const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { mkdtemp, rm, stat, readdir, copyFile, mkdir, access } = require('node:fs/promises');
const { join } = require('node:path');
const { homedir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { S3ObjectStorage } = require('../dist/services/object-storage');
const { TranscodingService } = require('../dist/services/transcoding.service');

async function scratch() {
  const root = process.env.UPLOAD_TEST_TMP || join(homedir(), '.cache/ochocast-upload-tests');
  await mkdir(root, { recursive: true }); return mkdtemp(join(root, 'test-'));
}
test('streams a 2 GiB source to disk with bounded RSS', async () => {
  const dir = await scratch();
  const size = 2 * 1024 ** 3;
  const chunk = Buffer.alloc(64 * 1024, 7);
  const source = Readable.from((async function* () { for (let i = 0; i < size / chunk.length; i++) yield chunk; })());
  const storage = new S3ObjectStorage({ send: async () => ({ Body: source, ContentLength: size }) });
  const initial = process.memoryUsage().rss; let peak = initial;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  try {
    const file = join(dir, 'source');
    await storage.download('media', 'key', file, size, new AbortController().signal);
    assert.equal((await stat(file)).size, size);
    assert.ok(peak - initial < 192 * 1024 ** 2, `RSS grew ${(peak - initial) / 1024 ** 2} MiB`);
    console.log(`2 GiB streaming: peak RSS ${(peak / 1024 ** 2).toFixed(1)} MiB; delta ${((peak - initial) / 1024 ** 2).toFixed(1)} MiB`);
  } finally { clearInterval(timer); await rm(dir, { recursive: true, force: true }); }
});
test('interrupted and truncated downloads remove their partial files', async () => {
  const dir = await scratch();
  try {
    const controller = new AbortController();
    const body = new Readable({ read() { this.push(Buffer.alloc(65536)); controller.abort(); } });
    const storage = new S3ObjectStorage({ send: async () => ({ Body: body }) });
    await assert.rejects(storage.download('b', 'k', join(dir, 'partial'), 1024 ** 3, controller.signal));
    assert.deepEqual(await readdir(dir), []);
    const truncated = new S3ObjectStorage({ send: async () => ({ Body: Readable.from(['abc']), ContentLength: 20 }) });
    await assert.rejects(truncated.download('b', 'k', join(dir, 'partial'), 100, new AbortController().signal), /Incomplete/);
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('abort kills a running child process promptly', async () => {
  const controller = new AbortController();
  const transcoder = new TranscodingService({}, controller.signal);
  const promise = transcoder.runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(promise, /exited/);
});
test('encodes 12 seconds, publishes playlists last, retains source and replays after failure', async () => {
  const dir = await scratch(); const source = join(dir, 'source.mp4');
  const oldRoot = process.env.TRANSCODING_TMP_DIR;
  process.env.TRANSCODING_TMP_DIR = join(dir, 'scratch'); process.env.FFMPEG_THREADS = '1';
  const uploaded = [];
  let fail = true;
  const storage = {
    download: async (_bucket, _key, target) => copyFile(source, target),
    upload: async (_bucket, key, file) => {
      if (fail) throw new Error('simulated S3 outage');
      await access(file); uploaded.push(key);
    },
  };
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10', '-t', '12', '-c:v', 'libx264', '-threads', '1', source]);
    const job = { jobId: '11111111-1111-4111-8111-111111111111', videoId: '22222222-2222-4222-8222-222222222222', originalKey: 'source', miniature_id: 'thumb.jpg' };
    const transcoder = new TranscodingService(storage);
    assert.equal((await transcoder.processJob(job)).success, false);
    assert.deepEqual(await readdir(process.env.TRANSCODING_TMP_DIR), []);
    await access(source); fail = false;
    const result = await transcoder.processJob(job);
    assert.equal(result.success, true); assert.equal(result.duration, 12);
    assert.equal(uploaded.at(-1), result.media_id);
    assert.ok(uploaded.some(key => key.endsWith('.ts')));
    assert.deepEqual(await readdir(process.env.TRANSCODING_TMP_DIR), []);
    await access(source);
  } finally {
    if (oldRoot === undefined) delete process.env.TRANSCODING_TMP_DIR; else process.env.TRANSCODING_TMP_DIR = oldRoot;
    await rm(dir, { recursive: true, force: true });
  }
});
