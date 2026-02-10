import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PollEntity } from './infra/gateways/entities/poll.entity';
import { PollVoteEntity } from './infra/gateways/entities/poll-vote.entity';
import { PollsController } from './infra/controllers/polls.controller';
import { PollsRepository } from './infra/gateways/polls.repository';
import { PollsMapper } from './infra/gateways/polls.mapper';
import { CreatePollUsecase } from './domain/usecases/create-poll.usecase';
import { VotePollUsecase } from './domain/usecases/vote-poll.usecase';
import { GetPollsByTrackUsecase } from './domain/usecases/get-polls-by-track.usecase';
import { ClosePollUsecase } from './domain/usecases/close-poll.usecase';
import { PollsScheduler } from './polls.scheduler';
import { PollTimerService } from './infra/services/poll-timer.service';
import { UsersModule } from 'src/users/users.module';
import { ChatModule } from 'src/chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PollEntity, PollVoteEntity]),
    UsersModule,
    ChatModule,
  ],
  controllers: [PollsController],
  providers: [
    PollsRepository,
    PollsMapper,
    CreatePollUsecase,
    VotePollUsecase,
    GetPollsByTrackUsecase,
    ClosePollUsecase,
    PollTimerService,
    PollsScheduler,
    {
      provide: 'IPollsGateway',
      useClass: PollsRepository,
    },
  ],
  exports: [
    PollsRepository,
    CreatePollUsecase,
    VotePollUsecase,
    GetPollsByTrackUsecase,
    ClosePollUsecase,
    PollTimerService,
  ],
})
export class PollsModule {}
