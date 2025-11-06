import { toEventEntity, toEventObject } from 'src/common/mapper/event.mapper';
import { EventEntity } from 'src/events/infra/gateways/entities/event.entity';
import { EventObject } from 'src/events/domain/event';
import { TrackEntity } from 'src/tracks/infra/gateways/entities/track.entity';
import { UserObject } from 'src/users/domain/user';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

jest.mock('src/common/mapper/track.mapper', () => ({
  toTrackEntity: jest.fn((t) => ({ ...t, mapped: true })),
  toTrackObject: jest.fn((t) => ({ ...t, mapped: true })),
}));

import { toTrackEntity, toTrackObject } from 'src/common/mapper/track.mapper';

describe('Event Mapper', () => {
  const now = new Date();
  const mockTrackEntity: TrackEntity = { id: 'track1' } as any;

  const mockUserObject: UserObject = {
    id: 'user1',
    firstName: 'Alice',
    lastName: 'Doe',
    username: 'JDoe',
    email: 'alice@example.com',
    role: 'admin',
    events: [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
    description: 'desc',
    createdAt: now,
    picture_id: 'pic123',
  };

  const tag1 = new TagEntity({
    id: 'tag1',
    name: 'Tag 1',
    videos: [],
    createdAt: now,
    updatedAt: now,
  });

  const tag2 = new TagEntity({
    id: 'tag2',
    name: 'Tag 2',
    videos: [],
    createdAt: now,
    updatedAt: now,
  });

  const baseEventEntity = new EventEntity({
    id: 'event1',
    name: 'Event Name',
    description: 'Event Desc',
    tags: [tag1, tag2],
    startDate: now,
    endDate: now,
    published: true,
    isPrivate: false,
    closed: true,
    imageSlug: 'image.png',
    tracks: [mockTrackEntity],
    creatorId: 'user1',
    creator: {
      id: 'user1',
      firstName: 'Alice',
      lastName: 'Doe',
      email: 'alice@example.com',
      role: 'admin',
      createdAt: now,
      description: 'desc',
      events: [],
    } as any,
    createdAt: now,
    usersSubscribe: [],
  });

  it('should map EventEntity to EventObject', () => {
    const result = toEventObject(baseEventEntity);

    expect(result).toBeInstanceOf(EventObject);
    expect(result).toMatchObject({
      id: 'event1',
      name: 'Event Name',
      description: 'Event Desc',
      tags: [tag1, tag2],
      startDate: now,
      endDate: now,
      published: true,
      isPrivate: false,
      closed: true,
      imageSlug: 'image.png',
      creatorId: 'user1',
      createdAt: now,
    });

    expect(toTrackObject).toHaveBeenCalledWith(mockTrackEntity);
  });

  it('should handle undefined creator safely in toEventObject', () => {
    const entityWithoutCreator = {
      ...baseEventEntity,
      creator: undefined,
    } as EventEntity;
    const result = toEventObject(entityWithoutCreator);
    expect(result.creator).toBeUndefined();
    expect(result.creatorId).toBe('user1');
  });

  it('should map EventObject to EventEntity', () => {
    const eventObject = new EventObject(
      'event1',
      'Event Name',
      'Event Desc',
      [tag1, tag2],
      now,
      now,
      true,
      false,
      true,
      'image.png',
      [{ id: 'track1' }] as any,
      'user1',
      now,
      mockUserObject,
      [],
    );

    const result = toEventEntity(eventObject);

    expect(result).toBeInstanceOf(EventEntity);
    expect(result).toMatchObject({
      id: 'event1',
      name: 'Event Name',
      creatorId: 'user1',
    });

    expect(result.tracks[0]).toHaveProperty('mapped', true);
    expect(toTrackEntity).toHaveBeenCalledWith({ id: 'track1' });
  });
});
