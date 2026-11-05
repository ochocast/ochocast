import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3_CONFIG } from '../config/s3.config';
import {
  PermanentJobError,
  RenderSegment,
  RenderTextLayer,
  TextColor,
  TextPosition,
  VideoEditRenderJob,
} from '../types/job.types';
import { wrapText } from './text-wrap';
import {
  ffmpegThreads,
  maxSourceBytes,
  TranscodingService,
} from './transcoding.service';

// Canonical format of the cut segments, as the merge service: they are then
// concatenated as is, and the HLS ladder tops out at 720p anyway.
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

// Fixed text style, sized for the 720p canvas (the ladder scales it down).
const FONT_SIZE = 40;
const LINE_SPACING = 10;
const BORDER_WIDTH = 3;
const COLORS: Record<TextColor, { font: string; border: string }> = {
  white: { font: 'white', border: 'black' },
  black: { font: 'black', border: 'white' },
  green: { font: '0x1DAC78', border: 'black' },
};
const POSITION_Y: Record<TextPosition, string> = {
  top: 'h*0.06',
  center: '(h-text_h)/2',
  bottom: 'h*0.88-text_h',
};

const FONT_CANDIDATES = [
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', // Alpine font-dejavu
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', // Debian, Ubuntu
];

/** Font file of the texts: FFMPEG_FONT_FILE, else DejaVu Sans Bold. */
export function renderFontFile(): string {
  const configured = process.env.FFMPEG_FONT_FILE;
  if (configured) {
    if (!existsSync(configured))
      throw new Error(`FFMPEG_FONT_FILE not found: ${configured}`);
    return configured;
  }
  const found = FONT_CANDIDATES.find((file) => existsSync(file));
  if (!found)
    throw new Error(
      'No font for the render texts: install DejaVu (font-dejavu) or set FFMPEG_FONT_FILE',
    );
  return found;
}

// Filter arguments are quoted, never escaped: refuse what quoting cannot
// carry rather than build a filter graph from it. Text itself goes through
// a file, so user content never reaches the graph.
const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;
const quotedPath = (file: string) => {
  if (!SAFE_PATH.test(file)) throw new Error(`Unsupported path: ${file}`);
  return `'${file}'`;
};
const seconds = (value: number) => value.toFixed(3);

/** One drawtext per layer, its text read from `textFile`. */
export function drawTextFilter(
  layer: RenderTextLayer,
  textFile: string,
  fontFile: string,
): string {
  const color = COLORS[layer.color];
  const start = layer.startOffset;
  const end = layer.startOffset + layer.duration;
  return [
    `drawtext=fontfile=${quotedPath(fontFile)}`,
    `textfile=${quotedPath(textFile)}`,
    // Never interpret %{...} sequences of the user's text.
    'expansion=none',
    `fontsize=${FONT_SIZE}`,
    `line_spacing=${LINE_SPACING}`,
    `fontcolor=${color.font}`,
    `borderw=${BORDER_WIDTH}`,
    `bordercolor=${color.border}`,
    'x=(w-text_w)/2',
    `y=${POSITION_Y[layer.position]}`,
    `enable='between(t,${seconds(start)},${seconds(end)})'`,
  ].join(':');
}

/** Video filter of a segment: canonical canvas, then its texts. */
export function segmentFilter(
  textFiles: { layer: RenderTextLayer; file: string }[],
  fontFile: string,
): string {
  return [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1',
    `fps=${FPS}`,
    ...textFiles.map(({ layer, file }) =>
      drawTextFilter(layer, file, fontFile),
    ),
  ].join(',');
}

/**
 * Renders a montage without touching its source: each segment is cut in
 * playback order with its texts drawn, the segments are concatenated, then
 * encoded to the same HLS ladder as transcoding, under the job's own folder.
 *
 * Runs in the render worker: files live under TRANSCODING_WORK_DIR, and
 * `signal` stops every download, FFmpeg process and upload on timeout or
 * shutdown. What another attempt would hit again on the same bytes (missing
 * or unreadable source, over the size budget) throws a PermanentJobError.
 */
export class RenderService {
  constructor(private readonly s3Client: S3Client) {}

  async render(
    job: VideoEditRenderJob,
    signal: AbortSignal,
    onEncodingStarted?: () => void,
  ): Promise<{ duration: number; mediaId: string }> {
    const mediaId = `${job.outputPrefix}/master.m3u8`;
    const checkpointKey = `${job.outputPrefix}/_result.json`;
    // A lost callback is retried without rendering again.
    const cached = await this.readCheckpoint(checkpointKey, job, signal);
    if (cached !== undefined) return { duration: cached, mediaId };

    const fontFile = renderFontFile();
    const root = process.env.TRANSCODING_WORK_DIR || tmpdir();
    await mkdir(root, { recursive: true });
    const workDir = await mkdtemp(path.join(root, 'render-'));
    try {
      const input = path.join(workDir, 'source');
      await this.download(job.sourceKey, input, signal);
      const { hasAudio } = await this.probe(input, signal);

      onEncodingStarted?.();
      const cuts: string[] = [];
      for (let i = 0; i < job.segments.length; i++) {
        const out = path.join(workDir, `segment-${i}.mp4`);
        await this.cutSegment(
          input,
          job.segments[i],
          i,
          out,
          hasAudio,
          workDir,
          fontFile,
          signal,
        );
        cuts.push(out);
      }
      await rm(input, { force: true });

      const assembled = path.join(workDir, 'assembled.mp4');
      const list = path.join(workDir, 'list.txt');
      await writeFile(
        list,
        cuts.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'),
      );
      await this.runProcess(
        [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          list,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          assembled,
        ],
        signal,
      );
      for (const cut of cuts) await rm(cut, { force: true });

      const hlsDir = path.join(workDir, 'hls');
      await mkdir(hlsDir, { recursive: true });
      const transcoder = new TranscodingService(this.s3Client, signal);
      await transcoder.transcodeVideoHLS(assembled, hlsDir, hasAudio);
      const duration = await this.duration(assembled, signal);
      await this.uploadRendition(transcoder, hlsDir, job.outputPrefix);
      await this.writeCheckpoint(checkpointKey, job, duration);
      return { duration, mediaId };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  /** Cuts one segment of the source to the canonical format, with texts. */
  async cutSegment(
    input: string,
    segment: RenderSegment,
    index: number,
    output: string,
    hasAudio: boolean,
    workDir: string,
    fontFile: string,
    signal: AbortSignal,
  ): Promise<void> {
    const textFiles: { layer: RenderTextLayer; file: string }[] = [];
    for (let j = 0; j < segment.textLayers.length; j++) {
      const layer = segment.textLayers[j];
      const file = path.join(workDir, `text-${index}-${j}.txt`);
      await writeFile(file, wrapText(layer.content).join('\n'));
      textFiles.push({ layer, file });
    }
    // Seeking the input resets timestamps to 0: the texts' times are
    // relative to the segment, as stored.
    await this.runProcess(
      [
        '-y',
        '-ss',
        seconds(segment.sourceStart),
        '-i',
        input,
        '-t',
        seconds(segment.sourceEnd - segment.sourceStart),
        '-map',
        '0:v:0',
        ...(hasAudio ? ['-map', '0:a:0'] : []),
        '-vf',
        segmentFilter(textFiles, fontFile),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        ffmpegThreads(),
        ...(hasAudio
          ? ['-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k']
          : ['-an']),
        '-sn',
        '-dn',
        output,
      ],
      signal,
    );
  }

  /** Uploads the HLS files, master playlist last (see uploadHLSFiles). */
  async uploadRendition(
    transcoder: TranscodingService,
    hlsDir: string,
    outputPrefix: string,
  ): Promise<void> {
    await transcoder.uploadHLSFiles(hlsDir, outputPrefix);
  }

  /** Deletes a render nobody references any more (video deleted). */
  async remove(outputPrefix: string): Promise<void> {
    const signal = AbortSignal.timeout(10000);
    let token: string | undefined;
    do {
      const listed = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: S3_CONFIG.mediaBucket,
          Prefix: `${outputPrefix}/`,
          ContinuationToken: token,
        }),
        { abortSignal: signal },
      );
      const objects = (listed.Contents || [])
        .filter((object) => object.Key)
        .map((object) => ({ Key: object.Key }));
      if (objects.length)
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: S3_CONFIG.mediaBucket,
            Delete: { Objects: objects, Quiet: true },
          }),
          { abortSignal: signal },
        );
      token = listed.NextContinuationToken;
    } while (token);
  }

  private async download(
    key: string,
    destination: string,
    signal: AbortSignal,
  ): Promise<void> {
    const maxBytes = maxSourceBytes();
    let head;
    try {
      head = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
        { abortSignal: signal },
      );
    } catch (error) {
      if (isNotFound(error))
        throw new PermanentJobError(
          'invalid_source',
          `Original file not found: ${key}`,
        );
      throw error;
    }
    const tooLarge = () =>
      new PermanentJobError(
        'source_too_large',
        'Source exceeds configured size limit',
      );
    if ((head.ContentLength || 0) > maxBytes) throw tooLarge();
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
      { abortSignal: signal },
    );
    const body = response.Body as Readable;
    if (!body) throw new Error('Missing S3 object body');
    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        callback(received > maxBytes ? tooLarge() : null, chunk);
      },
    });
    await pipeline(body, limiter, createWriteStream(destination), { signal });
  }

  async probe(
    input: string,
    signal: AbortSignal,
  ): Promise<{ hasAudio: boolean }> {
    let streams: { codec_type?: string }[];
    try {
      const { stdout } = await this.runProcess(
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type',
          '-of',
          'json',
          input,
        ],
        signal,
        process.env.FFPROBE_PATH || 'ffprobe',
        1024 * 1024,
      );
      streams = JSON.parse(stdout).streams ?? [];
    } catch (error) {
      signal.throwIfAborted();
      throw new PermanentJobError(
        'invalid_source',
        `Unreadable source: ${error instanceof Error ? error.message : String(error)}`.slice(
          0,
          1000,
        ),
      );
    }
    if (!streams.some((s) => s.codec_type === 'video'))
      throw new PermanentJobError('invalid_source', 'Source has no video');
    return { hasAudio: streams.some((s) => s.codec_type === 'audio') };
  }

  async duration(file: string, signal: AbortSignal): Promise<number> {
    const { stdout } = await this.runProcess(
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        file,
      ],
      signal,
      process.env.FFPROBE_PATH || 'ffprobe',
    );
    const value = Number.parseFloat(stdout);
    return Number.isFinite(value) && value > 0
      ? Math.round(value * 1000) / 1000
      : 0;
  }

  private async readCheckpoint(
    key: string,
    job: VideoEditRenderJob,
    signal: AbortSignal,
  ): Promise<number | undefined> {
    try {
      const object = await this.s3Client.send(
        new GetObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
        { abortSignal: signal },
      );
      const saved = JSON.parse(await object.Body!.transformToString());
      if (
        saved.jobId !== job.jobId ||
        !Number.isFinite(saved.duration) ||
        saved.duration < 0
      )
        throw new Error('Invalid render checkpoint');
      return saved.duration;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      signal.throwIfAborted();
      // An unreadable checkpoint only costs a render; it must not fail the job.
      console.warn(
        `Render checkpoint unreadable for job ${job.jobId}:`,
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }

  private async writeCheckpoint(
    key: string,
    job: VideoEditRenderJob,
    duration: number,
  ): Promise<void> {
    // Best effort, with its own timeout: every output is already uploaded.
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: S3_CONFIG.mediaBucket,
          Key: key,
          Body: JSON.stringify({ jobId: job.jobId, duration }),
          ContentType: 'application/json',
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    } catch (error) {
      console.warn(
        `Render checkpoint not saved for job ${job.jobId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  runProcess(
    args: string[],
    signal: AbortSignal,
    command = process.env.FFMPEG_PATH || 'ffmpeg',
    maxStdout = 8192,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const child = spawn(
        command,
        ['-protocol_whitelist', 'file,pipe', ...args],
        { stdio: ['ignore', 'pipe', 'pipe'], signal, killSignal: 'SIGKILL' },
      );
      let stdout = '';
      let stderr = '';
      let processError: Error | undefined;
      child.stdout.on(
        'data',
        (chunk) => (stdout = (stdout + chunk.toString()).slice(-maxStdout)),
      );
      child.stderr.on(
        'data',
        (chunk) => (stderr = (stderr + chunk.toString()).slice(-16384)),
      );
      child.on('error', (error) => {
        processError = error;
      });
      child.on('close', (code) => {
        if (processError) reject(processError);
        else if (code === 0) resolve({ stdout, stderr });
        else
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      });
    });
  }
}

function isNotFound(error: unknown): boolean {
  return (
    ['NoSuchKey', 'NotFound'].includes(
      (error as { name?: string }).name ?? '',
    ) ||
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 404
  );
}
