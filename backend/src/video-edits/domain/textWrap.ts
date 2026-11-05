/**
 * How the render lays a text out: words wrapped at TEXT_LINE_LENGTH
 * characters, a longer word cut. Kept in sync with the worker copy in
 * ffmpegServer/src/services/text-wrap.ts, which draws exactly these lines.
 */
export const TEXT_LINE_LENGTH = 40;
export const TEXT_MAX_LINES = 3;

export function wrapText(content: string): string[] {
  const words = content.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let word of words) {
    while (word.length > TEXT_LINE_LENGTH) {
      if (line) lines.push(line);
      lines.push(word.slice(0, TEXT_LINE_LENGTH));
      word = word.slice(TEXT_LINE_LENGTH);
      line = '';
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= TEXT_LINE_LENGTH)
      line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
