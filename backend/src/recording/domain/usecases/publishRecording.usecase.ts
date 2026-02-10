import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { CreateNewVideoUsecase } from 'src/videos/domain/usecases/createNewVideo.usecase';
import { CreateVideoDto } from 'src/videos/infra/controllers/dto/create-video.dto';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

@Injectable()
export class PublishRecordingUsecase {
  private readonly logger = new Logger(PublishRecordingUsecase.name);

  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    private createNewVideoUsecase: CreateNewVideoUsecase,
  ) {}

  async execute(
    trackId: string,
    file: Express.Multer.File,
  ): Promise<{ videoId: string }> {
    this.logger.log(`Publishing recording for track: ${trackId}`);

    // 1. Get track info
    const tracks = await this.trackGateway.getTracks({ id: trackId });
    if (!tracks || tracks.length === 0) {
      throw new Error(`Track not found: ${trackId}`);
    }
    const track = tracks[0];

    this.logger.log(`Found track: ${track.name}`);

    // 2. Get event info for tags and creator
    const event = await this.eventGateway.getEventById(track.eventId);
    if (!event) {
      throw new Error(`Event not found: ${track.eventId}`);
    }

    this.logger.log(`Found event: ${event.name}`);

    // 3. Build video metadata from track/event
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

    // 4. Create the video (will transcode, generate thumbnail, upload to S3)
    const video = await this.createNewVideoUsecase.execute(
      videoDto,
      file,
      null, // miniature will be auto-generated from video
    );

    this.logger.log(`Video created successfully: ${video.id}`);

    return { videoId: video.id };
  }
}
