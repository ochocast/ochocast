import { forwardOneLocalJob } from '../src/queue/local-queue-bridge';
import { ScalewayQueuesClient } from '../src/queue/scaleway-queues.client';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('Missing ' + name);
  return value;
}

async function main(): Promise<void> {
  const provider = required('TRANSCODING_QUEUE_PROVIDER');
  if (provider !== 'scaleway' && provider !== 'local') {
    throw new Error(
      'Only Scaleway Queues or the local SQS emulator is supported',
    );
  }
  if (provider === 'local' && process.env.NODE_ENV !== 'development') {
    throw new Error('The local queue provider requires NODE_ENV=development');
  }
  const queueUrl =
    provider === 'local'
      ? required('TRANSCODING_QUEUE_URL')
      : required('LOCAL_QUEUE_BRIDGE_QUEUE_URL');
  if (queueUrl !== required('TRANSCODING_QUEUE_URL')) {
    throw new Error(
      'The local bridge must read the same dev queue as the backend publishes to',
    );
  }
  const client = new ScalewayQueuesClient({
    endpoint: required('TRANSCODING_QUEUE_ENDPOINT'),
    region: required('TRANSCODING_QUEUE_REGION'),
    accessKey: required(
      provider === 'local'
        ? 'TRANSCODING_QUEUE_ACCESS_KEY'
        : 'LOCAL_QUEUE_BRIDGE_ACCESS_KEY',
    ),
    secretKey: required(
      provider === 'local'
        ? 'TRANSCODING_QUEUE_SECRET_KEY'
        : 'LOCAL_QUEUE_BRIDGE_SECRET_KEY',
    ),
    allowLocalHttp: provider === 'local',
  });
  const result = await forwardOneLocalJob({
    client,
    queueUrl,
    workerUrl:
      process.env.LOCAL_QUEUE_BRIDGE_WORKER_URL || 'http://127.0.0.1:8081/',
  });
  if (result.status === 'empty') {
    console.log('No message in the development queue (one 10-second poll).');
  } else {
    console.log(
      'Transcoding acknowledged and queue message deleted: ' + result.messageId,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(
    'Local queue bridge failed: ' +
      (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
});
