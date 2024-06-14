import { Module } from '@nestjs/common';
import { CommentsController } from './infra/controllers/comments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentEntity } from './infra/gateways/entities/comment.entity';
import { CommentGateway } from './infra/gateways/comment.gateway';
import { CreateNewCommentUsecase } from './domain/usecases/createNewcomment.usecase';
import { GetCommentsUsecase } from './domain/usecases/getComments.usecase';
import { DeleteCommentsUsecase } from './domain/usecases/deleteComment.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([CommentEntity])],
  controllers: [CommentsController],
  providers: [
    {
      provide: 'CommentGateway',
      useClass: CommentGateway,
    },
    CreateNewCommentUsecase,
    GetCommentsUsecase,
    DeleteCommentsUsecase,
  ],
})
export class CommentsModule {}