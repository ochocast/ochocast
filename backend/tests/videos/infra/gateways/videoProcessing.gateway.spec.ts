import { VideoProcessingGateway } from 'src/videos/infra/gateways/videoProcessing.gateway';

describe('VideoProcessingGateway', () => {
  const videos = { findOne: jest.fn() };
  const jobs = { findOne: jest.fn() };
  const gateway = new VideoProcessingGateway(videos as any, jobs as any);

  beforeEach(() => {
    videos.findOne.mockReset();
    jobs.findOne.mockReset();
  });

  // Polled by every viewer: one primary key read, no relation, no archived video.
  it('reads only the columns of a non-archived video', async () => {
    const row = { id: 'id', transcoding_status: 'pending' };
    videos.findOne.mockResolvedValue(row);
    expect(await gateway.findVideo('id')).toBe(row);
    expect(videos.findOne).toHaveBeenCalledWith({
      where: { id: 'id', archived: false },
      select: {
        id: true,
        transcoding_status: true,
        transcoding_error: true,
        media_id: true,
        createdAt: true,
      },
    });
  });

  it('reads the job of the video by its indexed videoId', async () => {
    jobs.findOne.mockResolvedValue(null);
    expect(await gateway.findJob('id')).toBeNull();
    expect(jobs.findOne).toHaveBeenCalledWith({
      where: { videoId: 'id' },
      select: {
        id: true,
        status: true,
        attempts: true,
        leaseExpiresAt: true,
        result: true,
      },
    });
  });
});
