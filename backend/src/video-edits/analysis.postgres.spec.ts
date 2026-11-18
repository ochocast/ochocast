import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AddVideoEditAnalysis1795000000000 } from '../migrations/1795000000000-AddVideoEditAnalysis';
import { VideoEntity } from '../videos/infra/gateways/entities/video.entity';
import { AnalysisJobEntity } from './infra/analysis/analysis-job.entity';
import { AnalysisService } from './infra/analysis/analysis.service';
import {
  AnalysisController,
  AnalysisCallbacksController,
} from './infra/analysis/analysis.controller';
const url =
  process.env.VIDEO_EDIT_ANALYSIS_TEST_DATABASE_URL ||
  process.env.VIDEO_EDIT_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'analysis: PostgreSQL concurrency, cache, leases and HTTP',
  () => {
    let db: DataSource,
      service: AnalysisService,
      app: INestApplication,
      videoId: string;
    const schema = 'analysis_test_' + randomUUID().replace(/-/g, '');
    const owner = {
        id: randomUUID(),
        email: 'owner@example.test',
        role: 'user',
      },
      stranger = {
        id: randomUUID(),
        email: 'other@example.test',
        role: 'user',
      },
      admin = { id: randomUUID(), email: 'admin@example.test', role: 'admin' };
    const publish = jest.fn(async () => {});
    let etag = 'etag-v1';
    const secret = 'analysis-callback-at-least-32-characters';
    const oldEnabled = process.env.VIDEO_EDIT_ANALYSIS_ENABLED,
      oldSecret = process.env.TRANSCODING_CALLBACK_SECRET;
    beforeAll(async () => {
      process.env.VIDEO_EDIT_ANALYSIS_ENABLED = 'true';
      process.env.TRANSCODING_CALLBACK_SECRET = secret;
      if (!new URL(url).pathname.includes('test'))
        throw Error('Refusing non-test database');
      const root = join(__dirname, '..'),
        entities = (await readdir(root, { recursive: true }))
          .filter((p) => p.endsWith('.entity.ts'))
          .map((p) => join(root, p));
      const options = {
        type: 'postgres' as const,
        url,
        schema,
        synchronize: false,
        extra: { options: `-c search_path=${schema},public` },
      };
      const boot = new DataSource({
        ...options,
        entities: entities.filter((p) => !p.endsWith('analysis-job.entity.ts')),
      });
      await boot.initialize();
      await boot.query(`CREATE SCHEMA "${schema}"`);
      await boot.synchronize();
      const runner = boot.createQueryRunner();
      try {
        await new AddVideoEditAnalysis1795000000000().up(runner);
      } finally {
        await runner.release();
      }
      await boot.destroy();
      db = new DataSource({ ...options, entities });
      await db.initialize();
      service = new AnalysisService(
        db,
        {
          getVideos: async ({ id }) => {
            const v = await db.getRepository(VideoEntity).findOneBy({ id });
            return v ? [{ ...v, creator: owner }] : [];
          },
        } as any,
        {
          getUserByEmail: async (email) =>
            [owner, stranger, admin].find((u) => u.email === email),
        } as any,
        { findSourceKey: async (id) => id + '/source/original.mp4' } as any,
        { enabled: true, publish } as any,
        { send: async () => ({ ETag: etag, ContentLength: 100 }) } as any,
      );
      const module = await Test.createTestingModule({
        controllers: [AnalysisController, AnalysisCallbacksController],
        providers: [{ provide: AnalysisService, useValue: service }],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.use((req, _res, next) => {
        req.user = { email: req.headers['x-test-user'] };
        next();
      });
      await app.init();
    });
    afterAll(async () => {
      if (app) await app.close();
      if (db?.isInitialized) {
        await db.query(`DROP SCHEMA "${schema}" CASCADE`);
        await db.destroy();
      }
      for (const [key, value] of [
        ['VIDEO_EDIT_ANALYSIS_ENABLED', oldEnabled],
        ['TRANSCODING_CALLBACK_SECRET', oldSecret],
      ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    beforeEach(async () => {
      publish.mockClear();
      etag = 'etag-v1';
      videoId = randomUUID();
      await db.getRepository(VideoEntity).save({
        id: videoId,
        media_id: videoId + '/master.m3u8',
        miniature_id: 'test.jpg',
        title: 'Analysis test',
        description: '',
        external_speakers: '',
        views: 0,
        duration: 20,
        archived: false,
        transcoding_status: 'ready',
      });
    });
    it('24 concurrent requests create and publish one analysis; two workers acquire only one lease', async () => {
      const jobs = await Promise.all(
        Array.from({ length: 24 }, () => service.request(videoId, owner.email)),
      );
      expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(
        await db.getRepository(AnalysisJobEntity).countBy({ videoId }),
      ).toBe(1);
      const claims = await Promise.allSettled([
        service.claim(jobs[0].id, videoId),
        service.claim(jobs[0].id, videoId),
      ]);
      expect(claims.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
    it('reuses cached cuts and invalidates cache on source ETag change', async () => {
      const first = await service.request(videoId, owner.email),
        claim: any = await service.claim(first.id, videoId);
      await service.complete(first.id, claim.leaseToken, {
        jobId: first.id,
        success: true,
        cuts: [10],
        duration: 20,
        outcome: 'cuts',
      });
      const cached = await service.request(videoId, owner.email);
      expect(cached.id).toBe(first.id);
      expect(cached.reused).toBe('cache');
      expect(publish).toHaveBeenCalledTimes(1);
      etag = 'new';
      await expect(service.get(videoId, owner.email)).rejects.toThrow(
        'Original changed',
      );
      expect((await service.request(videoId, owner.email)).id).not.toBe(
        first.id,
      );
      expect(publish).toHaveBeenCalledTimes(2);
    });
    it('rejects stale leases/invalid cuts and stores no_audio idempotently', async () => {
      const job = await service.request(videoId, owner.email),
        claim: any = await service.claim(job.id, videoId);
      await expect(service.progress(job.id, randomUUID(), 10)).rejects.toThrow(
        'lease',
      );
      await expect(
        service.complete(job.id, claim.leaseToken, {
          jobId: job.id,
          success: true,
          cuts: [4, 10],
          duration: 20,
          outcome: 'cuts',
        }),
      ).rejects.toThrow('Invalid proposed cuts');
      await service.progress(job.id, claim.leaseToken, 12);
      await service.progress(job.id, claim.leaseToken, 8);
      expect((await service.get(videoId, owner.email)).processedSeconds).toBe(
        12,
      );
      const result = {
        jobId: job.id,
        success: true,
        cuts: [],
        duration: 20,
        outcome: 'no_audio' as const,
      };
      await service.complete(job.id, claim.leaseToken, result);
      await service.complete(job.id, claim.leaseToken, result);
      expect((await service.get(videoId, owner.email)).result.outcome).toBe(
        'no_audio',
      );
    });
    it('recovers expired analysis leases without waiting 3900s queue visibility', async () => {
      const job = await service.request(videoId, owner.email);
      await service.claim(job.id, videoId);
      await db
        .getRepository(AnalysisJobEntity)
        .update(job.id, { leaseExpiresAt: new Date(0) });
      await service.maintain();
      expect(publish).toHaveBeenCalledTimes(2);
      expect((await service.get(videoId, owner.email)).status).toBe('pending');
    });
    it('retries persisted queue publication failures', async () => {
      publish.mockRejectedValueOnce(new Error('queue unavailable'));
      const job = await service.request(videoId, owner.email);
      expect(job.status).toBe('pending');
      await db
        .getRepository(AnalysisJobEntity)
        .update(job.id, { nextDispatchAt: new Date(0) });
      await service.maintain();
      expect(publish).toHaveBeenCalledTimes(2);
    });
    it('accepts duplicate transient callbacks and stops after three attempts', async () => {
      const job = await service.request(videoId, owner.email);
      for (let attempt = 0; attempt < 3; attempt++) {
        const claim: any = await service.claim(job.id, videoId);
        const result = { jobId: job.id, success: false, error: 'temporary read failure' };
        await service.complete(job.id, claim.leaseToken, result);
        await service.complete(job.id, claim.leaseToken, result);
      }
      expect((await service.get(videoId, owner.email)).status).toBe('failed');
      expect(await service.claim(job.id, videoId)).toEqual({ status: 'completed' });
    });
    it('does not reuse expired cache', async () => {
      const job = await service.request(videoId, owner.email),
        claim: any = await service.claim(job.id, videoId);
      await service.complete(job.id, claim.leaseToken, {
        jobId: job.id,
        success: true,
        cuts: [],
        duration: 20,
        outcome: 'no_silence',
      });
      await db
        .getRepository(AnalysisJobEntity)
        .update(job.id, { expiresAt: new Date(0) });
      expect((await service.request(videoId, owner.email)).id).not.toBe(job.id);
    });
    it('HTTP creator/admin access, UUID validation and callback secret', async () => {
      const path = `/api/videos/${videoId}/edit/silence-analysis`;
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-user', stranger.email)
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-user', 'missing')
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/videos/invalid/edit/silence-analysis')
        .set('x-test-user', owner.email)
        .expect(400);
      const response = await request(app.getHttpServer())
          .post(path)
          .set('x-test-user', owner.email)
          .expect(202),
        id = response.body.id;
      await request(app.getHttpServer())
        .get(path + '/' + id)
        .set('x-test-user', admin.email)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/internal/video-edits/analysis-jobs/${id}/claim`)
        .send({ videoId })
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/internal/video-edits/analysis-jobs/${id}/claim`)
        .set('X-Transcoding-Token', secret)
        .send({ videoId })
        .expect(200);
    });
  },
);
