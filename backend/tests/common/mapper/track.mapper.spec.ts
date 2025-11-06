import { toTrackEntity, toTrackObject } from 'src/common/mapper/track.mapper';
import { TrackEntity } from 'src/tracks/infra/gateways/entities/track.entity';
import { TrackObject } from 'src/tracks/domain/track';
import { UserObject } from 'src/users/domain/user';
import { PublicUserObject } from 'src/users/domain/publicUser';

jest.mock('src/common/mapper/user.mapper', () => ({
  toUserObject: jest.fn((u) => ({ ...u, fromEntity: true })),
}));

import { toUserObject } from 'src/common/mapper/user.mapper';

describe('Track Mapper', () => {
  const now = new Date();

  const mockUserEntity = { id: 'u1', email: 'john@example.com' } as any;
  const mockUserObject: UserObject = {
    id: 'u1',
    firstName: 'John',
    lastName: 'Doe',
    username: 'JDoe',
    email: 'john@example.com',
    role: 'speaker',
    events: [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
    description: '',
    createdAt: now,
    picture_id: '',
  };

  const trackEntity = new TrackEntity({
    id: 't1',
    name: 'Track 1',
    description: 'A great track',
    keywords: ['a', 'b'],
    streamKey: 'stream-abc',
    closed: false,
    createdAt: now,
    startDate: now,
    endDate: now,
    eventId: 'e1',
    event: { id: 'e1' } as any,
    speakers: [mockUserEntity],
  });

  it('should map TrackEntity to TrackObject', () => {
    const result = toTrackObject(trackEntity);

    expect(result).toMatchObject({
      id: 't1',
      name: 'Track 1',
      description: 'A great track',
      keywords: ['a', 'b'],
      streamKey: 'stream-abc',
      closed: false,
      createdAt: now,
      startDate: now,
      endDate: now,
      eventId: 'e1',
    });

    expect(result.speakers).toHaveLength(1);
    expect(result.speakers[0]).toBeInstanceOf(PublicUserObject);
    expect(result.speakers[0].id).toBe('u1');
    expect(toUserObject).toHaveBeenCalledWith(mockUserEntity);
  });

  it('should map TrackObject to TrackEntity', () => {
    const trackObject = new TrackObject(
      't1',
      'Track 1',
      'A great track',
      ['a', 'b'],
      'stream-abc',
      false,
      'e1',
      now,
      now,
      now,
      [mockUserObject],
      undefined,
    );

    const result = toTrackEntity(trackObject);

    expect(result).toBeInstanceOf(TrackEntity);
    expect(result.id).toBe('t1');
    expect(result.event.id).toBe('e1');
  });

  it('should handle empty speaker list in TrackEntity', () => {
    const emptySpeakersEntity = new TrackEntity({
      ...trackEntity,
      speakers: [],
    });
    const result = toTrackObject(emptySpeakersEntity);
    expect(result.speakers).toEqual([]);
  });

  it('should handle undefined speakers in TrackObject', () => {
    const trackObject = new TrackObject(
      't2',
      'Track 2',
      'No speakers track',
      [],
      'stream-def',
      false,
      'e2',
      now,
      now,
      now,
      undefined,
      undefined,
    );
    const result = toTrackEntity(trackObject);
    expect(result.speakers).toEqual([]);
  });
});
