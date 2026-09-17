import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { TranscodingJobsService } from './transcoding-jobs.service';
import { AddTranscodingJobs1789574400000 } from '../migrations/1789574400000-AddTranscodingJobs';
import { VideoTranscodingJob } from '../queue/job.types';

const integration = process.env.TRANSCODING_TEST_DATABASE_URL
  ? describe
  : describe.skip;

integration(
  'PostgreSQL migration and concurrent job claims (dedicated test database)',
  () => {
    let database: DataSource;
    beforeAll(async () => {
      database = new DataSource({
        type: 'postgres',
        url: process.env.TRANSCODING_TEST_DATABASE_URL,
        entities: [join(__dirname, '../**/*.entity.ts')],
        synchronize: false,
      });
      await database.initialize();
      // Deliberately no IF NOT EXISTS: refuse to touch a database already containing application tables.
      await database.query(`CREATE TABLE "video_entity" (
      "id" uuid PRIMARY KEY, "transcoding_status" varchar DEFAULT 'pending',
      "transcoding_error" text, "duration" float, "subtitle_id" varchar,
      "updatedAt" timestamptz DEFAULT now()
    )`);
      const runner = database.createQueryRunner();
      try {
        await new AddTranscodingJobs1789574400000().up(runner);
      } finally {
        await runner.release();
      }
    });
    afterAll(async () => {
      await database?.destroy();
    });

    it('grants exactly one claim, persists success and cascades deletion of a video', async () => {
      const job: VideoTranscodingJob = {
        jobId: randomUUID(),
        videoId: randomUUID(),
        originalKey: 'source.mp4',
        originalFileName: 'source.mp4',
        media_id: 'master.m3u8',
        miniature_id: 'image.jpg',
        title: 'Test',
        timestamp: Date.now(),
      };
      await database.query('INSERT INTO "video_entity" ("id") VALUES ($1)', [
        job.videoId,
      ]);
      const service = new TranscodingJobsService(database);
      await service.register(job);
      const claims = await Promise.allSettled([
        service.claim(job.jobId, job.videoId),
        service.claim(job.jobId, job.videoId),
      ]);
      expect(
        claims.filter((claim) => claim.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        claims.filter((claim) => claim.status === 'rejected'),
      ).toHaveLength(1);
      const accepted = claims.find(
        (claim) => claim.status === 'fulfilled',
      ) as PromiseFulfilledResult<Awaited<ReturnType<typeof service.claim>>>;
      if (accepted.value.status !== 'claimed')
        throw new Error('Job was not claimed');
      await service.complete(job.jobId, accepted.value.leaseToken, {
        jobId: job.jobId,
        videoId: job.videoId,
        success: true,
        duration: 12,
        processedAt: Date.now(),
      });
      expect(
        (
          await database.query(
            'SELECT "transcoding_status", "duration" FROM "video_entity" WHERE "id"=$1',
            [job.videoId],
          )
        )[0],
      ).toEqual({ transcoding_status: 'ready', duration: 12 });
      expect(await service.claim(job.jobId, job.videoId)).toEqual({
        status: 'completed',
      });
      await database.query('DELETE FROM "video_entity" WHERE "id"=$1', [
        job.videoId,
      ]);
      expect(
        await database.query('SELECT * FROM "transcoding_job" WHERE "id"=$1', [
          job.jobId,
        ]),
      ).toEqual([]);
      const runner = database.createQueryRunner();
      try {
        await new AddTranscodingJobs1789574400000().down(runner);
      } finally {
        await runner.release();
      }
      // This table was created by this suite in an otherwise empty test database.
      await database.query('DROP TABLE "video_entity"');
    });
  },
);
