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
import { Public } from 'nest-keycloak-connect';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TranscodingCallbackGuard } from 'src/transcoding-jobs/transcoding-jobs.controller';
import { RecordingMergeJobsService } from './recording-merge-jobs.service';

export class ClaimMergeDto {
  @IsUUID()
  recordingId: string;
}

export class MergeResultDto {
  @IsUUID()
  jobId: string;
  @IsUUID()
  recordingId: string;
  @IsBoolean()
  success: boolean;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  duration: number;
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
}

export class CompleteMergeDto {
  @IsUUID()
  leaseToken: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => MergeResultDto)
  result: MergeResultDto;
}

/**
 * US-3 — Callbacks of the merge worker. They bypass Keycloak only; the same
 * shared-secret guard as the transcoding callbacks is mandatory.
 */
@Public()
@UseGuards(TranscodingCallbackGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@Controller('internal/recordings/merge-jobs')
export class RecordingMergeJobsController {
  constructor(private readonly jobs: RecordingMergeJobsService) {}

  @Post(':jobId/claim')
  @HttpCode(200)
  claim(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: ClaimMergeDto,
  ) {
    return this.jobs.claim(jobId, body.recordingId);
  }

  @Post(':jobId/result')
  @HttpCode(200)
  async result(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: CompleteMergeDto,
  ) {
    await this.jobs.complete(jobId, body.leaseToken, body.result);
    return { accepted: true };
  }
}
