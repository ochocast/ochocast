import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { CreateRecordingSegmentFromFileUsecase } from 'src/recording/domain/usecases/createRecordingSegmentFromFile.usecase';
import { IRecordingRepositoryGateway } from 'src/recording/domain/gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';

const uploadedBodies: unknown[] = [];
jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(({ params }) => {
    uploadedBodies.push(params.Body);
    return { done: jest.fn().mockResolvedValue({}) };
  }),
}));

const readAll = async (body: unknown): Promise<Buffer> => {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const chunk of body as Readable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

describe('CreateRecordingSegmentFromFileUsecase', () => {
  let usecase: CreateRecordingSegmentFromFileUsecase;
  let recordingRepo: jest.Mocked<IRecordingRepositoryGateway>;
  let trackGateway: jest.Mocked<ITrackGateway>;
  let workDir: string;

  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';

  beforeEach(async () => {
    uploadedBodies.length = 0;
    workDir = await mkdtemp(path.join(tmpdir(), 'segment-spec-'));
    recordingRepo = {
      createRecording: jest.fn().mockImplementation(async (r) => r),
      getRecordingsByTrack: jest.fn(),
      getRecordingById: jest.fn(),
      countRecordingsByTrack: jest.fn().mockResolvedValue(2),
      updateRecording: jest.fn(),
      deleteRecording: jest.fn(),
    };
    trackGateway = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn().mockResolvedValue([{ id: trackId }]),
      updateTrack: jest.fn(),
      deleteTrack: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateRecordingSegmentFromFileUsecase,
        { provide: 'RecordingRepositoryGateway', useValue: recordingRepo },
        { provide: 'TrackGateway', useValue: trackGateway },
        { provide: 's3Client', useValue: {} },
      ],
    }).compile();
    usecase = moduleRef.get(CreateRecordingSegmentFromFileUsecase);
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('streams a segment stored on disk to S3 instead of buffering it', async () => {
    const filePath = path.join(workDir, 'upload');
    await writeFile(filePath, 'segment-bytes');

    const recording = await usecase.execute(
      trackId,
      { path: filePath, originalname: 'live.mp4' } as Express.Multer.File,
      { duration: 42 },
    );

    expect(uploadedBodies).toHaveLength(1);
    expect(Buffer.isBuffer(uploadedBodies[0])).toBe(false);
    expect((await readAll(uploadedBodies[0])).toString()).toBe('segment-bytes');
    expect(recording.mediaId).toMatch(
      new RegExp(`^recordings/${trackId}/[0-9a-f-]+/original\\.mp4$`),
    );
    expect(recording.visibility).toBe('unlisted');
    expect(recordingRepo.createRecording).toHaveBeenCalledTimes(1);
  });

  it('still accepts an in-memory upload', async () => {
    await usecase.execute(trackId, {
      buffer: Buffer.from('in-memory'),
      originalname: 'live.mp4',
    } as Express.Multer.File);

    expect((await readAll(uploadedBodies[0])).toString()).toBe('in-memory');
  });

  it('rejects an unknown track before uploading anything', async () => {
    trackGateway.getTracks.mockResolvedValue([]);
    await expect(
      usecase.execute(trackId, {
        buffer: Buffer.from('x'),
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(uploadedBodies).toHaveLength(0);
  });
});
