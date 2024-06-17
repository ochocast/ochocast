import { CommentObject } from '../comment';

export interface ICommentGateway {
  createNewComment: (comment: CommentObject) => Promise<CommentObject>;
  getComments: (filter: any) => Promise<CommentObject[]>;
  deleteComment: (id: string) => Promise<CommentObject>;
}
