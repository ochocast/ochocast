import { RecordingRepositoryGateway } from 'src/recording/infra/gateways/recording-repository.gateway';
import { RecordingObject } from 'src/recording/domain/recording';
import { TrackEntity } from 'src/tracks/infra/gateways/entities/track.entity';

const TRACK_ID = '33333333-3333-4333-8333-333333333333';

const segment = () =>
  new RecordingObject(
    '22222222-2222-4222-8222-222222222222',
    TRACK_ID,
    'recordings/key.mp4',
    'unlisted',
    false,
    0,
    null,
    new Date(),
  );

describe('RecordingRepositoryGateway', () => {
  const build = (max: number | string | null) => {
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max }),
    };
    const manager = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => query),
      save: jest.fn(async (entity) => entity),
    };
    const repository = {
      manager: { transaction: jest.fn(async (work) => work(manager)) },
      update: jest.fn(),
    };
    return {
      gateway: new RecordingRepositoryGateway(repository as any),
      manager,
      query,
      repository,
    };
  };

  it('numbers a segment after the last segment of its track, merges excluded', async () => {
    const { gateway, manager, query } = build('4');

    const saved = await gateway.createSegment(segment());

    expect(saved.segmentIndex).toBe(5);
    // Locked first, so two uploads of one track never share an index.
    expect(manager.findOne).toHaveBeenCalledWith(TrackEntity, {
      where: { id: TRACK_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(query.andWhere).toHaveBeenCalledWith("r.kind = 'segment'");
  });

  it('numbers the first segment of a track 0', async () => {
    const { gateway } = build(null);
    expect((await gateway.createSegment(segment())).segmentIndex).toBe(0);
  });

  it('publishes only a recording that is still unlisted and ready', async () => {
    const { gateway, repository } = build(null);
    repository.update.mockResolvedValue({ affected: 0 });

    const published = await gateway.markPublished('id', {
      publishedAt: new Date(),
      publishedById: 'user',
      publishedVideoId: 'video',
    });

    expect(published).toBe(false);
    expect(repository.update).toHaveBeenCalledWith(
      { id: 'id', visibility: 'unlisted', status: 'ready' },
      expect.objectContaining({ visibility: 'published' }),
    );
  });
});
