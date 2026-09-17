import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'nest-keycloak-connect';
import { StartRecordingDto } from './dto/start-recording.dto';
import { StartRecordingUsecase } from '../../domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from '../../domain/usecases/stopRecording.usecase';
import { PublishRecordingUsecase } from '../../domain/usecases/publishRecording.usecase';
import { CreateRecordingSegmentFromFileUsecase } from '../../domain/usecases/createRecordingSegmentFromFile.usecase';
import { GetTrackRecordingsUsecase } from '../../domain/usecases/getTrackRecordings.usecase';
import { GetRecordingMediaUrlUsecase } from '../../domain/usecases/getRecordingMediaUrl.usecase';
import { MergeRecordingsUsecase } from '../../domain/usecases/mergeRecordings.usecase';
import { DeleteRecordingUsecase } from '../../domain/usecases/deleteRecording.usecase';
import { MarkRecordingPublishedUsecase } from '../../domain/usecases/markRecordingPublished.usecase';
import { MergeRecordingsDto } from './dto/merge-recordings.dto';
import { RecordingObject } from '../../domain/recording';
import { RecordingSecretGuard } from '../guards/recording-secret.guard';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { isUUID } from 'class-validator';

@ApiTags('Recording')
@Controller('recordings')
export class RecordingController {
  constructor(
    private startRecordingUsecase: StartRecordingUsecase,
    private stopRecordingUsecase: StopRecordingUsecase,
    private publishRecordingUsecase: PublishRecordingUsecase,
    private createRecordingSegmentFromFileUsecase: CreateRecordingSegmentFromFileUsecase,
    private getTrackRecordingsUsecase: GetTrackRecordingsUsecase,
    private getRecordingMediaUrlUsecase: GetRecordingMediaUrlUsecase,
    private mergeRecordingsUsecase: MergeRecordingsUsecase,
    private deleteRecordingUsecase: DeleteRecordingUsecase,
    private markRecordingPublishedUsecase: MarkRecordingPublishedUsecase,
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

  @Public()
  @UseGuards(RecordingSecretGuard)
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
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'object'
            ? JSON.stringify(error)
            : String(error);
      throw new HttpException(
        `Failed to publish recording: ${msg}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * US-1 / Raccordement — Register a captured recording segment (unlisted).
   * Called by the recorder (secret-guarded, multipart file), once per segment,
   * including additional segments produced by a live crash.
   */
  @Public()
  @UseGuards(RecordingSecretGuard)
  @Post('segments')
  @UseInterceptors(FileInterceptor('file'))
  async createSegment(
    @UploadedFile() file: Express.Multer.File,
    @Body('trackId') trackId: string,
    @Body('problematic') problematic?: string,
    @Body('duration') duration?: string,
  ): Promise<RecordingObject> {
    if (!file) {
      throw new HttpException('File is required', HttpStatus.BAD_REQUEST);
    }
    if (!trackId || !isUUID(trackId)) {
      throw new HttpException(
        'trackId must be a valid UUID',
        HttpStatus.BAD_REQUEST,
      );
    }

    const parsedDuration =
      duration !== undefined && duration !== '' ? Number(duration) : null;

    try {
      return await this.createRecordingSegmentFromFileUsecase.execute(
        trackId,
        file,
        {
          problematic: problematic === 'true' || problematic === '1',
          duration:
            parsedDuration !== null && !Number.isNaN(parsedDuration)
              ? parsedDuration
              : null,
        },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        `Failed to register recording segment: ${msg}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * US-1 / US-2 — List the unlisted recording segments of a track.
   * Intended for the organizer, in the track settings.
   */
  @Get('track/:trackId')
  async getTrackRecordings(
    @Param('trackId') trackId: string,
    @CurrentUserEmail() email: string,
  ): Promise<RecordingObject[]> {
    if (!isUUID(trackId)) {
      throw new HttpException('trackId must be a UUID', HttpStatus.BAD_REQUEST);
    }
    return this.getTrackRecordingsUsecase.execute(trackId, email);
  }

  /**
   * Returns a short-lived presigned URL to preview/play a segment's raw file.
   * Restricted to the organizer of the segment's track.
   */
  @Get(':id/media')
  async getRecordingMedia(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<{ url: string }> {
    if (!isUUID(id)) {
      throw new HttpException('id must be a UUID', HttpStatus.BAD_REQUEST);
    }
    const url = await this.getRecordingMediaUrlUsecase.execute(id, email);
    return { url };
  }

  /**
   * US-3 — Merge several unlisted segments into a new merged recording.
   * Organizer-only.
   */
  @Post('track/:trackId/merge')
  @UsePipes(new ValidationPipe())
  async mergeRecordings(
    @Param('trackId') trackId: string,
    @Body() dto: MergeRecordingsDto,
    @CurrentUserEmail() email: string,
  ): Promise<RecordingObject> {
    if (!isUUID(trackId)) {
      throw new HttpException('trackId must be a UUID', HttpStatus.BAD_REQUEST);
    }
    return this.mergeRecordingsUsecase.execute(trackId, dto.segmentIds, email);
  }

  /**
   * US-4 — Mark a recording as published (after the organizer created a video
   * from it via the editor). Organizer-only.
   */
  @Post(':id/mark-published')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markPublished(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<void> {
    if (!isUUID(id)) {
      throw new HttpException('id must be a UUID', HttpStatus.BAD_REQUEST);
    }
    await this.markRecordingPublishedUsecase.execute(id, email);
  }

  /**
   * US-3 "Go back" — Delete a merged recording. Organizer-only.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecording(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<void> {
    if (!isUUID(id)) {
      throw new HttpException('id must be a UUID', HttpStatus.BAD_REQUEST);
    }
    await this.deleteRecordingUsecase.execute(id, email);
  }
}
