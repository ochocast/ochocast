import { Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QueueModule } from './queue.module';
import { QueueService, TranscodingDisabledError } from './queue.service';
import { TranscodingJobsModule } from '../transcoding-jobs/transcoding-jobs.module';
import { TranscodingJobsService } from '../transcoding-jobs/transcoding-jobs.service';
import { VideoTranscodingJob } from './job.types';
import { ScalewayQueuesClient } from './scaleway-queues.client';
import * as localBridge from './local-queue-bridge';

describe('Scaleway queue publishing', () => {
  const previous = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      TRANSCODING_QUEUE_PROVIDER: 'scaleway',
      TRANSCODING_QUEUE_URL: 'https://queue.example/queue',
      TRANSCODING_QUEUE_ENDPOINT: 'https://queue.example',
      TRANSCODING_QUEUE_REGION: 'fr-par',
      TRANSCODING_QUEUE_ACCESS_KEY: 'test-access',
      TRANSCODING_QUEUE_SECRET_KEY: 'test-secret',
      TRANSCODING_DISPATCH_SECRET:
        'dispatch-test-secret-at-least-32-characters',
      TRANSCODING_CALLBACK_SECRET:
        'callback-test-secret-at-least-32-characters',
      PUBLIC_API_URL: 'https://api.example/api',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...previous };
  });
  const clearTranscodingEnv = () => {
    for (const name of Object.keys(process.env))
      if (/^(TRANSCODING_|LOCAL_QUEUE_BRIDGE_)/.test(name))
        delete process.env[name];
  };

  it.each([
    ['missing', undefined],
    ['plain http', 'http://api.example/api'],
  ])('refuses the Scaleway queue with a %s PUBLIC_API_URL', (_, value) => {
    if (value === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = value;
    // HLS playlists built from the request would be http:// behind the
    // TLS-terminating ingress and blocked as mixed content.
    expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
      'PUBLIC_API_URL must be an https URL when the Scaleway transcoding queue is enabled',
    );
  });

  it('accepts an http PUBLIC_API_URL with the local queue bridge in development', () => {
    // What `npm run local:queue-config` writes: the page and the API are both
    // served over http, so no playlist can be blocked as mixed content.
    process.env.NODE_ENV = 'development';
    process.env.PUBLIC_API_URL = 'http://localhost:3001/api';
    process.env.TRANSCODING_QUEUE_URL =
      'https://queue.example/ochocast-local-ffmpeg';
    process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL =
      process.env.TRANSCODING_QUEUE_URL;
    process.env.LOCAL_QUEUE_BRIDGE_ACCESS_KEY = 'receive-access';
    process.env.LOCAL_QUEUE_BRIDGE_SECRET_KEY = 'receive-secret';
    expect(new QueueService({} as TranscodingJobsService).enabled).toBe(true);
  });

  it('does not require PUBLIC_API_URL while transcoding is disabled', () => {
    clearTranscodingEnv();
    delete process.env.PUBLIC_API_URL;
    expect(new QueueService({} as TranscodingJobsService).enabled).toBe(false);
  });

  it('persists the job before publishing a signed Scaleway message', async () => {
    let registered = false;
    const jobs = {
      register: jest.fn(async () => {
        registered = true;
      }),
    };
    const sendMessage = jest
      .spyOn(ScalewayQueuesClient.prototype, 'sendMessage')
      .mockImplementation(async (_queueUrl, message) => {
        expect(registered).toBe(true);
        const envelope = JSON.parse(message);
        expect(envelope.job).toEqual(job);
      });
    const service = new QueueService(jobs as unknown as TranscodingJobsService);
    const job = {
      jobId: 'test',
      videoId: 'video',
      originalKey: 'video/source.mp4',
    } as VideoTranscodingJob;
    expect(service.enabled).toBe(true);
    await service.publishJob(job);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('boots disabled with a fully empty transcoding environment', () => {
    clearTranscodingEnv();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = new QueueService({} as TranscodingJobsService);
    expect(service.enabled).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('disabled');
  });

  it('treats an empty provider as disabled', () => {
    clearTranscodingEnv();
    process.env.TRANSCODING_QUEUE_PROVIDER = '';
    expect(new QueueService({} as TranscodingJobsService).enabled).toBe(false);
  });

  it.each([
    'TRANSCODING_QUEUE_URL',
    'TRANSCODING_QUEUE_ENDPOINT',
    'TRANSCODING_QUEUE_REGION',
    'TRANSCODING_QUEUE_ACCESS_KEY',
    'TRANSCODING_QUEUE_SECRET_KEY',
    'TRANSCODING_DISPATCH_SECRET',
  ])(
    'refuses %s without a provider instead of silently disabling transcoding',
    (name) => {
      const value = process.env[name];
      clearTranscodingEnv();
      process.env[name] = value;
      expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
        'TRANSCODING_QUEUE_PROVIDER must be scaleway, local or disabled',
      );
    },
  );

  it.each(['unknown', 'Scaleway', 'none', 'false'])(
    'rejects the unknown provider %p at startup',
    (provider) => {
      process.env.TRANSCODING_QUEUE_PROVIDER = provider;
      expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
        'TRANSCODING_QUEUE_PROVIDER must be scaleway, local or disabled',
      );
    },
  );

  it('keeps a lone callback secret usable for draining in-flight jobs', () => {
    const secret = process.env.TRANSCODING_CALLBACK_SECRET;
    clearTranscodingEnv();
    process.env.TRANSCODING_CALLBACK_SECRET = secret;
    expect(new QueueService({} as TranscodingJobsService).enabled).toBe(false);
  });

  it('ignores queue settings with an explicit disabled provider in a single warning', () => {
    process.env.TRANSCODING_QUEUE_PROVIDER = 'disabled';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = new QueueService({} as TranscodingJobsService);
    expect(service.enabled).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('TRANSCODING_QUEUE_URL');
  });

  it('does not evaluate the local bridge while disabled', () => {
    process.env.TRANSCODING_QUEUE_PROVIDER = 'disabled';
    process.env.NODE_ENV = 'development';
    process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL = 'https://staging.example/queue';
    expect(new QueueService({} as TranscodingJobsService).enabled).toBe(false);
  });

  it('never registers nor sends a job while disabled', async () => {
    process.env.TRANSCODING_QUEUE_PROVIDER = 'disabled';
    const jobs = { register: jest.fn() };
    const sendMessage = jest.spyOn(
      ScalewayQueuesClient.prototype,
      'sendMessage',
    );
    const service = new QueueService(jobs as unknown as TranscodingJobsService);
    const job = { jobId: 'job-1' } as VideoTranscodingJob;
    await expect(service.publishJob(job)).rejects.toBeInstanceOf(
      TranscodingDisabledError,
    );
    await expect(service.publishRegisteredJob(job)).rejects.toBeInstanceOf(
      TranscodingDisabledError,
    );
    expect(jobs.register).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('fails startup when serverless configuration is incomplete', () => {
    delete process.env.TRANSCODING_QUEUE_URL;
    expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
      'TRANSCODING_QUEUE_URL',
    );
  });

  it('automatically forwards a published job in local development without delaying the upload', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TRANSCODING_QUEUE_URL =
      'https://queue.example/ochocast-local-ffmpeg';
    process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL =
      process.env.TRANSCODING_QUEUE_URL;
    process.env.LOCAL_QUEUE_BRIDGE_ACCESS_KEY = 'receive-access';
    process.env.LOCAL_QUEUE_BRIDGE_SECRET_KEY = 'receive-secret';
    const jobs = { register: jest.fn().mockResolvedValue(undefined) };
    jest
      .spyOn(ScalewayQueuesClient.prototype, 'sendMessage')
      .mockResolvedValue();
    let finishBridge: (result: {
      status: 'processed';
      messageId: string;
    }) => void;
    const bridge = jest
      .spyOn(localBridge, 'forwardOneLocalJob')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishBridge = resolve;
          }),
      );
    const service = new QueueService(jobs as unknown as TranscodingJobsService);
    const job = { jobId: 'job-1', videoId: 'video-1' } as VideoTranscodingJob;

    await service.publishJob(job);
    await new Promise((resolve) => setImmediate(resolve));
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge.mock.calls[0][0].queueUrl).toBe(
      process.env.TRANSCODING_QUEUE_URL,
    );
    expect(bridge.mock.calls[0][0].workerUrl).toBe('http://127.0.0.1:8081/');
    finishBridge!({ status: 'processed', messageId: 'message-1' });
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('serializes local FFmpeg requests when two videos are uploaded', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TRANSCODING_QUEUE_URL =
      'https://queue.example/ochocast-local-ffmpeg';
    process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL =
      process.env.TRANSCODING_QUEUE_URL;
    process.env.LOCAL_QUEUE_BRIDGE_ACCESS_KEY = 'receive-access';
    process.env.LOCAL_QUEUE_BRIDGE_SECRET_KEY = 'receive-secret';
    jest
      .spyOn(ScalewayQueuesClient.prototype, 'sendMessage')
      .mockResolvedValue();
    let finishFirst: (result: {
      status: 'processed';
      messageId: string;
    }) => void;
    const bridge = jest
      .spyOn(localBridge, 'forwardOneLocalJob')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ status: 'processed', messageId: 'message-2' });
    const service = new QueueService({
      register: jest.fn().mockResolvedValue(undefined),
    } as unknown as TranscodingJobsService);

    await Promise.all([
      service.publishJob({ jobId: 'job-1' } as VideoTranscodingJob),
      service.publishJob({ jobId: 'job-2' } as VideoTranscodingJob),
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(bridge).toHaveBeenCalledTimes(1);
    finishFirst!({ status: 'processed', messageId: 'message-1' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(bridge).toHaveBeenCalledTimes(2);
  });

  it('does not launch the local bridge if publishing to Scaleway fails', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TRANSCODING_QUEUE_URL =
      'https://queue.example/ochocast-local-ffmpeg';
    process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL =
      process.env.TRANSCODING_QUEUE_URL;
    process.env.LOCAL_QUEUE_BRIDGE_ACCESS_KEY = 'receive-access';
    process.env.LOCAL_QUEUE_BRIDGE_SECRET_KEY = 'receive-secret';
    jest
      .spyOn(ScalewayQueuesClient.prototype, 'sendMessage')
      .mockRejectedValue(new Error('publish failed'));
    const bridge = jest.spyOn(localBridge, 'forwardOneLocalJob');
    const service = new QueueService({
      register: jest.fn().mockResolvedValue(undefined),
    } as unknown as TranscodingJobsService);

    await expect(
      service.publishJob({ jobId: 'job-1' } as VideoTranscodingJob),
    ).rejects.toThrow('publish failed');
    await new Promise((resolve) => setImmediate(resolve));
    expect(bridge).not.toHaveBeenCalled();
  });

  it('refuses local auto-forwarding to a staging queue at startup', () => {
    process.env.NODE_ENV = 'development';
    process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL =
      process.env.TRANSCODING_QUEUE_URL;
    process.env.LOCAL_QUEUE_BRIDGE_ACCESS_KEY = 'receive-access';
    process.env.LOCAL_QUEUE_BRIDGE_SECRET_KEY = 'receive-secret';
    expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
      'dev/local queue',
    );
  });

  it('never starts the local bridge outside development', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL =
      'https://queue.example/ochocast-local-ffmpeg';
    const sendMessage = jest
      .spyOn(ScalewayQueuesClient.prototype, 'sendMessage')
      .mockResolvedValue();
    const bridge = jest.spyOn(localBridge, 'forwardOneLocalJob');
    const service = new QueueService({
      register: jest.fn().mockResolvedValue(undefined),
    } as unknown as TranscodingJobsService);

    await service.publishJob({ jobId: 'job-1' } as VideoTranscodingJob);
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(bridge).not.toHaveBeenCalled();
  });

  it('uses the Docker queue and auto-forwards without Scaleway credentials', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TRANSCODING_QUEUE_PROVIDER = 'local';
    process.env.TRANSCODING_QUEUE_ENDPOINT = 'http://127.0.0.1:9324';
    process.env.TRANSCODING_QUEUE_URL =
      'http://127.0.0.1:9324/000000000000/ochocast-local-ffmpeg';
    process.env.TRANSCODING_QUEUE_ACCESS_KEY = 'local';
    process.env.TRANSCODING_QUEUE_SECRET_KEY = 'local';
    delete process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL;
    delete process.env.LOCAL_QUEUE_BRIDGE_ACCESS_KEY;
    delete process.env.LOCAL_QUEUE_BRIDGE_SECRET_KEY;
    const sendMessage = jest
      .spyOn(ScalewayQueuesClient.prototype, 'sendMessage')
      .mockResolvedValue();
    const bridge = jest
      .spyOn(localBridge, 'forwardOneLocalJob')
      .mockResolvedValue({ status: 'processed', messageId: 'local-message' });
    const service = new QueueService({
      register: jest.fn().mockResolvedValue(undefined),
    } as unknown as TranscodingJobsService);

    await service.publishJob({ jobId: 'job-1' } as VideoTranscodingJob);
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge.mock.calls[0][0].queueUrl).toBe(
      process.env.TRANSCODING_QUEUE_URL,
    );
  });

  it('rejects the Docker provider outside development', () => {
    process.env.TRANSCODING_QUEUE_PROVIDER = 'local';
    process.env.NODE_ENV = 'production';
    expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
      'NODE_ENV=development',
    );
  });
});

describe('Transcoding backlog while the queue is disabled', () => {
  const previous = { ...process.env };
  const unfinished = jest.fn();
  let warn: jest.SpyInstance;
  beforeEach(() => {
    for (const name of Object.keys(process.env))
      if (/^(TRANSCODING_|LOCAL_QUEUE_BRIDGE_)/.test(name))
        delete process.env[name];
    unfinished.mockReset();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...previous };
  });

  it('boots the global queue module without any transcoding setting and reports stuck jobs', async () => {
    const oldest = new Date(Date.now() - 90 * 60_000);
    unfinished.mockResolvedValue({ count: 3, oldest });
    @Module({
      providers: [
        { provide: TranscodingJobsService, useValue: { unfinished } },
      ],
      exports: [TranscodingJobsService],
    })
    class FakeTranscodingJobsModule {}
    const app = await Test.createTestingModule({ imports: [QueueModule] })
      .overrideModule(TranscodingJobsModule)
      .useModule(FakeTranscodingJobsModule)
      .compile();
    await app.init();
    expect(app.get(QueueService).enabled).toBe(false);
    const backlog = warn.mock.calls.map(([message]) => message).join('\n');
    expect(backlog).toContain('3 transcoding job(s)');
    expect(backlog).toContain(oldest.toISOString());
    expect(backlog).toContain('90 min');
    expect(backlog).toContain('TRANSCODING_CALLBACK_SECRET');
    await app.close();
  });

  it('still reports the backlog when no job carries a registration time', async () => {
    unfinished.mockResolvedValue({ count: 2, oldest: null });
    const service = new QueueService({
      unfinished,
    } as unknown as TranscodingJobsService);
    warn.mockClear();
    await service.onApplicationBootstrap();
    const backlog = warn.mock.calls.map(([message]) => message).join('\n');
    expect(backlog).toContain('2 transcoding job(s)');
    expect(backlog).not.toContain('could not be counted');
  });

  it('stays silent about the backlog when no job is unfinished', async () => {
    unfinished.mockResolvedValue({ count: 0, oldest: null });
    const service = new QueueService({
      unfinished,
    } as unknown as TranscodingJobsService);
    warn.mockClear();
    await service.onApplicationBootstrap();
    expect(unfinished).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('still boots when the backlog cannot be counted', async () => {
    unfinished.mockRejectedValue(new Error('database unavailable'));
    const service = new QueueService({
      unfinished,
    } as unknown as TranscodingJobsService);
    warn.mockClear();
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(warn.mock.calls[0][0]).toContain('database unavailable');
  });

  it('does not count the backlog when the queue is enabled', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      TRANSCODING_QUEUE_PROVIDER: 'scaleway',
      TRANSCODING_QUEUE_URL: 'https://queue.example/queue',
      TRANSCODING_QUEUE_ENDPOINT: 'https://queue.example',
      TRANSCODING_QUEUE_REGION: 'fr-par',
      TRANSCODING_QUEUE_ACCESS_KEY: 'test-access',
      TRANSCODING_QUEUE_SECRET_KEY: 'test-secret',
      TRANSCODING_DISPATCH_SECRET:
        'dispatch-test-secret-at-least-32-characters',
      TRANSCODING_CALLBACK_SECRET:
        'callback-test-secret-at-least-32-characters',
      PUBLIC_API_URL: 'https://api.example/api',
    });
    const service = new QueueService({
      unfinished,
    } as unknown as TranscodingJobsService);
    await service.onApplicationBootstrap();
    expect(unfinished).not.toHaveBeenCalled();
  });
});
