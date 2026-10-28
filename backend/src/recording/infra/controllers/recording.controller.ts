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
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'nest-keycloak-connect';
import { SetRecordingArmedDto } from './dto/set-recording-armed.dto';
import { LiveEventDto } from './dto/live-event.dto';
import { SetRecordingArmedUsecase } from '../../domain/usecases/setRecordingArmed.usecase';
import { HandleLiveEventUsecase } from '../../domain/usecases/handleLiveEvent.usecase';
import {
  GetRecordingStatusUsecase,
  RecordingStatus,
} from '../../domain/usecases/getRecordingStatus.usecase';
import { CreateRecordingSegmentFromFileUsecase } from '../../domain/usecases/createRecordingSegmentFromFile.usecase';
import { GetTrackRecordingsUsecase } from '../../domain/usecases/getTrackRecordings.usecase';
import { GetRecordingMediaUrlUsecase } from '../../domain/usecases/getRecordingMediaUrl.usecase';
import { MergeRecordingsUsecase } from '../../domain/usecases/mergeRecordings.usecase';
import { DeleteRecordingUsecase } from '../../domain/usecases/deleteRecording.usecase';
import { MarkRecordingPublishedUsecase } from '../../domain/usecases/markRecordingPublished.usecase';
import { MergeRecordingsDto } from './dto/merge-recordings.dto';
import { RecordingObject } from '../../domain/recording';
import { RecordingSecretGuard } from '../guards/recording-secret.guard';
import { SfuWebhookGuard } from '../guards/sfu-webhook.guard';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { isUUID } from 'class-validator';
import { diskStorage } from 'multer';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { SegmentUpload } from '../../domain/usecases/createRecordingSegmentFromFile.usecase';

// A segment covers a whole live (about 2 GB per hour at 4.5 Mbit/s): it is
// written to disk, never buffered in memory, then streamed to S3.
const SEGMENT_MAX_BYTES = 8 * 1024 ** 3;
const segmentUploadDir = () =>
  path.resolve(process.env.RECORDING_UPLOAD_DIR || tmpdir());
// multer's disk storage names files with 16 random bytes in hex.
const MULTER_FILENAME = /^[0-9a-f]{32}$/;

/**
 * Rebuilds the stored upload's path from the upload directory and multer's
 * generated name, instead of trusting `file.path`.
 */
function storedSegmentPath(file: Express.Multer.File): string {
  const dir = segmentUploadDir();
  const name = path.basename(file.filename ?? '');
  if (!MULTER_FILENAME.test(name)) {
    throw new HttpException('Invalid upload', HttpStatus.BAD_REQUEST);
  }
  const resolved = path.resolve(dir, name);
  if (!resolved.startsWith(dir + path.sep)) {
    throw new HttpException('Invalid upload', HttpStatus.BAD_REQUEST);
  }
  return resolved;
}

@ApiTags('Recording')
@Controller('recordings')
export class RecordingController {
  constructor(
    private setRecordingArmedUsecase: SetRecordingArmedUsecase,
    private handleLiveEventUsecase: HandleLiveEventUsecase,
    private getRecordingStatusUsecase: GetRecordingStatusUsecase,
    private createRecordingSegmentFromFileUsecase: CreateRecordingSegmentFromFileUsecase,
    private getTrackRecordingsUsecase: GetTrackRecordingsUsecase,
    private getRecordingMediaUrlUsecase: GetRecordingMediaUrlUsecase,
    private mergeRecordingsUsecase: MergeRecordingsUsecase,
    private deleteRecordingUsecase: DeleteRecordingUsecase,
    private markRecordingPublishedUsecase: MarkRecordingPublishedUsecase,
  ) {}

  /**
   * US-5a — Arm / disarm the automatic recording of a track's lives.
   * Organizer-only.
   */
  @Put('track/:trackId/armed')
  @UsePipes(new ValidationPipe())
  async setRecordingArmed(
    @Param('trackId') trackId: string,
    @Body() dto: SetRecordingArmedDto,
    @CurrentUserEmail() email: string,
  ): Promise<{ recordingArmed: boolean }> {
    if (!isUUID(trackId)) {
      throw new HttpException('trackId must be a UUID', HttpStatus.BAD_REQUEST);
    }
    return this.setRecordingArmedUsecase.execute(trackId, dto.armed, email);
  }

  /**
   * US-5c — Real-time recording status of a track (disabled / armed and
   * waiting / recording / error). Organizer-only.
   */
  @Get('track/:trackId/status')
  async getRecordingStatus(
    @Param('trackId') trackId: string,
    @CurrentUserEmail() email: string,
  ): Promise<RecordingStatus> {
    if (!isUUID(trackId)) {
      throw new HttpException('trackId must be a UUID', HttpStatus.BAD_REQUEST);
    }
    return this.getRecordingStatusUsecase.execute(trackId, email);
  }

  /**
   * US-5b — "Live started / stopped" notification from the SFU, which starts
   * or stops the recorder of armed tracks. SFU-only (secret-guarded).
   */
  @Public()
  @UseGuards(SfuWebhookGuard)
  @Post('live-events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ValidationPipe())
  async handleLiveEvent(@Body() dto: LiveEventDto): Promise<void> {
    await this.handleLiveEventUsecase.execute(dto.roomId, dto.event);
  }

  /**
   * US-1 / Raccordement — Register a captured recording segment (unlisted).
   * Called by the recorder (secret-guarded, multipart file), once per segment,
   * including additional segments produced by a live crash.
   */
  @Public()
  @UseGuards(RecordingSecretGuard)
  @Post('segments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, segmentUploadDir()),
      }),
      limits: { fileSize: SEGMENT_MAX_BYTES, files: 1 },
    }),
  )
  async createSegment(
    @UploadedFile() file: Express.Multer.File,
    @Body('trackId') trackId: string,
    @Body('problematic') problematic?: string,
    @Body('duration') duration?: string,
  ): Promise<RecordingObject> {
    if (!file) {
      throw new HttpException('File is required', HttpStatus.BAD_REQUEST);
    }
    const storedPath = storedSegmentPath(file);
    try {
      return await this.registerSegment(
        {
          path: storedPath,
          originalname: file.originalname,
          mimetype: file.mimetype,
        },
        trackId,
        problematic,
        duration,
      );
    } finally {
      // The temporary upload is removed whatever the outcome; the recorder
      // keeps its own copy until the backend accepts the segment.
      await unlink(storedPath).catch(() => undefined);
    }
  }

  private async registerSegment(
    upload: SegmentUpload,
    trackId: string,
    problematic?: string,
    duration?: string,
  ): Promise<RecordingObject> {
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
        upload,
        {
          problematic: problematic === 'true' || problematic === '1',
          duration:
            parsedDuration !== null && !Number.isNaN(parsedDuration)
              ? parsedDuration
              : null,
        },
      );
    } catch (error) {
      // Keep client errors (unknown track…) as-is: the recorder does not retry them.
      if (error instanceof HttpException) throw error;
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
    @Body('videoId') videoId: string | undefined,
    @CurrentUserEmail() email: string,
  ): Promise<void> {
    if (!isUUID(id)) {
      throw new HttpException('id must be a UUID', HttpStatus.BAD_REQUEST);
    }
    if (videoId !== undefined && !isUUID(videoId)) {
      throw new HttpException('videoId must be a UUID', HttpStatus.BAD_REQUEST);
    }
    await this.markRecordingPublishedUsecase.execute(id, email, videoId);
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
