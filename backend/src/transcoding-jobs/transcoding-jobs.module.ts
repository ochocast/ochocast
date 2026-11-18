import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchModule } from '../search/search.module';
import { TranscodingJobEntity } from './transcoding-job.entity';
import { TranscodingJobsService } from './transcoding-jobs.service';
import {
  TranscodingCallbackGuard,
  TranscodingJobsController,
} from './transcoding-jobs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TranscodingJobEntity]), SearchModule],
  controllers: [TranscodingJobsController],
  providers: [TranscodingJobsService, TranscodingCallbackGuard],
  exports: [TranscodingJobsService],
})
export class TranscodingJobsModule {}
