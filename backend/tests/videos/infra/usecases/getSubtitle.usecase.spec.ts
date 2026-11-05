import { S3Client } from '@aws-sdk/client-s3';
import { GetSubtitleUsecase } from 'src/videos/domain/usecases/getSubtitle.usecase';

describe('GetSubtitleUsecase with a rendered montage', () => {
  const signer = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://127.0.0.1:9',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const usecase = (rendered: string | null) =>
    new GetSubtitleUsecase(
      {
        getVideos: async () => [{ id: 'video', subtitle_id: 'video/sub.vtt' }],
        getRenderedMediaId: async () => rendered,
      } as any,
      signer,
    );

  const bucket = process.env.STOCK_MEDIA_BUCKET;
  beforeEach(() => {
    process.env.STOCK_MEDIA_BUCKET = 'media';
    jest.spyOn(console, 'log').mockImplementation();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (bucket === undefined) delete process.env.STOCK_MEDIA_BUCKET;
    else process.env.STOCK_MEDIA_BUCKET = bucket;
  });

  it('hides the subtitles of the original while viewers get the montage', async () => {
    await expect(
      usecase('video/edits/job/master.m3u8').execute('video'),
    ).resolves.toBeNull();
  });

  it('serves them again with the original', async () => {
    await expect(usecase(null).execute('video')).resolves.toContain(
      '/video/sub.vtt',
    );
  });
});
