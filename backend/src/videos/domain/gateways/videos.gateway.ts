import { VideoObject } from '../video';

export interface IVideoGateway {
  createNewVideo: (video: VideoObject) => Promise<VideoObject>;
  getVideos: (filter: any) => Promise<VideoObject[]>;
  //updateVideo: (video: VideoObject) => Promise<VideoObject>;
  deleteVideo: (id: string) => Promise<VideoObject>;
}
