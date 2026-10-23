export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

function timestamp(seconds: number) {
  const millis = Math.round(seconds * 1000);
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor(millis / 60_000) % 60;
  const secs = Math.floor(millis / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis % 1000).padStart(3, '0')}`;
}

export function toWebVtt(segments: unknown): string | null {
  if (!Array.isArray(segments)) throw new Error('Whisper returned invalid segments');
  const cues: string[] = [];
  let previousStart = 0;
  for (const segment of segments) {
    if (!segment || !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) || segment.start < previousStart ||
      segment.start < 0 || segment.end <= segment.start ||
      typeof segment.text !== 'string') {
      throw new Error('Whisper returned an invalid cue');
    }
    previousStart = segment.start;
    const text = segment.text.replace(/\s+/g, ' ').trim()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (text) cues.push(`${timestamp(segment.start)} --> ${timestamp(segment.end)}\n${text}`);
  }
  return cues.length ? `WEBVTT\n\n${cues.join('\n\n')}\n` : null;
}
