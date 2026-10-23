import { VideoObject } from '../video';

export interface IVideoGateway {
  getSuggestions(id: string): Promise<VideoObject[]>;
  searchVideo(data: string): Promise<VideoObject[]>;
  createNewVideo: (video: VideoObject) => Promise<VideoObject>;
  getVideos: (filter: any) => Promise<VideoObject[]>;
  getVideosAdmin: (filter: any) => Promise<VideoObject[]>;
  /** Writes only the given fields; the others keep their stored value. */
  modifyVideo(
    video: Partial<VideoObject> & Pick<VideoObject, 'id'>,
  ): Promise<VideoObject>;
  deleteVideo: (id: string) => Promise<VideoObject>;
  deleteVideoAdmin: (id: string) => Promise<VideoObject>;
  searchVideoAdmin(data: string): Promise<VideoObject[]>;
  restoreVideo: (id: string) => Promise<VideoObject>;
  incrementVideoViews: (id: string) => Promise<VideoObject>;
}
