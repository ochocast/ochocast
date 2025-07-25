import {
  NotFoundException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { EventDataDto } from 'src/events/infra/controllers/dto/event-data.dto';

export class UpdateEventUsecase {
  constructor(
    @Inject('EventGateway')
    private readonly eventGateway: IEventGateway,
    @Inject('UserGateway')
    private readonly userGateway: IUserGateway,
    @Inject('s3Client')
    private readonly s3Client: S3Client,
  ) {}

  /**
   * @param eventId       ID de l’événement à mettre à jour
   * @param eventUpdate   Champs venant du formulaire (JSON ou multipart) – peut être partiel
   * @param file          Fichier miniature (undefined si pas de changement)
   * @param userEmail     Email de l’utilisateur courant      */
  async execute(
    eventId: string,
    eventUpdate: EventDataDto,
    file: Express.Multer.File | undefined,
    userEmail: string,
  ): Promise<EventObject> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new NotFoundException('User not found');
    const existingEvent = await this.eventGateway.getEventById(eventId);
    if (!existingEvent) throw new NotFoundException('Event not found');
    if (!existingEvent.canBeEditBy(user)) throw new UnauthorizedException();
    if (file) {
      if (existingEvent.imageSlug && existingEvent.imageSlug !== 'imageSlug') {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.STOCK_MINIATURE_BUCKET,
            Key: existingEvent.imageSlug,
          }),
        );
      }

      const newSlug = `${randomUUID()}${extname(file.originalname)}`;
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.STOCK_MINIATURE_BUCKET,
          Key: newSlug,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      existingEvent.imageSlug = newSlug;
    } else if (eventUpdate.imageSlug) {
      existingEvent.imageSlug = eventUpdate.imageSlug;
    }

    if (eventUpdate.name !== undefined) existingEvent.name = eventUpdate.name;
    if (eventUpdate.description !== undefined)
      existingEvent.description = eventUpdate.description;
    if (eventUpdate.startDate !== undefined)
      existingEvent.startDate = eventUpdate.startDate;
    if (eventUpdate.endDate !== undefined)
      existingEvent.endDate = eventUpdate.endDate;
    if (eventUpdate.tags !== undefined) existingEvent.tags = eventUpdate.tags;
    return await this.eventGateway.updateEvent(existingEvent);
  }
}
