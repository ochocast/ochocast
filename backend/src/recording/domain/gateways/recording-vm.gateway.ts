export interface StartRecordingConfig {
  roomId: string;
  trackId: string;
}

export interface IRecordingVMGateway {
  startRecording: (config: StartRecordingConfig) => Promise<void>;
  stopRecording: (roomId: string) => Promise<void>;
  getStatus: (roomId?: string) => Promise<{
    status: string;
    roomId?: string;
    filePath?: string;
  }>;
  /** Whether a live is currently being broadcast in the SFU room. */
  isLiveActive: (roomId: string) => Promise<boolean>;
}
