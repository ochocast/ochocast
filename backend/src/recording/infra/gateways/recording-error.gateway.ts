import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IRecordingErrorGateway,
  RecordingError,
  RecordingErrorKind,
} from '../../domain/gateways/recording-error.gateway';
import { RecordingErrorEntity } from './entities/recording-error.entity';

export class RecordingErrorGateway implements IRecordingErrorGateway {
  constructor(
    @InjectRepository(RecordingErrorEntity)
    private readonly errorRepository: Repository<RecordingErrorEntity>,
  ) {}

  async setError(trackId: string, kind: RecordingErrorKind): Promise<void> {
    await this.errorRepository.save(
      new RecordingErrorEntity({ trackId, kind, occurredAt: new Date() }),
    );
  }

  async clearError(trackId: string): Promise<void> {
    await this.errorRepository.delete({ trackId });
  }

  async getError(trackId: string): Promise<RecordingError | null> {
    const entity = await this.errorRepository.findOneBy({ trackId });
    return entity ? { kind: entity.kind, occurredAt: entity.occurredAt } : null;
  }
}
