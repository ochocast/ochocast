import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../src/config/s3.config';

test(
  'an S3 request that stops answering fails instead of hanging until the job deadline',
  { timeout: 15000 },
  async (t) => {
    // Accepts the request, then never answers: a stalled PUT.
    const server = createServer(() => {});
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const previous = process.env.STOCK_SERVER_URL;
    process.env.STOCK_SERVER_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const client = createS3Client(200);
    t.after(async () => {
      if (previous === undefined) delete process.env.STOCK_SERVER_URL;
      else process.env.STOCK_SERVER_URL = previous;
      client.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    const started = Date.now();
    await assert.rejects(
      client.send(
        new PutObjectCommand({
          Bucket: 'media',
          Key: 'video/360p0.ts',
          Body: 'x',
        }),
      ),
    );
    // Three attempts of 200 ms plus backoff, far below a job deadline.
    assert.ok(Date.now() - started < 10000);
  },
);
