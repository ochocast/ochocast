import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class DeleteEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(eventId: string, currentEmail: string): Promise<EventObject> {
    const currentUser = await this.userGateway.getUserByEmail(currentEmail);
    if (!currentUser) throw new NotFoundException('User not foud');
    const event = await this.eventGateway.getEventById(eventId);
    if (!event) throw new NotFoundException('Event not Found');
    if (!event.canBeEditBy(currentUser))
      throw new UnauthorizedException("Current user can't delete this event");

    if (event.imageSlug !== 'imageSlug') {
      const miniatureCommand = new DeleteObjectCommand({
        Bucket: process.env.STOCK_MINIATURE_BUCKET,
        Key: event.imageSlug,
      });
      this.s3Client.send(miniatureCommand);
    }
    return await this.eventGateway.deleteEvent(eventId);
  }
}
