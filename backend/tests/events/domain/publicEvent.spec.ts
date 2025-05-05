import { PublicEventObject } from 'src/events/domain/publicEvent';
import { EventObject } from 'src/events/domain/event';
import { TrackObject } from 'src/tracks/domain/track';
import { PublicUserObject } from 'src/users/domain/publicUser';
import { UserObject } from 'src/users/domain/user';

jest.mock('src/users/domain/publicUser', () => ({
  PublicUserObject: jest.fn((u) => ({ ...u, isPublic: true })),
}));

describe('PublicEventObject', () => {
  const now = new Date('2024-01-01T10:00:00Z');

  const baseTrack: TrackObject = new TrackObject(
    'track1',
    'Track 1',
    'Track Desc',
    ['a', 'b'],
    'stream-key',
    false,
    'event1',
    now,
    now,
    now,
    [],
  );

  const baseCreator: UserObject = {
    id: 'u1',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    role: 'admin',
    events: [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
    description: 'Speaker bio',
    createdAt: now,
    picture_id: 'pic123',
  };

  const baseEvent: EventObject = new EventObject(
    'event1',
    'Spooky Night',
    'A fun spooky event',
    ['halloween', 'night'],
    now,
    now,
    true,
    false,
    false,
    'spooky-image',
    [baseTrack],
    baseCreator.id,
    now,
    baseCreator,
  );

  it('should map from EventObject and expose public fields correctly', () => {
    const result = new PublicEventObject(baseEvent, 'alice@example.com');

    expect(result).toMatchObject({
      id: 'event1',
      name: 'Spooky Night',
      description: 'A fun spooky event',
      tags: ['halloween', 'night'],
      startDate: now,
      endDate: now,
      published: true,
      isPrivate: false,
      closed: false,
      imageSlug: 'spooky-image',
      creatorId: 'u1',
      canBeEditByUser: true,
      tracks: [{ ...baseTrack }],
      creator: { ...baseCreator, isPublic: true },
    });
  });

  it('should set canBeEditByUser to false if email does not match', () => {
    const result = new PublicEventObject(baseEvent, 'bob@example.com');
    expect(result.canBeEditByUser).toBe(false);
  });

  it('should instantiate creator with PublicUserObject', () => {
    const result = new PublicEventObject(baseEvent, baseCreator.email);
    expect(PublicUserObject).toHaveBeenCalledWith(baseCreator);
    expect(result.creator).toHaveProperty('isPublic', true);
  });
});
