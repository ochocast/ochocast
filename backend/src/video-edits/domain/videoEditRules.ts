import {
  SegmentInput,
  TEXT_COLORS,
  TEXT_POSITIONS,
  VIDEO_EDIT_LIMITS,
} from './videoEdit';

// Absorbs float noise from the client (e.g. 12.3 + 0.1); never enough to
// let a real overlap or overflow through.
const EPSILON = 1e-6;

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const label = (index: number) => `segments[${index}]`;

/**
 * Checks a whole montage against the source video. Returns every problem
 * found, so the client can show them all at once; empty means valid.
 */
export function validateEditContent(
  segments: SegmentInput[],
  videoDuration: number,
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(segments) || segments.length === 0) {
    return ['A montage needs at least one segment'];
  }
  if (segments.length > VIDEO_EDIT_LIMITS.maxSegments) {
    errors.push(
      `A montage has at most ${VIDEO_EDIT_LIMITS.maxSegments} segments`,
    );
  }

  segments.forEach((segment, index) => {
    const { sourceStart, sourceEnd } = segment;
    if (!isTime(sourceStart) || !isTime(sourceEnd)) {
      errors.push(`${label(index)}: sourceStart and sourceEnd must be numbers`);
      return;
    }
    if (sourceStart < 0) {
      errors.push(`${label(index)}: sourceStart must be >= 0`);
    }
    if (sourceEnd > videoDuration + EPSILON) {
      errors.push(
        `${label(index)}: sourceEnd exceeds the video duration (${videoDuration}s)`,
      );
    }
    if (sourceEnd - sourceStart < VIDEO_EDIT_LIMITS.minSegmentDuration) {
      errors.push(
        `${label(index)}: a segment lasts at least ${VIDEO_EDIT_LIMITS.minSegmentDuration}s`,
      );
    }
    errors.push(
      ...validateTextLayers(segment, sourceEnd - sourceStart).map(
        (error) => `${label(index)}.${error}`,
      ),
    );
  });

  // A passage of the source may appear only once in the montage.
  const byStart = segments
    .map((segment, index) => ({ ...segment, index }))
    .filter((s) => isTime(s.sourceStart) && isTime(s.sourceEnd))
    .sort((a, b) => a.sourceStart - b.sourceStart);
  for (let i = 1; i < byStart.length; i++) {
    const previous = byStart[i - 1];
    const current = byStart[i];
    if (current.sourceStart < previous.sourceEnd - EPSILON) {
      errors.push(
        `${label(current.index)} overlaps ${label(previous.index)} in the source video`,
      );
    }
  }

  return errors;
}

function validateTextLayers(
  segment: SegmentInput,
  segmentDuration: number,
): string[] {
  const layers = segment.textLayers ?? [];
  const errors: string[] = [];
  if (!Array.isArray(layers)) return ['textLayers must be an array'];
  if (layers.length > VIDEO_EDIT_LIMITS.maxTextLayersPerSegment) {
    errors.push(
      `textLayers: at most ${VIDEO_EDIT_LIMITS.maxTextLayersPerSegment} per segment`,
    );
  }
  layers.forEach((layer, index) => {
    const at = `textLayers[${index}]`;
    const content =
      typeof layer.content === 'string' ? layer.content.trim() : '';
    if (
      content.length === 0 ||
      content.length > VIDEO_EDIT_LIMITS.maxTextLength
    ) {
      errors.push(
        `${at}: content must have 1 to ${VIDEO_EDIT_LIMITS.maxTextLength} characters`,
      );
    }
    if (!TEXT_POSITIONS.includes(layer.position)) {
      errors.push(
        `${at}: position must be one of ${TEXT_POSITIONS.join(', ')}`,
      );
    }
    if (!TEXT_COLORS.includes(layer.color)) {
      errors.push(`${at}: color must be one of ${TEXT_COLORS.join(', ')}`);
    }
    if (!isTime(layer.startOffset) || !isTime(layer.duration)) {
      errors.push(`${at}: startOffset and duration must be numbers`);
      return;
    }
    if (layer.startOffset < 0) {
      errors.push(`${at}: startOffset must be >= 0`);
    }
    if (layer.duration <= 0) {
      errors.push(`${at}: duration must be > 0`);
    }
    // Overlapping texts in the same segment are allowed.
    if (layer.startOffset + layer.duration > segmentDuration + EPSILON) {
      errors.push(`${at}: the text must end within its segment`);
    }
  });
  return errors;
}
