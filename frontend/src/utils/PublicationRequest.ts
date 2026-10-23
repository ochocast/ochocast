// US-6 — Request to publish a recording on a track speaker's channel.

export type PublicationRequestStatus =
  | 'pending'
  | 'accepted'
  | 'refused'
  | 'cancelled'
  | 'expired';

export interface PublicationRequestUser {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PublicationRequest {
  id: string;
  recordingId: string;
  trackId: string;
  requesterId: string;
  targetUserId: string;
  status: PublicationRequestStatus;
  title: string;
  metadata: {
    description: string;
    tags: unknown[];
    internalSpeakers: unknown[];
    externalSpeakers: string;
  };
  refusalReason: string | null;
  videoId: string | null;
  createdAt: string;
  decidedAt: string | null;
  requester?: PublicationRequestUser;
  target?: PublicationRequestUser;
  trackName?: string;
}

export const displayName = (user?: {
  firstName?: string;
  lastName?: string;
}): string => [user?.firstName, user?.lastName].filter(Boolean).join(' ');

/** Fired after answering a request so the upload panel refreshes at once. */
export const PUBLICATION_REQUESTS_CHANGED = 'publication-requests-changed';
