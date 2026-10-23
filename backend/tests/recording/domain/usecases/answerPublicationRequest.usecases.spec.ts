import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AcceptPublicationRequestUsecase } from 'src/recording/domain/usecases/acceptPublicationRequest.usecase';
import { RefusePublicationRequestUsecase } from 'src/recording/domain/usecases/refusePublicationRequest.usecase';
import { CancelPublicationRequestUsecase } from 'src/recording/domain/usecases/cancelPublicationRequest.usecase';
import {
  EIGHT_DAYS_AGO,
  ORGANIZER,
  RECORDING_ID,
  REQUEST_ID,
  SPEAKER,
  STRANGER,
  VIDEO_ID,
  makeRequest,
  makeRequestGateway,
  makeTrack,
  makeUserGateway,
} from './publicationRequest.fixtures';

describe('Answering a publication request', () => {
  let requestGateway: ReturnType<typeof makeRequestGateway>;

  beforeEach(() => {
    requestGateway = makeRequestGateway();
    requestGateway.getById.mockResolvedValue(makeRequest());
  });

  describe('AcceptPublicationRequestUsecase', () => {
    let usecase: AcceptPublicationRequestUsecase;
    let recordingRepository: any;
    let videoGateway: any;

    beforeEach(() => {
      recordingRepository = { updateRecording: jest.fn() };
      videoGateway = {
        getVideos: jest
          .fn()
          .mockResolvedValue([{ id: VIDEO_ID, creator: { id: SPEAKER.id } }]),
      };
      usecase = new AcceptPublicationRequestUsecase(
        requestGateway,
        recordingRepository,
        videoGateway,
        makeUserGateway(),
      );
    });

    it('marks the request accepted and the recording published', async () => {
      await usecase.execute(REQUEST_ID, VIDEO_ID, SPEAKER.email);

      expect(recordingRepository.updateRecording).toHaveBeenCalledWith(
        RECORDING_ID,
        expect.objectContaining({
          visibility: 'published',
          publishedById: SPEAKER.id,
          publishedVideoId: VIDEO_ID,
          publishedAt: expect.any(Date),
        }),
      );
      expect(requestGateway.update).toHaveBeenCalledWith(
        REQUEST_ID,
        expect.objectContaining({ status: 'accepted', videoId: VIDEO_ID }),
      );
    });

    it('refuses anyone but the targeted speaker', async () => {
      await expect(
        usecase.execute(REQUEST_ID, VIDEO_ID, ORGANIZER.email),
      ).rejects.toThrow(UnauthorizedException);
      expect(recordingRepository.updateRecording).not.toHaveBeenCalled();
    });

    it('rejects a video that is not on the speaker channel', async () => {
      videoGateway.getVideos.mockResolvedValue([
        { id: VIDEO_ID, creator: { id: ORGANIZER.id } },
      ]);

      await expect(
        usecase.execute(REQUEST_ID, VIDEO_ID, SPEAKER.email),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired request', async () => {
      requestGateway.getById.mockResolvedValue(
        makeRequest({ createdAt: EIGHT_DAYS_AGO }),
      );
      requestGateway.update.mockResolvedValue(
        makeRequest({ status: 'expired' }),
      );

      await expect(
        usecase.execute(REQUEST_ID, VIDEO_ID, SPEAKER.email),
      ).rejects.toThrow(ForbiddenException);
      expect(recordingRepository.updateRecording).not.toHaveBeenCalled();
    });
  });

  describe('RefusePublicationRequestUsecase', () => {
    let usecase: RefusePublicationRequestUsecase;

    beforeEach(() => {
      usecase = new RefusePublicationRequestUsecase(
        requestGateway,
        makeUserGateway(),
      );
    });

    it('stores the refusal with its trimmed reason', async () => {
      await usecase.execute(REQUEST_ID, '  Not my best talk  ', SPEAKER.email);

      expect(requestGateway.update).toHaveBeenCalledWith(
        REQUEST_ID,
        expect.objectContaining({
          status: 'refused',
          refusalReason: 'Not my best talk',
        }),
      );
    });

    it('accepts a refusal without reason', async () => {
      await usecase.execute(REQUEST_ID, undefined, SPEAKER.email);

      expect(requestGateway.update).toHaveBeenCalledWith(
        REQUEST_ID,
        expect.objectContaining({ status: 'refused', refusalReason: null }),
      );
    });

    it('refuses anyone but the targeted speaker', async () => {
      await expect(
        usecase.execute(REQUEST_ID, 'no', STRANGER.email),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a request that is no longer pending', async () => {
      requestGateway.getById.mockResolvedValue(
        makeRequest({ status: 'cancelled' }),
      );

      await expect(
        usecase.execute(REQUEST_ID, 'no', SPEAKER.email),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('CancelPublicationRequestUsecase', () => {
    let usecase: CancelPublicationRequestUsecase;
    let eventGateway: any;

    beforeEach(() => {
      eventGateway = {
        getEventById: jest.fn().mockResolvedValue({ canBeEditBy: () => false }),
      };
      usecase = new CancelPublicationRequestUsecase(
        requestGateway,
        { getTracks: jest.fn().mockResolvedValue([makeTrack()]) } as any,
        makeUserGateway(),
        eventGateway,
      );
    });

    it('lets the requester cancel a pending request', async () => {
      await usecase.execute(REQUEST_ID, ORGANIZER.email);

      expect(requestGateway.update).toHaveBeenCalledWith(
        REQUEST_ID,
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('refuses a user who is not an organizer of the track', async () => {
      await expect(usecase.execute(REQUEST_ID, STRANGER.email)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(requestGateway.update).not.toHaveBeenCalled();
    });

    it('rejects a request that is no longer pending', async () => {
      requestGateway.getById.mockResolvedValue(
        makeRequest({ status: 'refused' }),
      );

      await expect(
        usecase.execute(REQUEST_ID, ORGANIZER.email),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
