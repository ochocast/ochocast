import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { CreateVideoEdits1793638092000 } from '../migrations/1793638092000-CreateVideoEdits';
import { VideoEditGateway } from './infra/gateways/video-edit.gateway';
import { SegmentInput } from './domain/videoEdit';

const integration = process.env.VIDEO_EDIT_TEST_DATABASE_URL
  ? describe
  : describe.skip;

integration(
  'video_edit migration and gateway (dedicated test database)',
  () => {
    let database: DataSource;
    let gateway: VideoEditGateway;

    const migration = new CreateVideoEdits1793638092000();
    const run = async (step: 'up' | 'down') => {
      const runner = database.createQueryRunner();
      try {
        await migration[step](runner);
      } finally {
        await runner.release();
      }
    };

    const newVideo = async () => {
      const id = randomUUID();
      await database.query('INSERT INTO "video_entity" ("id") VALUES ($1)', [
        id,
      ]);
      return id;
    };

    const montage: SegmentInput[] = [
      {
        sourceStart: 1270.25,
        sourceEnd: 2205.5,
        textLayers: [
          {
            content: '  Merci !  ',
            position: 'center',
            color: 'green',
            startOffset: 600,
            duration: 30,
          },
          {
            content: 'Partie 2',
            position: 'bottom',
            color: 'white',
            startOffset: 0,
            duration: 600,
          },
        ],
      },
      { sourceStart: 120, sourceEnd: 870, textLayers: [] },
    ];

    beforeAll(async () => {
      database = new DataSource({
        type: 'postgres',
        url: process.env.VIDEO_EDIT_TEST_DATABASE_URL,
        entities: [join(__dirname, '../**/*.entity.ts')],
        synchronize: false,
      });
      await database.initialize();
      // Deliberately no IF NOT EXISTS: refuse to touch a database already containing application tables.
      await database.query(
        'CREATE TABLE "video_entity" ("id" uuid PRIMARY KEY)',
      );
      await run('up');
      gateway = new VideoEditGateway(database);
    });

    afterAll(async () => {
      if (database?.isInitialized) {
        await run('down');
        await database.query('DROP TABLE "video_entity"');
        await database.destroy();
      }
    });

    it('creates one montage per video, even under concurrent requests', async () => {
      const videoId = await newVideo();
      const whole = [{ sourceStart: 0, sourceEnd: 3012, textLayers: [] }];

      const results = await Promise.all([
        gateway.create(videoId, whole),
        gateway.create(videoId, whole),
      ]);

      const created = results.filter(Boolean);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        videoId,
        renderStatus: 'draft',
        version: 1,
        segments: [{ position: 0, sourceStart: 0, sourceEnd: 3012 }],
      });
      expect(await gateway.create(videoId, whole)).toBeNull();
    });

    it('replaces the content, in playback order, and bumps the version', async () => {
      const videoId = await newVideo();
      await gateway.create(videoId, [
        { sourceStart: 0, sourceEnd: 3012, textLayers: [] },
      ]);

      const result = await gateway.replaceContent(videoId, montage, {
        expectedVersion: 1,
        renderStatus: 'pending',
      });

      if (result.status !== 'ok') throw new Error(result.status);
      expect(result.edit).toMatchObject({
        version: 2,
        renderStatus: 'pending',
      });
      expect(result.edit.segments).toMatchObject([
        { position: 0, sourceStart: 1270.25, sourceEnd: 2205.5 },
        { position: 1, sourceStart: 120, sourceEnd: 870, textLayers: [] },
      ]);
      // Sorted by start, content trimmed.
      expect(
        result.edit.segments[0].textLayers.map((l) => [l.content, l.color]),
      ).toEqual([
        ['Partie 2', 'white'],
        ['Merci !', 'green'],
      ]);
      expect(await gateway.findByVideoId(videoId)).toEqual(result.edit);
    });

    it('refuses a stale version and any change while a render runs', async () => {
      const videoId = await newVideo();
      const edit = await gateway.create(videoId, montage);

      expect(
        await gateway.replaceContent(videoId, montage, {
          expectedVersion: 5,
          renderStatus: 'pending',
        }),
      ).toEqual({ status: 'version_conflict', currentVersion: 1 });

      await gateway.replaceContent(videoId, montage, {
        expectedVersion: 1,
        renderStatus: 'pending',
      });
      expect(
        await gateway.replaceContent(videoId, montage, {
          renderStatus: 'draft',
          clearRenderedMedia: true,
        }),
      ).toEqual({ status: 'render_in_progress', renderStatus: 'pending' });

      // Failing a render that is no longer the pending one changes nothing.
      await gateway.markRenderFailed(edit.id, 1, 'stale');
      expect((await gateway.findByVideoId(videoId)).renderStatus).toBe(
        'pending',
      );
      await gateway.markRenderFailed(edit.id, 2, 'queue down');
      expect(await gateway.findByVideoId(videoId)).toMatchObject({
        renderStatus: 'failed',
        renderError: 'queue down',
      });

      // A failed render can be retried.
      const retried = await gateway.replaceContent(videoId, montage, {
        expectedVersion: 2,
        renderStatus: 'pending',
      });
      expect(retried).toMatchObject({
        status: 'ok',
        edit: { version: 3, renderError: null },
      });
    });

    it('lets exactly one of two concurrent saves of a version through', async () => {
      const videoId = await newVideo();
      await gateway.create(videoId, montage);

      const results = await Promise.all(
        [montage, montage.slice(1)].map((segments) =>
          gateway.replaceContent(videoId, segments, {
            expectedVersion: 1,
            renderStatus: 'draft',
          }),
        ),
      );

      expect(results.map((r) => r.status).sort()).toEqual([
        'ok',
        'version_conflict',
      ]);
      expect((await gateway.findByVideoId(videoId)).version).toBe(2);
    });

    it('drops the rendered version when going back to the original', async () => {
      const videoId = await newVideo();
      const edit = await gateway.create(videoId, montage);
      await database.query(
        `UPDATE "video_edit" SET "render_status" = 'ready',
          "rendered_media_id" = 'rendered/master.m3u8' WHERE "id" = $1`,
        [edit.id],
      );

      const result = await gateway.replaceContent(
        videoId,
        [{ sourceStart: 0, sourceEnd: 3012, textLayers: [] }],
        { renderStatus: 'draft', clearRenderedMedia: true },
      );

      expect(result).toMatchObject({
        status: 'ok',
        edit: { renderStatus: 'draft', renderedMediaId: null, version: 2 },
      });
      const [{ count }] = await database.query(
        'SELECT COUNT(*)::int AS count FROM "video_edit_text_layer"' +
          ' l JOIN "video_edit_segment" s ON s.id = l."segmentId"' +
          ' WHERE s."editId" = $1',
        [edit.id],
      );
      expect(count).toBe(0);
    });

    it('enforces the bounds in the database too', async () => {
      const videoId = await newVideo();
      const edit = await gateway.create(videoId, montage);
      const segmentId = edit.segments[0].id;
      const insertSegment = (position: number, start: number, end: number) =>
        database.query(
          `INSERT INTO "video_edit_segment"
            ("id", "editId", "position", "source_start", "source_end")
            VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), edit.id, position, start, end],
        );
      const insertLayer = (color: string, position: string) =>
        database.query(
          `INSERT INTO "video_edit_text_layer" ("id", "segmentId", "content",
            "position", "color", "start_offset", "duration")
            VALUES ($1, $2, 'x', $3, $4, 0, 1)`,
          [randomUUID(), segmentId, position, color],
        );

      await expect(insertSegment(5, 10, 10.5)).rejects.toThrow(
        /CHK_video_edit_segment_min_duration/,
      );
      await expect(insertSegment(5, -1, 10)).rejects.toThrow(/check/);
      await expect(insertSegment(0, 3000, 3010)).rejects.toThrow(
        /UQ_video_edit_segment_position/,
      );
      await expect(insertLayer('red', 'top')).rejects.toThrow(/check/);
      await expect(insertLayer('white', 'left')).rejects.toThrow(/check/);
      await expect(
        database.query(
          `UPDATE "video_edit" SET "render_status" = 'done' WHERE "id" = $1`,
          [edit.id],
        ),
      ).rejects.toThrow(/check/);
    });

    it('deletes the montage with its video', async () => {
      const videoId = await newVideo();
      const edit = await gateway.create(videoId, montage);

      await database.query('DELETE FROM "video_entity" WHERE "id" = $1', [
        videoId,
      ]);

      expect(await gateway.findByVideoId(videoId)).toBeNull();
      const [{ count }] = await database.query(
        'SELECT COUNT(*)::int AS count FROM "video_edit_segment" WHERE "editId" = $1',
        [edit.id],
      );
      expect(count).toBe(0);
    });
  },
);
