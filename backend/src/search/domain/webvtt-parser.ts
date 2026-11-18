export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}

const NON_CUE_BLOCK = /^(NOTE|STYLE|REGION)(\s|$)/;
const TIMESTAMP = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/;
// <v Name>, <c.class>, <i>, <b>, <u>, <00:00:03.000> and their closing tags
const TAG = /<\/?[\w.:]+(?:\s[^>]*)?>/g;

function parseTimestamp(value: string): number | null {
  const match = TIMESTAMP.exec(value);
  if (!match) return null;
  const [, hours = '0', minutes, seconds, millis] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis) / 1000
  );
}

function parseTimingLine(line: string): { start: number; end: number } | null {
  const [left, right] = line.split('-->');
  // Cue settings (align:start position:10%…) follow the end timestamp.
  const start = parseTimestamp(left.trim());
  const end = parseTimestamp(right.trim().split(/\s+/)[0]);
  return start === null || end === null ? null : { start, end };
}

function cleanText(lines: string[]): string {
  return lines
    .join(' ')
    .replace(TAG, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&') // last, so "&amp;lt;" stays "&lt;"
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWebVtt(source: string): TranscriptCue[] {
  const blocks = source
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[^\S\n]*\n/);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (NON_CUE_BLOCK.test(lines[0].trim())) continue;
    // Lines before the timing line are the cue identifier: ignored.
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;
    const timing = parseTimingLine(lines[timingIndex]);
    if (!timing) continue;
    const text = cleanText(lines.slice(timingIndex + 1));
    if (text) cues.push({ ...timing, text });
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}
