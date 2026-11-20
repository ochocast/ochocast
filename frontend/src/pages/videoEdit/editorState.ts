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
// ---------------------------------------------------------------------------
// Preview: the montage is played from the original, passage by passage.

/** Montage time at which each passage starts. */
export const passageStarts = (segments: EditSegment[]): number[] => {
  let start = 0;
  return segments.map((s) => {
    const at = start;
    start += segmentDuration(s);
    return at;
  });
};

/** Where montage time `time` plays in the original, or null without any passage. */
export function toSource(segments: EditSegment[], time: number) {
  const at = locate(segments, Math.max(0, time));
  if (!at) return null;
  return {
    index: at.index,
    offset: at.offset,
    sourceTime: at.segment.sourceStart + at.offset,
  };
}

/** Montage time of original time `sourceTime` played as passage `index`. */
export function toMontage(
  segments: EditSegment[],
  index: number,
  sourceTime: number,
): number {
  const s = segments[index];
  if (!s) return totalDuration(segments);
  const offset = Math.max(
    0,
    Math.min(segmentDuration(s), sourceTime - s.sourceStart),
  );
  return passageStarts(segments)[index] + offset;
}

/** The passage, if any, that plays original time `sourceTime`. */
export function passageAt(
  segments: EditSegment[],
  sourceTime: number,
): number | null {
  const index = segments.findIndex(
    (s) => sourceTime >= s.sourceStart && sourceTime < s.sourceEnd,
  );
  return index < 0 ? null : index;
}

// Passages are cut to the millisecond: closer than this, two passages join
// in the original and play on without a seek.
const JOIN_TOLERANCE = 0.001;

export type Jump =
  | { kind: 'continue'; index: number }
  | { kind: 'seek'; index: number; sourceTime: number }
  | { kind: 'end' };

/** What follows the end of passage `index`. */
export function nextJump(segments: EditSegment[], index: number): Jump {
  const current = segments[index],
    next = segments[index + 1];
  if (!current || !next) return { kind: 'end' };
  if (Math.abs(next.sourceStart - current.sourceEnd) < JOIN_TOLERANCE)
    return { kind: 'continue', index: index + 1 };
  return { kind: 'seek', index: index + 1, sourceTime: next.sourceStart };
}

/**
 * Texts of a passage shown at `offset` seconds into it. Like the render
 * (FFmpeg `between(t,start,end)`), both bounds are included: a text that
 * starts the passage shows on its first frame, one that ends it on its last.
 */
export function visibleTexts(segment: EditSegment, offset: number): EditText[] {
  return segment.textLayers.filter(
    (t) => offset >= t.startOffset && offset <= t.startOffset + t.duration,
  );
}

export function formatTime(seconds: number) {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}
