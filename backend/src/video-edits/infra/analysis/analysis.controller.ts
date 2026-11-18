import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiExcludeController,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from 'nest-keycloak-connect';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { TranscodingCallbackGuard } from 'src/transcoding-jobs/transcoding-jobs.controller';
import { AnalysisResult } from '../../domain/videoEditAnalysis';
import { AnalysisService } from './analysis.service';

@ApiTags('Video edits')
@ApiForbiddenResponse({ description: 'videonotallowedit: creator/admin only.' })
@ApiNotFoundResponse({ description: 'Unknown user, video or analysis.' })
@Controller('videos/:videoId/edit/silence-analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}
  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Request silence cut suggestions',
    description:
      'Asynchronous, deduplicated per video. Reuses a 24h cache for identical source and settings. Does not modify a montage. Shared render queue; processing timeout 5 min by default, queue waiting is separate.',
  })
  @ApiAcceptedResponse({
    description: 'Job id, status, phase, settings and optional cached result.',
  })
  @ApiConflictResponse({ description: 'Video not ready or original missing.' })
  @ApiServiceUnavailableResponse({
    description:
      'Analysis publication disabled until backend and workers are upgraded.',
  })
  request(
    @Param('videoId', new ParseUUIDPipe()) videoId: string,
    @CurrentUserEmail() email: string,
  ) {
    return this.analysis.request(videoId, email);
  }
  @Get()
  @ApiOperation({
    summary: 'Latest silence analysis, for resuming after leaving the editor',
  })
  @ApiOkResponse({
    description:
      'Status, queue/processing phase, progress and suggestions (or no_audio/no_silence).',
  })
  latest(
    @Param('videoId', new ParseUUIDPipe()) videoId: string,
    @CurrentUserEmail() email: string,
  ) {
    return this.analysis.get(videoId, email);
  }
  @Get(':jobId')
  @ApiOperation({ summary: 'Read silence analysis status and suggestions' })
  get(
    @Param('videoId', new ParseUUIDPipe()) videoId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @CurrentUserEmail() email: string,
  ) {
    return this.analysis.get(videoId, email, jobId);
  }
}
class ClaimDto {
  @IsUUID() videoId: string;
}
class LeaseDto {
  @IsUUID() leaseToken: string;
}
class ProgressDto extends LeaseDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  processedSeconds: number;
}
class ResultDto implements AnalysisResult {
  @IsUUID() jobId: string;
  @IsBoolean() success: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(99)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  cuts?: number[];
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  duration?: number;
  @IsOptional() @IsIn(['cuts', 'no_audio', 'no_silence']) outcome?:
    | 'cuts'
    | 'no_audio'
    | 'no_silence';
  @IsOptional() @IsString() @MaxLength(2000) error?: string;
  @IsOptional() @IsBoolean() permanent?: boolean;
}
class CompleteDto extends LeaseDto {
  @IsDefined() @ValidateNested() @Type(() => ResultDto) result: ResultDto;
}
@ApiExcludeController()
@Public()
@UseGuards(TranscodingCallbackGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@Controller('internal/video-edits/analysis-jobs')
export class AnalysisCallbacksController {
  constructor(private readonly analysis: AnalysisService) {}
  @Post(':jobId/claim')
  @HttpCode(200)
  claim(
    @Param('jobId', new ParseUUIDPipe()) id: string,
    @Body() body: ClaimDto,
  ) {
    return this.analysis.claim(id, body.videoId);
  }
  @Post(':jobId/progress')
  @HttpCode(200)
  async progress(
    @Param('jobId', new ParseUUIDPipe()) id: string,
    @Body() body: ProgressDto,
  ) {
    await this.analysis.progress(id, body.leaseToken, body.processedSeconds);
    return { accepted: true };
  }
  @Post(':jobId/result')
  @HttpCode(200)
  async complete(
    @Param('jobId', new ParseUUIDPipe()) id: string,
    @Body() body: CompleteDto,
  ) {
    await this.analysis.complete(id, body.leaseToken, body.result);
    return { accepted: true };
  }
}
