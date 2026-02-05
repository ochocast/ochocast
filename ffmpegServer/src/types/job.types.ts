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

export interface VideoTranscodingResult {
  jobId: string;
  success: boolean;
  videoId: string;
  media_id: string;
  miniature_id?: string;
  subtitle_id?: string;
  duration: number;
  error?: string;
  processedAt: number;
}

export interface HLSVariant {
  resolution: string;
  scale: string;
  bitrate: string;
  name: string;
}

export const HLS_VARIANTS: HLSVariant[] = [
  { resolution: '640x360', scale: '640:360', bitrate: '800k', name: '360p' },
  { resolution: '854x480', scale: '854:480', bitrate: '1400k', name: '480p' },
  { resolution: '1280x720', scale: '1280:720', bitrate: '2800k', name: '720p' },
];
