import { getVideoProcessing } from './api';
import {
  Video,
  VideoProcessing,
  VideoProcessingState,
} from './VideoProperties';

const STATES: readonly VideoProcessingState[] = [
  'queued',
  'processing',
  'retrying',
  'ready',
  'failed',
];

const FIRST_POLL_DELAY_MS = 5000;
const MAX_POLL_DELAY_MS = 30000;

/** Delay before the next status check: 5 s, 10 s, 20 s, then every 30 s. */
export const nextPollDelay = (attempt: number) =>
  Math.min(FIRST_POLL_DELAY_MS * 2 ** attempt, MAX_POLL_DELAY_MS);

export const isFinalProcessingState = (state: VideoProcessingState) =>
  state === 'ready' || state === 'failed';

/** What the video page's player box shows. */
export type VideoPlayerView = 'processing' | 'failed' | 'player';

/**
 * A known processing state wins over the video's transcoding_status, loaded
 * with the page and possibly stale; the latter only applies until it arrives.
 */
export const videoPlayerView = (
  transcodingStatus: Video['transcoding_status'],
  processing: VideoProcessing | null,
): VideoPlayerView => {
  const state = processing?.state ?? transcodingStatus;
  if (state === 'failed') return 'failed';
  return state === 'ready' || state === undefined ? 'player' : 'processing';
};

export const parseVideoProcessing = (data: unknown): VideoProcessing | null => {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (!STATES.includes(body.state as VideoProcessingState)) return null;
  return {
    state: body.state as VideoProcessingState,
    since: typeof body.since === 'string' ? body.since : null,
    reason: typeof body.reason === 'string' ? body.reason : null,
    playedFromSource: body.playedFromSource === true,
  };
};

export type VideoProcessingFetchResult =
  | { kind: 'status'; status: VideoProcessing }
  | { kind: 'not_found' }
  | { kind: 'error' };

/** Never throws: network and server errors are worth another try later. */
export const fetchVideoProcessing = async (
  videoId: string,
): Promise<VideoProcessingFetchResult> => {
  try {
    const response = await getVideoProcessing(videoId);
    if (response?.status === 404) return { kind: 'not_found' };
    const status = response?.ok ? parseVideoProcessing(response.data) : null;
    return status ? { kind: 'status', status } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
};

const FAILURE_COPY = {
  invalid_source: {
    reason: 'processingFailureInvalidSource',
    advice: 'processingFailureInvalidSourceAdvice',
  },
  source_too_large: {
    reason: 'processingFailureTooLarge',
    advice: 'processingFailureTooLargeAdvice',
  },
  // Too long to transcode, and the source itself cannot be played as is.
  not_playable: {
    reason: 'processingFailureNotPlayable',
    advice: 'processingFailureNotPlayableAdvice',
  },
  temporary: {
    reason: 'processingFailureTemporary',
    advice: 'processingFailureTemporaryAdvice',
  },
} as const;

export type ProcessingFailureCopy =
  (typeof FAILURE_COPY)[keyof typeof FAILURE_COPY];

/** Translation keys explaining a final failure reason code to the creator. */
export const processingFailureCopy = (
  reason: string | null | undefined,
): ProcessingFailureCopy => {
  switch (reason) {
    case 'invalid_source':
      return FAILURE_COPY.invalid_source;
    case 'source_too_large':
      return FAILURE_COPY.source_too_large;
    case 'duration_exceeded':
    case 'deadline_exceeded':
      return FAILURE_COPY.not_playable;
    default:
      return FAILURE_COPY.temporary;
  }
};
