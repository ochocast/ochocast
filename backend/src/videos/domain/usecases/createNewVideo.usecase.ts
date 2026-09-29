import { Injectable } from '@nestjs/common';
import { CreateVideoDto } from '../../infra/controllers/dto/create-video.dto';
import { UploadsService } from '../../uploads/uploads.service';

/** Compatibility bridge for the disk-backed live-recorder callback. Browser uploads use sessions. */
@Injectable()
export class CreateNewVideoUsecase {
  constructor(private readonly uploads: UploadsService) {}
  async execute(video: CreateVideoDto, file: Express.Multer.File, _miniature?: Express.Multer.File) {
    return this.uploads.importRecording(video.creator.email, file, {
      title: video.title, description: video.description, tags: JSON.stringify(video.tags || []),
      internal_speakers: JSON.stringify(video.internal_speakers || []), external_speakers: video.external_speakers,
    });
  }
}
