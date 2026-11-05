import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from 'nest-keycloak-connect';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TranscodingCallbackGuard } from 'src/transcoding-jobs/transcoding-jobs.controller';
import { RenderFailureReason } from '../../domain/videoEditRenderJob';
import { VideoEditRenderJobsService } from './video-edit-render-jobs.service';

export class ClaimRenderDto {
  @IsUUID()
  editId: string;
}

export class RenderResultDto {
  @IsUUID()
  jobId: string;
  @IsUUID()
  editId: string;
  @IsBoolean()
  success: boolean;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  duration: number;
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  mediaId?: string;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  processedAt: number;
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
  @IsOptional()
  @IsBoolean()
  permanent?: boolean;
  @IsOptional()
  @IsIn(['invalid_source', 'source_too_large', 'deadline_exceeded'])
  reason?: RenderFailureReason;
}

export class CompleteRenderDto {
  @IsUUID()
  leaseToken: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => RenderResultDto)
  result: RenderResultDto;
}

/**
 * Callbacks of the render worker. They bypass Keycloak only; the same
 * shared-secret guard as the transcoding callbacks is mandatory.
 */
@ApiExcludeController()
@Public()
@UseGuards(TranscodingCallbackGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@Controller('internal/video-edits/render-jobs')
export class VideoEditRenderJobsController {
  constructor(private readonly jobs: VideoEditRenderJobsService) {}

  @Post(':jobId/claim')
  @HttpCode(200)
  claim(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: ClaimRenderDto,
  ) {
    return this.jobs.claim(jobId, body.editId);
  }

  @Post(':jobId/result')
  @HttpCode(200)
  async result(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: CompleteRenderDto,
  ) {
    await this.jobs.complete(jobId, body.leaseToken, body.result);
    return { accepted: true };
  }
}
