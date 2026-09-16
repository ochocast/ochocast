import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GetRecordingsFilter,
  IRecordingRepositoryGateway,
} from '../../domain/gateways/recording-repository.gateway';
import { RecordingObject } from '../../domain/recording';
import { RecordingEntity } from './entities/recording.entity';
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
      order: { segment_index: 'ASC', createdAt: 'ASC' },
    });
    return entities.map(toRecordingObject);
  }

  async getRecordingById(id: string): Promise<RecordingObject | null> {
    const entity = await this.recordingRepository.findOne({ where: { id } });
    return entity ? toRecordingObject(entity) : null;
  }

  async countRecordingsByTrack(trackId: string): Promise<number> {
    return this.recordingRepository.count({ where: { trackId } });
  }
}
