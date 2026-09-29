import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IPublicationRequestGateway,
  PublicationRequestUpdate,
} from '../../domain/gateways/publication-request.gateway';
import {
  PublicationRequestObject,
  PublicationRequestStatus,
} from '../../domain/publicationRequest';
import { PublicationRequestEntity } from './entities/publication-request.entity';
import {
  toPublicationRequestEntity,
  toPublicationRequestObject,
} from 'src/common/mapper/publication-request.mapper';

const RELATIONS = ['requester', 'target', 'track'];

export class PublicationRequestGateway implements IPublicationRequestGateway {
  constructor(
    @InjectRepository(PublicationRequestEntity)
    private readonly repository: Repository<PublicationRequestEntity>,
  ) {}

  async create(
    request: PublicationRequestObject,
  ): Promise<PublicationRequestObject> {
    const saved = await this.repository.save(
      toPublicationRequestEntity(request),
    );
    return this.getById(saved.id);
  }

  async getById(id: string): Promise<PublicationRequestObject | null> {
    const entity = await this.repository.findOne({
      where: { id },
      relations: RELATIONS,
    });
    return entity ? toPublicationRequestObject(entity) : null;
  }

  async findByTarget(
    targetUserId: string,
    status: PublicationRequestStatus,
  ): Promise<PublicationRequestObject[]> {
    const entities = await this.repository.find({
      where: { targetUserId, status },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return entities.map(toPublicationRequestObject);
  }

  async findByTrack(trackId: string): Promise<PublicationRequestObject[]> {
    const entities = await this.repository.find({
      where: { trackId },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return entities.map(toPublicationRequestObject);
  }

  async findPendingByRecording(
    recordingId: string,
  ): Promise<PublicationRequestObject | null> {
    const entity = await this.repository.findOne({
      where: { recordingId, status: 'pending' },
      relations: RELATIONS,
    });
    return entity ? toPublicationRequestObject(entity) : null;
  }

  async update(
    id: string,
    changes: PublicationRequestUpdate,
  ): Promise<PublicationRequestObject> {
    await this.repository.update({ id }, changes);
    return this.getById(id);
  }
}
