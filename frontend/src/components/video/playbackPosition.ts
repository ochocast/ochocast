/**
 * Index of the last start reached by the playback position, -1 when none is.
 * Used for the active transcript line, the occurrence counter and the current
 * strip marker, whose starts are in ascending order.
 *
 * A start counts as reached from its whole second: result links carry
 * `?t=<whole seconds>` while automatic subtitles keep milliseconds, and the
 * passage a link points to must be the current one on arrival.
 */
export const lastReachedIndex = (
  starts: number[],
  currentTime: number,
): number => {
  let index = -1;
  starts.forEach((start, i) => {
    if (Math.floor(start) <= currentTime) index = i;
  });
  return index;
};
