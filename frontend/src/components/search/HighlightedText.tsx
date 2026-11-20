import React from 'react';
import { TextPart } from '../../utils/searchApi';

interface HighlightedTextProps {
  parts: TextPart[];
  /** Class applied to each `<mark>` (hit parts). */
  className?: string;
}

/**
 * Renders text parts built by the search API: hit parts go in a `<mark>`,
 * the others stay plain text. Parts are React text children, so any markup
 * they contain is displayed literally.
 */
const HighlightedText: React.FC<HighlightedTextProps> = ({
  parts,
  className,
}) => (
  <>
    {parts.map((part, index) =>
      part.hit ? (
        <mark key={index} className={className}>
          {part.text}
        </mark>
      ) : (
        <React.Fragment key={index}>{part.text}</React.Fragment>
      ),
    )}
  </>
);

export default HighlightedText;
