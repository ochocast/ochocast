import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../../infra/gateways/entities/event.entity';

@Injectable()
export class CloseExpiredEventsUsecase {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepository: Repository<EventEntity>,
  ) {}

  async execute(): Promise<number> {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - offsetMs);

    const events = await this.eventsRepository.find({
      where: {
        closed: false,
      },
    });

    const toClose = events.filter((event) => {
      const closingTime = new Date(event.endDate.getTime());
      return localDate >= closingTime && event.published;
    });

    for (const event of toClose) {
      event.closed = true;
      await this.eventsRepository.save(event);
    }

    return toClose.length;
  }
}
