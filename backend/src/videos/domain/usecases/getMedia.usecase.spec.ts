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
