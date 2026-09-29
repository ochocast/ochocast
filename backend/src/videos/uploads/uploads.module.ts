import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3Module } from 'src/s3.module';
import { UsersModule } from 'src/users/users.module';
import { VideoEntity } from '../infra/gateways/entities/video.entity';
import { MultipartStorage, S3MultipartStorage } from './multipart-storage';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { VideoUpload } from './upload.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VideoUpload, VideoEntity]), S3Module, UsersModule],
  controllers: [UploadsController],
  providers: [UploadsService, { provide: MultipartStorage, useClass: S3MultipartStorage }],
  exports: [UploadsService],
})
export class UploadsModule {}
