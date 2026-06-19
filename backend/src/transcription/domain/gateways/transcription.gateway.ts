export interface TranscriptionJob {
  videoId: string;
  audioUrl: string;
  language: string;
}

export interface TranscriptionResult {
  text: string;
  vttContent: string;
  words: { start: number; end: number; word: string }[];
}

export interface ITranscriptionGateway {
  transcribe: (job: TranscriptionJob) => Promise<TranscriptionResult>;
}
