import { Module } from '@nestjs/common';
import { CommentsController } from './infra/controllers/comments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentEntity } from './infra/gateways/entities/comment.entity';
import { CommentGateway } from './infra/gateways/comment.gateway';
//import { CreateNewcommentUsecase } from './domain/usecases/createNewcomment.usecase';
//import { GetcommentsUsecase } from './domain/usecases/getcomments.usecase';
//import { LoginCommentUseCase } from './domain/usecases/loginComment.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([CommentEntity])],
  controllers: [CommentsController],
  providers: [
    {
      provide: 'CommentGateway',
      useClass: CommentGateway,
    },
    //CreateNewCommentUsecase,
    //GetCommentsUsecase,
    //LoginCommentUseCase,
  ],
})
export class CommentsModule {}