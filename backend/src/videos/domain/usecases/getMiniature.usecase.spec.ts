import { S3Client } from '@aws-sdk/client-s3';
import { GetMiniatureUsecase } from './getMiniature.usecase';

describe('Video miniature URL', () => {
  const bucket = process.env.STOCK_MINIATURE_BUCKET;
  const signer = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://127.0.0.1:9',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  beforeEach(() => {
    process.env.STOCK_MINIATURE_BUCKET = 'miniature';
    // HEAD succeeds: the miniature exists.
    jest.spyOn(signer, 'send').mockResolvedValue({} as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (bucket === undefined) delete process.env.STOCK_MINIATURE_BUCKET;
    else process.env.STOCK_MINIATURE_BUCKET = bucket;
  });

  it('serves every miniature as JPEG whatever type it was stored with', async () => {
    const url = await new GetMiniatureUsecase(
      {
        getVideos: async () => [
          { id: 'video', miniature_id: 'miniature-video.jpg' },
        ],
      } as any,
      signer,
    ).execute('video');
    expect(new URL(url).pathname).toBe('/miniature/miniature-video.jpg');
    expect(new URL(url).searchParams.get('response-content-type')).toBe(
      'image/jpeg',
    );
  });
});
