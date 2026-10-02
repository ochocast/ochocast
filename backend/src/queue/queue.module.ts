import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { TranscodingJobsModule } from '../transcoding-jobs/transcoding-jobs.module';

@Global()
@Module({
  imports: [TranscodingJobsModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
