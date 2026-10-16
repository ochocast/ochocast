import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TranscodingJobEntity } from 'src/transcoding-jobs/transcoding-job.entity';
import { IVideoProcessingGateway } from '../../domain/gateways/videoProcessing.gateway';
import { ProcessingJob, ProcessingVideo } from '../../domain/videoProcessing';
import { VideoEntity } from './entities/video.entity';

export class VideoProcessingGateway implements IVideoProcessingGateway {
  constructor(
    @InjectRepository(VideoEntity)
    private readonly videos: Repository<VideoEntity>,
    @InjectRepository(TranscodingJobEntity)
    private readonly jobs: Repository<TranscodingJobEntity>,
  ) {}

  findVideo(id: string): Promise<ProcessingVideo | null> {
    return this.videos.findOne({
      where: { id, archived: false },
      select: {
        id: true,
        transcoding_status: true,
        transcoding_error: true,
        createdAt: true,
      },
    });
  }

  findJob(videoId: string): Promise<ProcessingJob | null> {
    return this.jobs.findOne({
      where: { videoId },
      select: {
        id: true,
        status: true,
        attempts: true,
        leaseExpiresAt: true,
        result: true,
      },
    });
  }
}
