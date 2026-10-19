import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

// The worker as deployed, with a valid configuration except one setting.
const boot = (setting: Record<string, string>) =>
  spawnSync(
    process.execPath,
    ['-r', 'ts-node/register', path.join(__dirname, '../src/http-worker.ts')],
    {
      env: {
        PATH: process.env.PATH,
        TS_NODE_TRANSPILE_ONLY: '1',
        NODE_ENV: 'test',
        PORT: '0',
        TRANSCODING_DISPATCH_SECRET: 'd'.repeat(32),
        TRANSCODING_CALLBACK_SECRET: 'c'.repeat(32),
        TRANSCODING_BACKEND_URL: 'http://127.0.0.1:1/api',
        ...setting,
      },
      encoding: 'utf8',
      // A worker that accepted the setting would keep listening.
      timeout: 8000,
    },
  );

for (const [name, value] of [
  ['TRANSCODING_MAX_DURATION_SECONDS', '3600s'],
  ['TRANSCODING_UPLOAD_CONCURRENCY', '0'],
  ['FFMPEG_THREADS', 'four'],
]) {
  test(`the worker refuses to boot with an invalid ${name}, before any job`, () => {
    const worker = boot({ [name]: value });
    // spawnSync reports ETIMEDOUT when it had to stop a running worker.
    assert.equal(worker.error, undefined, 'the worker kept running');
    assert.notEqual(worker.status, 0);
    assert.match(worker.stderr, new RegExp(name));
  });
}
