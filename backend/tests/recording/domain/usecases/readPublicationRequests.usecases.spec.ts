import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GetMyPublicationRequestsUsecase } from 'src/recording/domain/usecases/getMyPublicationRequests.usecase';
import { GetTrackPublicationRequestsUsecase } from 'src/recording/domain/usecases/getTrackPublicationRequests.usecase';
import { GetPublicationRequestUsecase } from 'src/recording/domain/usecases/getPublicationRequest.usecase';
import { GetPublicationRequestMediaUrlUsecase } from 'src/recording/domain/usecases/getPublicationRequestMediaUrl.usecase';
import {
  EIGHT_DAYS_AGO,
  ORGANIZER,
  REQUEST_ID,
  SPEAKER,
  STRANGER,
  TRACK_ID,
  makeRequest,
  makeRequestGateway,
  makeTrack,
  makeUserGateway,
} from './publicationRequest.fixtures';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/video'),
}));

describe('Reading publication requests', () => {
  let requestGateway: ReturnType<typeof makeRequestGateway>;

  beforeEach(() => {
    requestGateway = makeRequestGateway();
    requestGateway.getById.mockResolvedValue(makeRequest());
  });

  it('lists only the still-pending requests addressed to me', async () => {
    requestGateway.findByTarget.mockResolvedValue([
      makeRequest(),
      makeRequest({ id: 'old', createdAt: EIGHT_DAYS_AGO }),
    ]);
    requestGateway.update.mockResolvedValue(makeRequest({ status: 'expired' }));
    const usecase = new GetMyPublicationRequestsUsecase(
      requestGateway,
      makeUserGateway(),
    );

    const requests = await usecase.execute(SPEAKER.email);

    expect(requestGateway.findByTarget).toHaveBeenCalledWith(
      SPEAKER.id,
      'pending',
    );
    expect(requests).toHaveLength(1);
  });

  describe('GetTrackPublicationRequestsUsecase', () => {
    const build = () =>
      new GetTrackPublicationRequestsUsecase(
        requestGateway,
        { getTracks: jest.fn().mockResolvedValue([makeTrack()]) } as any,
        makeUserGateway(),
        {
          getEventById: jest
            .fn()
            .mockResolvedValue({ canBeEditBy: () => false }),
        } as any,
      );

    it('lists the requests of the track for the organizer', async () => {
      requestGateway.findByTrack.mockResolvedValue([makeRequest()]);

      expect(await build().execute(TRACK_ID, ORGANIZER.email)).toHaveLength(1);
    });

    it('refuses a user who is not the organizer', async () => {
      await expect(build().execute(TRACK_ID, STRANGER.email)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('GetPublicationRequestUsecase', () => {
    const build = () =>
      new GetPublicationRequestUsecase(requestGateway, makeUserGateway());

    it('is readable by the targeted speaker and the requester', async () => {
      await expect(
        build().execute(REQUEST_ID, SPEAKER.email),
      ).resolves.toBeDefined();
      await expect(
        build().execute(REQUEST_ID, ORGANIZER.email),
      ).resolves.toBeDefined();
    });

    it('refuses anyone else', async () => {
      await expect(build().execute(REQUEST_ID, STRANGER.email)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('GetPublicationRequestMediaUrlUsecase', () => {
    const build = () =>
      new GetPublicationRequestMediaUrlUsecase(
        new GetPublicationRequestUsecase(requestGateway, makeUserGateway()),
        {
          getRecordingById: jest.fn().mockResolvedValue({ mediaId: 'key' }),
        } as any,
        {} as any,
      );

    it('gives the speaker a temporary URL while pending', async () => {
      expect(await build().execute(REQUEST_ID, SPEAKER.email)).toBe(
        'https://signed.example/video',
      );
    });

    it('refuses anyone else', async () => {
      await expect(build().execute(REQUEST_ID, STRANGER.email)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('stops giving access once the request is answered', async () => {
      requestGateway.getById.mockResolvedValue(
        makeRequest({ status: 'refused' }),
      );

      await expect(build().execute(REQUEST_ID, SPEAKER.email)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
