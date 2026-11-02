import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrepareRecordingUploadUsecase } from 'src/recording/domain/usecases/prepareRecordingUpload.usecase';
import { PreparePublicationRequestUploadUsecase } from 'src/recording/domain/usecases/preparePublicationRequestUpload.usecase';
import {
  ORGANIZER,
  RECORDING_ID,
  REQUEST_ID,
  SPEAKER,
  STRANGER,
  TRACK_ID,
  makeRequest,
  makeRequestGateway,
  makeTrack,
  makeUserGateway,
} from './publicationRequest.fixtures';

const UPLOAD_ID = '55555555-5555-4555-8555-555555555555';
const MEDIA_KEY = `recordings/${TRACK_ID}/merged/${RECORDING_ID}.mp4`;

describe('Publishing a recording through a server-side copy', () => {
  let requestGateway: ReturnType<typeof makeRequestGateway>;
  let recordingRepository: any;
  let videoUploadGateway: any;

  beforeEach(() => {
    requestGateway = makeRequestGateway();
    recordingRepository = {
      getRecordingById: jest.fn().mockResolvedValue({
        id: RECORDING_ID,
        trackId: TRACK_ID,
        mediaId: MEDIA_KEY,
        visibility: 'unlisted',
        status: 'ready',
      }),
    };
    videoUploadGateway = {
      createFromStoredMedia: jest.fn().mockResolvedValue({ id: UPLOAD_ID }),
    };
  });

  describe('on the organizer channel (US-4)', () => {
    const build = () =>
      new PrepareRecordingUploadUsecase(
        recordingRepository,
        requestGateway,
        videoUploadGateway,
        { getTracks: jest.fn().mockResolvedValue([makeTrack()]) } as any,
        makeUserGateway(),
        { getEventById: jest.fn().mockResolvedValue(null) } as any,
      );

    it('copies the recording into an upload of the organizer', async () => {
      await expect(
        build().execute(RECORDING_ID, ORGANIZER.email),
      ).resolves.toEqual({ id: UPLOAD_ID });
      expect(videoUploadGateway.createFromStoredMedia).toHaveBeenCalledWith(
        ORGANIZER.email,
        { key: MEDIA_KEY, filename: 'recording.mp4' },
      );
    });

    it('refuses anyone but the organizer', async () => {
      await expect(
        build().execute(RECORDING_ID, STRANGER.email),
      ).rejects.toThrow(UnauthorizedException);
      expect(videoUploadGateway.createFromStoredMedia).not.toHaveBeenCalled();
    });

    it('refuses while a speaker is asked to publish it', async () => {
      requestGateway.findPendingByRecording.mockResolvedValue(makeRequest());
      await expect(
        build().execute(RECORDING_ID, ORGANIZER.email),
      ).rejects.toThrow(ConflictException);
      expect(videoUploadGateway.createFromStoredMedia).not.toHaveBeenCalled();
    });

    it('refuses a montage still being merged', async () => {
      recordingRepository.getRecordingById.mockResolvedValue({
        id: RECORDING_ID,
        trackId: TRACK_ID,
        mediaId: MEDIA_KEY,
        visibility: 'unlisted',
        status: 'processing',
      });
      await expect(
        build().execute(RECORDING_ID, ORGANIZER.email),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('on the targeted speaker channel (US-6)', () => {
    const build = () =>
      new PreparePublicationRequestUploadUsecase(
        requestGateway,
        recordingRepository,
        videoUploadGateway,
        makeUserGateway(),
      );

    beforeEach(() => {
      requestGateway.getById.mockResolvedValue(makeRequest());
    });

    it('copies the recording into an upload of the speaker', async () => {
      await expect(build().execute(REQUEST_ID, SPEAKER.email)).resolves.toEqual(
        {
          id: UPLOAD_ID,
        },
      );
      expect(videoUploadGateway.createFromStoredMedia).toHaveBeenCalledWith(
        SPEAKER.email,
        { key: MEDIA_KEY, filename: 'recording.mp4' },
      );
    });

    it('refuses the organizer: only the targeted speaker answers', async () => {
      await expect(
        build().execute(REQUEST_ID, ORGANIZER.email),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses an answered request', async () => {
      requestGateway.getById.mockResolvedValue(
        makeRequest({ status: 'cancelled' }),
      );
      await expect(build().execute(REQUEST_ID, SPEAKER.email)).rejects.toThrow(
        ForbiddenException,
      );
      expect(videoUploadGateway.createFromStoredMedia).not.toHaveBeenCalled();
    });

    it('refuses a recording published meanwhile', async () => {
      recordingRepository.getRecordingById.mockResolvedValue({
        id: RECORDING_ID,
        trackId: TRACK_ID,
        mediaId: MEDIA_KEY,
        visibility: 'published',
        status: 'ready',
      });
      await expect(build().execute(REQUEST_ID, SPEAKER.email)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
