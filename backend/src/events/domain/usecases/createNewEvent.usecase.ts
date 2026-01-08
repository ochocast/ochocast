import { EventDataDto } from '../../infra/controllers/dto/event-data.dto';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { v4 as uuid } from 'uuid';
import { Inject, NotFoundException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { S3Client } from '@aws-sdk/client-s3';
import * as path from 'path';
import { tmpdir } from 'os';
import { Upload } from '@aws-sdk/lib-storage';
import { readFile, unlink } from 'node:fs/promises';
import * as sharp from 'sharp';

export class CreateNewEventUsecase {
  constructor(
    @Inject('EventGateway') private eventGateway: IEventGateway,
    @Inject('UserGateway') private userGateway: IUserGateway,
    @Inject('s3Client') private s3Client: S3Client,
  ) {}

  async execute(
    currentUserEmail: string,
    eventToCreate: EventDataDto,
    miniatureFile: Express.Multer.File,
  ): Promise<EventObject> {
    const user = await this.userGateway.getUserByEmail(currentUserEmail);
    if (!user) throw new NotFoundException('User not found');
    let miniature_id = '';
    if (miniatureFile) {
      miniature_id = `miniature${Date.now()}.jpg`;
    } else {
      miniature_id = `imageSlug`;
    }

    const event = new EventObject(
      uuid(),
      eventToCreate.name,
      eventToCreate.description,
      eventToCreate.tags,
      eventToCreate.startDate,
      eventToCreate.endDate,
      false,
      true,
      false,
      miniature_id,
      [],
      user.id,
      new Date(),
      user,
      [],
    );

    if (miniatureFile) {
      const tempMiniaturePath = path.join(
        tmpdir(),
        `miniature${event.imageSlug}.jpg`,
      );
      await sharp(miniatureFile.buffer)
        .resize(1280, 720, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80 })
        .toFile(tempMiniaturePath);

      if (event.imageSlug !== 'imageSlug') {
        const miniatureUpload = new Upload({
          client: this.s3Client,
          params: {
            Bucket: process.env.STOCK_MINIATURE_BUCKET,
            Key: event.imageSlug,
            Body: await readFile(tempMiniaturePath),
            ContentType: 'image/jpeg',
          },
        });
        const miniature_result = await miniatureUpload.done();
        await unlink(tempMiniaturePath).catch(() => {});
      }
    }

    await this.eventGateway.createNewEvent(event);
    return event;
  }
}
