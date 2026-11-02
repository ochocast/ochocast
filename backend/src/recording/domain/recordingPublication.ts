import { BadRequestException, ConflictException } from '@nestjs/common';
import { extname } from 'path';
import { RecordingObject } from './recording';
import { IPublicationRequestGateway } from './gateways/publication-request.gateway';
import { settleExpiry } from './publicationRequestAccess';

// Shared rules of publishing a recording, on the organizer's channel (US-4)
// or on a speaker's after approval (US-6).

export function assertPublishable(recording: RecordingObject): void {
  if (recording.visibility !== 'unlisted') {
    throw new ConflictException('Recording is already published');
  }
  if (recording.status !== 'ready') {
    throw new BadRequestException('Recording is not ready');
  }
}

/** The organizer cannot publish while a speaker is asked to. */
export async function assertNoPendingRequest(
  gateway: IPublicationRequestGateway,
  recordingId: string,
): Promise<void> {
  const pending = await gateway.findPendingByRecording(recordingId);
  if (pending && (await settleExpiry(gateway, pending)).status === 'pending') {
    throw new ConflictException(
      'A publication request is pending for this recording',
    );
  }
}

/** Name of the upload copied from a recording (its extension picks the player). */
export function recordingFilename(recording: RecordingObject): string {
  return `recording${extname(recording.mediaId).toLowerCase() || '.mp4'}`;
}
