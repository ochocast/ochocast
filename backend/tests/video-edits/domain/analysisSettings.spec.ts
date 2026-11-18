import { analysisSettings } from 'src/video-edits/domain/videoEditAnalysis';
import { analysisFingerprint } from 'src/video-edits/infra/analysis/analysis.service';
const names = [
  'VIDEO_EDIT_SILENCE_NOISE_DB',
  'VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS',
  'VIDEO_EDIT_ANALYSIS_TIMEOUT_MS',
];
let before: Record<string, string | undefined>;
beforeEach(() => {
  before = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  names.forEach((k) => delete process.env[k]);
});
afterEach(() =>
  names.forEach((k) => {
    if (before[k] === undefined) delete process.env[k];
    else process.env[k] = before[k];
  }),
);
it('defaults to a five-minute processing budget and configurable noise/silence thresholds', () => {
  expect(analysisSettings()).toEqual({
    noiseDb: -35,
    minSilenceSeconds: 0.8,
    timeoutMs: 300000,
  });
  process.env.VIDEO_EDIT_ANALYSIS_TIMEOUT_MS = '120000';
  process.env.VIDEO_EDIT_SILENCE_NOISE_DB = '-42';
  process.env.VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS = '1.2';
  expect(analysisSettings()).toEqual({
    noiseDb: -42,
    minSilenceSeconds: 1.2,
    timeoutMs: 120000,
  });
});
it.each([
  ['VIDEO_EDIT_ANALYSIS_TIMEOUT_MS', '0'],
  ['VIDEO_EDIT_ANALYSIS_TIMEOUT_MS', '600001'],
  ['VIDEO_EDIT_SILENCE_NOISE_DB', 'NaN'],
  ['VIDEO_EDIT_SILENCE_MIN_DURATION_SECONDS', '0'],
])('rejects invalid %s=%s', (name, value) => {
  process.env[name] = value;
  expect(() => analysisSettings()).toThrow();
});
it('cache fingerprint changes with original identity or detection parameters', () => {
  const base = analysisFingerprint('source', 'etag', 100, -35, 0.8);
  for (const next of [
    analysisFingerprint('source', 'new', 100, -35, 0.8),
    analysisFingerprint('source', 'etag', 101, -35, 0.8),
    analysisFingerprint('source', 'etag', 100, -40, 0.8),
    analysisFingerprint('source', 'etag', 100, -35, 1.2),
  ])
    expect(next).not.toBe(base);
});
