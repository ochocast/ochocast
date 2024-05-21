import { CommentObject } from '../comment';

export interface ICommentGateway {
  createNewComment: (comment: CommentObject) => Promise<CommentObject>;
  getComments: (filter: any) => Promise<CommentObject[]>;
  //updateComment: (comment: CommentObject) => Promise<CommentObject>;
  deleteComment: (id: string) => Promise<CommentObject>;
}
