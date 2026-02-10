export interface Video {
  id: string;
  media_id: string;
  miniature_id: string;
  subtitle_id?: string;
  title: string;
  description: string;
  creator: User;
  createdAt: Date;
  updatedAt: Date;
  internal_speakers: User[];
  external_speakers: string;
  views: number;
  tags: Tag_video[];
  archived?: boolean;
  duration?: number;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
  createdAt: Date;
  description: string;
  picture_id: string;
}

export interface Tag_video {
  id: string;
  name: string;
}

export interface CommentObject {
  id: string;
  parentid: string;
  creator: User;
  video: Video;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  likes?: number;
  isLiked?: boolean;
}
