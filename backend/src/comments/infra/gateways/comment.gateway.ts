import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ICommentGateway } from '../../domain/gateways/comments.gateway';
import { CommentObject } from '../../domain/comment';
import { CommentEntity } from './entities/comment.entity';

export class CommentGateway implements ICommentGateway {
  constructor(
    @InjectRepository(CommentEntity)
    private readonly commentsRepository: Repository<CommentEntity>,
  ) {}

  async createNewComment(
    commentDetails: CommentObject,
  ): Promise<CommentObject> {
    const comment: CommentEntity = new CommentEntity({
      ...commentDetails,
    });

    return await this.commentsRepository.save(comment);
  }

  getComments(filter: any): Promise<CommentObject[]> {
    return this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.creator', 'creator')
      .leftJoinAndSelect('comment.video', 'video')
      .where('comment.videoId = :videoId', { videoId: filter })
      .orderBy('comment.createdAt', 'DESC')
      .getMany();
  }

  async deleteComment(commentId: string): Promise<CommentObject> {
    const comment = await this.commentsRepository.findOneBy({ id: commentId });

    return await this.commentsRepository.remove(comment);
  }

  async likeComment(commentId: string): Promise<CommentObject> {
    const comment = await this.commentsRepository.findOneBy({ id: commentId });
    if (!comment) {
      throw new Error(`Comment with id ${commentId} not found`);
    }
    comment.likes += 1;
    await this.commentsRepository.save(comment);

    return comment;
  }

  async deletelikeComment(commentId: string): Promise<CommentObject> {
    const comment = await this.commentsRepository.findOneBy({ id: commentId });
    if (!comment) {
      throw new Error(`Comment with id ${commentId} not found`);
    }
    comment.likes -= 1;
    await this.commentsRepository.save(comment);

    return comment;
  }
}
