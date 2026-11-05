import { NotFoundException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { GetMediaUsecase } from './getMedia.usecase';

describe('HLS public content with retained transcoding sources', () => {
  const send = jest.fn();
  const service = new GetMediaUsecase(
    {
      getVideos: async () => [
        {
          id: 'video',
          media_id: 'video/master.m3u8',
          transcoding_status: 'ready',
        },
      ],
      getRenderedMediaId: async () => null,
    } as any,
    { send } as any,
  );

  beforeEach(() => {
    send.mockReset();
  });

  it.each([
    'source/original.mp4',
    'source/original.ts',
    '_transcoding/job/result.json',
    'audio.flac',
    'audio.wav',
    '../other/master.m3u8',
  ])('does not proxy private object %s', async (key) => {
    await expect(service.getContent('video', key)).rejects.toThrow(
      'Invalid media path',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['master.m3u8', '360p.m3u8', '720p12.ts'])(
    'continues to serve HLS asset %s',
    async (key) => {
      send.mockResolvedValue({
        Body: { transformToByteArray: async () => Buffer.from('media') },
      });
      await service.getContent('video', key);
      expect(send.mock.calls[0][0].input.Key).toBe(`video/${key}`);
    },
  );
});

describe('Source playback when transcoding is disabled', () => {
  const send = jest.fn();
  const sourceVideo = (media_id: string, duration?: number | null) => ({
    getVideos: async () => [
      { id: 'video', media_id, transcoding_status: 'ready', duration },
    ],
    getRenderedMediaId: async () => null,
  });
  const signer = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://127.0.0.1:9',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  const bucket = process.env.STOCK_MEDIA_BUCKET;

  beforeEach(() => {
    send.mockReset();
    process.env.STOCK_MEDIA_BUCKET = 'media';
    jest.spyOn(console, 'log').mockImplementation();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (bucket === undefined) delete process.env.STOCK_MEDIA_BUCKET;
    else process.env.STOCK_MEDIA_BUCKET = bucket;
  });

  it.each([
    ['video/source/original.ts', 'original.ts'],
    ['video/source/original.m3u8', 'original.m3u8'],
    ['video/source/original.mp4', 'master.m3u8'],
  ])(
    'never proxies the source %s publicly as %s',
    async (mediaId, requested) => {
      const service = new GetMediaUsecase(
        sourceVideo(mediaId) as any,
        { send } as any,
      );
      await expect(
        service.getContent('video', requested),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['video/source/original.m3u8', 'application/octet-stream'],
    ['video/source/original.mp4', 'video/mp4'],
    ['video/source/original.MOV', 'video/quicktime'],
    ['1700000000000.legacy.mp4', 'video/mp4'],
  ])(
    'returns a presigned URL for the source %s served as %s',
    async (mediaId, type) => {
      const url = await new GetMediaUsecase(
        sourceVideo(mediaId) as any,
        signer,
      ).execute('video', 'http://api.test/api');
      expect(url).not.toContain('/videos/media-content/');
      expect(new URL(url).pathname).toBe(`/media/${mediaId}`);
      expect(url).toContain('X-Amz-Signature=');
      // The stored type of an older object can never turn it into a page.
      expect(new URL(url).searchParams.get('response-content-type')).toBe(type);
    },
  );

  // The browser fetches byte ranges from this one URL for the whole playback:
  // a video too long to transcode must not get a 403 after an hour.
  it.each([
    ['a 10-minute video', 600, 2 * 600 + 3600],
    ['a 3-hour video played from its source', 3 * 3600, 2 * 3 * 3600 + 3600],
    ['a fractional duration', 4000.4, 2 * 4001 + 3600],
    ['a long recording of unknown duration', null, 24 * 3600],
    ['an unset duration', undefined, 24 * 3600],
    ['a zero duration', 0, 24 * 3600],
    ['a duration beyond the 7-day SigV4 limit', 10 * 24 * 3600, 604800],
  ])(
    'keeps the source URL of %s valid for its playback',
    async (_case, duration, expires) => {
      const url = await new GetMediaUsecase(
        sourceVideo('video/source/original.mp4', duration) as any,
        signer,
      ).execute('video', 'http://api.test/api');
      expect(Number(new URL(url).searchParams.get('X-Amz-Expires'))).toBe(
        expires,
      );
    },
  );

  it('never logs the presigned URL, a bearer credential', async () => {
    const url = await new GetMediaUsecase(
      sourceVideo('video/source/original.mp4') as any,
      signer,
    ).execute('video', 'http://api.test/api');
    expect(JSON.stringify((console.log as jest.Mock).mock.calls)).not.toContain(
      new URL(url).searchParams.get('X-Amz-Signature'),
    );
  });
});

describe('Rendered montage', () => {
  const videoId = 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2';
  const jobId = '11111111-1111-4111-8111-111111111111';
  const send = jest.fn();
  let rendered: string | null;
  const service = (media_id = `${videoId}/master.m3u8`) =>
    new GetMediaUsecase(
      {
        getVideos: async () => [
          { id: videoId, media_id, transcoding_status: 'ready' },
        ],
        getRenderedMediaId: async () => rendered,
      } as any,
      { send } as any,
    );

  beforeEach(() => {
    send.mockReset().mockResolvedValue({
      Body: { transformToByteArray: async () => Buffer.from('media') },
    });
    rendered = `${videoId}/edits/${jobId}/master.m3u8`;
  });

  it.each([
    ['an HLS original', `${videoId}/master.m3u8`],
    ['a source played as is', `${videoId}/source/original.mp4`],
  ])('gives viewers the rendition of %s on its own path', async (_, media) => {
    await expect(
      service(media).execute(videoId, 'http://api.test/api'),
    ).resolves.toBe(
      `http://api.test/api/videos/media-content/${videoId}/e-${jobId}/master.m3u8`,
    );
  });

  it('gives the original back once reverted', async () => {
    rendered = null;
    await expect(
      service().execute(videoId, 'http://api.test/api'),
    ).resolves.toBe(
      `http://api.test/api/videos/media-content/${videoId}/master.m3u8`,
    );
  });

  it.each(['master.m3u8', '720p.m3u8', '720p3.ts'])(
    'serves %s of the active rendition from its folder',
    async (file) => {
      await service().getContent(videoId, `e-${jobId}/${file}`);
      expect(send.mock.calls[0][0].input.Key).toBe(
        `${videoId}/edits/${jobId}/${file}`,
      );
    },
  );

  it('hides a replaced or reverted rendition', async () => {
    const old = '22222222-2222-4222-8222-222222222222';
    await expect(
      service().getContent(videoId, `e-${old}/master.m3u8`),
    ).rejects.toThrow('Media is not available');
    rendered = null;
    await expect(
      service().getContent(videoId, `e-${jobId}/master.m3u8`),
    ).rejects.toThrow('Media is not available');
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['_result.json', '../master.m3u8', 'sub/720p.m3u8'])(
    'never proxies %s of a rendition',
    async (file) => {
      await expect(
        service().getContent(videoId, `e-${jobId}/${file}`),
      ).rejects.toThrow(NotFoundException);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('keeps serving the original path of an edited video', async () => {
    await service().getContent(videoId, 'master.m3u8');
    expect(send.mock.calls[0][0].input.Key).toBe(`${videoId}/master.m3u8`);
  });
});
