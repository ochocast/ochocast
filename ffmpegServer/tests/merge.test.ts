import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createWorkerServer } from '../src/http-worker';
import { HttpError } from '../src/serverless/job-envelope';
import { parseMergeEnvelope } from '../src/serverless/merge-envelope';
import { MergeRunner } from '../src/serverless/merge-runner';
import {
  RecordingMergeJob,
  RecordingMergeResult,
} from '../src/types/job.types';

const secret = 'test-dispatch-secret-at-least-32-characters';
const makeJob = (
  overrides: Partial<RecordingMergeJob> = {},
): RecordingMergeJob => ({
  jobId: randomUUID(),
  recordingId: randomUUID(),
  trackId: randomUUID(),
  sourceKeys: ['recordings/t/seg-1.mp4', 'recordings/t/seg-2.mp4'],
  targetKey: 'recordings/t/merged/m.mp4',
  timestamp: Date.now(),
  ...overrides,
});
const sign = (job: unknown) => ({
  job,
  signature: createHmac('sha256', secret)
    .update(JSON.stringify(job))
    .digest('hex'),
});
const statusOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as HttpError).status;
  }
  return 0;
};

test('accepts a correctly signed merge job', () => {
  const job = makeJob();
  assert.deepEqual(parseMergeEnvelope(sign(job), secret), job);
});

test('rejects a merge job signed with another secret', () => {
  const envelope = sign(makeJob());
  assert.equal(
    statusOf(() => parseMergeEnvelope(envelope, 'x'.repeat(40))),
    401,
  );
});

test('rejects a merge of fewer than two segments', () => {
  const job = makeJob({ sourceKeys: ['recordings/t/seg-1.mp4'] });
  assert.equal(
    statusOf(() => parseMergeEnvelope(sign(job), secret)),
    400,
  );
});

test('rejects S3 keys that walk out of their prefix', () => {
  const job = makeJob({ targetKey: 'recordings/../videos/x.mp4' });
  assert.equal(
    statusOf(() => parseMergeEnvelope(sign(job), secret)),
    400,
  );
});

const claimed = (job: RecordingMergeJob) => ({
  status: 'claimed' as const,
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  job,
});

test('merges then reports a success to the backend', async () => {
  const job = makeJob();
  const reported: RecordingMergeResult[] = [];
  const runner = new MergeRunner(
    {
      claim: async () => claimed(job),
      complete: async (_id, _token, result) => {
        reported.push(result);
      },
    },
    { merge: async () => ({ duration: 42 }) },
    60_000,
  );
  await runner.run(job, new AbortController().signal);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].success, true);
  assert.equal(reported[0].duration, 42);
});

test('reports a failed merge, then asks the queue to retry', async () => {
  const job = makeJob();
  const reported: RecordingMergeResult[] = [];
  const runner = new MergeRunner(
    {
      claim: async () => claimed(job),
      complete: async (_id, _token, result) => {
        reported.push(result);
      },
    },
    {
      merge: async () => {
        throw new Error('ffmpeg exited with code 1');
      },
    },
    60_000,
  );
  await assert.rejects(
    runner.run(job, new AbortController().signal),
    (e: HttpError) => e.status === 503,
  );
  assert.equal(reported[0].success, false);
  assert.match(reported[0].error || '', /ffmpeg exited/);
});

test('skips a job the backend already completed', async () => {
  const job = makeJob();
  let merged = false;
  const runner = new MergeRunner(
    {
      claim: async () => ({ status: 'completed' as const }),
      complete: async () => undefined,
    },
    {
      merge: async () => {
        merged = true;
        return { duration: 1 };
      },
    },
    60_000,
  );
  await runner.run(job, new AbortController().signal);
  assert.equal(merged, false);
});

test('merge mode serves the root and /merge, not /transcode', async () => {
  const runs: string[] = [];
  const { server } = createWorkerServer(
    { run: async (job: RecordingMergeJob) => void runs.push(job.jobId) },
    secret,
    { parse: parseMergeEnvelope, alias: '/merge' },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const post = (route: string) =>
    fetch(`http://127.0.0.1:${port}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sign(makeJob())),
    });
  try {
    assert.equal((await post('/')).status, 200);
    assert.equal((await post('/merge')).status, 200);
    assert.equal((await post('/transcode')).status, 404);
    assert.equal(runs.length, 2);
  } finally {
    server.close();
  }
});
