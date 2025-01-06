import { VideoObject } from '../video';

export interface IVideoGateway {
  createNewVideo: (video: VideoObject) => Promise<VideoObject>;
  getVideos: (filter: any) => Promise<VideoObject[]>;
  getVideosAdmin: (filter: any) => Promise<VideoObject[]>;

  deleteVideo: (id: string) => Promise<VideoObject>;
  deleteVideoAdmin: (id: string) => Promise<VideoObject>;
}
