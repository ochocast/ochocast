import 'dotenv/config';
import { createServer, IncomingMessage } from 'node:http';
import { createS3Client } from './config/s3.config';
import { JobProcessorService } from './services/job-processor.service';
import { BackendClient } from './serverless/backend-client';
import { HttpError, parseJobEnvelope } from './serverless/job-envelope';
import { JobRunner } from './serverless/job-runner';

async function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        chunks.length = 0;
        reject(new HttpError(413, 'Job message too large'));
        return; // Continue draining without buffering, so the response can be delivered.
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      if (size > 64 * 1024) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    request.on('error', reject);
    request.on('aborted', () => reject(new HttpError(400, 'Request aborted')));
  });
}

export function createWorkerServer(
  runner: Pick<JobRunner, 'run'>,
  dispatchSecret: string,
) {
  let busy = false;
  const shutdown = new AbortController();
  const server = createServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.method === 'GET' && request.url === '/health') {
      send(shutdown.signal.aborted ? 503 : 200, {
        status: shutdown.signal.aborted ? 'stopping' : 'ok',
      });
      return;
    }
    // Scaleway Queue triggers POST the message body to the container root.
    if (
      request.method !== 'POST' ||
      !['/', '/transcode'].includes(request.url || '')
    ) {
      send(404, { error: 'Not found' });
      return;
    }
    if (busy || shutdown.signal.aborted) {
      send(503, { error: 'Worker busy' });
      return;
    }
    busy = true;
    try {
      const job = parseJobEnvelope(await readJson(request), dispatchSecret);
      await runner.run(job, shutdown.signal);
      send(200, { jobId: job.jobId, success: true });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      console.error(
        'Transcoding request failed:',
        error instanceof Error ? error.message : String(error),
      );
      if (!response.destroyed)
        send(status, {
          error:
            error instanceof HttpError
              ? error.message
              : 'Processing unavailable',
        });
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 30000; // Limit reading the small job message, not its processing time.
  server.headersTimeout = 15000;
  return { server, shutdown };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function main() {
  const dispatchSecret = required('TRANSCODING_DISPATCH_SECRET');
  const callbackSecret = required('TRANSCODING_CALLBACK_SECRET');
  if (dispatchSecret.length < 32 || callbackSecret.length < 32)
    throw new Error('Transcoding secrets must contain at least 32 characters');
  const backendUrl = required('TRANSCODING_BACKEND_URL').replace(/\/$/, '');
  const parsed = new URL(backendUrl);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('Invalid TRANSCODING_BACKEND_URL');
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
    throw new Error('Production backend callbacks require HTTPS');
  if (process.env.NODE_ENV === 'production') {
    for (const name of [
      'STOCK_SERVER_URL',
      'STOCK_CLIENT_ID',
      'STOCK_SECRET',
      'STOCK_REGION',
      'STOCK_MEDIA_BUCKET',
      'STOCK_MINIATURE_BUCKET',
    ])
      required(name);
  }
  const timeoutMs = Number(process.env.TRANSCODING_JOB_TIMEOUT_MS || 3000000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3300000)
    throw new Error('Invalid TRANSCODING_JOB_TIMEOUT_MS (1000..3300000)');
  const s3 = createS3Client();
  const runner = new JobRunner(
    new BackendClient(backendUrl, callbackSecret),
    new JobProcessorService(s3),
    timeoutMs,
  );
  const { server, shutdown } = createWorkerServer(runner, dispatchSecret);
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () =>
    console.log('HTTP transcoder listening'),
  );
  const stop = () => {
    if (shutdown.signal.aborted) return;
    shutdown.abort();
    server.close(() => {
      s3.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 35000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) main();
