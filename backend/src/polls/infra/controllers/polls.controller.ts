import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
  Inject,
} from '@nestjs/common';
import { Public } from 'nest-keycloak-connect';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { CreatePollUsecase } from '../../domain/usecases/create-poll.usecase';
import { VotePollUsecase } from '../../domain/usecases/vote-poll.usecase';
import { GetPollsByTrackUsecase } from '../../domain/usecases/get-polls-by-track.usecase';
import { ClosePollUsecase } from '../../domain/usecases/close-poll.usecase';
import { PollObject } from '../../domain/poll';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { isUUID } from 'class-validator';

@ApiTags('Polls')
@Controller('polls')
export class PollsController {
  constructor(
    private createPollUsecase: CreatePollUsecase,
    private votePollUsecase: VotePollUsecase,
    private getPollsByTrackUsecase: GetPollsByTrackUsecase,
    private closePollUsecase: ClosePollUsecase,
    @Inject('UserGateway')
    private usersGateway: any,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async createPoll(
    @Body() createPollDto: CreatePollDto,
    @CurrentUserEmail() email: string,
  ): Promise<PollObject> {
    const users = await this.usersGateway.getUsers({ email });
    const user = users[0];

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const creatorInfo = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      description: user.description || '',
      picture_id: user.picture_id || '',
    };

    return this.createPollUsecase.execute(
      createPollDto.question,
      createPollDto.responses,
      createPollDto.duration,
      createPollDto.trackId,
      creatorInfo,
    );
  }

  @Public()
  @Post(':pollId/vote')
  @UsePipes(new ValidationPipe())
  async votePoll(
    @Param('pollId') pollId: string,
    @Body() votePollDto: VotePollDto,
    @CurrentUserEmail() email?: string,
  ): Promise<PollObject> {
    if (!isUUID(pollId)) {
      throw new HttpException(
        'Poll ID must be a valid UUID',
        HttpStatus.BAD_REQUEST,
      );
    }

    let userId: string | undefined;

    // If email is provided, get userId from JWT
    if (email) {
      const users = await this.usersGateway.getUsers({ email });
      const user = users[0];

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      userId = user.id;
    }

    // Use provided userId/sessionId from body if available
    const finalUserId = votePollDto.userId || userId;
    const finalSessionId = votePollDto.sessionId;

    return this.votePollUsecase.execute(
      pollId,
      votePollDto.responseIndex,
      finalUserId,
      finalSessionId,
    );
  }

  @Public()
  @Get('track/:trackId')
  async getPollsByTrack(
    @Param('trackId') trackId: string,
  ): Promise<PollObject[]> {
    if (!isUUID(trackId)) {
      throw new HttpException(
        'Track ID must be a valid UUID',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.getPollsByTrackUsecase.execute(trackId);
  }

  @Post(':pollId/close')
  async closePoll(@Param('pollId') pollId: string): Promise<PollObject> {
    if (!isUUID(pollId)) {
      throw new HttpException(
        'Poll ID must be a valid UUID',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.closePollUsecase.execute(pollId);
  }

  @Delete(':pollId')
  async deletePoll(
    @Param('pollId') pollId: string,
  ): Promise<{ message: string }> {
    if (!isUUID(pollId)) {
      throw new HttpException(
        'Poll ID must be a valid UUID',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { message: 'Poll deleted' };
  }
}
