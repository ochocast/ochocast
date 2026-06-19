import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleTranscriptionUsecase } from 'src/transcription/domain/usecases/scheduleTranscription.usecase';
import { TranscriptionJob } from 'src/transcription/domain/gateways/transcription.gateway';

describe('ScheduleTranscriptionUsecase', () => {
  let scheduleTranscriptionUsecase: ScheduleTranscriptionUsecase;
  let mockTranscriptionGateway: any;

  beforeEach(async () => {
    mockTranscriptionGateway = {
      transcribe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleTranscriptionUsecase,
        {
          provide: 'TranscriptionGateway',
          useValue: mockTranscriptionGateway,
        },
      ],
    }).compile();

    scheduleTranscriptionUsecase = module.get<ScheduleTranscriptionUsecase>(
      ScheduleTranscriptionUsecase,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should transcribe each job in the batch', async () => {
    const jobs: TranscriptionJob[] = [
      { videoId: 'video-1', audioUrl: 'http://s3/audio1.mp3', language: 'fr' },
      { videoId: 'video-2', audioUrl: 'http://s3/audio2.mp3', language: 'fr' },
    ];

    mockTranscriptionGateway.transcribe.mockResolvedValue({
      text: 'Bonjour le monde',
      vttContent: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nBonjour le monde',
      words: [],
    });

    await scheduleTranscriptionUsecase.execute(jobs);

    expect(mockTranscriptionGateway.transcribe).toHaveBeenCalledTimes(2);
    expect(mockTranscriptionGateway.transcribe).toHaveBeenCalledWith(jobs[0]);
    expect(mockTranscriptionGateway.transcribe).toHaveBeenCalledWith(jobs[1]);
  });

  it('should continue processing remaining jobs if one fails', async () => {
    const jobs: TranscriptionJob[] = [
      { videoId: 'video-1', audioUrl: 'http://s3/audio1.mp3', language: 'fr' },
      { videoId: 'video-2', audioUrl: 'http://s3/audio2.mp3', language: 'fr' },
    ];

    mockTranscriptionGateway.transcribe
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce({
        text: 'OK',
        vttContent: 'WEBVTT',
        words: [],
      });

    await scheduleTranscriptionUsecase.execute(jobs);

    expect(mockTranscriptionGateway.transcribe).toHaveBeenCalledTimes(2);
  });

  it('should do nothing when the job list is empty', async () => {
    await scheduleTranscriptionUsecase.execute([]);

    expect(mockTranscriptionGateway.transcribe).not.toHaveBeenCalled();
  });
});
