import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createWorkerServer } from '../src/http-worker';
import { parseJobEnvelope } from '../src/serverless/job-envelope';
import { JobRunner } from '../src/serverless/job-runner';
import { BackendClient } from '../src/serverless/backend-client';
import { ScalewayQueuesClient } from '../../backend/src/queue/scaleway-queues.client';
import {
  PermanentJobError,
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../src/types/job.types';

const secret = 'test-dispatch-secret-at-least-32-characters';
const job: VideoTranscodingJob = {
  jobId: randomUUID(),
  videoId: randomUUID(),
  originalFileName: 'test.mp4',
  originalKey: 'video/source/original.mp4',
  media_id: 'video/master.m3u8',
  miniature_id: 'miniature.jpg',
  title: 'Test',
  timestamp: Date.now(),
};
const result: VideoTranscodingResult = {
  jobId: job.jobId,
  videoId: job.videoId,
  success: true,
  duration: 10,
  processedAt: Date.now(),
};
const envelope = () => ({
  job,
  signature: createHmac('sha256', secret)
    .update(JSON.stringify(job))
    .digest('hex'),
});
const claim = () => ({
  status: 'claimed' as const,
  job,
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(Date.now() + 3600000).toISOString(),
});

test('signed jobs are accepted; tampered jobs and malformed signatures are rejected', () => {
  assert.deepEqual(parseJobEnvelope(envelope(), secret), job);
  assert.throws(
    () =>
      parseJobEnvelope(
        { ...envelope(), job: { ...job, originalKey: 'other/source' } },
        secret,
      ),
    /signature/,
  );
  assert.throws(
    () => parseJobEnvelope({ job, signature: 'abcd' }, secret),
    /signature/,
  );
});

test('HTTP root and alias validate signatures; only one job runs per instance', async () => {
  let finish!: () => void;
  let started!: () => void;
  const active = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const { server } = createWorkerServer(
    {
      run: async () => {
        calls++;
        started();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    },
    secret,
  );
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(`${url}${path}`, { method: 'POST', body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await post('/', { padding: 'x'.repeat(65536) })).status, 413);
    assert.equal((await post('/', { job, signature: 'bad' })).status, 401);
    const first = post('/', envelope());
    await active;
    assert.equal((await post('/transcode', envelope())).status, 503);
    assert.equal((await fetch(`${url}/health`)).status, 200);
    finish();
    assert.equal((await first).status, 200);
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('the exact Scaleway queue message is accepted by the HTTP trigger', async () => {
  const received: VideoTranscodingJob[] = [];
  const { server } = createWorkerServer(
    {
      run: async (incoming) => {
        received.push(incoming);
      },
    },
    secret,
  );
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const workerUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const queueUrl = 'https://sqs.mnq.fr-par.scaleway.com/project/queue';
  const client = new ScalewayQueuesClient({
    endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
    region: 'fr-par',
    accessKey: 'SCWTESTACCESS',
    secretKey: 'test-secret',
    fetchImplementation: (async (_target, request) => {
      const parameters = new URLSearchParams(String(request?.body));
      assert.equal(parameters.get('QueueUrl'), queueUrl);
      const delivered = await fetch(`${workerUrl}/`, {
        method: 'POST',
        body: parameters.get('MessageBody'),
      });
      assert.equal(delivered.status, 200);
      return new Response(
        '<SendMessageResponse><SendMessageResult><MessageId>message-1</MessageId></SendMessageResult></SendMessageResponse>',
        { status: 200 },
      );
    }) as typeof fetch,
  });
  try {
    await client.sendMessage(queueUrl, JSON.stringify(envelope()));
    assert.deepEqual(received, [job]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a completed job is acknowledged without encoding or sending another result', async () => {
  const runner = new JobRunner(
    {
      claim: async () => ({ status: 'completed' }),
      complete: async () => assert.fail('unexpected callback'),
    },
    {
      processJob: async () => {
        throw new Error('unexpected encoding');
      },
    },
    1000,
  );
  await runner.run(job, new AbortController().signal);
});

test('result callback is awaited before acknowledging a successful job', async () => {
  let completed = false;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        assert.deepEqual(received, result);
        completed = true;
      },
    },
    { processJob: async () => result },
    1000,
  );
  await runner.run(job, new AbortController().signal);
  assert.equal(completed, true);
});

test('callback outage remains retryable even when FFmpeg succeeded', async () => {
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async () => {
        throw new Error('backend unavailable');
      },
    },
    { processJob: async () => result },
    1000,
  );
  await assert.rejects(
    runner.run(job, new AbortController().signal),
    /backend unavailable/,
  );
});

test('failed encoding is reported and the trigger is not acknowledged', async () => {
  let failure: VideoTranscodingResult | undefined;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        failure = received;
      },
    },
    {
      processJob: async () => {
        throw new Error('invalid video');
      },
    },
    1000,
  );
  await assert.rejects(
    runner.run(job, new AbortController().signal),
    /Transcoding failed/,
  );
  assert.equal(failure?.success, false);
  assert.equal(failure?.error, 'invalid video');
});

const untilAborted = {
  processJob: async (_job: VideoTranscodingJob, signal: AbortSignal) =>
    new Promise<VideoTranscodingResult>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new Error('This operation was aborted')),
        { once: true },
      );
    }),
};

test('a deadline once encoding started is a permanent failure: stored, then acknowledged', async () => {
  let failure: VideoTranscodingResult | undefined;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        failure = received;
      },
    },
    {
      processJob: async (incoming, signal, onEncodingStarted) => {
        onEncodingStarted?.();
        return untilAborted.processJob(incoming, signal);
      },
    },
    10,
  );
  // Another run would hit the same deadline: the trigger must not retry it.
  await runner.run(job, new AbortController().signal);
  assert.equal(failure?.success, false);
  assert.equal(failure?.permanent, true);
  assert.equal(failure?.reason, 'deadline_exceeded');
  assert.match(failure?.error || '', /deadline/);
});

test('a deadline after a short encode (a stalled upload) stays retryable', async () => {
  let failure: VideoTranscodingResult | undefined;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        failure = received;
      },
    },
    {
      processJob: async (
        incoming,
        signal,
        onEncodingStarted,
        onEncodingFinished,
      ) => {
        onEncodingStarted?.();
        onEncodingFinished?.();
        // An upload that hangs until the deadline: another attempt can pass it.
        return untilAborted.processJob(incoming, signal);
      },
    },
    200,
  );
  await assert.rejects(
    runner.run(job, new AbortController().signal),
    /Transcoding failed/,
  );
  assert.equal(failure?.permanent, undefined);
  assert.equal(failure?.reason, undefined);
  assert.match(failure?.error || '', /deadline exceeded .*after encoding/);
});

test('a deadline after an encode that used most of the budget is permanent', async () => {
  let failure: VideoTranscodingResult | undefined;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        failure = received;
      },
    },
    {
      processJob: async (
        incoming,
        signal,
        onEncodingStarted,
        onEncodingFinished,
      ) => {
        onEncodingStarted?.();
        // The encode alone takes 150 of the 200 ms: the outputs no longer fit.
        await new Promise((resolve) => setTimeout(resolve, 150));
        onEncodingFinished?.();
        return untilAborted.processJob(incoming, signal);
      },
    },
    200,
  );
  await runner.run(job, new AbortController().signal);
  assert.equal(failure?.permanent, true);
  assert.equal(failure?.reason, 'deadline_exceeded');
});

test('a deadline before encoding started (stalled download or probe) stays retryable', async () => {
  let failure: VideoTranscodingResult | undefined;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        failure = received;
      },
    },
    untilAborted,
    10,
  );
  // A stall is transient: another attempt can get past it.
  await assert.rejects(
    runner.run(job, new AbortController().signal),
    /Transcoding failed/,
  );
  assert.equal(failure?.success, false);
  assert.equal(failure?.permanent, undefined);
  assert.equal(failure?.reason, undefined);
  assert.match(failure?.error || '', /deadline exceeded .*before encoding/);
});

test('a shutdown abort releases the lease but stays retryable', async () => {
  let failure: VideoTranscodingResult | undefined;
  const shutdown = new AbortController();
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        failure = received;
      },
    },
    {
      processJob: async (incoming, signal) => {
        setImmediate(() => shutdown.abort());
        return untilAborted.processJob(incoming, signal);
      },
    },
    60000,
  );
  await assert.rejects(runner.run(job, shutdown.signal), /Transcoding failed/);
  assert.equal(failure?.success, false);
  assert.equal(failure?.permanent, undefined);
});

test('a permanent failure result is stored and acknowledged without retry', async () => {
  const permanent: VideoTranscodingResult = {
    ...result,
    success: false,
    duration: 0,
    error: 'Source has no video stream',
    permanent: true,
    reason: 'invalid_source',
  };
  let stored: VideoTranscodingResult | undefined;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        stored = received;
      },
    },
    { processJob: async () => permanent },
    1000,
  );
  await runner.run(job, new AbortController().signal);
  assert.deepEqual(stored, permanent);
});

test('a thrown permanent error (source too large) is reported as permanent and acknowledged', async () => {
  let stored: VideoTranscodingResult | undefined;
  const runner = new JobRunner(
    {
      claim: async () => claim(),
      complete: async (_id, _token, received) => {
        stored = received;
      },
    },
    {
      processJob: async () => {
        throw new PermanentJobError(
          'source_too_large',
          'Source exceeds configured size limit',
        );
      },
    },
    1000,
  );
  await runner.run(job, new AbortController().signal);
  assert.equal(stored?.success, false);
  assert.equal(stored?.permanent, true);
  assert.equal(stored?.reason, 'source_too_large');
  assert.equal(stored?.error, 'Source exceeds configured size limit');
});

test('a backend predating permanent failures (400) receives a plain failure instead', async (t) => {
  const bodies: Array<{ result: VideoTranscodingResult }> = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      // forbidNonWhitelisted: an older backend refuses unknown result fields.
      const known = [
        'jobId',
        'videoId',
        'success',
        'duration',
        'subtitle_id',
        'error',
        'processedAt',
      ];
      return new Response('{}', {
        status: Object.keys(body.result).every((key) => known.includes(key))
          ? 200
          : 400,
      });
    },
  );
  t.mock.method(console, 'warn', () => {});
  const client = new BackendClient('http://backend/api', secret);
  const plainFailure = { ...result, success: false, error: 'too long' };
  // A permanent failure, and a transient one after the probe (S3 outage).
  for (const extra of [
    {
      permanent: true,
      reason: 'duration_exceeded',
      sourceCodecsPlayable: true,
    },
    { sourceCodecsPlayable: false },
  ] as const) {
    bodies.length = 0;
    await client.complete(job.jobId, randomUUID(), {
      ...plainFailure,
      ...extra,
    });
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[1].result, plainFailure);
  }
});

test('backend client retries transient callbacks, but rejects an expired lease', async (t) => {
  let calls = 0;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('{}', { status: calls < 3 ? 503 : 200 });
  });
  const client = new BackendClient('http://backend/api', secret);
  await client.complete(job.jobId, randomUUID(), result);
  assert.equal(calls, 3);
  // Re-mocking fetch would leak the first mock into later tests.
  fetchMock.mock.mockImplementation(
    async () => new Response('{}', { status: 409 }),
  );
  await assert.rejects(
    client.complete(job.jobId, randomUUID(), result),
    /rejected/,
  );
});

const encodeOnce = () => ({
  processJob: async () => assert.fail('unexpected encoding'),
});

test('a deleted job (410) is discarded with a log line and no encoding', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{}', { status: 410 }),
  );
  const log = t.mock.method(console, 'log', () => {});
  const client = new BackendClient('http://backend/api', secret);
  await new JobRunner(client, encodeOnce(), 1000).run(
    job,
    new AbortController().signal,
  );
  await client.complete(job.jobId, randomUUID(), result);
  const lines = log.mock.calls.map((call) => call.arguments.join(' '));
  assert.equal(lines.filter((line) => line.includes(job.jobId)).length, 2);
});

test('a callback 404 (route, ingress or version skew) is retryable, never success', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{}', { status: 404 }),
  );
  const client = new BackendClient('http://backend/api', secret);
  const notFound = { status: 503, message: /route not found \(404\)/ };
  await assert.rejects(
    new JobRunner(client, encodeOnce(), 1000).run(
      job,
      new AbortController().signal,
    ),
    notFound,
  );
  await assert.rejects(
    client.complete(job.jobId, randomUUID(), result),
    notFound,
  );
});

test('callback redirects are refused and never forward the secret', async () => {
  const leaked: string[] = [];
  const target = createServer((request, response) => {
    leaked.push(String(request.headers['x-transcoding-token']));
    response.writeHead(404).end();
  });
  target.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => target.once('listening', resolve));
  const targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
  const backend = createServer((request, response) => {
    response.writeHead(302, { Location: `${targetUrl}${request.url}` }).end();
  });
  backend.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => backend.once('listening', resolve));
  const client = new BackendClient(
    `http://127.0.0.1:${(backend.address() as AddressInfo).port}/api`,
    secret,
  );
  try {
    await assert.rejects(client.claim(job), { status: 503 });
    await assert.rejects(client.complete(job.jobId, randomUUID(), result), {
      status: 503,
    });
    assert.deepEqual(leaked, []);
  } finally {
    for (const server of [backend, target]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
