import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TranscodingJobEntity } from './transcoding-job.entity';
import { TranscodingJobsService } from './transcoding-jobs.service';
import {
  TranscodingCallbackGuard,
  TranscodingJobsController,
} from './transcoding-jobs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TranscodingJobEntity])],
  controllers: [TranscodingJobsController],
  providers: [TranscodingJobsService, TranscodingCallbackGuard],
  exports: [TranscodingJobsService],
})
export class TranscodingJobsModule {}
