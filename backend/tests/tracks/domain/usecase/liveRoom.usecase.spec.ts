import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { ILiveRoomGateway } from 'src/tracks/domain/gateways/live-room.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { TrackObject } from 'src/tracks/domain/track';
import { LiveRoomUsecase } from 'src/tracks/domain/usecases/liveRoom.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const user = (id: string, email: string) =>
  ({ id, email }) as unknown as UserObject;

describe('LiveRoomUsecase', () => {
  const now = new Date();
  const speaker = user('speaker-1', 'alice@example.com');
  const creator = user('creator-1', 'carol@example.com');
  const stranger = user('stranger-1', 'mallory@example.com');
  const track = new TrackObject(
    'track-1',
    'name',
    'desc',
    [],
    'key',
    false,
    'event-1',
    now,
    now,
    now,
    [speaker],
    undefined,
  );

  let trackGateway: jest.Mocked<ITrackGateway>;
  let userGateway: jest.Mocked<IUserGateway>;
  let eventGateway: jest.Mocked<IEventGateway>;
  let liveRoomGateway: jest.Mocked<ILiveRoomGateway>;
  let usecase: LiveRoomUsecase;

  beforeEach(() => {
    trackGateway = {
      getTracks: jest.fn().mockResolvedValue([track]),
    } as unknown as jest.Mocked<ITrackGateway>;
    userGateway = {
      getUserByEmail: jest.fn(async (email: string) =>
        [speaker, creator, stranger].find((u) => u.email === email),
      ),
    } as unknown as jest.Mocked<IUserGateway>;
    eventGateway = {
      getEventById: jest.fn().mockResolvedValue({
        canBeEditBy: (u: UserObject) => u.id === creator.id,
      }),
    } as unknown as jest.Mocked<IEventGateway>;
    liveRoomGateway = {
      create: jest.fn().mockResolvedValue({ status: 201, body: { key: 'k' } }),
      get: jest.fn().mockResolvedValue({ status: 200, body: {} }),
      status: jest.fn().mockResolvedValue({ status: 200, body: {} }),
    };
    usecase = new LiveRoomUsecase(
      trackGateway,
      userGateway,
      eventGateway,
      liveRoomGateway,
    );
  });

  it('opens the room for a speaker of the track', async () => {
    await expect(usecase.open('track-1', speaker.email)).resolves.toEqual({
      status: 201,
      body: { key: 'k' },
    });
    expect(liveRoomGateway.create).toHaveBeenCalledWith('track-1');
  });

  it("opens the room for the event's creator", async () => {
    await usecase.open('track-1', creator.email);
    expect(liveRoomGateway.create).toHaveBeenCalledWith('track-1');
  });

  it('refuses any other user, and never reaches the control plane', async () => {
    for (const call of [
      () => usecase.open('track-1', stranger.email),
      () => usecase.get('track-1', stranger.email),
      () => usecase.status('track-1', stranger.email),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(liveRoomGateway.create).not.toHaveBeenCalled();
    expect(liveRoomGateway.get).not.toHaveBeenCalled();
    expect(liveRoomGateway.status).not.toHaveBeenCalled();
  });

  it('refuses a request without a signed-in user', async () => {
    await expect(usecase.get('track-1', undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('answers 404 for an unknown track', async () => {
    trackGateway.getTracks.mockResolvedValue([]);
    await expect(usecase.open('nope', speaker.email)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
