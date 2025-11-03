import { Inject, NotFoundException } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class GetEventMiniatureUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(eventId: string, currentEmail: string): Promise<string> {
    const event = await this.eventGateway.getEventById(eventId);
    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Si pas d'utilisateur connecté (accès public), vérifier que l'event est published
    if (!currentEmail && !event.published) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Si l'utilisateur est connecté, vérifier que c'est le créateur ou que l'event est published
    if (currentEmail) {
      const currentUser = await this.userGateway.getUserByEmail(currentEmail);
      if (!currentUser) throw new NotFoundException('User not found');

      const isCreator = event.creator.id === currentUser.id;
      if (!isCreator && !event.published) {
        throw new NotFoundException(`Event with ID ${eventId} not found`);
      }
    }

    const key = event.imageSlug;

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MINIATURE_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    return url;
  }
}
