import { VideoGateway } from 'src/videos/infra/gateways/video.gateway';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
import { ModifyVideoUsecase } from './modifyVideo.usecase';

describe('Editing a video never overwrites its media or transcoding state', () => {
  const owner = { id: 'owner', email: 'owner@example.com' };
  let rows: Map<string, any>;
  // Runs once the use case has read the video, before it saves the edit.
  let afterRead: (() => void) | undefined;

  // The real gateway, over an in-memory table: modifyVideo copies every field
  // it receives onto the stored row, as it does with TypeORM.
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
            rows.has(id) ? { ...rows.get(id) } : null,
          save: async (row: any) => {
            rows.set(row.id, { ...row });
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
