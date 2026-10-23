import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { S3Client } from '@aws-sdk/client-s3';
import { TranscodingService } from '../src/services/transcoding.service';
import { S3_CONFIG } from '../src/config/s3.config';

// A local S3 endpoint: the real uploadFile, lib-storage Upload and S3Client
// send real PUT requests, and concurrency is measured where it matters.
type Put = { key: string; contentType?: string; activeAtStart: number };
const fakeS3 = async (
  respond: (
    key: string,
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void> | void,
) => {
  const state = {
    active: 0,
    peak: 0,
    puts: [] as Put[],
    finished: [] as string[],
    deleted: [] as string[],
    // What DeleteObjects answers, and after how long.
    deleteResult: '<DeleteResult></DeleteResult>',
    deleteDelayMs: 0,
  };
  const prefix = `/${S3_CONFIG.mediaBucket}/`;
  const server = createServer(async (request, response) => {
    // DeleteObjects: POST /<bucket>?delete with the keys in an XML body.
    if (request.method === 'POST' && (request.url || '').includes('?delete')) {
      let body = '';
      for await (const chunk of request) body += chunk;
      for (const [, key] of body.matchAll(/<Key>([^<]+)<\/Key>/g))
        state.deleted.push(key);
      await sleep(state.deleteDelayMs);
      if (!response.destroyed)
        response
          .writeHead(200, { 'Content-Type': 'application/xml' })
          .end(state.deleteResult);
      return;
    }
    const key = decodeURIComponent(
      (request.url || '').split('?')[0].slice(prefix.length),
    );
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    state.puts.push({
      key,
      contentType: request.headers['content-type'],
      activeAtStart: state.active,
    });
    try {
      for await (const _chunk of request);
      await respond(key, request, response);
    } finally {
      state.active--;
      state.finished.push(key);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = new S3Client({
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  return {
    client,
    state,
    close: async () => {
      client.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};
const ok = async (
  _key: string,
  _request: IncomingMessage,
  response: ServerResponse,
) => {
  await sleep(20);
  response.writeHead(200, { ETag: '"etag"' }).end();
};

// A flat HLS output: three playlists with their segments, and the master.
const hlsOutput = async (segments: number) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ochocast-hls-upload-'));
  const files = ['master.m3u8'];
  for (const name of ['360p', '480p', '720p']) {
    files.push(`${name}.m3u8`);
    for (let index = 0; index < segments; index++)
      files.push(`${name}${index}.ts`);
  }
  await Promise.all(
    files.map((file) => writeFile(path.join(directory, file), `${file}\n`)),
  );
  return { directory, files };
};
const setEnv = (
  t: { after: (fn: () => void) => void },
  name: string,
  value: string | undefined,
) => {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
};
const run = async (
  t: { after: (fn: () => Promise<void>) => void },
  segments: number,
  respond: Parameters<typeof fakeS3>[0],
  signal?: AbortSignal,
) => {
  const output = await hlsOutput(segments);
  const s3 = await fakeS3(respond);
  t.after(async () => {
    await s3.close();
    await rm(output.directory, { recursive: true, force: true });
  });
  const upload = new TranscodingService(s3.client, signal).uploadHLSFiles(
    output.directory,
    'video',
  );
  return { ...output, ...s3, upload };
};

test('HLS files upload TRANSCODING_UPLOAD_CONCURRENCY at a time, the master last once every other file is stored', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', '3');
  t.mock.method(console, 'log', () => {});
  const { files, state, upload } = await run(t, 5, ok);
  assert.equal(await upload, files.length);
  assert.equal(state.peak, 3);
  assert.deepEqual(
    state.puts.map(({ key }) => key).sort(),
    files.map((file) => `video/${file}`).sort(),
  );
  const master = state.puts.at(-1);
  assert.equal(master?.key, 'video/master.m3u8');
  assert.equal(master?.activeAtStart, 1, 'nothing else in flight');
  assert.equal(state.finished.indexOf('video/master.m3u8'), files.length - 1);
  assert.deepEqual(state.deleted, []);
  for (const { key, contentType } of state.puts)
    assert.equal(
      contentType,
      key.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
    );
});

test('HLS uploads run 8 at a time by default', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', undefined);
  t.mock.method(console, 'log', () => {});
  const { files, state, upload } = await run(t, 8, ok);
  assert.equal(await upload, files.length);
  assert.equal(state.peak, 8);
  assert.equal(state.puts.at(-1)?.key, 'video/master.m3u8');
});

test('an invalid TRANSCODING_UPLOAD_CONCURRENCY rejects before any upload', async (t) => {
  for (const value of ['0', '-1', '1.5', 'eight']) {
    setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', value);
    const { state, upload } = await run(t, 1, ok);
    await assert.rejects(upload, /Invalid TRANSCODING_UPLOAD_CONCURRENCY/);
    assert.equal(state.puts.length, 0, value);
  }
});

test('a failed HLS upload stops new uploads, waits for those in flight, and never publishes the master', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', '4');
  t.mock.method(console, 'log', () => {});
  const { files, state, upload } = await run(
    t,
    8,
    async (key, _request, response) => {
      if (key === 'video/360p3.ts') {
        // Not retried by the SDK: the upload fails at once.
        response
          .writeHead(403, { 'Content-Type': 'application/xml' })
          .end(
            '<Error><Code>AccessDenied</Code><Message>denied</Message></Error>',
          );
        return;
      }
      await ok(key, _request, response);
    },
  );
  await assert.rejects(upload, { name: 'AccessDenied' });
  assert.equal(state.active, 0, 'uploads in flight settled before rejecting');
  assert.ok(
    state.puts.length < files.length - 1,
    `${state.puts.length} uploads started after a failure`,
  );
  assert.equal(
    state.puts.some(({ key }) => key === 'video/master.m3u8'),
    false,
  );
  // Nothing left to fail later as an unhandled stream error.
  await sleep(100);
});

test('an abort stops HLS uploads, in flight and pending, and never publishes the master', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', '4');
  t.mock.method(console, 'log', () => {});
  const controller = new AbortController();
  // S3 never answers: only the abort ends the uploads.
  const { files, state, upload } = await run(
    t,
    8,
    () => new Promise<void>(() => {}),
    controller.signal,
  );
  const waitUntil = Date.now() + 2000;
  while (state.puts.length < 4 && Date.now() < waitUntil) await sleep(5);
  controller.abort();
  await assert.rejects(upload, { name: 'AbortError' });
  await sleep(100);
  assert.equal(state.puts.length, 4, 'no upload started after the abort');
  assert.ok(state.puts.length < files.length);
  assert.equal(
    state.puts.some(({ key }) => key === 'video/master.m3u8'),
    false,
  );
});

// Otherwise they stay in the bucket: a retry uploads them again, and a video
// played from its source never serves them.
test('a failed HLS upload deletes the renditions it started, never the master', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', '4');
  t.mock.method(console, 'log', () => {});
  const { state, upload } = await run(t, 8, async (key, request, response) => {
    if (key === 'video/360p3.ts') {
      response
        .writeHead(403, { 'Content-Type': 'application/xml' })
        .end(
          '<Error><Code>AccessDenied</Code><Message>denied</Message></Error>',
        );
      return;
    }
    await ok(key, request, response);
  });
  await assert.rejects(upload, { name: 'AccessDenied' });
  assert.deepEqual(
    [...state.deleted].sort(),
    state.puts.map(({ key }) => key).sort(),
  );
  assert.equal(state.deleted.includes('video/master.m3u8'), false);
});

test('an aborted HLS upload (job deadline) deletes the renditions it started', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', '4');
  t.mock.method(console, 'log', () => {});
  const controller = new AbortController();
  const { state, upload } = await run(
    t,
    8,
    () => new Promise<void>(() => {}),
    controller.signal,
  );
  const waitUntil = Date.now() + 2000;
  while (state.puts.length < 4 && Date.now() < waitUntil) await sleep(5);
  controller.abort();
  await assert.rejects(upload, { name: 'AbortError' });
  assert.deepEqual(
    [...state.deleted].sort(),
    state.puts.map(({ key }) => key).sort(),
  );
});

// With Quiet, S3 answers 200 and lists the keys it refused in Errors.
test('keys S3 refuses to delete are logged', async (t) => {
  setEnv(t, 'TRANSCODING_UPLOAD_CONCURRENCY', '4');
  t.mock.method(console, 'log', () => {});
  const warn = t.mock.method(console, 'warn', () => {});
  const { state, upload } = await run(t, 8, async (key, request, response) => {
    if (key === 'video/360p3.ts') {
      response
        .writeHead(403, { 'Content-Type': 'application/xml' })
        .end(
          '<Error><Code>AccessDenied</Code><Message>denied</Message></Error>',
        );
      return;
    }
    await ok(key, request, response);
  });
  state.deleteResult =
    '<DeleteResult><Error><Key>video/360p0.ts</Key><Code>AccessDenied</Code>' +
    '<Message>denied</Message></Error></DeleteResult>';
  await assert.rejects(upload, { name: 'AccessDenied' });
  const logged = warn.mock.calls.map((call) => String(call.arguments[0]));
  assert.ok(
    logged.some(
      (line) =>
        line.includes('1 partial HLS file') &&
        line.includes('video/360p0.ts (AccessDenied)'),
    ),
    logged.join('\n'),
  );
});

// The lease outlives the job deadline by as little as 30 s: the cleanup has
// one budget for every batch of 1000 keys, not one each.
test('the cleanup of a partial upload stops at its budget, across batches', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const s3 = await fakeS3(ok);
  t.after(() => s3.close());
  s3.state.deleteDelayMs = 300;
  const keys = Array.from({ length: 1500 }, (_, index) => `video/${index}.ts`);
  const started = Date.now();
  await (
    new TranscodingService(s3.client) as unknown as {
      deletePartialUpload(keys: string[], budgetMs: number): Promise<void>;
    }
  ).deletePartialUpload(keys, 400);
  const elapsed = Date.now() - started;
  // Two batches of 300 ms each would take 600 ms.
  assert.ok(elapsed < 520, `cleanup took ${elapsed} ms`);
  assert.equal(warn.mock.callCount(), 1);
});
