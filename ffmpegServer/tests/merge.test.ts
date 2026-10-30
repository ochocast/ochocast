import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { promisify } from 'node:util';
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createWorkerServer } from '../src/http-worker';
import { HttpError } from '../src/serverless/job-envelope';
import { MergeBackendClient } from '../src/serverless/merge-backend-client';
import { parseMergeEnvelope } from '../src/serverless/merge-envelope';
import { MergeRunner } from '../src/serverless/merge-runner';
import { MergeService } from '../src/services/merge.service';
import {
  PermanentJobError,
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
const setEnv = (
  t: { after: (fn: () => void) => void },
  name: string,
  value: string,
) => {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
};
const workRoot = async (t: {
  after: (fn: () => Promise<void>) => void;
}): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'ochocast-merge-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
};
const noMerge = {
  merge: async () => assert.fail('unexpected merge'),
  remove: async () => assert.fail('unexpected removal'),
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
        return 'stored';
      },
    },
    { ...noMerge, merge: async () => ({ duration: 42 }) },
    60_000,
  );
  await runner.run(job, new AbortController().signal);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].success, true);
  assert.equal(reported[0].duration, 42);
});

test('reports a transient failure without the permanent flag, then asks the queue to retry', async () => {
  const job = makeJob();
  const reported: RecordingMergeResult[] = [];
  const runner = new MergeRunner(
    {
      claim: async () => claimed(job),
      complete: async (_id, _token, result) => {
        reported.push(result);
        return 'stored';
      },
    },
    {
      ...noMerge,
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
  // Omitted, not false: the backend puts the job back to pending.
  assert.equal('permanent' in reported[0], false);
});

test('reports a permanent failure with permanent: true, then acknowledges the message', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const job = makeJob();
  const reported: RecordingMergeResult[] = [];
  const runner = new MergeRunner(
    {
      claim: async () => claimed(job),
      complete: async (_id, _token, result) => {
        reported.push(result);
        return 'stored';
      },
    },
    {
      ...noMerge,
      merge: async () => {
        throw new PermanentJobError(
          'invalid_source',
          'Segment 2: Unreadable video source',
        );
      },
    },
    60_000,
  );
  await runner.run(job, new AbortController().signal);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].success, false);
  assert.equal(reported[0].permanent, true);
  assert.match(reported[0].error || '', /Segment 2/);
  assert.match(
    String(warn.mock.calls[0].arguments[0]),
    /failed permanently \(invalid_source\)/,
  );
});

test('a montage deleted during the merge (410 on result) gets its uploaded MP4 removed', async (t) => {
  t.mock.method(console, 'log', () => {});
  const job = makeJob();
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request) =>
      String(input).endsWith('/claim')
        ? new Response(JSON.stringify(claimed(job)), { status: 200 })
        : new Response('{}', { status: 410 }),
  );
  const removed: string[] = [];
  const merger = {
    merge: async () => ({ duration: 5 }),
    remove: async (key: string) => void removed.push(key),
  };
  const client = new MergeBackendClient('http://backend/api', secret);
  await new MergeRunner(client, merger, 60_000).run(
    job,
    new AbortController().signal,
  );
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.deepEqual(removed, [job.targetKey]);

  // A failed attempt uploaded nothing: nothing to remove, nothing to retry.
  await new MergeRunner(
    client,
    {
      ...merger,
      merge: async () => {
        throw new Error('ffmpeg exited with code 1');
      },
    },
    60_000,
  ).run(job, new AbortController().signal);
  assert.deepEqual(removed, [job.targetKey]);

  // The removal is best effort: logged, the message is still acknowledged.
  const error = t.mock.method(console, 'error', () => {});
  await new MergeRunner(
    client,
    {
      ...merger,
      remove: async () => {
        throw new Error('AccessDenied');
      },
    },
    60_000,
  ).run(job, new AbortController().signal);
  assert.match(
    error.mock.calls.map((call) => call.arguments.join(' ')).join('\n'),
    new RegExp(`could not remove ${job.targetKey}: AccessDenied`),
  );
});

test('skips a job the backend already completed', async () => {
  const job = makeJob();
  let merged = false;
  const runner = new MergeRunner(
    {
      claim: async () => ({ status: 'completed' as const }),
      complete: async () => 'stored',
    },
    {
      ...noMerge,
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

// Private steps of MergeService, stubbed around the orchestration under test.
type Steps = {
  probe: (
    input: string,
    index: number,
    signal: AbortSignal,
  ) => Promise<{ hasAudio: boolean }>;
  normalize: (
    input: string,
    output: string,
    hasAudio: boolean,
    signal: AbortSignal,
  ) => Promise<void>;
  runProcess: (
    command: string,
    args: string[],
    signal: AbortSignal,
  ) => Promise<{ stdout: string; stderr: string }>;
  getDuration: (input: string, signal: AbortSignal) => Promise<number>;
  upload: (key: string, file: string, signal: AbortSignal) => Promise<void>;
};
const steps = MergeService.prototype as unknown as Steps;
const tooLarge = (error: unknown) =>
  error instanceof PermanentJobError && error.reason === 'source_too_large';

test('a montage over TRANSCODING_MAX_SOURCE_BYTES fails permanently before any download', async (t) => {
  setEnv(t, 'TRANSCODING_MAX_SOURCE_BYTES', '100');
  setEnv(t, 'TRANSCODING_WORK_DIR', await workRoot(t));
  const sent: string[] = [];
  const s3 = {
    send: async (command: HeadObjectCommand | GetObjectCommand) => {
      if (command instanceof HeadObjectCommand) {
        sent.push(`head ${command.input.Key}`);
        return { ContentLength: 60 };
      }
      sent.push(`get ${command.input.Key}`);
      return { Body: Readable.from([Buffer.alloc(60)]), ContentLength: 60 };
    },
  } as unknown as S3Client;
  await assert.rejects(
    new MergeService(s3).merge(
      ['a.mp4', 'b.mp4'],
      'merged.mp4',
      new AbortController().signal,
    ),
    tooLarge,
  );
  // Each segment fits alone; only their total (120 bytes) is over the budget.
  assert.deepEqual(sent, ['head a.mp4', 'head b.mp4']);
});

test('segments are downloaded, normalized and deleted one at a time', async (t) => {
  const root = await workRoot(t);
  setEnv(t, 'TRANSCODING_WORK_DIR', root);
  const workFiles = async () => {
    const [workDir] = await readdir(root);
    return (await readdir(path.join(root, workDir))).sort();
  };
  const seenAtDownload: string[][] = [];
  const s3 = {
    send: async (command: HeadObjectCommand | GetObjectCommand) => {
      if (command instanceof HeadObjectCommand) return { ContentLength: 3 };
      seenAtDownload.push(await workFiles());
      return { Body: Readable.from([Buffer.from('raw')]), ContentLength: 3 };
    },
  } as unknown as S3Client;
  t.mock.method(steps, 'probe', async () => ({ hasAudio: true }));
  t.mock.method(steps, 'normalize', async (input: string, output: string) => {
    assert.equal(await readFile(input, 'utf8'), 'raw');
    await writeFile(output, 'normalized');
  });
  // The concat: the only FFmpeg run left once normalize is stubbed.
  t.mock.method(
    steps,
    'runProcess',
    async (_command: string, args: string[]) => {
      assert.deepEqual(await workFiles(), [
        'list.txt',
        'norm-0.mp4',
        'norm-1.mp4',
        'norm-2.mp4',
      ]);
      await writeFile(args[args.length - 1], 'merged');
      return { stdout: '', stderr: '' };
    },
  );
  t.mock.method(steps, 'getDuration', async () => 12);
  const uploads: string[] = [];
  t.mock.method(steps, 'upload', async (key: string, file: string) => {
    assert.equal(await readFile(file, 'utf8'), 'merged');
    uploads.push(key);
  });
  const result = await new MergeService(s3).merge(
    ['a.mp4', 'b.mp4', 'c.mp4'],
    'merged.mp4',
    new AbortController().signal,
  );
  assert.deepEqual(result, { duration: 12 });
  // Each raw file is gone before the next download starts.
  assert.deepEqual(seenAtDownload, [
    [],
    ['norm-0.mp4'],
    ['norm-0.mp4', 'norm-1.mp4'],
  ]);
  assert.deepEqual(uploads, ['merged.mp4']);
  assert.deepEqual(await readdir(root), []);
});

test('a segment truncated without moov (brutal stop) fails the merge permanently', async (t) => {
  const root = await workRoot(t);
  setEnv(t, 'TRANSCODING_WORK_DIR', root);
  const clip = path.join(root, 'clip.mp4');
  await promisify(execFile)(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=160x90:r=10',
    '-t',
    '1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    clip,
  ]);
  const whole = await readFile(clip);
  // Without +faststart the moov atom is written last: cut it off.
  const bodies: Record<string, Buffer> = {
    'a.mp4': whole,
    'b.mp4': whole.subarray(0, Math.floor(whole.length / 2)),
  };
  const s3 = {
    send: async (command: HeadObjectCommand | GetObjectCommand) => {
      const body = bodies[command.input.Key || ''];
      if (command instanceof HeadObjectCommand)
        return { ContentLength: body.length };
      return { Body: Readable.from([body]), ContentLength: body.length };
    },
  } as unknown as S3Client;
  const normalize = t.mock.method(
    steps,
    'normalize',
    async (_input: string, output: string, hasAudio: boolean) => {
      assert.equal(hasAudio, false);
      await writeFile(output, 'normalized');
    },
  );
  await assert.rejects(
    new MergeService(s3).merge(
      ['a.mp4', 'b.mp4'],
      'merged.mp4',
      new AbortController().signal,
    ),
    (error: unknown) =>
      error instanceof PermanentJobError &&
      error.reason === 'invalid_source' &&
      /^Segment 2: Unreadable video source/.test(error.message),
  );
  assert.equal(normalize.mock.callCount(), 1);
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
