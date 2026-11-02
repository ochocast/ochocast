import { validateEditContent } from 'src/video-edits/domain/videoEditRules';
import {
  SegmentInput,
  TextLayerInput,
  VIDEO_EDIT_LIMITS,
} from 'src/video-edits/domain/videoEdit';

describe('validateEditContent', () => {
  const duration = 3012;
  const text = (overrides: Partial<TextLayerInput> = {}): TextLayerInput => ({
    content: 'Ouverture',
    position: 'bottom',
    color: 'white',
    startOffset: 0,
    duration: 300,
    ...overrides,
  });
  const segment = (
    sourceStart: number,
    sourceEnd: number,
    textLayers: TextLayerInput[] = [],
  ): SegmentInput => ({ sourceStart, sourceEnd, textLayers });

  it('accepts the montage of the mockup, in any playback order', () => {
    expect(
      validateEditContent(
        [
          segment(1270, 2205, [text({ content: 'Partie 2' })]),
          segment(120, 870, [text()]),
          segment(2460, 2970, [text({ position: 'center', duration: 275 })]),
        ],
        duration,
      ),
    ).toEqual([]);
  });

  it('accepts the whole video as one segment, and touching segments', () => {
    expect(validateEditContent([segment(0, duration)], duration)).toEqual([]);
    expect(
      validateEditContent([segment(10, 20), segment(0, 10)], duration),
    ).toEqual([]);
  });

  it('refuses an empty montage', () => {
    expect(validateEditContent([], duration)).toEqual([
      'A montage needs at least one segment',
    ]);
  });

  it('refuses more segments than the limit', () => {
    const segments = Array.from(
      { length: VIDEO_EDIT_LIMITS.maxSegments + 1 },
      (_, i) => segment(i * 2, i * 2 + 1),
    );
    expect(validateEditContent(segments, duration)).toContain(
      'A montage has at most 100 segments',
    );
  });

  it.each([
    ['a negative start', segment(-1, 10), 'sourceStart must be >= 0'],
    [
      'an end after the video',
      segment(3000, 3013),
      'sourceEnd exceeds the video duration (3012s)',
    ],
    ['a segment under 1s', segment(10, 10.5), 'a segment lasts at least 1s'],
    ['an inverted segment', segment(20, 10), 'a segment lasts at least 1s'],
    [
      'a non numeric time',
      segment(Number.NaN, 10),
      'sourceStart and sourceEnd must be numbers',
    ],
  ])('refuses %s', (_, input, error) => {
    expect(validateEditContent([input], duration)).toEqual([
      `segments[0]: ${error}`,
    ]);
  });

  it('refuses a passage of the source used twice', () => {
    expect(
      validateEditContent(
        [segment(100, 200), segment(0, 50), segment(150, 300)],
        duration,
      ),
    ).toEqual(['segments[2] overlaps segments[0] in the source video']);
  });

  it('tolerates float noise at the boundaries', () => {
    expect(
      validateEditContent(
        [segment(0, 0.1 + 0.2 + 9.7), segment(10, duration + 1e-9)],
        duration,
      ),
    ).toEqual([]);
  });

  describe('text layers', () => {
    it('allows overlapping texts within a segment', () => {
      expect(
        validateEditContent(
          [
            segment(0, 60, [
              text({ duration: 30 }),
              text({ startOffset: 10, duration: 30 }),
            ]),
          ],
          duration,
        ),
      ).toEqual([]);
    });

    it('refuses a text that ends after its segment', () => {
      expect(
        validateEditContent(
          [segment(0, 60, [text({ startOffset: 50, duration: 11 })])],
          duration,
        ),
      ).toEqual([
        'segments[0].textLayers[0]: the text must end within its segment',
      ]);
    });

    it('refuses more texts than the limit', () => {
      const layers = Array.from(
        { length: VIDEO_EDIT_LIMITS.maxTextLayersPerSegment + 1 },
        () => text({ duration: 1 }),
      );
      expect(validateEditContent([segment(0, 60, layers)], duration)).toEqual([
        'segments[0].textLayers: at most 10 per segment',
      ]);
    });

    it.each([
      [
        'blank content',
        { content: '   ' },
        'content must have 1 to 500 characters',
      ],
      [
        'too long content',
        { content: 'x'.repeat(501) },
        'content must have 1 to 500 characters',
      ],
      [
        'an unknown position',
        { position: 'left' as any },
        'position must be one of top, center, bottom',
      ],
      [
        'an unknown color',
        { color: '#FF0000' as any },
        'color must be one of white, black, green',
      ],
      ['a negative start', { startOffset: -1 }, 'startOffset must be >= 0'],
      ['a zero duration', { duration: 0 }, 'duration must be > 0'],
    ])('refuses %s', (_, overrides, error) => {
      expect(
        validateEditContent([segment(0, 600, [text(overrides)])], duration),
      ).toEqual([`segments[0].textLayers[0]: ${error}`]);
    });
  });

  it('reports every problem at once', () => {
    expect(
      validateEditContent(
        [segment(-5, 0), segment(0, 4000, [text({ content: '' })])],
        duration,
      ),
    ).toEqual([
      'segments[0]: sourceStart must be >= 0',
      'segments[1]: sourceEnd exceeds the video duration (3012s)',
      'segments[1].textLayers[0]: content must have 1 to 500 characters',
    ]);
  });
});
