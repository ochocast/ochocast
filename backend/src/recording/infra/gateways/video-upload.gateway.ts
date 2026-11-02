import { Injectable } from '@nestjs/common';
import { IVideoUploadGateway } from '../../domain/gateways/video-upload.gateway';
import { UploadsService } from 'src/videos/uploads/uploads.service';

/**
 * Adapter rather than a provider alias of UploadsService: an alias would be
 * scanned again by the scheduler and run its maintenance timer twice.
 */
@Injectable()
export class VideoUploadGateway implements IVideoUploadGateway {
  constructor(private readonly uploads: UploadsService) {}

  async createFromStoredMedia(
    email: string,
    source: { key: string; filename: string },
  ): Promise<{ id: string }> {
    const { id } = await this.uploads.createFromStoredMedia(email, source);
    return { id };
  }
}
