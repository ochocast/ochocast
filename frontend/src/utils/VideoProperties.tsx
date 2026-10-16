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
  transcoding_status?: 'pending' | 'ready' | 'failed';
  transcoding_error?: string;
}

/** GET /videos/:id/processing — what a viewer can be told while a video is prepared. */
export type VideoProcessingState =
  | 'queued'
  | 'processing'
  | 'retrying'
  | 'ready'
  | 'failed';

export interface VideoProcessing {
  state: VideoProcessingState;
  /** ISO time the current state started, when known. */
  since: string | null;
  /** Final failure reason code, only when state is failed. */
  reason: string | null;
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
