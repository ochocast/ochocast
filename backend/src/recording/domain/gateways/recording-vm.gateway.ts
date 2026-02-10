export interface StartRecordingConfig {
  roomId: string;
  roomKey: string;
  sfuUrl: string;
  trackId?: string;
}

export interface IRecordingVMGateway {
  startRecording: (config: StartRecordingConfig) => Promise<void>;
  stopRecording: (roomId: string) => Promise<void>;
  getStatus: () => Promise<{
    status: string;
    roomId?: string;
    filePath?: string;
  }>;
}
