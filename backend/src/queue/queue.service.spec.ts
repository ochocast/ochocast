import { QueueService } from './queue.service';
import { TranscodingJobsService } from '../transcoding-jobs/transcoding-jobs.service';
import { VideoTranscodingJob } from './job.types';
import { ScalewayQueuesClient } from './scaleway-queues.client';

jest.mock('amqplib', () => ({
  connect: jest.fn(() => {
    throw new Error('RabbitMQ must not be used');
  }),
}));

describe('Scaleway queue publishing', () => {
  const previous = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, {
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
    process.env = { ...previous };
  });

  it('persists the job before publishing a signed Scaleway message without opening RabbitMQ', async () => {
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
    await service.consumeResults(async () => undefined);
    await service.publishJob(job);
    await service.onModuleDestroy();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('fails startup when serverless configuration is incomplete', () => {
    delete process.env.TRANSCODING_QUEUE_URL;
    expect(() => new QueueService({} as TranscodingJobsService)).toThrow(
      'TRANSCODING_QUEUE_URL',
    );
  });
});
