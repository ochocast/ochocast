import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { StartRecordingDto } from './dto/start-recording.dto';
import { StartRecordingUsecase } from '../../domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from '../../domain/usecases/stopRecording.usecase';
import { PublishRecordingUsecase } from '../../domain/usecases/publishRecording.usecase';
import { isUUID } from 'class-validator';

@ApiTags('Recording')
@Controller('recordings')
export class RecordingController {
  constructor(
    private startRecordingUsecase: StartRecordingUsecase,
    private stopRecordingUsecase: StopRecordingUsecase,
    private publishRecordingUsecase: PublishRecordingUsecase,
  ) {}

  @Post('start')
  @UsePipes(new ValidationPipe())
  async startRecording(
    @Body() dto: StartRecordingDto,
  ): Promise<{ status: string }> {
    try {
      await this.startRecordingUsecase.execute({
        roomId: dto.roomId,
        roomKey: dto.roomKey,
        sfuUrl: dto.sfuUrl,
        trackId: dto.trackId,
      });
      return { status: 'recording' };
    } catch (error) {
      throw new HttpException(
        `Failed to start recording: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('stop/:trackId')
  async stopRecording(
    @Param('trackId') trackId: string,
  ): Promise<{ status: string }> {
    if (!isUUID(trackId)) {
      throw new HttpException('trackId must be a UUID', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.stopRecordingUsecase.execute(trackId);
      return { status: 'stopped' };
    } catch (error) {
      throw new HttpException(
        `Failed to stop recording: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('publish')
  @UseInterceptors(FileInterceptor('file'))
  async publishRecording(
    @UploadedFile() file: Express.Multer.File,
    @Body('trackId') trackId: string,
  ): Promise<{ videoId: string }> {
    if (!file) {
      throw new HttpException('File is required', HttpStatus.BAD_REQUEST);
    }

    if (!trackId || !isUUID(trackId)) {
      throw new HttpException(
        'trackId must be a valid UUID',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.publishRecordingUsecase.execute(trackId, file);
    } catch (error) {
      throw new HttpException(
        `Failed to publish recording: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
