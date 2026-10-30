import { DataSource } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { TranscriptionService } from './transcription.service';
import { toWebVtt } from './webvtt';

// A counted failure waits as pending while attempts remain, so an open page
// keeps polling; out of attempts it is final.
const failureUpdate = expect.stringMatching(
  /transcription_status =\s+CASE WHEN transcription_attempts >= 3 THEN 'failed' ELSE 'pending' END,\s+transcription_error = \$2/,
);

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

  // Per-video statements in order: each claim, then its outcome.
  const videoUpdates = () =>
    query.mock.calls.filter(
      ([sql]) =>
        sql.startsWith('UPDATE video_entity') && sql.includes('WHERE id = $1'),
    );

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

  it('requeues the videos an interrupted batch left processing before selecting', async () => {
    videos = [];
    await service.run();
    const statements = query.mock.calls.map(([sql]) => sql);
    const interrupted = statements.findIndex((sql) =>
      sql.includes("WHERE transcription_status = 'processing'"),
    );
    expect(interrupted).toBeGreaterThan(-1);
    // Pending keeps an open page waiting; out of attempts it is final.
    expect(statements[interrupted]).toContain(
      "CASE WHEN transcription_attempts >= 3 THEN 'failed' ELSE 'pending' END",
    );
    expect(interrupted).toBeLessThan(
      statements.findIndex((sql) => sql.startsWith('SELECT id')),
    );
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
    expect(query).toHaveBeenCalledWith(failureUpdate, [
      'video-1',
      'Whisper HTTP 500',
    ]);
    expect(requested).toBe(false);
  });

  it.each([400, 401, 403, 404, 409, 502, 503])(
    'counts a %i refusal against the current video only and stops the batch',
    async (status) => {
      videos.push({ id: 'video-2', audio_key: 'video-2/audio.flac' });
      fetchMock.mockImplementation(
        async (url) =>
          new Response('{}', {
            status: String(url).includes('/transcriptions') ? status : 200,
          }),
      );
      await expect(service.run()).resolves.toEqual({
        processed: 0,
        failed: 1,
      });
      const updates = videoUpdates();
      // Claimed then failed: its attempt counts, so it cannot hold the head of
      // the queue, and video-2 is not touched.
      expect(updates.map(([, params]) => params[0])).toEqual([
        'video-1',
        'video-1',
      ]);
      expect(updates[1]).toEqual([
        failureUpdate,
        ['video-1', `Whisper HTTP ${status}`],
      ]);
      expect(requested).toBe(false);
    },
  );

  it('counts an unreachable worker against the current video and stops the batch', async () => {
    videos.push({ id: 'video-2', audio_key: 'video-2/audio.flac' });
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/transcriptions'))
        throw new TypeError('fetch failed');
      return new Response('{}');
    });
    await expect(service.run()).resolves.toEqual({ processed: 0, failed: 1 });
    expect(query).toHaveBeenCalledWith(failureUpdate, [
      'video-1',
      'Whisper request failed: fetch failed',
    ]);
    expect(query).not.toHaveBeenCalledWith(expect.any(String), ['video-2']);
  });

  it('keeps the reason Whisper gives for a refusal', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/transcriptions')
        ? new Response(
            JSON.stringify({ error: 'Audio download failed (URLError)' }),
            { status: 502 },
          )
        : new Response('{}'),
    );
    await service.run();
    expect(query).toHaveBeenCalledWith(failureUpdate, [
      'video-1',
      'Whisper HTTP 502: Audio download failed (URLError)',
    ]);
  });

  it('counts a storage timeout after a transcription without stopping the batch', async () => {
    videos.push({ id: 'video-2', audio_key: 'video-2/audio.flac' });
    // The AWS SDK names network errors TimeoutError too.
    send.mockRejectedValueOnce(
      Object.assign(new Error('socket hang up'), { name: 'TimeoutError' }),
    );
    await expect(service.run()).resolves.toEqual({ processed: 1, failed: 1 });
  });

  it.each([413, 422])(
    'counts a %i caused by the audio itself and continues the batch',
    async (status) => {
      videos.push({ id: 'video-2', audio_key: 'video-2/audio.flac' });
      fetchMock.mockImplementation(
        async (url) =>
          new Response('{}', {
            status: String(url).includes('/transcriptions') ? status : 200,
          }),
      );
      await expect(service.run()).resolves.toEqual({
        processed: 0,
        failed: 2,
      });
      // Each video keeps its counted attempt: no refund, and the batch goes on.
      const updates = videoUpdates();
      expect(updates.map(([, params]) => params[0])).toEqual([
        'video-1',
        'video-1',
        'video-2',
        'video-2',
      ]);
      expect([updates[1], updates[3]]).toEqual([
        [failureUpdate, ['video-1', `Whisper HTTP ${status}`]],
        [failureUpdate, ['video-2', `Whisper HTTP ${status}`]],
      ]);
    },
  );

  it('counts a timeout against the video but stops the batch', async () => {
    videos.push({ id: 'video-2', audio_key: 'video-2/audio.flac' });
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/transcriptions'))
        throw new DOMException('The operation timed out', 'TimeoutError');
      return new Response('{}');
    });
    await expect(service.run()).resolves.toEqual({ processed: 0, failed: 1 });
    expect(query).toHaveBeenCalledWith(failureUpdate, [
      'video-1',
      'Whisper timed out after 1800000 ms',
    ]);
    expect(query).not.toHaveBeenCalledWith(expect.any(String), ['video-2']);
  });

  it('never selects a failed video again: failed is final', async () => {
    await service.run();
    const select = query.mock.calls.find(([sql]) =>
      sql.startsWith('SELECT id'),
    )[0];
    expect(select).toContain("transcription_status = 'pending'");
    expect(select).not.toContain("'failed'");
  });

  it('transcribes videos not tried yet before retrying earlier failures', async () => {
    await service.run();
    expect(
      query.mock.calls.find(([sql]) => sql.startsWith('SELECT id'))[0],
    ).toContain('ORDER BY transcription_attempts, "createdAt"');
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

  it('fails at once with the reason a misconfigured worker reports', async () => {
    const reason = 'TRANSCRIPT_MAX_AUDIO_BYTES must be a positive integer';
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/health')
        ? new Response(JSON.stringify({ failed: true, error: reason }), {
            status: 500,
          })
        : new Response('{}'),
    );
    await expect(service.run()).rejects.toThrow(
      `Transcription worker failed: ${reason}`,
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://stop.test',
      expect.anything(),
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("transcription_status = 'processing'"),
      expect.anything(),
    );
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

  it('validates the stop endpoint and token even while transcription is disabled', () => {
    process.env.TRANSCRIPTION_ENABLED = 'false';
    process.env.NODE_ENV = 'production';
    process.env.WORKER_STOP_URL = 'http://stop.test';
    expect(
      () => new TranscriptionService({} as DataSource, {} as S3Client),
    ).toThrow('Transcription endpoints require HTTPS');
    process.env.WORKER_STOP_URL = 'https://stop.test';
    process.env.WORKER_CONTROL_TOKEN = 'short';
    expect(
      () => new TranscriptionService({} as DataSource, {} as S3Client),
    ).toThrow('WORKER_CONTROL_TOKEN');
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
