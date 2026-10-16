import sharp = require('sharp');
import { VideoGateway } from 'src/videos/infra/gateways/video.gateway';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
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
    mockUploads.length = 0;
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
