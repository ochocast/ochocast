import { Test } from '@nestjs/testing';
import { StartRecordingUsecase } from 'src/recording/domain/usecases/startRecording.usecase';
import { IRecordingVMGateway } from 'src/recording/domain/gateways/recording-vm.gateway';

describe('StartRecordingUsecase', () => {
  let usecase: StartRecordingUsecase;
  let vmGateway: jest.Mocked<IRecordingVMGateway>;

  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';

  beforeEach(async () => {
    vmGateway = {
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      getStatus: jest.fn().mockResolvedValue({ status: 'idle' }),
      isLiveActive: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StartRecordingUsecase,
        { provide: 'RecordingVMGateway', useValue: vmGateway },
      ],
    }).compile();

    usecase = moduleRef.get(StartRecordingUsecase);
    jest.spyOn(usecase as any, 'wait').mockResolvedValue(undefined);
  });

  it('starts the recorder on the track room (room_id == trackId)', async () => {
    await usecase.execute(trackId);

    expect(vmGateway.startRecording).toHaveBeenCalledWith({
      roomId: trackId,
      trackId,
    });
  });

  it('never starts a second recorder when one is already running', async () => {
    vmGateway.getStatus.mockResolvedValue({ status: 'recording' });

    await usecase.execute(trackId);

    expect(vmGateway.startRecording).not.toHaveBeenCalled();
  });

  it('retries when the recorder fails, then succeeds', async () => {
    vmGateway.startRecording
      .mockRejectedValueOnce(new Error('Stream not ready yet'))
      .mockResolvedValueOnce(undefined);

    await usecase.execute(trackId);

    expect(vmGateway.startRecording).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last retry', async () => {
    vmGateway.getStatus.mockRejectedValue(new Error('VM unreachable'));

    await expect(usecase.execute(trackId)).rejects.toThrow('VM unreachable');
    expect(vmGateway.getStatus).toHaveBeenCalledTimes(3);
  });
});
