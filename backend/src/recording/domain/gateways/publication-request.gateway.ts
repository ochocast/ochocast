import {
  PublicationRequestObject,
  PublicationRequestStatus,
} from '../publicationRequest';

export interface PublicationRequestUpdate {
  status?: PublicationRequestStatus;
  refusalReason?: string | null;
  videoId?: string | null;
  decidedAt?: Date | null;
}

/** US-6 — Persistence port for publication requests. */
export interface IPublicationRequestGateway {
  create: (
    request: PublicationRequestObject,
  ) => Promise<PublicationRequestObject>;
  getById: (id: string) => Promise<PublicationRequestObject | null>;
  findByTarget: (
    targetUserId: string,
    status: PublicationRequestStatus,
  ) => Promise<PublicationRequestObject[]>;
  findByTrack: (trackId: string) => Promise<PublicationRequestObject[]>;
  findPendingByRecording: (
    recordingId: string,
  ) => Promise<PublicationRequestObject | null>;
  update: (
    id: string,
    changes: PublicationRequestUpdate,
  ) => Promise<PublicationRequestObject>;
}
