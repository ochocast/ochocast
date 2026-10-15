import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { JobProcessorService } from '../src/services/job-processor.service';
import { TranscodingService } from '../src/services/transcoding.service';
import { VideoTranscodingJob } from '../src/types/job.types';

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
