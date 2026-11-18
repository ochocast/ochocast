import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3_CONFIG } from '../config/s3.config';
import {
  AnalysisJob,
  AnalysisResult,
  AnalysisSettings,
} from '../types/analysis.types';
import { PermanentJobError } from '../types/job.types';
import { maxSourceBytes } from './transcoding.service';

type Detection = {
  duration: number;
  cuts: number[];
  outcome: 'cuts' | 'no_audio' | 'no_silence';
};
function processOutput(
  command: string,
  args: string[],
  signal: AbortSignal,
  output: (kind: 'stdout' | 'stderr', chunk: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errorTail = '';
    child.stdout.on('data', (chunk) => output('stdout', chunk.toString()));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      errorTail = (errorTail + text).slice(-2000);
      output('stderr', text);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            signal.aborted
              ? new Error('Analysis interrupted')
              : new PermanentJobError(
                  'invalid_source',
                  `Audio analysis failed (${code}): ${errorTail}`,
                ),
          ),
    );
  });
}
/** Pure file analysis for generated fixtures as well as the S3-backed worker. */
export async function analyzeFile(
  input: string,
  settings: AnalysisSettings,
  signal: AbortSignal,
  onProgress: (seconds: number) => void = () => {},
): Promise<Detection> {
  let probeText = '';
  await processOutput(
    process.env.FFPROBE_PATH || 'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type',
      '-of',
      'json',
      input,
    ],
    signal,
    (kind, text) => {
      if (kind === 'stdout') probeText = (probeText + text).slice(-1024 * 1024);
    },
  );
  let probe: {
    streams?: { codec_type: string }[];
    format?: { duration?: string };
  };
  try {
    probe = JSON.parse(probeText);
  } catch {
    throw new PermanentJobError('invalid_source', 'Unreadable source metadata');
  }
  const duration = Number(probe.format?.duration);
  if (
    !Number.isFinite(duration) ||
    duration < 1 ||
    !probe.streams?.some((s) => s.codec_type === 'video')
  )
    throw new PermanentJobError(
      'invalid_source',
      'Source duration or video stream missing',
    );
  if (!probe.streams.some((s) => s.codec_type === 'audio'))
    return { duration, cuts: [], outcome: 'no_audio' };
  const cuts: number[] = [];
  let silenceStart: number | undefined,
    stderr = '',
    stdout = '';
  const propose = (end: number) => {
    if (silenceStart === undefined) return;
    const cut =
      Math.round(((silenceStart + Math.min(end, duration)) / 2) * 1000) / 1000;
    if (
      cuts.length < 99 &&
      cut >= 5 &&
      cut <= duration - 5 &&
      (!cuts.length || cut - cuts[cuts.length - 1] >= 5)
    )
      cuts.push(cut);
    silenceStart = undefined;
  };
  onProgress(0);
  await processOutput(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-threads',
      '1',
      '-i',
      input,
      '-map',
      '0:a:0',
      '-vn',
      '-sn',
      '-dn',
      '-af',
      `silencedetect=noise=${settings.noiseDb}dB:d=${settings.minSilenceSeconds}`,
      '-progress',
      'pipe:1',
      '-stats_period',
      '1',
      '-f',
      'null',
      '-',
    ],
    signal,
    (kind, text) => {
      if (kind === 'stderr') {
        stderr += text;
        const lines = stderr.split(/[\r\n]/);
        stderr = (lines.pop() || '').slice(-8192);
        for (const line of lines) {
          const start = /silence_start:\s*([\d.]+)/.exec(line);
          if (start) silenceStart = Number(start[1]);
          const end = /silence_end:\s*([\d.]+)/.exec(line);
          if (end) propose(Number(end[1]));
        }
      } else {
        stdout += text;
        const lines = stdout.split('\n');
        stdout = (lines.pop() || '').slice(-8192);
        for (const line of lines) {
          const match = /^out_time_us=(\d+)/.exec(line);
          if (match) onProgress(Math.min(duration, Number(match[1]) / 1e6));
        }
      }
    },
  );
  if (silenceStart !== undefined) propose(duration);
  onProgress(duration);
  return { duration, cuts, outcome: cuts.length ? 'cuts' : 'no_silence' };
}
export class AnalysisService {
  constructor(private readonly s3: S3Client) {}
  async analyze(
    job: AnalysisJob,
    signal: AbortSignal,
    onProgress: (seconds: number) => void,
  ): Promise<AnalysisResult> {
    if (job.sourceBytes > maxSourceBytes())
      throw new PermanentJobError(
        'source_too_large',
        'Original exceeds worker size limit',
      );
    const root = process.env.TRANSCODING_WORK_DIR || tmpdir();
    await mkdir(root, { recursive: true });
    const work = await mkdtemp(path.join(root, 'silence-analysis-'));
    try {
      const object = { Bucket: S3_CONFIG.mediaBucket, Key: job.sourceKey };
      let head;
      try {
        head = await this.s3.send(new HeadObjectCommand(object), {
          abortSignal: signal,
        });
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        )
          throw new PermanentJobError(
            'invalid_source',
            'Original file not found',
          );
        throw error;
      }
      if (
        head.ETag !== job.sourceEtag ||
        head.ContentLength !== job.sourceBytes
      )
        throw new PermanentJobError(
          'invalid_source',
          'Original changed since analysis was requested',
        );
      let response;
      try {
        response = await this.s3.send(
          new GetObjectCommand({ ...object, IfMatch: job.sourceEtag }),
          { abortSignal: signal },
        );
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status === 404 || status === 412)
          throw new PermanentJobError(
            'invalid_source',
            'Original changed or disappeared',
          );
        throw error;
      }
      if (!response.Body)
        throw new PermanentJobError('invalid_source', 'Original is empty');
      let bytes = 0;
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(
            bytes > job.sourceBytes || bytes > maxSourceBytes()
              ? new PermanentJobError(
                  'source_too_large',
                  'Original exceeds size budget',
                )
              : null,
            chunk,
          );
        },
      });
      const input = path.join(work, 'original');
      await pipeline(
        response.Body as Readable,
        limit,
        createWriteStream(input),
        { signal },
      );
      if (bytes !== job.sourceBytes)
        throw new Error('Incomplete source download');
      const detection = await analyzeFile(
        input,
        job.settings,
        signal,
        onProgress,
      );
      // The editing API may round the source duration down. Suggestions must
      // leave five seconds inside that editable interval too.
      const cuts = detection.cuts.filter((cut) => cut <= job.duration - 5);
      return {
        jobId: job.jobId,
        success: true,
        ...detection,
        cuts,
        outcome:
          detection.outcome === 'no_audio'
            ? 'no_audio'
            : cuts.length
              ? 'cuts'
              : 'no_silence',
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
