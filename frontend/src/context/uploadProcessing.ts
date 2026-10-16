import type { UploadItem } from './UploadContext';
import { VideoProcessing } from '../utils/VideoProperties';
import {
  ProcessingFailureCopy,
  processingFailureCopy,
} from '../utils/videoProcessing';

type FailureKey = ProcessingFailureCopy[keyof ProcessingFailureCopy];
type Translate = (key: FailureKey) => string;

/**
 * The bytes landed and /complete created the video (its id is the upload
 * session id): the video is still to be processed, not online yet.
 */
export const uploadCompletedUpdate = (
  result: { id?: string } | undefined,
  sessionId?: string,
): Partial<UploadItem> => ({
  progress: 100,
  status: 'processing',
  videoId: result?.id || sessionId,
  errorMessage: undefined,
});

/** What a processing status means for the upload, or null to keep waiting. */
export const processingUploadUpdate = (
  processing: VideoProcessing,
  t: Translate,
): Partial<UploadItem> | null => {
  if (processing.state === 'ready')
    return { status: 'completed', progress: 100, errorMessage: undefined };
  if (processing.state === 'failed') {
    const copy = processingFailureCopy(processing.reason);
    return {
      status: 'error',
      progress: 100,
      errorMessage: `${t(copy.reason)} ${t(copy.advice)}`,
    };
  }
  return null;
};
