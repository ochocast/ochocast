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
  };
  const prefix = `/${S3_CONFIG.mediaBucket}/`;
  const server = createServer(async (request, response) => {
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
