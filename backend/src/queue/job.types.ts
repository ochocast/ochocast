export interface VideoTranscodingJob {
  jobId: string;
  videoId: string;
  originalFileName: string;
  media_id: string;
  miniature_id?: string;
  subtitle_id?: string;
  title: string;
  description: string;
  tags: string[];
  creator: string;
  internal_speakers?: string[];
  external_speakers?: string[];
  timestamp: number;
}
