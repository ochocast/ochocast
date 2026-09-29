import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from 'src/queue/queue.service';
import { VideoTranscodingResult } from 'src/queue/job.types';
import { DataSource } from 'typeorm';
import { VideoEntity } from './infra/gateways/entities/video.entity';
import { VideoUpload } from './uploads/upload.entity';

@Injectable()
export class TranscodingResultConsumer implements OnModuleInit {
  private readonly logger = new Logger(TranscodingResultConsumer.name);
  constructor(private readonly queueService: QueueService, private readonly db: DataSource) {}
  async onModuleInit() {
    // Multipart upload can be deployed before the transcoding plane. The
    // durable result consumer starts automatically once RabbitMQ is configured.
    if (this.queueService.configured) {
      await this.queueService.consumeResults(result => this.handleResult(result));
    }
  }
  async handleResult(result: VideoTranscodingResult) {
    await this.db.transaction(async m => {
      const s = await m.findOne(VideoUpload, { where: { id: result.videoId }, lock: { mode: 'pessimistic_write' } });
      // Unknown, superseded, or duplicate terminal results are acknowledged without changing data.
      if (!s || s.job?.jobId !== result.jobId || s.state === 'ready') return;
      if (result.success && !new RegExp(`^${s.id}/jobs/${s.job.jobId}/[0-9a-f-]{36}/master\\.m3u8$`).test(result.media_id || ''))
        throw new Error('Unexpected transcoding output key');
      const update = result.success ? {
        duration: result.duration, media_id: result.media_id,
        transcoding_status: 'ready' as const, transcoding_error: null,
      } : { transcoding_status: 'failed' as const, transcoding_error: (result.error || 'Unknown transcoding error').slice(0, 4096) };
      await m.update(VideoEntity, s.id, update);
      s.state = result.success ? 'ready' : 'failed'; s.completedAt = new Date();
      await m.save(s);
      this.logger.log(`Video ${s.id}: ${s.state}`);
    });
  }
}
