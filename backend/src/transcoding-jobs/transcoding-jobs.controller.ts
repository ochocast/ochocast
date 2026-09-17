import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Public } from 'nest-keycloak-connect';
import { timingSafeEqual } from 'node:crypto';
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
import { TranscodingJobsService } from './transcoding-jobs.service';

@Injectable()
export class TranscodingCallbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.TRANSCODING_CALLBACK_SECRET;
    // Avoid Authorization: the global Keycloak guard logs invalid bearer tokens.
    const header = context.switchToHttp().getRequest().headers[
      'x-transcoding-token'
    ];
    if (!secret || secret.length < 32 || typeof header !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from(secret);
    const actual = Buffer.from(header);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    return true;
  }
}

export class ClaimTranscodingDto {
  @IsUUID()
  videoId: string;
}

export class TranscodingResultDto {
  @IsUUID()
  jobId: string;
  @IsUUID()
  videoId: string;
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
  @MaxLength(1024)
  subtitle_id?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}

export class CompleteTranscodingDto {
  @IsUUID()
  leaseToken: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => TranscodingResultDto)
  result: TranscodingResultDto;
}

// These routes bypass Keycloak only; the dedicated shared-secret guard is mandatory.
@Public()
@UseGuards(TranscodingCallbackGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@Controller('internal/transcoding/jobs')
export class TranscodingJobsController {
  constructor(private readonly jobs: TranscodingJobsService) {}

  @Post(':jobId/claim')
  @HttpCode(200)
  claim(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: ClaimTranscodingDto,
  ) {
    return this.jobs.claim(jobId, body.videoId);
  }

  @Post(':jobId/result')
  @HttpCode(200)
  async result(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() body: CompleteTranscodingDto,
  ) {
    await this.jobs.complete(jobId, body.leaseToken, body.result);
    return { accepted: true };
  }
}
