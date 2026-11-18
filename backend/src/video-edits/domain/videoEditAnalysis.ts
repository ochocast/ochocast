/** Wire contract mirrored in ffmpegServer/src/types/analysis.types.ts. */
export interface AnalysisSettings {
  noiseDb: number;
  minSilenceSeconds: number;
  timeoutMs: number;
}
export interface AnalysisMessage {
  type: 'silence_analysis';
  jobId: string;
  videoId: string;
  timestamp: number;
}
export interface AnalysisJob extends AnalysisMessage {
  sourceKey: string;
  sourceEtag: string;
  sourceBytes: number;
  duration: number;
  settings: AnalysisSettings;
}
export interface AnalysisResult {
  jobId: string;
  success: boolean;
  cuts?: number[];
  duration?: number;
  outcome?: 'cuts' | 'no_silence' | 'no_audio';
  error?: string;
  permanent?: boolean;
}
export function analysisSettings(): AnalysisSettings {
  const noiseDb = Number(process.env.VIDEO_EDIT_SILENCE_NOISE_DB ?? -35);
  const minSilenceSeconds = Number(
    process.env.VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS ?? 0.8,
  );
  const timeoutMs = Number(
    process.env.VIDEO_EDIT_ANALYSIS_TIMEOUT_MS ?? 300000,
  );
  if (!Number.isFinite(noiseDb) || noiseDb < -90 || noiseDb > -5)
    throw new Error('Invalid VIDEO_EDIT_SILENCE_NOISE_DB (-90..-5)');
  if (
    !Number.isFinite(minSilenceSeconds) ||
    minSilenceSeconds < 0.1 ||
    minSilenceSeconds > 60
  )
    throw new Error(
      'Invalid VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS (0.1..60)',
    );
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000)
    throw new Error('Invalid VIDEO_EDIT_ANALYSIS_TIMEOUT_MS (1000..600000)');
  return { noiseDb, minSilenceSeconds, timeoutMs };
}
