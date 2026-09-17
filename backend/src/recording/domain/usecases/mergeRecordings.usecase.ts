import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { QueueService } from 'src/queue/queue.service';
import { RecordingObject } from '../recording';

/**
 * US-3 — Merge several unlisted segments of a track into a single merged
 * recording. The merge is created as `unlisted` + `processing`; the ffmpeg
 * worker produces the concatenated file and reports back. Source segments are
 * kept unlisted. Organizer-only.
 */
@Injectable()
export class MergeRecordingsUsecase {
  constructor(
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    private queueService: QueueService,
  ) {}

  async execute(
    trackId: string,
    segmentIds: string[],
    email: string,
  ): Promise<RecordingObject> {
    if (!Array.isArray(segmentIds) || segmentIds.length < 2) {
      throw new BadRequestException('A merge requires at least two segments');
    }

    const tracks = await this.trackGateway.getTracks({ id: trackId });
    if (!tracks || tracks.length === 0) {
      throw new NotFoundException(`Track not found: ${trackId}`);
    }

    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    const track = tracks[0];
    if (!track.canBeEditBy(currentUser)) {
      const event = await this.eventGateway.getEventById(track.eventId);
      if (!event || !event.canBeEditBy(currentUser)) {
        throw new UnauthorizedException(
          'Only the organizer can merge the recordings of this track',
        );
      }
    }

    // All requested ids must be unlisted raw segments of this track.
    const unlisted = await this.recordingRepository.getRecordingsByTrack(
      trackId,
      { visibility: 'unlisted' },
    );
    const byId = new Map(unlisted.map((r) => [r.id, r]));
    const selected = segmentIds.map((id) => {
      const rec = byId.get(id);
      if (!rec || rec.kind !== 'segment') {
        throw new BadRequestException(
          `Segment ${id} is not an unlisted segment of this track`,
        );
      }
      return rec;
    });

    // Default merge order is chronological.
    selected.sort((a, b) => a.segmentIndex - b.segmentIndex);

    const mergedId = uuid();
    const targetKey = `recordings/${trackId}/merged/${mergedId}.mp4`;
    const nextIndex =
      unlisted.reduce((max, r) => Math.max(max, r.segmentIndex), -1) + 1;

    const merged = new RecordingObject(
      mergedId,
      trackId,
      targetKey,
      'unlisted',
      false,
      nextIndex,
      null,
      new Date(),
      'merged',
      'processing',
      selected.map((r) => r.id),
    );

    const saved = await this.recordingRepository.createRecording(merged);

    await this.queueService.publishMergeJob({
      jobId: uuid(),
      recordingId: mergedId,
      trackId,
      sourceKeys: selected.map((r) => r.mediaId),
      targetKey,
      timestamp: Date.now(),
    });

    return saved;
  }
}
