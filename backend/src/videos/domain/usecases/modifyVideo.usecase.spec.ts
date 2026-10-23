import { BadRequestException } from '@nestjs/common';
import sharp = require('sharp');
import { VideoGateway } from 'src/videos/infra/gateways/video.gateway';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { ModifyVideoUsecase } from './modifyVideo.usecase';

// Objects the use case puts in the buckets.
const mockUploads: Array<{ Key: string }> = [];
jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor({ params }: { params: { Key: string } }) {
      mockUploads.push(params);
    }
    done = async () => ({});
  },
}));

describe('Editing a video never overwrites its stored keys or transcoding state', () => {
  const owner = { id: 'owner', email: 'owner@example.com' };
  let rows: Map<string, any>;
  // Runs once the use case has read the video, before it saves the edit.
  let afterRead: (() => void) | undefined;
  // Runs once the gateway has checked or loaded the row, before it saves.
  let afterLoad: (() => void) | undefined;
  const loaded = <T>(value: T) => {
    afterLoad?.();
    afterLoad = undefined;
    return value;
  };

  // Tags and users the gateway resolves the form's lists against.
  let tags: Map<string, any>;
  let users: Map<string, any>;
  const tagsRepository = {
    findOneBy: async ({ id }: any) => tags.get(id) ?? null,
    createQueryBuilder: () => {
      let name = '';
      const query = {
        where: (_sql: string, params: { name: string }) => {
          name = params.name;
          return query;
        },
        getOne: async () =>
          [...tags.values()].find(
            (tag) => tag.name.toLowerCase() === name.toLowerCase(),
          ) ?? null,
      };
      return query;
    },
    save: async (tag: any) => {
      const saved = { ...tag, id: tag.id ?? `tag-${tags.size + 1}` };
      tags.set(saved.id, saved);
      return saved;
    },
  };
  const usersRepository = {
    findOneBy: async ({ id }: any) => users.get(id) ?? null,
  };

  // The real gateway, over an in-memory table that saves like TypeORM: only
  // the columns the saved entity defines are written.
  const gateway = () =>
    new VideoGateway(
      {
        find: async ({ where }: any) => {
          const found = [...rows.values()]
            .filter((row) => row.id === where.id && !row.archived)
            .map((row) => ({ ...row }));
          afterRead?.();
          afterRead = undefined;
          return found;
        },
        findOneBy: async ({ id }: any) =>
          loaded(rows.has(id) ? { ...rows.get(id) } : null),
        existsBy: async ({ id }: any) => loaded(rows.has(id)),
        manager: {
          getRepository: (entity: unknown) =>
            entity === TagEntity ? tagsRepository : usersRepository,
        },
        create: (fields: any) => ({ ...fields }),
        save: async (row: any) => {
          const defined = Object.fromEntries(
            Object.entries(row).filter(([, value]) => value !== undefined),
          );
          rows.set(row.id, { ...rows.get(row.id), ...defined });
          return row;
        },
      } as any,
      {} as any,
    );
  const usecase = () =>
    new ModifyVideoUsecase(
      gateway(),
      { getUserByEmail: async () => owner } as any,
      {} as any,
    );

  // Fields as the settings form posts them (multipart, JSON-encoded lists).
  const form = (fields: Record<string, unknown>) =>
    ({
      id: 'video',
      miniature_id: 'miniature.jpg',
      title: 'New title',
      description: 'New description',
      creator: owner.id,
      tags: '[]',
      internal_speakers: '[]',
      external_speakers: '',
      comments: '[]',
      createdAt: JSON.stringify('2026-10-16T08:00:00.000Z'),
      views: '0',
      ...fields,
    }) as unknown as ModifyVideoDto;

  const storedVideo = (fields: Record<string, unknown>) => ({
    id: 'video',
    miniature_id: 'miniature.jpg',
    title: 'Old title',
    description: 'Old description',
    creator: owner,
    tags: [],
    internal_speakers: [],
    external_speakers: '',
    archived: false,
    views: 0,
    createdAt: new Date('2026-10-16T08:00:00.000Z'),
    ...fields,
  });

  beforeEach(() => {
    rows = new Map();
    afterRead = undefined;
    afterLoad = undefined;
    mockUploads.length = 0;
    tags = new Map([
      [
        'tag',
        {
          id: 'tag',
          name: 'Tag',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    ]);
    users = new Map([['speaker', { id: 'speaker', firstName: 'Ada' }]]);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps the source fallback when the form was loaded while the video was transcoding', async () => {
    rows.set(
      'video',
      storedVideo({
        media_id: 'video/source/original.mp4',
        duration: 1500,
        transcoding_status: 'ready',
        transcoding_error: null,
      }),
    );

    await usecase().execute(
      form({ media_id: 'video/master.m3u8' }),
      owner.email,
    );

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      description: 'New description',
      media_id: 'video/source/original.mp4',
      duration: 1500,
      transcoding_status: 'ready',
      transcoding_error: null,
    });
  });

  it('keeps a source fallback stored while the edit is being saved', async () => {
    rows.set(
      'video',
      storedVideo({
        media_id: 'video/master.m3u8',
        duration: null,
        transcoding_status: 'pending',
        transcoding_error: null,
      }),
    );
    // The worker's result lands just after the use case read the video (for
    // instance while a new miniature uploads).
    afterRead = () =>
      Object.assign(rows.get('video'), {
        media_id: 'video/source/original.mp4',
        duration: 1500,
        transcoding_status: 'ready',
      });

    await usecase().execute(
      form({ media_id: 'video/master.m3u8' }),
      owner.email,
    );

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      media_id: 'video/source/original.mp4',
      duration: 1500,
      transcoding_status: 'ready',
    });
  });

  it('keeps a transcoding result written between the gateway load and its save', async () => {
    rows.set(
      'video',
      storedVideo({
        media_id: 'video/master.m3u8',
        duration: null,
        transcoding_status: 'pending',
        transcoding_error: null,
      }),
    );
    afterLoad = () =>
      Object.assign(rows.get('video'), {
        media_id: 'video/source/original.mp4',
        duration: 1500,
        transcoding_status: 'ready',
      });

    await usecase().execute(
      form({ media_id: 'video/master.m3u8' }),
      owner.email,
    );

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      media_id: 'video/source/original.mp4',
      duration: 1500,
      transcoding_status: 'ready',
    });
  });

  it('applies every field the settings form edits', async () => {
    rows.set('video', storedVideo({}));

    await usecase().execute(
      form({
        tags: JSON.stringify([{ id: 'tag', name: 'Tag' }]),
        internal_speakers: JSON.stringify([{ id: 'speaker' }]),
        external_speakers: 'Ada Lovelace',
      }),
      owner.email,
    );

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      description: 'New description',
      tags: [{ id: 'tag', name: 'Tag' }],
      internal_speakers: [{ id: 'speaker' }],
      external_speakers: 'Ada Lovelace',
    });
  });

  // Tags are saved with cascade: a client object would update the shared tag
  // row and its links to other videos.
  it('saves only stored or new tags: a forged name or video list reaches no tag', async () => {
    rows.set('video', storedVideo({}));

    await usecase().execute(
      form({
        tags: JSON.stringify([
          { id: 'tag', name: 'Renamed', videos: [{ id: 'another-video' }] },
          {
            name: '  Fresh ',
            videos: [{ id: 'another-video' }],
            createdAt: '2000-01-01T00:00:00.000Z',
          },
          { id: 'unknown-tag' },
        ]),
      }),
      owner.email,
    );

    const saved = rows.get('video').tags;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toBe(tags.get('tag'));
    expect(tags.get('tag').name).toBe('Tag');
    expect(saved[1]).toMatchObject({ name: 'Fresh' });
    expect(saved[1].createdAt).not.toEqual('2000-01-01T00:00:00.000Z');
    for (const tag of saved) expect(tag.videos).toBeUndefined();
  });

  it('saves only stored users as internal speakers', async () => {
    rows.set('video', storedVideo({}));

    await usecase().execute(
      form({
        internal_speakers: JSON.stringify([
          { id: 'speaker', firstName: 'Forged' },
          { id: 'nobody' },
        ]),
      }),
      owner.email,
    );

    expect(rows.get('video').internal_speakers).toEqual([users.get('speaker')]);
  });

  // The use case parses and caps the form's lists (parseVideoLists): a raw
  // string reaching the gateway would skip that check.
  it.each([
    ['tags', { tags: JSON.stringify([{ name: 'Fresh' }]) }],
    [
      'internal speakers',
      { internal_speakers: JSON.stringify([{ id: 'speaker' }]) },
    ],
  ])(
    'the gateway refuses %s the caller did not parse, before saving anything',
    async (_, fields) => {
      rows.set('video', storedVideo({}));

      await expect(
        gateway().modifyVideo({ id: 'video', ...fields } as any),
      ).rejects.toThrow();

      expect(rows.get('video')).toEqual(storedVideo({}));
      expect([...tags.keys()]).toEqual(['tag']);
    },
  );

  // The same limits as the upload's, which creates a video with these lists.
  it.each([
    ['tags that are not JSON', { tags: 'not json' }],
    ['tags that are not a list', { tags: JSON.stringify({ id: 'tag' }) }],
    [
      'more than 100 tags',
      {
        tags: JSON.stringify(
          Array.from({ length: 101 }, (_, i) => ({ name: `Tag ${i}` })),
        ),
      },
    ],
    [
      'more than 100 internal speakers',
      {
        internal_speakers: JSON.stringify(
          Array.from({ length: 101 }, (_, i) => ({ id: `user-${i}` })),
        ),
      },
    ],
  ])('rejects %s with a 400, before saving anything', async (_, fields) => {
    rows.set('video', storedVideo({}));

    await expect(
      usecase().execute(form(fields), owner.email),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(rows.get('video').title).toBe('Old title');
    expect(tags.size).toBe(1);
  });

  it('keeps the stored tags and speakers when the form leaves them out', async () => {
    rows.set(
      'video',
      storedVideo({ tags: [tags.get('tag')], internal_speakers: [] }),
    );

    await usecase().execute(
      form({ tags: undefined, internal_speakers: undefined }),
      owner.email,
    );

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      tags: [tags.get('tag')],
    });
  });

  it('ignores the columns the settings form does not edit', async () => {
    rows.set('video', storedVideo({}));

    await usecase().execute(
      form({
        views: '1000000',
        createdAt: JSON.stringify('2020-01-01T00:00:00.000Z'),
        archived: 'true',
        creator: 'someone-else',
        comments: JSON.stringify([{ id: 'comment', content: 'Forged' }]),
      }),
      owner.email,
    );

    const stored = rows.get('video');
    expect(stored).toMatchObject({
      title: 'New title',
      views: 0,
      createdAt: new Date('2026-10-16T08:00:00.000Z'),
      archived: false,
      creator: owner,
    });
    expect(stored.comments).toBeUndefined();
  });

  it('ignores a media key, duration or transcoding state sent by the owner', async () => {
    rows.set(
      'video',
      storedVideo({
        media_id: 'video/master.m3u8',
        duration: null,
        transcoding_status: 'pending',
        transcoding_error: null,
      }),
    );

    await usecase().execute(
      form({
        media_id: 'another-video/source/original.mp4',
        duration: '604800',
        transcoding_status: 'ready',
        transcoding_error: 'forged',
      }),
      owner.email,
    );

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      media_id: 'video/master.m3u8',
      duration: null,
      transcoding_status: 'pending',
      transcoding_error: null,
    });
  });

  // The subtitle is presigned in the media bucket, next to every source.
  it.each([
    ['the key of another video source', 'another-video/source/original.mp4'],
    // The settings page sends the name of a picked file it never uploads.
    ['the name of a subtitle file the edit does not upload', 'subtitles.srt'],
  ])('keeps the stored subtitle when the form sends %s', async (_, sent) => {
    rows.set('video', storedVideo({ subtitle_id: 'subtitle-video.vtt' }));

    await usecase().execute(form({ subtitle_id: sent }), owner.email);

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      subtitle_id: 'subtitle-video.vtt',
    });
  });

  it('keeps a video without subtitles without any once edited', async () => {
    rows.set('video', storedVideo({ subtitle_id: null }));

    // The settings page posts the null it loaded, as a multipart string.
    await usecase().execute(form({ subtitle_id: 'null' }), owner.email);

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      subtitle_id: null,
    });
  });

  it('ignores a miniature key sent by the owner', async () => {
    rows.set('video', storedVideo({ miniature_id: 'miniature-video.jpg' }));

    await usecase().execute(
      form({ miniature_id: 'another-video/source/miniature-original' }),
      owner.email,
    );

    expect(rows.get('video')).toMatchObject({
      title: 'New title',
      miniature_id: 'miniature-video.jpg',
    });
  });

  it('points the video at the miniature it uploaded, not a key sent with it', async () => {
    rows.set('video', storedVideo({ miniature_id: 'miniature-video.jpg' }));
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#00ccff' },
    })
      .png()
      .toBuffer();

    await usecase().execute(
      form({ miniature_id: 'another-video/source/miniature-original' }),
      owner.email,
      [{ fieldname: 'miniature', buffer: image } as Express.Multer.File],
    );

    expect(mockUploads).toHaveLength(1);
    const uploaded = mockUploads[0].Key;
    expect(uploaded).not.toBe('another-video/source/miniature-original');
    expect(uploaded).not.toBe('miniature-video.jpg');
    expect(rows.get('video').miniature_id).toBe(uploaded);
  });
});
