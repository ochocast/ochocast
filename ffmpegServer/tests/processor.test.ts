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

test('S3 authorization errors are not mistaken for a missing checkpoint', async () => {
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
