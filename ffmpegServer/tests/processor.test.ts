import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { JobRunner } from '../src/serverless/job-runner';
import { JobProcessorService } from '../src/services/job-processor.service';
import { TranscodingService } from '../src/services/transcoding.service';
import {
  PermanentJobError,
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../src/types/job.types';

const job: VideoTranscodingJob = {
  jobId: 'job',
  videoId: 'video',
  originalKey: 'video/source/original.mp4',
  originalFileName: 'test.mp4',
  media_id: 'video/master.m3u8',
  miniature_id: 'image.jpg',
  title: 'Test',
  timestamp: 1,
};

test('source streams to disk; durable success checkpoint bypasses encoding on retry', async (t) => {
  let checkpoint: string | undefined;
  let encodings = 0;
  let downloads = 0;
  const s3 = {
    send: async (command: GetObjectCommand | PutObjectCommand) => {
      if (command instanceof PutObjectCommand) {
        checkpoint = command.input.Body as string;
        return {};
      }
      if (command.input.Key?.endsWith('result.json')) {
        if (checkpoint)
          return { Body: { transformToString: async () => checkpoint } };
        throw Object.assign(new Error('not found'), { name: 'NoSuchKey' });
      }
      downloads++;
      return {
        Body: Readable.from([Buffer.from('video bytes')]),
        ContentLength: 11,
      };
    },
  } as unknown as S3Client;
  let inputPath = '';
  t.mock.method(
    TranscodingService.prototype,
    'processJob',
    async (
      _job: VideoTranscodingJob,
      input: Buffer | string,
      _miniature?: Buffer,
      _subtitle?: Buffer,
      retainSources?: boolean,
    ) => {
      encodings++;
      inputPath = input as string;
      assert.equal((await readFile(inputPath)).toString(), 'video bytes');
      assert.equal(retainSources, true);
      return {
        jobId: job.jobId,
        videoId: job.videoId,
        success: true,
        duration: 1,
        processedAt: 1,
      };
    },
  );
  const processor = new JobProcessorService(s3);
  const first = await processor.processJob(job, new AbortController().signal);
  const second = await processor.processJob(job, new AbortController().signal);
  assert.deepEqual(second, first);
  assert.equal(encodings, 1);
  assert.equal(downloads, 1);
  await assert.rejects(readFile(inputPath), { code: 'ENOENT' });
});

test('S3 authorization errors on the source still fail the job', async () => {
  const s3 = {
    send: async () => {
      throw new Error('AccessDenied');
    },
  } as unknown as S3Client;
  await assert.rejects(
    new JobProcessorService(s3).processJob(job, new AbortController().signal),
    /AccessDenied/,
  );
});

test('a missing output file rejects its upload without crashing the worker', async () => {
  const service = new TranscodingService({} as S3Client) as unknown as {
    uploadFile(
      file: string,
      bucket: string,
      key: string,
      type: string,
    ): Promise<void>;
  };
  await assert.rejects(
    service.uploadFile(
      '/nonexistent-dir/miniature.jpg',
      'b',
      'k',
      'image/jpeg',
    ),
    { code: 'ENOENT' },
  );
  // The stream would emit its own ENOENT later, as an uncaught exception.
  await new Promise((resolve) => setTimeout(resolve, 100));
});

const encodedS3 = (
  checkpointRead: () => never,
  checkpointWrite: (signal?: AbortSignal) => void,
) =>
  ({
    send: async (
      command: GetObjectCommand | PutObjectCommand,
      options?: { abortSignal?: AbortSignal },
    ) => {
      if (command instanceof PutObjectCommand) {
        checkpointWrite(options?.abortSignal);
        return {};
      }
      if (command.input.Key?.endsWith('result.json')) checkpointRead();
      return { Body: Readable.from([Buffer.from('video')]), ContentLength: 5 };
    },
  }) as unknown as S3Client;
const notFound = () => {
  throw Object.assign(new Error('not found'), { name: 'NoSuchKey' });
};
const encoded = {
  jobId: job.jobId,
  videoId: job.videoId,
  success: true,
  duration: 1,
  processedAt: 1,
};

test('a failed checkpoint write does not turn a completed encode into a failure', async (t) => {
  t.mock.method(
    TranscodingService.prototype,
    'processJob',
    async () => encoded,
  );
  const warn = t.mock.method(console, 'warn', () => {});
  const s3 = encodedS3(notFound, () => {
    throw new Error('SlowDown');
  });
  assert.deepEqual(
    await new JobProcessorService(s3).processJob(
      job,
      new AbortController().signal,
    ),
    encoded,
  );
  assert.equal(warn.mock.callCount(), 1);
});

test('the checkpoint write is not cancelled by the job deadline firing after the encode', async (t) => {
  const deadline = new AbortController();
  t.mock.method(TranscodingService.prototype, 'processJob', async () => {
    deadline.abort();
    return encoded;
  });
  let written = false;
  const s3 = encodedS3(notFound, (signal) => {
    if (!signal || signal.aborted) throw new Error('aborted');
    written = true;
  });
  await new JobProcessorService(s3).processJob(job, deadline.signal);
  assert.equal(written, true);
});

test('an unreadable checkpoint is logged and treated as absent', async (t) => {
  let encodings = 0;
  t.mock.method(TranscodingService.prototype, 'processJob', async () => {
    encodings++;
    return encoded;
  });
  const warn = t.mock.method(console, 'warn', () => {});
  const s3 = encodedS3(
    () => {
      throw Object.assign(new Error('InternalError'), {
        $metadata: { httpStatusCode: 500 },
      });
    },
    () => {},
  );
  assert.deepEqual(
    await new JobProcessorService(s3).processJob(
      job,
      new AbortController().signal,
    ),
    encoded,
  );
  assert.equal(encodings, 1);
  assert.equal(warn.mock.callCount(), 1);
});

const leasedRunner = (
  s3: S3Client,
  stored: (result: VideoTranscodingResult) => void,
  timeoutMs: number,
) =>
  new JobRunner(
    {
      claim: async (claimed) => ({
        status: 'claimed',
        job: claimed,
        leaseToken: 'lease',
        leaseExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      complete: async (_id, _token, result) => stored(result),
    },
    new JobProcessorService(s3),
    timeoutMs,
  );

test('a stalled source download that reaches the job deadline is retried, never permanent', async () => {
  // A GET that never answers: only the job deadline ends it.
  const s3 = {
    send: (
      command: GetObjectCommand,
      options?: { abortSignal?: AbortSignal },
    ) =>
      command.input.Key?.endsWith('result.json')
        ? Promise.resolve().then(notFound)
        : new Promise((_resolve, reject) =>
            options?.abortSignal?.addEventListener(
              'abort',
              () => reject(new Error('Request aborted')),
              { once: true },
            ),
          ),
  } as unknown as S3Client;
  let stored: VideoTranscodingResult | undefined;
  await assert.rejects(
    leasedRunner(s3, (result) => (stored = result), 50).run(
      job,
      new AbortController().signal,
    ),
    /can be retried/,
  );
  assert.equal(stored?.success, false);
  assert.equal(stored?.permanent, undefined);
  assert.equal(stored?.reason, undefined);
});

const withAttachments: VideoTranscodingJob = {
  ...job,
  miniatureSourceKey: 'video/source/miniature',
  subtitleSourceKey: 'video/source/subtitle.vtt',
  subtitle_id: 'subtitle.vtt',
};
const sourceS3 = {
  send: async (command: GetObjectCommand) => {
    if (command.input.Key?.endsWith('result.json')) notFound();
    return { Body: Readable.from([Buffer.from('bytes')]), ContentLength: 5 };
  },
} as unknown as S3Client;
// Runs until the job deadline aborts the service's signal.
function untilDeadline(this: unknown) {
  const { signal } = this as { signal: AbortSignal };
  return new Promise<void>((_resolve, reject) =>
    signal.addEventListener('abort', () => reject(new Error('aborted')), {
      once: true,
    }),
  );
}

test('a deadline while the final attachments upload (stalled S3 PUT) stays retryable', async (t) => {
  t.mock.method(TranscodingService.prototype, 'probeSource', async () => 2);
  t.mock.method(
    TranscodingService.prototype,
    'processMiniature',
    async () => {},
  );
  t.mock.method(
    TranscodingService.prototype as unknown as {
      uploadFile: () => Promise<void>;
    },
    'uploadFile',
    untilDeadline,
  );
  const encode = t.mock.method(
    TranscodingService.prototype,
    'transcodeVideoHLS',
    async () => {},
  );
  t.mock.method(console, 'error', () => {});
  let stored: VideoTranscodingResult | undefined;
  await assert.rejects(
    leasedRunner(sourceS3, (result) => (stored = result), 50).run(
      withAttachments,
      new AbortController().signal,
    ),
    /can be retried/,
  );
  assert.equal(stored?.permanent, undefined);
  assert.equal(encode.mock.callCount(), 0);
});

test('a deadline during encoding is permanent, once the final miniature and subtitle are written', async (t) => {
  t.mock.method(TranscodingService.prototype, 'probeSource', async () => 2);
  t.mock.method(
    TranscodingService.prototype,
    'processMiniature',
    async () => {},
  );
  const uploaded: string[] = [];
  t.mock.method(
    TranscodingService.prototype as unknown as {
      uploadFile: (...args: string[]) => Promise<void>;
    },
    'uploadFile',
    async (_file: string, _bucket: string, key: string) => {
      uploaded.push(key);
    },
  );
  let writtenBeforeEncoding: string[] | undefined;
  t.mock.method(
    TranscodingService.prototype,
    'transcodeVideoHLS',
    function (this: unknown) {
      writtenBeforeEncoding = [...uploaded];
      // FFmpeg runs until the job deadline kills it.
      return untilDeadline.call(this);
    },
  );
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  let stored: VideoTranscodingResult | undefined;
  // Another run would hit the same deadline: acknowledged, not retried.
  await leasedRunner(sourceS3, (result) => (stored = result), 200).run(
    withAttachments,
    new AbortController().signal,
  );
  assert.equal(stored?.permanent, true);
  assert.equal(stored?.reason, 'deadline_exceeded');
  assert.equal(stored?.duration, 2);
  // The backend then plays the source with these final attachments.
  assert.deepEqual(writtenBeforeEncoding?.sort(), [
    'image.jpg',
    'subtitle.vtt',
  ]);
});

test('a source above TRANSCODING_MAX_SOURCE_BYTES is a permanent failure, announced or streamed', async (t) => {
  const previous = process.env.TRANSCODING_MAX_SOURCE_BYTES;
  process.env.TRANSCODING_MAX_SOURCE_BYTES = '4';
  t.after(() => {
    if (previous === undefined) delete process.env.TRANSCODING_MAX_SOURCE_BYTES;
    else process.env.TRANSCODING_MAX_SOURCE_BYTES = previous;
  });
  const encode = t.mock.method(
    TranscodingService.prototype,
    'processJob',
    async () => encoded,
  );
  for (const ContentLength of [11, undefined]) {
    const s3 = {
      send: async (command: GetObjectCommand) => {
        if (command.input.Key?.endsWith('result.json')) notFound();
        return {
          Body: Readable.from([Buffer.from('video bytes')]),
          ContentLength,
        };
      },
    } as unknown as S3Client;
    await assert.rejects(
      new JobProcessorService(s3).processJob(job, new AbortController().signal),
      (error: unknown) =>
        error instanceof PermanentJobError &&
        error.reason === 'source_too_large' &&
        /size limit/.test(error.message),
    );
  }
  assert.equal(encode.mock.callCount(), 0);
});
