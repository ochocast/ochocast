import { forwardOneLocalJob } from './local-queue-bridge';
import { ScalewayQueuesClient } from './scaleway-queues.client';

const queueUrl =
  'https://sqs.mnq.fr-par.scaleway.com/project/ochocast-local-ffmpeg';
const workerUrl = 'http://127.0.0.1:8081/';
const message = {
  messageId: 'message-1',
  receiptHandle: 'receipt-1',
  body: '{"job":{"jobId":"test"},"signature":"signed"}',
};

describe('one-shot local Scaleway queue bridge', () => {
  const client = () => ({
    receiveMessage: jest.fn().mockResolvedValue(message),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
  });

  it('forwards the exact body and deletes only after HTTP 200', async () => {
    const consumer = client();
    const fetchImplementation = jest
      .fn()
      .mockResolvedValue(
        new Response('{"jobId":"test","success":true}', { status: 200 }),
      );
    await expect(
      forwardOneLocalJob({
        client: consumer as unknown as ScalewayQueuesClient,
        queueUrl,
        workerUrl,
        fetchImplementation,
      }),
    ).resolves.toEqual({ status: 'processed', messageId: 'message-1' });
    expect(fetchImplementation.mock.calls[0][1].body).toBe(message.body);
    expect(consumer.deleteMessage).toHaveBeenCalledWith(queueUrl, 'receipt-1');
  });

  it('leaves a failed job in the queue for retry', async () => {
    const consumer = client();
    const fetchImplementation = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(
      forwardOneLocalJob({
        client: consumer as unknown as ScalewayQueuesClient,
        queueUrl,
        workerUrl,
        fetchImplementation,
      }),
    ).rejects.toThrow('HTTP 503');
    expect(consumer.deleteMessage).not.toHaveBeenCalled();
  });

  it('does not acknowledge an unexpected successful HTTP status', async () => {
    const consumer = client();
    const fetchImplementation = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 202 }));
    await expect(
      forwardOneLocalJob({
        client: consumer as unknown as ScalewayQueuesClient,
        queueUrl,
        workerUrl,
        fetchImplementation,
      }),
    ).rejects.toThrow('HTTP 202');
    expect(consumer.deleteMessage).not.toHaveBeenCalled();
  });

  it('does not delete when HTTP 200 confirms a different job', async () => {
    const consumer = client();
    const fetchImplementation = jest
      .fn()
      .mockResolvedValue(
        new Response('{"jobId":"another","success":true}', { status: 200 }),
      );
    await expect(
      forwardOneLocalJob({
        client: consumer as unknown as ScalewayQueuesClient,
        queueUrl,
        workerUrl,
        fetchImplementation,
      }),
    ).rejects.toThrow('did not acknowledge');
    expect(consumer.deleteMessage).not.toHaveBeenCalled();
  });

  it('exits without invoking FFmpeg when the queue is empty', async () => {
    const consumer = client();
    consumer.receiveMessage.mockResolvedValue(undefined);
    const fetchImplementation = jest.fn();
    await expect(
      forwardOneLocalJob({
        client: consumer as unknown as ScalewayQueuesClient,
        queueUrl,
        workerUrl,
        fetchImplementation,
      }),
    ).resolves.toEqual({ status: 'empty' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('refuses non-development queues and non-local HTTP destinations', async () => {
    const consumer = client();
    await expect(
      forwardOneLocalJob({
        client: consumer as unknown as ScalewayQueuesClient,
        queueUrl: queueUrl.replace('local', 'staging'),
        workerUrl,
      }),
    ).rejects.toThrow('dev/local queue');
    await expect(
      forwardOneLocalJob({
        client: consumer as unknown as ScalewayQueuesClient,
        queueUrl,
        workerUrl: 'https://example.com/',
      }),
    ).rejects.toThrow('loopback');
    expect(consumer.receiveMessage).not.toHaveBeenCalled();
  });
});
