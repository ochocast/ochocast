import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueueService } from 'src/queue/queue.service';
import { VideoTranscodingResult } from 'src/queue/job.types';
import { Repository } from 'typeorm';
import { VideoEntity } from './infra/gateways/entities/video.entity';

@Injectable()
export class TranscodingResultConsumer implements OnModuleInit {
  private readonly logger = new Logger(TranscodingResultConsumer.name);

  constructor(
    private readonly queueService: QueueService,
    @InjectRepository(VideoEntity)
    private readonly videosRepository: Repository<VideoEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queueService.consumeResults((result) =>
      this.handleResult(result),
    );
  }

  private async handleResult(result: VideoTranscodingResult): Promise<void> {
    const update = result.success
      ? {
          duration: result.duration,
          transcoding_status: 'ready' as const,
          transcoding_error: null,
          ...(result.subtitle_id !== undefined
            ? { subtitle_id: result.subtitle_id }
            : {}),
        }
      : {
          transcoding_status: 'failed' as const,
          transcoding_error: result.error || 'Unknown transcoding error',
        };

    const outcome = await this.videosRepository.update(result.videoId, update);
    if (!outcome.affected) {
      throw new Error(`Video ${result.videoId} was not found`);
    }
    this.logger.log(
      `Video ${result.videoId} transcoding status: ${update.transcoding_status}`,
    );
  }
}
