import { ProcessingJob, ProcessingVideo } from '../videoProcessing';

export interface IVideoProcessingGateway {
  /** A video that is not archived, without any relation. */
  findVideo(id: string): Promise<ProcessingVideo | null>;
  findJob(videoId: string): Promise<ProcessingJob | null>;
}
