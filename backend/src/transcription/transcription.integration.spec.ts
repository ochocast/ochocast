import { DataSource } from 'typeorm';
import {
  CreateBucketCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createServer, Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TranscriptionService } from './transcription.service';
import { AddAutomaticTranscription1791540000000 } from '../migrations/1791540000000-AddAutomaticTranscription';

const integration = process.env.TRANSCRIPTION_TEST_DATABASE_URL
  ? describe
  : describe.skip;

integration(
  'real FFmpeg -> S3 -> Whisper -> persisted WebVTT (isolated local services)',
  () => {
    let db: DataSource;
    let s3: S3Client;
    let signer: S3Client;
    let control: Server;
    let service: TranscriptionService;
    let directory: string;
    let lifecycle: string[];
    let originalEnv: NodeJS.ProcessEnv;
    const schema = `transcription_${randomUUID().replace(/-/g, '')}`;
    const bucket = `transcription-${randomUUID()}`;

    beforeAll(async () => {
      originalEnv = { ...process.env };
      const databaseUrl = process.env.TRANSCRIPTION_TEST_DATABASE_URL;
      if (!['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname))
        throw new Error(
          'Transcription tests require an isolated local PostgreSQL database',
        );
      directory = await mkdtemp(path.join(tmpdir(), 'ochocast-transcription-'));
      db = new DataSource({
        type: 'postgres',
        url: databaseUrl,
        extra: { options: `-c search_path=${schema}` },
      });
      await db.initialize();
      await db.query(`CREATE SCHEMA ${schema}`);
      await db.query(`CREATE TABLE video_entity (id uuid PRIMARY KEY,
      archived boolean DEFAULT false, transcoding_status varchar DEFAULT 'ready',
      subtitle_id varchar, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now())`);
      const runner = db.createQueryRunner();
      await new AddAutomaticTranscription1791540000000().up(runner);
      await runner.release();

      const endpoint =
        process.env.TRANSCRIPTION_TEST_S3_URL || 'http://127.0.0.1:29300';
      if (!['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname))
        throw new Error('Transcription tests require local S3');
      const options = {
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'transcription',
          secretAccessKey: 'transcription-test-only',
        },
        requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      };
      s3 = new S3Client({ ...options, endpoint });
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      // On Docker Desktop the VM downloads via the host-gateway URL; Node writes
      // via loopback. Both are real requests to the same isolated S3 service.
      signer = new S3Client({
        ...options,
        endpoint:
          process.env.TRANSCRIPTION_TEST_S3_SIGNING_URL ||
          'http://host.docker.internal:29300',
      });
      signer.send = s3.send.bind(s3);
      lifecycle = [];
      control = createServer((req, res) => {
        lifecycle.push(req.url);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
      await new Promise<void>((resolve) =>
        control.listen(0, '127.0.0.1', resolve),
      );
      const address = control.address() as { port: number };
      Object.assign(process.env, {
        TRANSCRIPTION_ENABLED: 'true',
        NODE_ENV: 'test',
        TRANSCRIPTION_API_URL:
          process.env.TRANSCRIPTION_TEST_API_URL || 'http://127.0.0.1:28082',
        TRANSCRIPT_API_KEY: 'transcription-test-api-key-at-least-32-characters',
        WORKER_START_URL: `http://127.0.0.1:${address.port}/start`,
        WORKER_STOP_URL: `http://127.0.0.1:${address.port}/stop`,
        WORKER_CONTROL_TOKEN:
          'transcription-test-control-token-at-least-32-characters',
        WORKER_HEALTH_RETRIES: '120',
        WORKER_HEALTH_DELAY_MS: '1000',
        STOCK_MEDIA_BUCKET: bucket,
        STOCK_MINIATURE_BUCKET: bucket,
        TRANSCODING_EXTRACT_AUDIO: 'true',
      });
      service = new TranscriptionService(db, signer);
      // A cold Docker volume downloads the model before inference is ready.
      // Keep that startup budget separate from the per-video test timeout.
      const apiUrl = process.env.TRANSCRIPTION_API_URL;
      if (!['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname))
        throw new Error('Transcription tests require a local Whisper service');
      let ready = false;
      const readyDeadline = Date.now() + 600_000;
      while (Date.now() < readyDeadline) {
        let response: Response | undefined;
        try {
          response = await fetch(`${apiUrl}/health`, {
            signal: AbortSignal.timeout(5000),
          });
        } catch {}
        if (response?.ok) {
          ready = true;
          break;
        }
        if (response?.status === 500)
          throw new Error('Local Whisper model failed to load');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      if (!ready)
        throw new Error(
          'Local Whisper model did not become ready before integration tests',
        );
    }, 660_000);

    beforeEach(async () => {
      // An earlier failed scenario must not leave a video for the next batch.
      await db.query('TRUNCATE video_entity');
      lifecycle.length = 0;
    });

    afterAll(async () => {
      if (control)
        await new Promise<void>((resolve) => control.close(() => resolve()));
      if (db?.isInitialized) {
        await db.query(`DROP SCHEMA ${schema} CASCADE`);
        await db.destroy();
      }
      s3?.destroy();
      signer?.destroy();
      if (directory) await rm(directory, { recursive: true, force: true });
      if (originalEnv) process.env = originalEnv;
    });

    async function transcode(kind: 'speech' | 'no_audio' | 'silence') {
      const id = randomUUID();
      const input = path.join(directory, `${id}.mp4`);
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x180:r=10',
      ];
      if (kind === 'speech')
        args.push(
          '-i',
          path.resolve(__dirname, '../../../e2e/assets/speech-fr.wav'),
        );
      if (kind === 'silence')
        args.push('-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono');
      args.push(
        '-t',
        kind === 'speech' ? '12' : '2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
      );
      if (kind !== 'no_audio') args.push('-c:a', 'aac');
      args.push(input);
      await promisify(execFile)(process.env.FFMPEG_PATH || 'ffmpeg', args);
      // Load after the test's isolated storage env is configured.
      const {
        TranscodingService,
      } = require('../../../ffmpegServer/src/services/transcoding.service');
      const worker = new TranscodingService(s3);
      const result = await worker.processJob(
        {
          jobId: randomUUID(),
          videoId: id,
          originalFileName: `${id}.mp4`,
          originalKey: `${id}/source/original.mp4`,
          media_id: `${id}/master.m3u8`,
          miniature_id: `${id}.jpg`,
          title: 'Automatic subtitles test',
          timestamp: Date.now(),
        },
        input,
        undefined,
        undefined,
        true,
      );
      expect(result.success).toBe(true);
      expect(result.has_audio).toBe(kind !== 'no_audio');
      await db.query(
        `INSERT INTO video_entity (id, audio_key, has_audio, transcription_status)
      VALUES ($1, $2, $3, $4)`,
        [
          id,
          result.audio_key,
          result.has_audio,
          result.has_audio ? 'pending' : 'no_audio',
        ],
      );
      return id;
    }

    it('transcribes real French speech and persists a readable WebVTT', async () => {
      const id = await transcode('speech');
      lifecycle.length = 0;
      await expect(service.run()).resolves.toEqual({ processed: 1, failed: 0 });
      const [video] = await db.query(
        'SELECT * FROM video_entity WHERE id = $1',
        [id],
      );
      expect(video.transcription_status).toBe('ready');
      const object = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: video.subtitle_id }),
      );
      const vtt = await object.Body.transformToString();
      expect(vtt).toMatch(/^WEBVTT/);
      // CI's tiny model once heard "les soucis" for "les sous-titres", while
      // the first and last words and the timing held: those are checked, so a
      // lost segment still fails. The fixture's speech ends at 8.7 s.
      const text = vtt.toLowerCase();
      expect(text).toContain('bonjour');
      expect(text).toContain('merci');
      const ends = [
        ...vtt.matchAll(/ --> (\d{2}):(\d{2}):(\d{2}\.\d{3})/g),
      ].map(([, h, m, s]) => Number(h) * 3600 + Number(m) * 60 + Number(s));
      expect(Math.max(...ends)).toBeGreaterThan(8);
      expect(lifecycle).toEqual(['/start', '/stop']);
    }, 180_000);

    it('does not start the VM or create subtitles for video without an audio track', async () => {
      const id = await transcode('no_audio');
      lifecycle.length = 0;
      await service.run();
      const [video] = await db.query(
        'SELECT * FROM video_entity WHERE id = $1',
        [id],
      );
      expect(video.transcription_status).toBe('no_audio');
      expect(video.subtitle_id).toBeNull();
      expect(lifecycle).toEqual([]);
    }, 30_000);

    it('treats a silent audio track as no_speech and does not retry it', async () => {
      const id = await transcode('silence');
      await service.run();
      const [video] = await db.query(
        'SELECT * FROM video_entity WHERE id = $1',
        [id],
      );
      expect(video.transcription_status).toBe('no_speech');
      expect(video.subtitle_id).toBeNull();
      lifecycle.length = 0;
      await service.run();
      expect(lifecycle).toEqual([]);
    }, 60_000);

    it('preserves manual subtitles without calling Whisper', async () => {
      await db.query(
        `INSERT INTO video_entity (id, subtitle_id, audio_key, transcription_status)
      VALUES ($1, 'manual.vtt', 'unused.wav', 'pending')`,
        [randomUUID()],
      );
      lifecycle.length = 0;
      await service.run();
      expect(lifecycle).toEqual([]);
    });
  },
);
