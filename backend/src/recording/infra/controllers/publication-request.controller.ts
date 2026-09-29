import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { PublicationRequestObject } from '../../domain/publicationRequest';
import { CreatePublicationRequestUsecase } from '../../domain/usecases/createPublicationRequest.usecase';
import { GetMyPublicationRequestsUsecase } from '../../domain/usecases/getMyPublicationRequests.usecase';
import { GetTrackPublicationRequestsUsecase } from '../../domain/usecases/getTrackPublicationRequests.usecase';
import { GetPublicationRequestUsecase } from '../../domain/usecases/getPublicationRequest.usecase';
import { GetPublicationRequestMediaUrlUsecase } from '../../domain/usecases/getPublicationRequestMediaUrl.usecase';
import { AcceptPublicationRequestUsecase } from '../../domain/usecases/acceptPublicationRequest.usecase';
import { RefusePublicationRequestUsecase } from '../../domain/usecases/refusePublicationRequest.usecase';
import { CancelPublicationRequestUsecase } from '../../domain/usecases/cancelPublicationRequest.usecase';
import {
  AcceptPublicationRequestDto,
  CreatePublicationRequestDto,
  RefusePublicationRequestDto,
} from './dto/publication-request.dto';

const assertUUID = (value: string, name: string) => {
  if (!isUUID(value)) {
    throw new HttpException(`${name} must be a UUID`, HttpStatus.BAD_REQUEST);
  }
};

/** US-6 — Publishing a recording on a track speaker's channel, with approval. */
@ApiTags('Publication requests')
@Controller('publication-requests')
export class PublicationRequestController {
  constructor(
    private createUsecase: CreatePublicationRequestUsecase,
    private getMineUsecase: GetMyPublicationRequestsUsecase,
    private getByTrackUsecase: GetTrackPublicationRequestsUsecase,
    private getOneUsecase: GetPublicationRequestUsecase,
    private getMediaUrlUsecase: GetPublicationRequestMediaUrlUsecase,
    private acceptUsecase: AcceptPublicationRequestUsecase,
    private refuseUsecase: RefusePublicationRequestUsecase,
    private cancelUsecase: CancelPublicationRequestUsecase,
  ) {}

  /** Organizer-only: ask a track speaker to publish a recording. */
  @Post()
  @UsePipes(new ValidationPipe())
  create(
    @Body() dto: CreatePublicationRequestDto,
    @CurrentUserEmail() email: string,
  ): Promise<PublicationRequestObject> {
    return this.createUsecase.execute(
      {
        recordingId: dto.recordingId,
        targetUserId: dto.targetUserId,
        title: dto.title,
        metadata: {
          description: dto.description ?? '',
          tags: dto.tags ?? [],
          internalSpeakers: dto.internalSpeakers ?? [],
          externalSpeakers: dto.externalSpeakers ?? '',
        },
      },
      email,
    );
  }

  /** Pending requests addressed to the current user (upload panel). */
  @Get('mine')
  getMine(
    @CurrentUserEmail() email: string,
  ): Promise<PublicationRequestObject[]> {
    return this.getMineUsecase.execute(email);
  }

  /** Organizer-only: requests of a track, newest first. */
  @Get('track/:trackId')
  getByTrack(
    @Param('trackId') trackId: string,
    @CurrentUserEmail() email: string,
  ): Promise<PublicationRequestObject[]> {
    assertUUID(trackId, 'trackId');
    return this.getByTrackUsecase.execute(trackId, email);
  }

  /** Targeted speaker or requester. */
  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<PublicationRequestObject> {
    assertUUID(id, 'id');
    return this.getOneUsecase.execute(id, email);
  }

  /** Temporary (5 min) read access to the proposed video. */
  @Get(':id/media')
  async getMedia(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<{ url: string }> {
    assertUUID(id, 'id');
    return { url: await this.getMediaUrlUsecase.execute(id, email) };
  }

  /** Targeted speaker: the video was published on their channel. */
  @Post(':id/accept')
  @UsePipes(new ValidationPipe())
  accept(
    @Param('id') id: string,
    @Body() dto: AcceptPublicationRequestDto,
    @CurrentUserEmail() email: string,
  ): Promise<PublicationRequestObject> {
    assertUUID(id, 'id');
    return this.acceptUsecase.execute(id, dto.videoId, email);
  }

  /** Targeted speaker: refuse, with an optional reason. */
  @Post(':id/refuse')
  @UsePipes(new ValidationPipe())
  refuse(
    @Param('id') id: string,
    @Body() dto: RefusePublicationRequestDto,
    @CurrentUserEmail() email: string,
  ): Promise<PublicationRequestObject> {
    assertUUID(id, 'id');
    return this.refuseUsecase.execute(id, dto.reason, email);
  }

  /** Organizer: withdraw a pending request. */
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<PublicationRequestObject> {
    assertUUID(id, 'id');
    return this.cancelUsecase.execute(id, email);
  }
}
