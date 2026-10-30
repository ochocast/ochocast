import { RecordingMergeJob } from '../recordingMergeJob';

/** US-3 — Port: hands a merge job to the merge worker. */
export interface IMergeJobDispatcher {
  /** False when no merge queue is configured on this environment. */
  readonly enabled: boolean;
  /** Persists the job, then publishes it. */
  dispatch: (job: RecordingMergeJob) => Promise<void>;
}
