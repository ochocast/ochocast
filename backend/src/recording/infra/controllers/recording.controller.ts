import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
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
import { Request } from 'express';
import { RecordingPrincipal } from '../../domain/recording-authorization.service';

type RecordingRequest = Request & { user?: RecordingPrincipal };

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
    @Req() request: RecordingRequest,
  ): Promise<{ status: string }> {
    try {
      await this.startRecordingUsecase.execute(
        {
          roomId: dto.roomId,
          trackId: dto.trackId,
        },
        request.user,
      );
      return { status: 'recording' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to start recording: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('stop/:trackId')
  async stopRecording(
    @Param('trackId') trackId: string,
    @Req() request: RecordingRequest,
  ): Promise<{ status: string }> {
    if (!isUUID(trackId)) {
      throw new HttpException('trackId must be a UUID', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.stopRecordingUsecase.execute(trackId, request.user);
      return { status: 'stopped' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
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
    @Req() request: RecordingRequest,
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
      return await this.publishRecordingUsecase.execute(
        trackId,
        file,
        request.user,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to publish recording: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
