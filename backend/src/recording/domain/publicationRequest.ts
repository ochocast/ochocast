import { ApiProperty } from '@nestjs/swagger';

export type PublicationRequestStatus =
  | 'pending'
  | 'accepted'
  | 'refused'
  | 'cancelled'
  | 'expired';

/** Video metadata proposed by the organizer; the speaker may edit it. */
export interface PublicationRequestMetadata {
  description: string;
  tags: unknown[];
  internalSpeakers: unknown[];
  externalSpeakers: string;
}

export interface PublicationRequestUser {
  id: string;
  firstName: string;
  lastName: string;
}

const DEFAULT_TTL_DAYS = 7;

/**
 * US-6 — Request from a track organizer to publish a recording on the channel
 * of one of the track speakers. Nothing is published until the speaker
 * accepts; an unanswered request expires after PUBLICATION_REQUEST_TTL_DAYS.
 */
export class PublicationRequestObject {
  @ApiProperty() id: string;
  @ApiProperty() recordingId: string;
  @ApiProperty() trackId: string;
  @ApiProperty() requesterId: string;
  @ApiProperty() targetUserId: string;
  @ApiProperty() status: PublicationRequestStatus;
  @ApiProperty() title: string;
  @ApiProperty() metadata: PublicationRequestMetadata;
  @ApiProperty({ nullable: true }) refusalReason: string | null;
  @ApiProperty({ nullable: true }) videoId: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) decidedAt: Date | null;
  @ApiProperty({ required: false }) requester?: PublicationRequestUser;
  @ApiProperty({ required: false }) target?: PublicationRequestUser;
  @ApiProperty({ required: false }) trackName?: string;

  constructor(fields: Omit<PublicationRequestObject, 'isStale'>) {
    Object.assign(this, fields);
  }

  /** A pending request older than the TTL counts as an implicit refusal. */
  isStale(now: Date = new Date()): boolean {
    if (this.status !== 'pending') return false;
    const days =
      Number(process.env.PUBLICATION_REQUEST_TTL_DAYS) || DEFAULT_TTL_DAYS;
    return now.getTime() - this.createdAt.getTime() > days * 86_400_000;
  }
}
