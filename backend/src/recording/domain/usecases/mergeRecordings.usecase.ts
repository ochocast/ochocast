import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { getOrganizedTrack } from '../trackOrganizer';
import { IMergeJobDispatcher } from '../gateways/merge-job-dispatcher.gateway';
import { RecordingObject } from '../recording';

/**
 * US-3 — Merge several unlisted segments of a track into a single merged
 * recording. The merge is created as `unlisted` + `processing` and sent to
 * the merge queue; the merge worker produces the concatenated file and reports
 * back through its callbacks. Source segments are kept unlisted.
 * Organizer-only.
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
    @Inject('MergeJobDispatcher')
    private mergeJobDispatcher: IMergeJobDispatcher,
  ) {}

  async execute(
    trackId: string,
    segmentIds: string[],
    email: string,
  ): Promise<RecordingObject> {
    if (!Array.isArray(segmentIds) || segmentIds.length < 2) {
      throw new BadRequestException('A merge requires at least two segments');
    }
    if (!this.mergeJobDispatcher.enabled) {
      throw new ServiceUnavailableException(
        'Merging is not available on this environment',
      );
    }

    await getOrganizedTrack(
      {
        trackGateway: this.trackGateway,
        userGateway: this.userGateway,
        eventGateway: this.eventGateway,
      },
      trackId,
      email,
      'Only the organizer can merge the recordings of this track',
    );

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

    const merged = new RecordingObject(
      mergedId,
      trackId,
      targetKey,
      'unlisted',
      false,
      // Sorts with its first segment; segment numbering is left untouched.
      selected[0].segmentIndex,
      null,
      new Date(),
      'merged',
      'processing',
      selected.map((r) => r.id),
    );

    const saved = await this.recordingRepository.createRecording(merged);

    try {
      await this.mergeJobDispatcher.dispatch({
        jobId: uuid(),
        recordingId: mergedId,
        trackId,
        sourceKeys: selected.map((r) => r.mediaId),
        targetKey,
        timestamp: Date.now(),
      });
    } catch {
      // Not queued: show the montage as failed so the organizer can go back.
      await this.recordingRepository.updateRecording(mergedId, {
        status: 'failed',
      });
      throw new ServiceUnavailableException('The merge could not be started');
    }

    return saved;
  }
}
