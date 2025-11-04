import { Module } from '@nestjs/common';
import { CommentsController } from './infra/controllers/comments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentEntity } from './infra/gateways/entities/comment.entity';
import { CommentGateway } from './infra/gateways/comment.gateway';
import { CreateNewCommentUsecase } from './domain/usecases/createNewComment.usecase';
import { GetCommentsUsecase } from './domain/usecases/getComments.usecase';
import { DeleteCommentUsecase } from './domain/usecases/deleteComment.usecase';
import { LikeCommentsUsecase } from './domain/usecases/likeComment.usecase';
import { DeleteLikeCommentsUsecase } from './domain/usecases/deleteLikeComment.usecase';

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
    DeleteCommentUsecase,
    LikeCommentsUsecase,
    DeleteLikeCommentsUsecase,
  ],
})
export class CommentsModule {}
