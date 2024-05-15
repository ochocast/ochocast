import { ICommentGateway } from '../../domain/gateways/comments.gateway';
import { CommentObject } from '../../domain/comment';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentEntity } from './entities/comment.entity';

export class CommentGateway implements ICommentGateway {
  constructor(
    @InjectRepository(CommentEntity)
    private readonly commentsRepository: Repository<CommentEntity>,
  ) {}

  async createNewComment(commentDetails: CommentObject): Promise<CommentObject> {
    const comment: CommentEntity = new CommentEntity({
      ...commentDetails,
    });

    return await this.commentsRepository.save(comment);
  }

  getComments(filter: any): Promise<CommentObject[]> {
    return this.commentsRepository.find({
      where: {
        ...filter,
      },
      relations: ['creator'],
    });
  }

  /*async updateComment(commentDetails: CommentObject): Promise<CommentObject> {
    const comment = await this.commentsRepository.findOne({
      where: {
        id: commentDetails.id,
      },
    });

    return await this.commentsRepository.save({
      ...comment,
      ...commentDetails,
    });
  }*/

  async deleteComment(commentId: string): Promise<CommentObject> {
    const comment = await this.commentsRepository.findOneBy({ id: commentId });

    return await this.commentsRepository.remove(comment);
  }
}
