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
