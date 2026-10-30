import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GetRecordingsFilter,
  IRecordingRepositoryGateway,
  RecordingPublication,
  RecordingUpdate,
} from '../../domain/gateways/recording-repository.gateway';
import { RecordingObject } from '../../domain/recording';
import { RecordingEntity } from './entities/recording.entity';
import { TrackEntity } from 'src/tracks/infra/gateways/entities/track.entity';
import {
  toRecordingEntity,
  toRecordingObject,
} from 'src/common/mapper/recording.mapper';

export class RecordingRepositoryGateway implements IRecordingRepositoryGateway {
  constructor(
    @InjectRepository(RecordingEntity)
    private readonly recordingRepository: Repository<RecordingEntity>,
  ) {}

  async createRecording(recording: RecordingObject): Promise<RecordingObject> {
    const entity = toRecordingEntity(recording);
    const saved = await this.recordingRepository.save(entity);
    return toRecordingObject(saved);
  }

  async createSegment(recording: RecordingObject): Promise<RecordingObject> {
    return this.recordingRepository.manager.transaction(async (manager) => {
      // Locking the track serializes its segments, so each gets its own index.
      await manager.findOne(TrackEntity, {
        where: { id: recording.trackId },
        lock: { mode: 'pessimistic_write' },
      });
      const { max } = await manager
        .createQueryBuilder(RecordingEntity, 'r')
        .select('MAX(r.segment_index)', 'max')
        .where('r.trackId = :trackId', { trackId: recording.trackId })
        .andWhere("r.kind = 'segment'")
        .getRawOne();
      recording.segmentIndex = max === null ? 0 : Number(max) + 1;
      const saved = await manager.save(toRecordingEntity(recording));
      return toRecordingObject(saved);
    });
  }

  async getRecordingsByTrack(
    trackId: string,
    filter?: GetRecordingsFilter,
  ): Promise<RecordingObject[]> {
    const where: Record<string, unknown> = { trackId };
    if (filter?.visibility) {
      where.visibility = filter.visibility;
    }
    const entities = await this.recordingRepository.find({
      where,
      relations: ['published_by'],
      order: { segment_index: 'ASC', createdAt: 'ASC' },
    });
    return entities.map(toRecordingObject);
  }

  async getRecordingById(id: string): Promise<RecordingObject | null> {
    const entity = await this.recordingRepository.findOne({ where: { id } });
    return entity ? toRecordingObject(entity) : null;
  }

  async updateRecording(
    id: string,
    changes: RecordingUpdate,
  ): Promise<RecordingObject | null> {
    const patch: Record<string, unknown> = {};
    if (changes.status !== undefined) patch.status = changes.status;
    if (changes.mediaId !== undefined) patch.media_id = changes.mediaId;
    if (changes.duration !== undefined) patch.duration = changes.duration;

    if (Object.keys(patch).length > 0) {
      await this.recordingRepository.update(id, patch);
    }
    const entity = await this.recordingRepository.findOne({ where: { id } });
    return entity ? toRecordingObject(entity) : null;
  }

  async markPublished(
    id: string,
    publication: RecordingPublication,
  ): Promise<boolean> {
    const result = await this.recordingRepository.update(
      { id, visibility: 'unlisted', status: 'ready' },
      {
        visibility: 'published',
        published_at: publication.publishedAt,
        published_by_id: publication.publishedById,
        published_video_id: publication.publishedVideoId,
      },
    );
    return (result.affected ?? 0) > 0;
  }

  async deleteRecording(id: string): Promise<void> {
    await this.recordingRepository.delete(id);
  }
}
