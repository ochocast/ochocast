import { IEventGateway } from '../../domain/gateways/events.gateway';
import { EventObject } from '../../domain/event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from './entities/event.entity';
import { toEventObject } from 'src/common/mapper/event.mapper';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { TrackEntity } from 'src/tracks/infra/gateways/entities/track.entity';

export class EventGateway implements IEventGateway {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepository: Repository<EventEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async createNewEvent(eventDetails: EventObject): Promise<EventObject> {
    let tags: TagEntity[] = [];
    if (typeof eventDetails.tags === 'string') {
      tags = JSON.parse(eventDetails.tags).map(
        (tag: any) => new TagEntity(tag),
      );
    } else if (Array.isArray(eventDetails.tags)) {
      tags = eventDetails.tags.map((tag: any) => new TagEntity(tag));
    }

    let tracks: TrackEntity[] = [];
    if (Array.isArray(eventDetails.tracks)) {
      tracks = eventDetails.tracks.map((track: any) => new TrackEntity(track));
    }
    // Exclure usersSubscribe du spread pour éviter l'erreur de type
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { usersSubscribe, ...rest } = eventDetails;
    const event: EventEntity = new EventEntity({
      ...rest,
      tags,
      tracks,
      creator: eventDetails.creatorId
        ? ({ id: eventDetails.creatorId } as UserEntity)
        : undefined,
      // usersSubscribe: [] // à gérer si besoin
    });
    return toEventObject(await this.eventsRepository.save(event));
  }

  getEvents(filter: any): Promise<EventObject[]> {
    return this.eventsRepository
      .find({
        where: {
          ...filter,
        },
        relations: [
          'creator',
          'tracks',
          'tracks.speakers',
          'usersSubscribe',
          'tags',
        ],
      })
      .then((entities) => entities.map(toEventObject));
  }

  async updateEvent(eventDetails: EventObject): Promise<EventObject> {
    const event = await this.eventsRepository.findOne({
      where: {
        id: eventDetails.id,
      },
      relations: [
        'creator',
        'tracks',
        'tracks.speakers',
        'usersSubscribe',
        'tags',
      ],
    });

    if (!event) {
      throw new Error(`Event ${eventDetails.id} not found`);
    }

    // Update basic event properties
    event.name = eventDetails.name;
    event.description = eventDetails.description;
    event.startDate = eventDetails.startDate;
    event.endDate = eventDetails.endDate;
    event.published = eventDetails.published;
    event.isPrivate = eventDetails.isPrivate;
    event.closed = eventDetails.closed;
    event.imageSlug = eventDetails.imageSlug;

    let tags: TagEntity[] = [];
    if (typeof eventDetails.tags === 'string') {
      tags = JSON.parse(eventDetails.tags).map(
        (tag: any) => new TagEntity(tag),
      );
    } else if (Array.isArray(eventDetails.tags)) {
      tags = eventDetails.tags.map((tag: any) => new TagEntity(tag));
    }
    event.tags = tags;

    // Update subscribers relationship
    event.usersSubscribe = await Promise.all(
      eventDetails.usersSubscribe.map(async (publicUser) => {
        const full = await this.userRepository.findOneBy({ id: publicUser.id });
        if (!full) throw new Error(`User ${publicUser.id} not found`);
        return full;
      }),
    );

    // Save and reload to ensure all relations are persisted
    const saved = await this.eventsRepository.save(event);
    const reloaded = await this.eventsRepository.findOne({
      where: { id: saved.id },
      relations: [
        'creator',
        'tracks',
        'tracks.speakers',
        'usersSubscribe',
        'tags',
      ],
    });
    return toEventObject(reloaded);
  }

  async deleteEvent(eventId: string): Promise<EventObject> {
    const event = await this.eventsRepository.findOneBy({ id: eventId });

    return toEventObject(await this.eventsRepository.remove(event));
  }

  async getEventById(id: string): Promise<EventObject> {
    const entity = await this.eventsRepository.findOne({
      where: { id },
      relations: [
        'creator',
        'tracks',
        'tracks.speakers',
        'usersSubscribe',
        'tags',
      ],
    });

    if (!entity) return null;

    return toEventObject(entity);
  }
}
