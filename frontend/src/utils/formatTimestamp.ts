/** Formats a position in seconds as `m:ss`, or `h:mm:ss` from one hour. */
export const formatTimestamp = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
  }
  return `${minutes}:${secs}`;
};
