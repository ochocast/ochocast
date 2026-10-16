import { VideoObject } from '../video';

export interface IVideoGateway {
  getSuggestions(id: string): Promise<VideoObject[]>;
  searchVideo(data: string): Promise<VideoObject[]>;
  createNewVideo: (video: VideoObject) => Promise<VideoObject>;
  getVideos: (filter: any) => Promise<VideoObject[]>;
  getVideosAdmin: (filter: any) => Promise<VideoObject[]>;
  /** Copies the given fields onto the stored video; others keep their value. */
  modifyVideo(
    video: Partial<VideoObject> & Pick<VideoObject, 'id'>,
  ): Promise<VideoObject>;
  deleteVideo: (id: string) => Promise<VideoObject>;
  deleteVideoAdmin: (id: string) => Promise<VideoObject>;
  searchVideoAdmin(data: string): Promise<VideoObject[]>;
  restoreVideo: (id: string) => Promise<VideoObject>;
  incrementVideoViews: (id: string) => Promise<VideoObject>;
}
