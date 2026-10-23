import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseEnv } from 'node:util';
import {
  configureLocalFiles,
  prepareLocalEnvironment,
  updateEnv,
} from './configure-local-scaleway-queue.mjs';

const config = {
  schema_version: 1,
  purpose: 'ochocast-local-ffmpeg',
  queue_name: 'ochocast-local-ffmpeg-thomas',
  queue_url:
    'https://sqs.mnq.fr-par.scaleway.com/project/ochocast-local-ffmpeg-thomas',
  endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
  region: 'fr-par',
  publisher_access_key: 'publish-access',
  publisher_secret_key: 'publish-secret',
  consumer_access_key: 'receive-access',
  consumer_secret_key: 'receive-secret',
  lease_seconds: 3600,
  visibility_timeout_seconds: 3900,
};
const dispatch = 'dispatch-test-secret-at-least-32-characters';
const callback = 'callback-test-secret-at-least-32-characters';
const secrets = `TRANSCODING_DISPATCH_SECRET=${dispatch}\nTRANSCODING_CALLBACK_SECRET=${callback}\n`;

test('imports separate cloud credentials, enables the bridge and preserves local settings', () => {
  const prepared = prepareLocalEnvironment(
    config,
    '# Keep this comment\nNODE_ENV=development\nTRANSCODING_QUEUE_PROVIDER=local\nPG_PASSWORD=unchanged\nSTOCK_SERVER_URL=http://localhost:9000\n' +
      secrets,
    'MINIO_ACCESS_KEY=unchanged\n' + secrets,
  );
  const backend = parseEnv(prepared.backend);
  assert.equal(backend.TRANSCODING_QUEUE_PROVIDER, 'scaleway');
  assert.equal(backend.TRANSCODING_QUEUE_ACCESS_KEY, 'publish-access');
  assert.equal(backend.LOCAL_QUEUE_BRIDGE_ACCESS_KEY, 'receive-access');
  assert.equal(
    backend.LOCAL_QUEUE_BRIDGE_QUEUE_URL,
    backend.TRANSCODING_QUEUE_URL,
  );
  assert.equal(backend.LOCAL_QUEUE_BRIDGE_WORKER_URL, 'http://127.0.0.1:8081/');
  assert.equal(backend.TRANSCODING_LEASE_SECONDS, '3600');
  assert.equal(backend.PG_PASSWORD, 'unchanged');
  assert.equal(backend.STOCK_SERVER_URL, 'http://localhost:9000');
  assert.ok(prepared.backend.includes('# Keep this comment'));
  assert.equal(parseEnv(prepared.worker).TRANSCODING_DISPATCH_SECRET, dispatch);
  assert.equal(parseEnv(prepared.worker).MINIO_ACCESS_KEY, 'unchanged');
  assert.ok(!prepared.worker.includes('receive-secret'));
  assert.ok(!prepared.worker.includes('publish-secret'));
});

test('generates distinct shared secrets only when missing and remains idempotent', () => {
  const first = prepareLocalEnvironment(config, 'NODE_ENV=development\n', '');
  const backend = parseEnv(first.backend);
  const worker = parseEnv(first.worker);
  assert.equal(backend.TRANSCODING_DISPATCH_SECRET.length, 64);
  assert.notEqual(
    backend.TRANSCODING_DISPATCH_SECRET,
    backend.TRANSCODING_CALLBACK_SECRET,
  );
  assert.equal(
    worker.TRANSCODING_DISPATCH_SECRET,
    backend.TRANSCODING_DISPATCH_SECRET,
  );
  assert.equal(
    worker.TRANSCODING_CALLBACK_SECRET,
    backend.TRANSCODING_CALLBACK_SECRET,
  );
  assert.deepEqual(
    prepareLocalEnvironment(config, first.backend, first.worker),
    first,
  );
});

test('adopts existing FFmpeg secrets instead of rotating them', () => {
  const prepared = prepareLocalEnvironment(
    config,
    'NODE_ENV=development\n',
    secrets,
  );
  assert.equal(
    parseEnv(prepared.backend).TRANSCODING_DISPATCH_SECRET,
    dispatch,
  );
});

test('removes duplicate assignments, keeps CRLF and safely quotes special characters', () => {
  const result = updateEnv(
    '# comment\r\nKEY=old\r\nexport KEY=older\r\nOTHER=ok\r\n',
    { KEY: 'new#value$LITERAL' },
  );
  assert.equal(parseEnv(result).KEY, 'new#value$LITERAL');
  assert.ok(result.includes("KEY='new#value$LITERAL'"));
  assert.equal(result.match(/KEY=/g).length, 1);
  assert.ok(result.includes('\r\nOTHER=ok\r\n'));
});

test('refuses multiline controlled settings instead of leaving dangling dotenv content', () => {
  assert.throws(
    () => updateEnv('KEY="first\nsecond"\n', { KEY: 'replacement' }),
    /single-line/,
  );
});

test('refuses a staging/production queue or a foreign Terraform output', () => {
  for (const invalid of [
    { purpose: 'staging' },
    { schema_version: 2 },
    { queue_name: 'ochocast-staging-ffmpeg' },
    { queue_name: 'ochocast-local-ffmpeg-prod' },
    { queue_url: config.queue_url.replace('thomas', 'someoneelse') },
  ]) {
    assert.throws(() =>
      prepareLocalEnvironment({ ...config, ...invalid }, '', ''),
    );
  }
});

test('refuses non-Scaleway, HTTP, cross-origin and authenticated URLs', () => {
  for (const invalid of [
    { endpoint: 'http://sqs.mnq.fr-par.scaleway.com' },
    { endpoint: 'https://queue.example.com' },
    { queue_url: 'https://queue.example.com/ochocast-local-ffmpeg-thomas' },
    { queue_url: config.queue_url + '?token=secret' },
    {
      queue_url: config.queue_url.replace('https://', 'https://user:password@'),
    },
    { region: 'invalid' },
  ]) {
    assert.throws(() =>
      prepareLocalEnvironment({ ...config, ...invalid }, '', ''),
    );
  }
});

test('refuses bad credentials without including their value in errors', () => {
  const injected = 'sensitive-key\nINJECTED=value';
  assert.throws(
    () =>
      prepareLocalEnvironment(
        { ...config, consumer_secret_key: injected },
        '',
        '',
      ),
    (error) => {
      assert.ok(!error.message.includes('sensitive-key'));
      return /consumer_secret_key/.test(error.message);
    },
  );
});

test('refuses production environments, unsafe timeouts and conflicting/weak secrets', () => {
  assert.throws(
    () => prepareLocalEnvironment(config, 'NODE_ENV=production\n', ''),
    /local development/,
  );
  assert.throws(
    () => prepareLocalEnvironment(config, '', 'NODE_ENV=production\n'),
    /local development/,
  );
  assert.throws(
    () =>
      prepareLocalEnvironment(
        { ...config, visibility_timeout_seconds: 60 },
        '',
        '',
      ),
    /visibility/,
  );
  assert.throws(
    () =>
      prepareLocalEnvironment(
        config,
        secrets,
        secrets.replace(dispatch, callback),
      ),
    /differs/,
  );
  assert.throws(
    () =>
      prepareLocalEnvironment(config, secrets.replace(dispatch, 'short'), ''),
    /at least 32/,
  );
  assert.throws(
    () =>
      prepareLocalEnvironment(config, secrets.replace(callback, dispatch), ''),
    /different secrets/,
  );
});

test('writes private local files, saves original values once and preserves them on reimport', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ochocast-local-queue-config-'));
  try {
    mkdirSync(join(directory, 'backend'));
    mkdirSync(join(directory, 'ffmpegServer'));
    const backendPath = join(directory, 'backend/.env');
    const workerPath = join(directory, 'ffmpegServer/.env');
    const original = 'NODE_ENV=development\nPG_PASSWORD=keep\n' + secrets;
    writeFileSync(backendPath, original);
    writeFileSync(workerPath, secrets);
    configureLocalFiles(config, directory);
    assert.equal(
      readFileSync(backendPath + '.local-queue.backup', 'utf8'),
      original,
    );
    assert.equal(
      readFileSync(workerPath + '.local-queue.backup', 'utf8'),
      secrets,
    );
    const configured = readFileSync(backendPath, 'utf8');
    configureLocalFiles(config, directory);
    assert.equal(readFileSync(backendPath, 'utf8'), configured);
    assert.equal(
      readFileSync(backendPath + '.local-queue.backup', 'utf8'),
      original,
    );
    for (const path of [
      backendPath,
      workerPath,
      backendPath + '.local-queue.backup',
    ]) {
      assert.equal(statSync(path).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('validation failures leave local files unchanged', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ochocast-local-queue-config-'));
  try {
    mkdirSync(join(directory, 'backend'));
    mkdirSync(join(directory, 'ffmpegServer'));
    const backendPath = join(directory, 'backend/.env');
    writeFileSync(backendPath, 'NODE_ENV=production\n');
    assert.throws(
      () => configureLocalFiles(config, directory),
      /local development/,
    );
    assert.equal(readFileSync(backendPath, 'utf8'), 'NODE_ENV=production\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
