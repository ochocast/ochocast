import { Test } from '@nestjs/testing';
import { StopRecordingUsecase } from 'src/recording/domain/usecases/stopRecording.usecase';
import { IRecordingVMGateway } from 'src/recording/domain/gateways/recording-vm.gateway';

describe('StopRecordingUsecase', () => {
  let usecase: StopRecordingUsecase;
  let vmGateway: jest.Mocked<IRecordingVMGateway>;

  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';

  beforeEach(async () => {
    vmGateway = {
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      getStatus: jest.fn(),
      isLiveActive: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StopRecordingUsecase,
        { provide: 'RecordingVMGateway', useValue: vmGateway },
      ],
    }).compile();

    usecase = moduleRef.get(StopRecordingUsecase);
  });

  it('stops the recorder when the track is being recorded', async () => {
    vmGateway.getStatus.mockResolvedValue({ status: 'recording' });

    await usecase.execute(trackId);

    expect(vmGateway.stopRecording).toHaveBeenCalledWith(trackId);
  });

  it('does nothing when nothing is recording', async () => {
    vmGateway.getStatus.mockResolvedValue({ status: 'idle' });

    await usecase.execute(trackId);

    expect(vmGateway.stopRecording).not.toHaveBeenCalled();
  });
});
