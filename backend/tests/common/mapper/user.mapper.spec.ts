import { toUserObject, toUserEntity } from 'src/common/mapper/user.mapper';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { UserObject } from 'src/users/domain/user';

jest.mock('src/common/mapper/event.mapper', () => ({
  toEventObject: jest.fn((e) => ({ ...e, name: 'Mock Event' })),
  toEventEntity: jest.fn((e) => ({ ...e, name: 'Mock Event Entity' })),
}));

import { toEventObject, toEventEntity } from 'src/common/mapper/event.mapper';
import { EventObject } from 'src/events/domain/event';

describe('User Mapper', () => {
  const now = new Date();

  const baseEntity = new UserEntity({
    id: 'u1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    role: 'user',
    description: 'A test user',
    picture_id: 'pic-123',
    createdAt: now,
    events: [{ id: 'e1' } as any],
    comments: [{ id: 'c1' } as any],
    videos: [{ id: 'v1' } as any],
    videosAsSpeaker: [{ id: 'v2' } as any],
  });

  it('should map UserEntity to UserObject fully', () => {
    const result = toUserObject(baseEntity);
    expect(result).toMatchObject({
      id: 'u1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'user',
      description: 'A test user',
      picture_id: 'pic-123',
      createdAt: now,
      events: [{ id: 'e1', name: 'Mock Event' }],
      comments: [],
      videos: [],
      videosAsSpeaker: [],
    });
    expect(toEventObject).toHaveBeenCalledWith({ id: 'e1' });
  });

  it('should map UserObject to UserEntity fully', () => {
    const userObject: UserObject = {
      id: 'u1',
      firstName: 'Jane',
      lastName: 'Doe',
      username: 'JDoe',
      email: 'jane@example.com',
      role: 'user',
      description: 'A test user',
      picture_id: 'pic-123',
      createdAt: now,
      comments: [],
      videos: [],
      videosAsSpeaker: [],
      events: [
        { id: 'e1', name: 'Mock Event' } as Partial<EventObject> as EventObject,
      ],
    };

    const result = toUserEntity(userObject);
    expect(result).toBeInstanceOf(UserEntity);
    expect(result).toMatchObject({
      id: 'u1',
      firstName: 'Jane',
      lastName: 'Doe',
      username: 'JDoe',
      email: 'jane@example.com',
      role: 'user',
      description: 'A test user',
      picture_id: 'pic-123',
      createdAt: now,
      events: [{ id: 'e1', name: 'Mock Event Entity' }],
    });
    expect(toEventEntity).toHaveBeenCalledWith({
      id: 'e1',
      name: 'Mock Event',
    });
  });

  it('should handle undefined collections safely in toUserObject', () => {
    const incompleteEntity = new UserEntity({
      ...baseEntity,
      events: undefined,
      comments: undefined,
      videos: undefined,
      videosAsSpeaker: undefined,
    });

    const result = toUserObject(incompleteEntity);
    expect(result.events).toEqual([]);
    expect(result.comments).toEqual([]);
    expect(result.videos).toEqual([]);
    expect(result.videosAsSpeaker).toEqual([]);
  });

  it('should handle null fields safely in toUserEntity', () => {
    const userObject: UserObject = {
      id: null,
      firstName: null,
      lastName: null,
      username: null,
      email: null,
      role: null,
      description: null,
      picture_id: null,
      createdAt: null,
      comments: null,
      videos: null,
      videosAsSpeaker: null,
      events: null,
    };

    const result = toUserEntity(userObject);
    expect(result).toBeInstanceOf(UserEntity);
    expect(result.events).toEqual([]);
  });
});
