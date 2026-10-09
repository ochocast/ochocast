import { QueueService } from './queue.service';
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
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...previous };
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
    await service.publishJob(job);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing or obsolete queue provider at startup', () => {
    delete process.env.TRANSCODING_QUEUE_PROVIDER;
    expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
      'must be scaleway',
    );
    process.env.TRANSCODING_QUEUE_PROVIDER = 'unknown';
    expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
      'must be scaleway',
    );
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
