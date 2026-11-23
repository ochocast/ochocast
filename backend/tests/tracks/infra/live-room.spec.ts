import {
  BadGatewayException,
  ForbiddenException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { LiveRoomGateway } from 'src/tracks/infra/gateways/live-room.gateway';
import { TracksController } from 'src/tracks/infra/controllers/tracks.controller';
import {
  LiveRoomUnavailableError,
  NotAllowedError,
} from 'src/tracks/domain/errors';

const TRACK = '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c';

describe('LiveRoomGateway', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const answer = (status: number, body: string) =>
    (global.fetch = jest.fn(
      async () => new Response(body, { status }),
    ) as never);

  it('passes room states on, including 202 while a worker starts', async () => {
    answer(202, '{"state":"provisioning"}');
    await expect(new LiveRoomGateway().create(TRACK)).resolves.toEqual({
      status: 202,
      body: { state: 'provisioning' },
    });
  });

  it.each([401, 403, 500, 503])(
    'turns a control plane %i into an unavailable error, not a sign-in error',
    async (status) => {
      answer(status, 'missing or invalid control token');
      await expect(new LiveRoomGateway().get(TRACK)).rejects.toBeInstanceOf(
        LiveRoomUnavailableError,
      );
    },
  );

  it('gives up on a control plane that does not answer', async () => {
    global.fetch = jest.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }) as never;
    await expect(new LiveRoomGateway().status(TRACK)).rejects.toMatchObject({
      timedOut: true,
    });
  });
});

describe('TracksController live room errors', () => {
  const controller = (error: Error) =>
    new (TracksController as never as new (
      ...args: unknown[]
    ) => TracksController)(
      {},
      {},
      {},
      {},
      {},
      { open: jest.fn().mockRejectedValue(error) },
    );
  const res = { status: jest.fn() } as never;

  it.each([
    [new NotAllowedError('no'), ForbiddenException],
    [new LiveRoomUnavailableError('down'), BadGatewayException],
    [new LiveRoomUnavailableError('slow', true), GatewayTimeoutException],
  ])('maps %p', async (error, expected) => {
    await expect(
      controller(error).openLiveRoom(TRACK, 'a@example.com', res),
    ).rejects.toBeInstanceOf(expected);
  });
});
