/**
 * Reads the `t` query parameter of the video page (a position in seconds).
 *
 * Anything that is not a finite, non-negative number is ignored (`null`). A
 * known duration bounds the result; an unknown one (`null` or 0, before the
 * metadata is loaded) leaves it as is.
 */
export const parseStartTime = (
  raw: string | null,
  duration: number | null,
): number | null => {
  if (raw === null || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (duration !== null && duration > 0) return Math.min(seconds, duration);
  return seconds;
};
