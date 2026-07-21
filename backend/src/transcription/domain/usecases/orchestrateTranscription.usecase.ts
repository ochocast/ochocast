import { Inject, Injectable, Logger } from '@nestjs/common';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class OrchestrateTranscriptionUsecase {
  private readonly logger = new Logger(OrchestrateTranscriptionUsecase.name);

  private readonly transcriptionApiUrl: string;
  private readonly workerStartUrl: string | null;
  private readonly workerStopUrl: string | null;
  private readonly workerControlToken: string | null;
  private readonly workerHealthRetries: number;
  private readonly workerHealthDelayMs: number;

  constructor(
    @Inject('VideoGateway')
    private readonly videoGateway: IVideoGateway,
    @Inject('s3Client')
    private readonly s3Client: S3Client,
  ) {
    this.transcriptionApiUrl = process.env.TRANSCRIPTION_API_URL || '';
    this.workerStartUrl = process.env.WORKER_START_URL || null;
    this.workerStopUrl = process.env.WORKER_STOP_URL || null;
    this.workerControlToken = process.env.WORKER_CONTROL_TOKEN || null;
    this.workerHealthRetries = Number.parseInt(
      process.env.WORKER_HEALTH_RETRIES || '60',
      10,
    );
    this.workerHealthDelayMs = Number.parseInt(
      process.env.WORKER_HEALTH_DELAY_MS || '5000',
      10,
    );
  }

  async execute(): Promise<void> {
    const videos = await this.videoGateway.getVideosWithoutSubtitle();

    if (videos.length === 0) {
      this.logger.log('No videos to transcribe');
      return;
    }

    this.logger.log(`Found ${videos.length} videos to transcribe`);

    const hasWorkerLifecycle = this.hasWorkerLifecycle();

    try {
      if (hasWorkerLifecycle) {
        this.logger.log('Starting worker VM...');
        await this.startWorker();
        await this.waitForWorker();
        this.logger.log('Worker VM started');
      }

      for (const video of videos) {
        try {
          this.logger.log(`Transcribing video: ${video.id}`);

          const audioKey = `${video.id}/audio.wav`;
          const audioBuffer = await this.downloadFromS3(audioKey);

          const formData = new FormData();
          formData.append(
            'file',
            new Blob([new Uint8Array(audioBuffer)]),
            `${video.id}.wav`,
          );
          formData.append('model', 'whisper-1');
          formData.append('language', 'fr');
          formData.append('response_format', 'verbose_json');

          const response = await fetch(
            `${this.transcriptionApiUrl}/v1/audio/transcriptions`,
            { method: 'POST', body: formData },
          );

          if (!response.ok) {
            throw new Error(`Transcription failed: ${await response.text()}`);
          }

          const data = await response.json();

          const vttContent = this.toVTT(data.segments || []);
          const subtitleKey = `subtitle-${video.id}.vtt`;

          await this.uploadToS3(subtitleKey, vttContent);

          await this.videoGateway.updateSubtitleId(video.id, subtitleKey);

          this.logger.log(`Done: ${video.id}`);
        } catch (err) {
          this.logger.error(`Failed for video ${video.id}:`, err);
        }
      }
    } finally {
      if (hasWorkerLifecycle) {
        this.logger.log('Stopping worker VM...');
        await this.stopWorker();
        this.logger.log('Worker VM stopped');
      }
    }
  }

  private hasWorkerLifecycle(): boolean {
    return Boolean(this.workerStartUrl && this.workerStopUrl);
  }

  private async startWorker(): Promise<void> {
    await this.callWorkerLifecycleUrl(this.workerStartUrl!, 'start');
  }

  private async stopWorker(): Promise<void> {
    await this.callWorkerLifecycleUrl(this.workerStopUrl!, 'stop');
  }

  private async callWorkerLifecycleUrl(
    url: string,
    action: 'start' | 'stop',
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.workerControlToken) {
      headers.Authorization = `Bearer ${this.workerControlToken}`;
    }

    const response = await fetch(url, { method: 'POST', headers });
    if (!response.ok) {
      throw new Error(
        `Worker ${action} failed with HTTP ${response.status}: ${await response.text()}`,
      );
    }
  }

  private async waitForWorker(
    retries = this.workerHealthRetries,
    delayMs = this.workerHealthDelayMs,
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${this.transcriptionApiUrl}/health`);
        if (res.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error('Worker did not start in time');
  }

  private async downloadFromS3(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: key,
    });
    const response = await this.s3Client.send(command);
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  private async uploadToS3(key: string, content: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: key,
      Body: content,
      ContentType: 'text/vtt',
    });
    await this.s3Client.send(command);
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
