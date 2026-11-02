import { Injectable, Logger } from '@nestjs/common';
import { CreateNewVideoUsecase } from 'src/videos/domain/usecases/createNewVideo.usecase';
import { CreateVideoDto } from 'src/videos/infra/controllers/dto/create-video.dto';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import {
  RecordingAuthorizationService,
  RecordingPrincipal,
} from '../recording-authorization.service';

@Injectable()
export class PublishRecordingUsecase {
  private readonly logger = new Logger(PublishRecordingUsecase.name);

  constructor(
    private readonly authorization: RecordingAuthorizationService,
    private createNewVideoUsecase: CreateNewVideoUsecase,
  ) {}

  async execute(
    trackId: string,
    file: Express.Multer.File,
    principal: RecordingPrincipal,
  ): Promise<{ videoId: string }> {
    this.logger.log(`Publishing recording for track: ${trackId}`);

    const { track, event } = await this.authorization.authorize(
      trackId,
      principal,
      true,
    );

    // Build video metadata from the authorized track/event
    const videoTitle = `${track.name} - Enregistrement Live`;
    const videoDescription =
      track.description || event.description || 'Enregistrement automatique';

    // Convert speakers from PublicUserObject to UserEntity format
    const internalSpeakers: UserEntity[] = track.speakers.map((speaker) => {
      return new UserEntity({
        id: speaker.id,
        firstName: speaker.firstName,
        lastName: speaker.lastName,
      });
    });

    // Use event creator as video creator
    const creator = new UserEntity({
      id: event.creator.id,
      email: event.creator.email,
      firstName: event.creator.firstName,
      lastName: event.creator.lastName,
    });

    const videoDto: CreateVideoDto = {
      media_id: file.originalname || `recording-${trackId}.mp4`,
      miniature_id: '',
      title: videoTitle,
      description: videoDescription,
      tags: event.tags || [],
      creator: creator,
      internal_speakers: internalSpeakers,
      external_speakers: '',
      comments: [],
      archived: false,
    };

    this.logger.log(`Creating video: ${videoTitle}`);

    // Create the video (will transcode, generate thumbnail, upload to S3)
    const video = await this.createNewVideoUsecase.execute(
      videoDto,
      file,
      null, // miniature will be auto-generated from video
    );

    this.logger.log(`Video created successfully: ${video.id}`);

    return { videoId: video.id };
  }
}
