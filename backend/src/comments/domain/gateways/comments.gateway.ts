import { CommentObject } from '../comment';

export interface ICommentGateway {
  createNewComment: (comment: CommentObject) => Promise<CommentObject>;
  getComments: (filter: any) => Promise<CommentObject[]>;
  deleteComment: (id: string) => Promise<CommentObject>;
  likeComment: (id: string) => Promise<CommentObject>;
  deletelikeComment: (id: string) => Promise<CommentObject>;
}
