import { DataSource } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { TranscriptionService } from './transcription.service';
import { toWebVtt } from './webvtt';

describe('Automatic subtitles and on-demand lifecycle', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchMock: jest.SpyInstance;
  let query: jest.Mock;
  let send: jest.Mock;
  let requested: boolean;
  let videos: { id: string; audio_key: string }[];
  let service: TranscriptionService;

  beforeEach(() => {
    originalEnv = { ...process.env };
    Object.assign(process.env, {
      TRANSCRIPTION_ENABLED: 'true',
      NODE_ENV: 'test',
      TRANSCRIPTION_API_URL: 'http://whisper.test',
      TRANSCRIPT_API_KEY: 'whisper-key-with-at-least-32-characters',
      WORKER_START_URL: 'https://start.test',
      WORKER_STOP_URL: 'https://stop.test',
      WORKER_CONTROL_TOKEN: 'control-key-with-at-least-32-characters',
      WORKER_HEALTH_RETRIES: '1',
      WORKER_HEALTH_DELAY_MS: '1',
      STOCK_MEDIA_BUCKET: 'media',
    });
    requested = false;
    videos = [{ id: 'video-1', audio_key: 'video-1/audio.wav' }];
    query = jest.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return [{ acquired: true }];
      if (sql.startsWith('SELECT id, audio_key')) return videos;
      if (sql.startsWith('SELECT worker_requested'))
        return [{ worker_requested: requested }];
      if (sql.includes('RETURNING id')) return [[], 1];
      if (sql.includes('SET worker_requested = true')) requested = true;
      if (sql.includes('SET worker_requested = false')) requested = false;
      return [];
    });
    const runner = { connect: jest.fn(), release: jest.fn(), query };
    send = jest.fn(async () => ({}));
    const s3 = new S3Client({
      region: 'us-east-1',
      endpoint: 'http://storage.test',
      forcePathStyle: true,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    s3.send = send;
    service = new TranscriptionService(
      { createQueryRunner: () => runner } as unknown as DataSource,
      s3,
    );
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/v1/audio/transcriptions'))
        return new Response(
          JSON.stringify({
            segments: [{ start: 0, end: 2, text: 'Bonjour !' }],
          }),
        );
      return new Response('{}');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchMock.mockRestore();
  });

  it('starts once, signs the WAV, writes VTT and stops after a successful batch', async () => {
    await expect(service.run()).resolves.toEqual({ processed: 1, failed: 0 });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://start.test',
      'http://whisper.test/health',
      'http://whisper.test/v1/audio/transcriptions',
      'https://stop.test',
    ]);
    const body = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(body.audio_url).toContain('video-1/audio.wav');
    expect(body.audio_url).toContain('X-Amz-Signature');
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Key: 'subtitle-auto-video-1.vtt',
      ContentType: 'text/vtt',
      Body: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nBonjour !\n',
    });
    expect(requested).toBe(false);
  });

  it('does not boot the VM when there are no eligible videos', async () => {
    videos = [];
    await service.run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      query.mock.calls.find(([sql]) => sql.startsWith('SELECT id'))[0],
    ).toContain("transcoding_status = 'ready'");
  });

  it('records silence as no_speech without publishing an empty subtitle', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ segments: [] })),
    );
    await service.run();
    expect(send).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET subtitle_id'),
      ['video-1', null, 'no_speech'],
    );
    expect(requested).toBe(false);
  });

  it('keeps the video playable, schedules retry, continues the batch and stops on API failure', async () => {
    videos.push({ id: 'video-2', audio_key: 'video-2/audio.wav' });
    fetchMock.mockImplementation(
      async (url) =>
        new Response('{}', {
          status: String(url).includes('/transcriptions') ? 500 : 200,
        }),
    );
    await expect(service.run()).resolves.toEqual({ processed: 0, failed: 2 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("transcription_status = 'failed'"),
      ['video-1', 'Whisper HTTP 500'],
    );
    expect(requested).toBe(false);
  });

  it('stops the batch on a busy worker without marking later videos failed', async () => {
    videos.push({ id: 'video-2', audio_key: 'video-2/audio.flac' });
    fetchMock.mockImplementation(
      async (url) =>
        new Response('{}', {
          status: String(url).includes('/transcriptions') ? 409 : 200,
        }),
    );
    await expect(service.run()).resolves.toEqual({ processed: 0, failed: 1 });
    const failures = query.mock.calls.filter(([sql]) =>
      sql.includes("transcription_status = 'failed'"),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0][1][0]).toBe('video-1');
  });

  it('removes an unattached VTT when a video is archived or edited concurrently', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return [{ acquired: true }];
      if (sql.startsWith('SELECT id, audio_key')) return videos;
      if (sql.startsWith('SELECT worker_requested'))
        return [{ worker_requested: requested }];
      if (sql.includes('SET worker_requested = true')) requested = true;
      if (sql.includes('SET worker_requested = false')) requested = false;
      if (sql.includes('SET subtitle_id')) return [[], 0];
      if (sql.includes('RETURNING id')) return [[], 1];
      return [];
    });
    await expect(service.run()).resolves.toEqual({ processed: 0, failed: 0 });
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[1][0].input.Key).toBe('subtitle-auto-video-1.vtt');
  });

  it('requires HTTPS for the worker in production', () => {
    process.env.NODE_ENV = 'production';
    expect(
      () => new TranscriptionService({} as DataSource, {} as S3Client),
    ).toThrow('Transcription endpoints require HTTPS');
  });

  it('stops even when readiness fails after the VM start', async () => {
    fetchMock.mockImplementation(
      async (url) =>
        new Response('{}', {
          status: String(url).endsWith('/health') ? 503 : 200,
        }),
    );
    await expect(service.run()).rejects.toThrow('did not become ready');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://stop.test',
      expect.anything(),
    );
    expect(requested).toBe(false);
  });

  it('recovers an orphaned VM without starting a new batch', async () => {
    requested = true;
    await service.recover();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://stop.test',
    ]);
    expect(requested).toBe(false);
  });

  it('recovers a requested worker while transcription is disabled', async () => {
    process.env.TRANSCRIPTION_ENABLED = 'false';
    requested = true;
    const runner = { connect: jest.fn(), release: jest.fn(), query };
    const disabled = new TranscriptionService(
      { createQueryRunner: () => runner } as unknown as DataSource,
      {} as S3Client,
    );
    await disabled.recover();
    expect(requested).toBe(false);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://stop.test',
    ]);
  });

  it('does not start or stop a worker already owned by another replica', async () => {
    query.mockImplementation(async () => [{ acquired: false }]);
    await service.run();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WebVTT generation', () => {
  it('rounds timestamps across minute boundaries and escapes cue markup', () => {
    expect(
      toWebVtt([{ start: 59.9996, end: 61, text: '<test> & texte' }]),
    ).toBe(
      'WEBVTT\n\n00:01:00.000 --> 00:01:01.000\n&lt;test&gt; &amp; texte\n',
    );
  });
  it('rejects missing or malformed segments instead of silently publishing empty output', () => {
    expect(() => toWebVtt(undefined)).toThrow();
    expect(() => toWebVtt([{ start: 1, end: 0, text: 'bad' }])).toThrow();
    expect(toWebVtt([])).toBeNull();
  });
});
