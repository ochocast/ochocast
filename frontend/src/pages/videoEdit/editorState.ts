export type TextPosition = 'top' | 'center' | 'bottom';
export type TextColor = 'white' | 'black' | 'green';
export interface EditText {
  key: string;
  content: string;
  position: TextPosition;
  color: TextColor;
  startOffset: number;
  duration: number;
}
export interface EditSegment {
  key: string;
  sourceStart: number;
  sourceEnd: number;
  textLayers: EditText[];
}
export type RenderStatus =
  | 'draft'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';
export interface VideoEdit {
  version: number;
  renderStatus: RenderStatus;
  renderError: string | null;
  segments: Array<
    Omit<EditSegment, 'key' | 'textLayers'> & {
      textLayers: Array<Omit<EditText, 'key'>>;
    }
  >;
}
let nextKey = 0;
export const localKey = () => `edit-local-${++nextKey}`;
export const segmentDuration = (s: EditSegment) => s.sourceEnd - s.sourceStart;
export const totalDuration = (segments: EditSegment[]) =>
  segments.reduce((n, s) => n + segmentDuration(s), 0);
export const isRendering = (status?: RenderStatus) =>
  status === 'pending' || status === 'processing';
export const hydrate = (edit: VideoEdit): EditSegment[] =>
  edit.segments.map((s) => ({
    key: localKey(),
    sourceStart: s.sourceStart,
    sourceEnd: s.sourceEnd,
    textLayers: s.textLayers.map((t) => ({ ...t, key: localKey() })),
  }));
export const payload = (version: number, segments: EditSegment[]) => ({
  version,
  segments: segments.map((s) => ({
    sourceStart: s.sourceStart,
    sourceEnd: s.sourceEnd,
    textLayers: s.textLayers.map(
      ({ content, position, color, startOffset, duration }) => ({
        content,
        position,
        color,
        startOffset,
        duration,
      }),
    ),
  })),
});
// Same word wrapping as backend/domain/textWrap and the FFmpeg worker.
export function wrapText(content: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (let word of content.trim().split(/\s+/).filter(Boolean)) {
    while (word.length > 40) {
      if (line) lines.push(line);
      lines.push(word.slice(0, 40));
      word = word.slice(40);
      line = '';
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= 40) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
export interface ValidationIssue {
  code:
    | 'segmentsLimit'
    | 'durationLimit'
    | 'segmentBounds'
    | 'overlap'
    | 'textsLimit'
    | 'textLength'
    | 'textBounds'
    | 'textStyle';
  passage?: number;
  text?: number;
}
export function validate(
  segments: EditSegment[],
  sourceDuration: number,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (!segments.length || segments.length > 100)
    errors.push({ code: 'segmentsLimit' });
  if (totalDuration(segments) > 2700) errors.push({ code: 'durationLimit' });
  segments.forEach((s, i) => {
    const passage = i + 1;
    if (
      ![s.sourceStart, s.sourceEnd].every(Number.isFinite) ||
      s.sourceStart < 0 ||
      s.sourceEnd > sourceDuration ||
      segmentDuration(s) < 1
    )
      errors.push({ code: 'segmentBounds', passage });
    if (
      segments
        .slice(0, i)
        .some(
          (other) =>
            s.sourceStart < other.sourceEnd && other.sourceStart < s.sourceEnd,
        )
    )
      errors.push({ code: 'overlap', passage });
    if (s.textLayers.length > 10) errors.push({ code: 'textsLimit', passage });
    s.textLayers.forEach((t, j) => {
      const text = j + 1;
      if (
        !t.content.trim() ||
        t.content.length > 500 ||
        wrapText(t.content).length > 3
      )
        errors.push({ code: 'textLength', passage, text });
      if (
        ![t.startOffset, t.duration].every(Number.isFinite) ||
        t.startOffset < 0 ||
        t.duration <= 0 ||
        t.startOffset + t.duration > segmentDuration(s)
      )
        errors.push({ code: 'textBounds', passage, text });
      if (
        !['top', 'center', 'bottom'].includes(t.position) ||
        !['white', 'black', 'green'].includes(t.color)
      )
        errors.push({ code: 'textStyle', passage, text });
    });
  });
  return errors;
}
export function splitSegment(
  segments: EditSegment[],
  key: string,
  offset: number,
): EditSegment[] {
  const i = segments.findIndex((s) => s.key === key),
    s = segments[i];
  if (
    !s ||
    !Number.isFinite(offset) ||
    offset < 5 ||
    segmentDuration(s) - offset < 5 ||
    segments.length >= 100
  )
    return segments;
  // Text crossing the cut keeps the same visible interval on both pieces.
  const clipped = (start: number, end: number): EditText[] =>
    s.textLayers.flatMap((t) => {
      const a = Math.max(start, t.startOffset),
        b = Math.min(end, t.startOffset + t.duration);
      const crossesCut =
        t.startOffset < offset && t.startOffset + t.duration > offset;
      return b > a && (!crossesCut || b - a >= 0.5)
        ? [{ ...t, key: localKey(), startOffset: a - start, duration: b - a }]
        : [];
    });
  const leftTexts = clipped(0, offset),
    rightTexts = clipped(offset, segmentDuration(s));
  if (leftTexts.length > 10 || rightTexts.length > 10) return segments;
  return [
    ...segments.slice(0, i),
    { ...s, sourceEnd: s.sourceStart + offset, textLayers: leftTexts },
    {
      ...s,
      key: localKey(),
      sourceStart: s.sourceStart + offset,
      textLayers: rightTexts,
    },
    ...segments.slice(i + 1),
  ];
}
export function moveSegment(
  segments: EditSegment[],
  key: string,
  insertion: number,
): EditSegment[] {
  const from = segments.findIndex((s) => s.key === key);
  if (from < 0) return segments;
  const rest = segments.filter((s) => s.key !== key);
  rest.splice(
    Math.max(
      0,
      Math.min(rest.length, insertion > from ? insertion - 1 : insertion),
    ),
    0,
    segments[from],
  );
  return rest;
}
export function locate(segments: EditSegment[], time: number) {
  let start = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i],
      end = start + segmentDuration(s);
    if (time < end || i === segments.length - 1)
      return {
        segment: s,
        index: i,
        start,
        offset: Math.max(0, Math.min(segmentDuration(s), time - start)),
      };
    start = end;
  }
  return null;
}
export function formatTime(seconds: number) {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}
