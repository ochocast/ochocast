import { TextPart } from './search.types';

// ts_headline wraps each hit in U+0002 ... U+0003 (StartSel / StopSel).
// eslint-disable-next-line no-control-regex
const MARKED = /\u0002([^\u0002\u0003]*)\u0003/g;
// eslint-disable-next-line no-control-regex
const STRAY_MARK = /[\u0002\u0003]/g;

/**
 * Splits a `ts_headline` output into plain and highlighted parts. Parts keep
 * the text verbatim (markup stays literal); unbalanced marks are dropped.
 */
export function splitHighlight(marked: string): TextPart[] {
  const parts: TextPart[] = [];
  const add = (text: string, hit: boolean) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.hit === hit) last.text += text;
    else parts.push({ text, hit });
  };

  let from = 0;
  for (const match of marked.matchAll(MARKED)) {
    add(marked.slice(from, match.index).replace(STRAY_MARK, ''), false);
    add(match[1], true);
    from = match.index + match[0].length;
  }
  add(marked.slice(from).replace(STRAY_MARK, ''), false);
  return parts;
}
