import { VideoGateway } from 'src/videos/infra/gateways/video.gateway';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
import { ModifyVideoUsecase } from './modifyVideo.usecase';

describe('Editing a video never overwrites its media or transcoding state', () => {
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

  // The real gateway, over an in-memory table that saves like TypeORM: only
  // the columns the saved entity defines are written.
  const usecase = () =>
    new ModifyVideoUsecase(
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
      ),
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
});
