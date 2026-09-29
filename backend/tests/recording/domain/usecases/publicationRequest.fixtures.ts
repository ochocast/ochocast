import { PublicationRequestObject } from 'src/recording/domain/publicationRequest';
import { IPublicationRequestGateway } from 'src/recording/domain/gateways/publication-request.gateway';

export const ORGANIZER = {
  id: 'organizer-id',
  email: 'orga@example.com',
} as any;
export const SPEAKER = {
  id: 'speaker-id',
  email: 'speaker@example.com',
} as any;
export const STRANGER = {
  id: 'stranger-id',
  email: 'nobody@example.com',
} as any;
export const USERS = [ORGANIZER, SPEAKER, STRANGER];

export const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
export const RECORDING_ID = '22222222-2222-4222-8222-222222222222';
export const TRACK_ID = '33333333-3333-4333-8333-333333333333';
export const VIDEO_ID = '44444444-4444-4444-8444-444444444444';

/** Track whose speakers are the organizer and the targeted speaker. */
export const makeTrack = () =>
  ({
    id: TRACK_ID,
    eventId: 'event-id',
    speakers: [{ id: ORGANIZER.id }, { id: SPEAKER.id }],
    canBeEditBy: (u: any) => [ORGANIZER.id, SPEAKER.id].includes(u.id),
  }) as any;

export const makeRequest = (
  overrides: Partial<PublicationRequestObject> = {},
): PublicationRequestObject =>
  new PublicationRequestObject({
    id: REQUEST_ID,
    recordingId: RECORDING_ID,
    trackId: TRACK_ID,
    requesterId: ORGANIZER.id,
    targetUserId: SPEAKER.id,
    status: 'pending',
    title: 'My talk',
    metadata: {
      description: '',
      tags: [],
      internalSpeakers: [],
      externalSpeakers: '',
    },
    refusalReason: null,
    videoId: null,
    createdAt: new Date(),
    decidedAt: null,
    ...overrides,
  });

export const makeRequestGateway =
  (): jest.Mocked<IPublicationRequestGateway> => ({
    create: jest.fn().mockImplementation(async (r) => r),
    getById: jest.fn(),
    findByTarget: jest.fn(),
    findByTrack: jest.fn(),
    findPendingByRecording: jest.fn().mockResolvedValue(null),
    update: jest
      .fn()
      .mockImplementation(async (id, changes) => makeRequest({ ...changes })),
  });

export const makeUserGateway = () =>
  ({
    getUserByEmail: jest
      .fn()
      .mockImplementation(
        async (email: string) => USERS.find((u) => u.email === email) ?? null,
      ),
  }) as any;

export const EIGHT_DAYS_AGO = new Date(Date.now() - 8 * 86_400_000);
