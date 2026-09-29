import { ScalewayQueuesClient } from './scaleway-queues.client';

type QueueConsumer = Pick<
  ScalewayQueuesClient,
  'receiveMessage' | 'deleteMessage'
>;

export interface LocalQueueBridgeOptions {
  client: QueueConsumer;
  queueUrl: string;
  workerUrl: string;
  fetchImplementation?: typeof fetch;
}

export function validateLocalBridgeTargets(
  queueUrl: string,
  workerUrl: string,
): void {
  const queueName = decodeURIComponent(
    new URL(queueUrl).pathname.split('/').filter(Boolean).pop() || '',
  );
  if (!/(^|[-_])(local|dev|development)([-_]|$)/i.test(queueName)) {
    throw new Error('The local bridge requires a dedicated dev/local queue');
  }
  const worker = new URL(workerUrl);
  if (
    worker.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(worker.hostname) ||
    worker.pathname !== '/' ||
    worker.username ||
    worker.password ||
    worker.search ||
    worker.hash
  ) {
    throw new Error('The local FFmpeg URL must be an HTTP loopback root URL');
  }
}

/** Forward one SQS-compatible queue message without a permanent worker. */
export async function forwardOneLocalJob(
  options: LocalQueueBridgeOptions,
): Promise<{ status: 'empty' } | { status: 'processed'; messageId: string }> {
  validateLocalBridgeTargets(options.queueUrl, options.workerUrl);
  const worker = new URL(options.workerUrl);

  const message = await options.client.receiveMessage(options.queueUrl);
  if (!message) return { status: 'empty' };

  // Forward the exact queue body: re-serializing the signed job would break HMAC.
  const response = await (options.fetchImplementation || fetch)(worker, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: message.body,
    signal: AbortSignal.timeout(3300000),
  });
  const responseBody = await response.text();
  if (response.status !== 200) {
    // Leave the message in the queue: it becomes visible again after the queue's
    // visibility timeout. Only an acknowledged backend result yields HTTP 200.
    throw new Error(
      'Local FFmpeg rejected message ' +
        message.messageId +
        ' (HTTP ' +
        response.status +
        ')',
    );
  }
  let acknowledged: { jobId?: unknown; success?: unknown };
  let expected: { job?: { jobId?: unknown } };
  try {
    acknowledged = JSON.parse(responseBody);
    expected = JSON.parse(message.body);
  } catch {
    throw new Error('Local FFmpeg returned an invalid job acknowledgment');
  }
  if (
    acknowledged.success !== true ||
    typeof expected.job?.jobId !== 'string' ||
    acknowledged.jobId !== expected.job.jobId
  ) {
    throw new Error('Local FFmpeg did not acknowledge the queued job');
  }
  await options.client.deleteMessage(options.queueUrl, message.receiptHandle);
  return { status: 'processed', messageId: message.messageId };
}
