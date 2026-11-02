export type RecordingErrorKind = 'start_failed' | 'stop_failed';

export interface RecordingError {
  kind: RecordingErrorKind;
  occurredAt: Date;
}

/**
 * US-5c — Persistence port for the last recorder failure of a track, shown to
 * the organizer until the next successful start/stop or until disarming.
 */
export interface IRecordingErrorGateway {
  setError: (trackId: string, kind: RecordingErrorKind) => Promise<void>;
  clearError: (trackId: string) => Promise<void>;
  getError: (trackId: string) => Promise<RecordingError | null>;
}
