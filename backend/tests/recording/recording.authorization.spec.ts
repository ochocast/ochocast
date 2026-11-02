import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard, TokenValidation } from 'nest-keycloak-connect';
import * as request from 'supertest';
import { RecordingController } from 'src/recording/infra/controllers/recording.controller';
import { RecordingModule } from 'src/recording/recording.module';
import { CreateNewVideoUsecase } from 'src/videos/domain/usecases/createNewVideo.usecase';
import { TrackObject } from 'src/tracks/domain/track';
import { EventObject } from 'src/events/domain/event';
import { UserObject } from 'src/users/domain/user';
import { oidcFixture } from './oidc.fixture';

jest.mock('uuid', () => ({ v4: () => 'video-id' }));

const trackId = '11111111-1111-4111-8111-111111111111';
const otherTrackId = '22222222-2222-4222-8222-222222222222';
const account = (id: string) =>
  ({ id, email: `${id}@example.test` }) as UserObject;
const owner = account('owner');
const speaker = account('speaker');
const stranger = account('stranger');
const now = new Date();
const event = new EventObject(
  'event-1',
  'Event',
  'description',
  [],
  now,
  now,
  true,
  false,
  false,
  '',
  [],
  owner.id,
  now,
  owner,
  [],
);
const track = new TrackObject(
  trackId,
  'Track',
  'description',
  [],
  '',
  false,
  event.id,
  now,
  now,
  now,
  [speaker],
  undefined,
);

describe('Recording HTTP authorization', () => {
  let app: INestApplication;
  let tracks: { getTracks: jest.Mock };
  let events: { getEventById: jest.Mock };
  let users: { getUserByEmail: jest.Mock };
  let recorder: { startRecording: jest.Mock; stopRecording: jest.Mock };
  let createVideo: { execute: jest.Mock };
  const oidc = oidcFixture();
  const jwt = (user: UserObject, extra = {}) =>
    oidc.token({ email: user.email, ...extra });
  const config = {
    trackId,
    roomId: trackId,
    roomKey: 'dummy-key',
    sfuUrl: 'http://ignored.invalid',
  };
  const start = (token = jwt(stranger), body = config) =>
    request(app.getHttpServer())
      .post('/recordings/start')
      .auth(token, { type: 'bearer' })
      .send(body);
  const stop = (token = jwt(stranger), id = trackId) =>
    request(app.getHttpServer())
      .post(`/recordings/stop/${id}`)
      .auth(token, { type: 'bearer' });
  const publish = (token = jwt(stranger), id = trackId) =>
    request(app.getHttpServer())
      .post('/recordings/publish')
      .auth(token, { type: 'bearer' })
      .field('trackId', id)
      .attach('file', Buffer.from('test mp4'), 'recording.mp4');

  beforeEach(async () => {
    tracks = { getTracks: jest.fn().mockResolvedValue([track]) };
    events = { getEventById: jest.fn().mockResolvedValue(event) };
    users = {
      getUserByEmail: jest.fn(async (email: string) =>
        [owner, speaker, stranger].find((u) => u.email === email),
      ),
    };
    recorder = { startRecording: jest.fn(), stopRecording: jest.fn() };
    createVideo = { execute: jest.fn().mockResolvedValue({ id: 'video-id' }) };
    // Keep the production module's complete provider list, replacing only external
    // modules and IO. New auth providers must therefore be wired by RecordingModule.
    const providers = Reflect.getMetadata('providers', RecordingModule);
    const module = await Test.createTestingModule({
      controllers: [RecordingController],
      providers: [
        ...providers,
        { provide: CreateNewVideoUsecase, useValue: createVideo },
        { provide: 'TrackGateway', useValue: tracks },
        { provide: 'EventGateway', useValue: events },
        { provide: 'UserGateway', useValue: users },
      ],
    })
      .overrideProvider('RecordingVMGateway')
      .useValue(recorder)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalGuards(
      new AuthGuard(
        oidc.keycloak,
        { realm: 'test', tokenValidation: TokenValidation.OFFLINE, secret: '' },
        undefined,
      ),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('denies a non-speaker start before recorder discovery/control', async () => {
    await start().expect(403);
    expect(recorder.startRecording).not.toHaveBeenCalled();
  });
  it('denies a non-speaker stop before recorder control', async () => {
    await stop().expect(403);
    expect(recorder.stopRecording).not.toHaveBeenCalled();
  });
  it.each([owner, speaker])(
    'allows $id to start and stop the authorized track room',
    async (user) => {
      await start(jwt(user)).expect(201, { status: 'recording' });
      expect(recorder.startRecording).toHaveBeenCalledWith({
        roomId: trackId,
        trackId,
      });
      await stop(jwt(user)).expect(201, { status: 'stopped' });
      expect(recorder.stopRecording).toHaveBeenCalledWith(trackId);
    },
  );
  it('rejects a different room even for the track owner', async () => {
    await start(jwt(owner), { ...config, roomId: otherTrackId }).expect(400);
    expect(recorder.startRecording).not.toHaveBeenCalled();
  });
  it('does not let a dummy key or body identity authorize a stranger', async () => {
    await start(jwt(stranger), {
      ...config,
      email: owner.email,
      user: {
        email: owner.email,
        realm_access: { roles: ['service-recorder'] },
      },
    } as typeof config).expect(403);
    expect(recorder.startRecording).not.toHaveBeenCalled();
  });
  it('requires a signed-in account on start/stop/publish', async () => {
    const unregistered = oidc.token({ email: 'unknown@example.test' });
    await start(unregistered).expect(401);
    await stop(unregistered).expect(401);
    await publish(unregistered).expect(401);
    await request(app.getHttpServer())
      .post('/recordings/start')
      .send(config)
      .expect(401);
  });
  it('returns 400 for malformed track IDs', async () => {
    await start(jwt(owner), { ...config, trackId: 'invalid' }).expect(400);
    await stop(jwt(owner), 'invalid').expect(400);
    await publish(jwt(owner), 'invalid').expect(400);
  });
  it('preserves 404 for a missing track or parent event', async () => {
    tracks.getTracks.mockResolvedValue([]);
    await start(jwt(owner)).expect(404);
    await stop(jwt(owner)).expect(404);
    await publish(jwt(owner)).expect(404);
    tracks.getTracks.mockResolvedValue([track]);
    events.getEventById.mockResolvedValue(null);
    await start(jwt(owner)).expect(404);
    await stop(jwt(owner)).expect(404);
    await publish(jwt(owner)).expect(404);
    expect(recorder.startRecording).not.toHaveBeenCalled();
    expect(recorder.stopRecording).not.toHaveBeenCalled();
    expect(createVideo.execute).not.toHaveBeenCalled();
  });
  it('does not wrap HTTP failures from recorder control in 500', async () => {
    recorder.startRecording.mockRejectedValue(
      new BadRequestException('not ready'),
    );
    recorder.stopRecording.mockRejectedValue(
      new BadRequestException('not recording'),
    );
    await start(jwt(owner)).expect(400);
    await stop(jwt(owner)).expect(400);
  });
  it('retains 500 for unexpected recorder failures', async () => {
    recorder.startRecording.mockRejectedValue(new Error('offline'));
    await start(jwt(owner)).expect(500);
  });
  it('protects event-creator attribution from arbitrary authenticated publishers', async () => {
    await publish().expect(403);
    expect(createVideo.execute).not.toHaveBeenCalled();
  });
  it.each([owner, speaker])(
    'allows $id to publish with the event creator as author',
    async (user) => {
      await publish(jwt(user)).expect(201, { videoId: 'video-id' });
      expect(createVideo.execute.mock.calls[0][0].creator.id).toBe(owner.id);
    },
  );
  it('allows the validated service-recorder realm role to publish without an app account', async () => {
    const token = oidc.token({
      sub: 'recorder-service',
      preferred_username: 'recorder',
      realm_access: { roles: ['service-recorder'] },
    });
    await publish(token).expect(201, { videoId: 'video-id' });
    expect(createVideo.execute.mock.calls[0][0].creator.id).toBe(owner.id);
    // Publish privileges do not confer control of other users' tracks.
    await start(token).expect(401);
    await stop(token).expect(401);
  });
  it('does not accept the service role from a body, username, or forged token', async () => {
    await publish(
      jwt(stranger, { preferred_username: 'service-recorder' }),
    ).expect(403);
    await request(app.getHttpServer())
      .post('/recordings/publish')
      .auth(jwt(stranger), { type: 'bearer' })
      .field('trackId', trackId)
      .field('realm_access', JSON.stringify({ roles: ['service-recorder'] }))
      .attach('file', Buffer.from('mp4'), 'recording.mp4')
      .expect(403);
    const forged = oidcFixture().token({
      realm_access: { roles: ['service-recorder'] },
    });
    await publish(forged).expect(401);
    expect(createVideo.execute).not.toHaveBeenCalled();
  });
});
