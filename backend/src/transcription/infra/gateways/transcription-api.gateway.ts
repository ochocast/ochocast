import { Injectable, Logger } from '@nestjs/common';
import {
  ITranscriptionGateway,
  TranscriptionJob,
  TranscriptionResult,
} from '../../domain/gateways/transcription.gateway';

@Injectable()
export class TranscriptionApiGateway implements ITranscriptionGateway {
  private readonly logger = new Logger(TranscriptionApiGateway.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.apiUrl = process.env.TRANSCRIPTION_API_URL || 'https://api.openai.com';
    this.apiKey = process.env.TRANSCRIPTION_API_KEY || '';
    this.logger.log(`Transcription API URL: ${this.apiUrl}`);
  }

  async transcribe(job: TranscriptionJob): Promise<TranscriptionResult> {
    this.logger.log(`Transcribing video: ${job.videoId}`);

    const audioResponse = await fetch(job.audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio for video ${job.videoId}`);
    }
    const audioBlob = await audioResponse.blob();

    const formData = new FormData();
    formData.append('file', audioBlob, `${job.videoId}.mp3`);
    formData.append('model', 'whisper-1');
    formData.append('language', job.language);
    formData.append('response_format', 'verbose_json');

    const response = await fetch(`${this.apiUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Transcription API error: ${error}`);
    }

    const data = await response.json();
    return this.normalize(data);
  }

  private normalize(raw: any): TranscriptionResult {
    return {
      text: raw.text || '',
      vttContent: this.toVTT(raw.segments || []),
      words: (raw.words || []).map((w: any) => ({
        start: w.start,
        end: w.end,
        word: w.word,
      })),
    };
  }

  private toVTT(segments: any[]): string {
    const lines = ['WEBVTT', ''];
    segments.forEach((seg) => {
      lines.push(
        `${this.formatTime(seg.start)} --> ${this.formatTime(seg.end)}`,
      );
      lines.push(seg.text.trim());
      lines.push('');
    });
    return lines.join('\n');
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(parseFloat(s).toFixed(3)).padStart(6, '0')}`;
  }
}
