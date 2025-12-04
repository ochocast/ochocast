import { VideoObject } from '../video';

export interface IVideoGateway {
  getSuggestions(id: string): Promise<VideoObject[]>;
  searchVideo(data: string): Promise<VideoObject[]>;
  createNewVideo: (video: VideoObject) => Promise<VideoObject>;
  getVideos: (filter: any) => Promise<VideoObject[]>;
  getVideosAdmin: (filter: any) => Promise<VideoObject[]>;
  modifyVideo(video: VideoObject): Promise<VideoObject>;
  deleteVideo: (id: string) => Promise<VideoObject>;
  deleteVideoAdmin: (id: string) => Promise<VideoObject>;
  searchVideoAdmin(data: string): Promise<VideoObject[]>;
  restoreVideo: (id: string) => Promise<VideoObject>;
}
