import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { analyzeFile } from '../src/services/analysis.service';
import { AnalysisMessage, AnalysisJob } from '../src/types/analysis.types';
import { parseEditEnvelope } from '../src/serverless/analysis-envelope';
import { parseRenderEnvelope } from '../src/serverless/render-envelope';
import { AnalysisRunner } from '../src/serverless/analysis-runner';
import { createWorkerServer } from '../src/http-worker';
const exec = promisify(execFile);
const settings = { noiseDb: -35, minSilenceSeconds: 0.8, timeoutMs: 300000 };
const secret = 'analysis-test-secret-at-least-32-characters';
const message = (): AnalysisMessage => ({
  type: 'silence_analysis',
  jobId: randomUUID(),
  videoId: randomUUID(),
  timestamp: Date.now(),
});
const signed = (job: unknown) => ({
  job,
  signature: createHmac('sha256', secret)
    .update(JSON.stringify(job))
    .digest('hex'),
});
test('generated videos with silences, continuous audio, and no audio', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ochocast-silence-test-'));
  try {
    for (const kind of ['silence', 'continuous', 'no_audio']) {
      const file = path.join(dir, kind + '.mkv');
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=32x32:r=2:d=12',
      ];
      if (kind !== 'no_audio')
        args.push(
          '-f',
          'lavfi',
          '-i',
          kind === 'silence'
            ? 'aevalsrc=if(between(t\\,3\\,9)\\,0\\,0.2*sin(2*PI*440*t)):s=16000:d=12'
            : 'sine=frequency=440:sample_rate=16000:duration=12',
        );
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        ...(kind === 'no_audio' ? ['-an'] : ['-c:a', 'pcm_s16le']),
        file,
      );
      await exec(process.env.FFMPEG_PATH || 'ffmpeg', args);
      const progress: number[] = [];
      const result = await analyzeFile(
        file,
        settings,
        new AbortController().signal,
        (n) => progress.push(n),
      );
      if (kind === 'silence') {
        assert.equal(result.outcome, 'cuts');
        assert.equal(result.cuts.length, 1);
        assert.ok(Math.abs(result.cuts[0] - 6) < 0.05);
        assert.ok(result.cuts.every((c) => c >= 5 && c <= result.duration - 5));
        assert.ok(progress.length > 0);
        const stricter = await analyzeFile(
          file,
          { ...settings, minSilenceSeconds: 7 },
          new AbortController().signal,
        );
        assert.equal(stricter.outcome, 'no_silence');
      } else {
        if (kind === 'continuous') {
          const louderThreshold = await analyzeFile(
            file,
            { ...settings, noiseDb: -5 },
            new AbortController().signal,
          );
          assert.equal(louderThreshold.outcome, 'cuts');
        }
        assert.deepEqual(result.cuts, []);
        assert.equal(
          result.outcome,
          kind === 'no_audio' ? 'no_audio' : 'no_silence',
        );
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('legacy parser rejects analysis; new parser keeps legacy renders and rejects unknown types', () => {
  const envelope = signed(message());
  assert.throws(
    () => parseRenderEnvelope(envelope, secret),
    /Unsupported render job type|Invalid job identifiers/,
  );
  assert.equal(
    (parseEditEnvelope(envelope, secret) as AnalysisMessage).type,
    'silence_analysis',
  );
  const old = {
    jobId: randomUUID(),
    videoId: randomUUID(),
    editId: randomUUID(),
    version: 1,
    timestamp: Date.now(),
  };
  assert.deepEqual(parseEditEnvelope(signed(old), secret), old);
  assert.throws(
    () => parseEditEnvelope(signed({ ...old, type: 'future_unknown' }), secret),
    /Unsupported edit job type/,
  );
});
test('unknown type returns HTTP 400 then the worker accepts another job', async () => {
  const calls: string[] = [];
  const { server } = createWorkerServer(
    {
      run: async (job: AnalysisMessage) => {
        calls.push(job.jobId);
      },
    },
    secret,
    {
      parse: (v, s) => parseEditEnvelope(v, s) as AnalysisMessage,
      alias: '/render',
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/`;
    const unknown = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed({ ...message(), type: 'future_unknown' })),
    });
    assert.equal(unknown.status, 400);
    assert.equal(calls.length, 0);
    const next = message();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed(next)),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [next.jobId]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
test('analysis timeout aborts work and reports permanent failure independently of rendering', async () => {
  const msg = message(),
    job: AnalysisJob = {
      ...msg,
      sourceKey: 'video/source.mp4',
      sourceEtag: 'etag',
      sourceBytes: 100,
      duration: 12,
      settings,
    };
  let completed: any;
  const runner = new AnalysisRunner(
    {
      claim: async () => ({
        status: 'claimed',
        job,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 360000).toISOString(),
      }),
      progress: async () => {},
      complete: async (_id, _token, result) => {
        completed = result;
      },
    },
    {
      analyze: async (_job, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('stopped')), {
            once: true,
          });
        }),
    },
    20,
  );
  await runner.run(msg, new AbortController().signal);
  assert.equal(completed.success, false);
  assert.equal(completed.permanent, true);
  assert.match(completed.error, /deadline exceeded/);
});
