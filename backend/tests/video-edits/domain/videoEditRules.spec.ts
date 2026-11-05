import {
  maxEditedDuration,
  validateEditContent,
} from 'src/video-edits/domain/videoEditRules';
import { wrapText } from 'src/video-edits/domain/textWrap';
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

  const mockup = [
    segment(1270, 2205, [text({ content: 'Partie 2' })]),
    segment(120, 870, [text()]),
    segment(2460, 2970, [text({ position: 'center', duration: 275 })]),
  ];

  it('accepts the montage of the mockup, in any playback order, under a 1h cap', () => {
    expect(validateEditContent(mockup, duration, 3600)).toEqual([]);
  });

  it('caps the edited video at 45 minutes by default', () => {
    // 36:35 in the mockup: within the provisional cap.
    expect(validateEditContent(mockup, duration)).toEqual([]);
    expect(validateEditContent([segment(0, 2700)], duration)).toEqual([]);
    expect(validateEditContent([segment(0, 2701)], duration)).toEqual([
      'The edited video lasts 2701s, more than the 2700s allowed',
    ]);
  });

  describe('maxEditedDuration', () => {
    const original = process.env.VIDEO_EDIT_MAX_DURATION_SECONDS;
    afterEach(() => {
      if (original === undefined)
        delete process.env.VIDEO_EDIT_MAX_DURATION_SECONDS;
      else process.env.VIDEO_EDIT_MAX_DURATION_SECONDS = original;
    });

    it('reads VIDEO_EDIT_MAX_DURATION_SECONDS', () => {
      process.env.VIDEO_EDIT_MAX_DURATION_SECONDS = '600';
      expect(maxEditedDuration()).toBe(600);
      expect(validateEditContent([segment(0, 601)], duration)).toHaveLength(1);
    });

    it('refuses an invalid value', () => {
      process.env.VIDEO_EDIT_MAX_DURATION_SECONDS = 'soon';
      expect(() => maxEditedDuration()).toThrow(
        'VIDEO_EDIT_MAX_DURATION_SECONDS',
      );
    });
  });

  it('accepts the whole video as one segment, and touching segments', () => {
    expect(
      validateEditContent([segment(0, duration)], duration, duration),
    ).toEqual([]);
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

    it('refuses a text that does not fit in 3 lines of 40 characters', () => {
      const fourLines = Array.from({ length: 4 }, () => 'x'.repeat(40)).join(
        ' ',
      );
      expect(
        validateEditContent(
          [segment(0, 600, [text({ content: fourLines })])],
          duration,
        ),
      ).toEqual([
        'segments[0].textLayers[0]: content must fit in 3 lines of 40 characters',
      ]);
      expect(
        validateEditContent(
          [segment(0, 600, [text({ content: fourLines.slice(0, 122) })])],
          duration,
        ),
      ).toEqual([]);
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
        5000,
      ),
    ).toEqual([
      'segments[0]: sourceStart must be >= 0',
      'segments[1]: sourceEnd exceeds the video duration (3012s)',
      'segments[1].textLayers[0]: content must have 1 to 500 characters',
    ]);
  });

  describe('wrapText', () => {
    it('wraps words at 40 characters', () => {
      expect(
        wrapText('Partie 2 : démonstration du nouveau lecteur vidéo en direct'),
      ).toEqual([
        'Partie 2 : démonstration du nouveau',
        'lecteur vidéo en direct',
      ]);
    });

    it('collapses whitespace and line breaks', () => {
      expect(wrapText('  Merci\n\n  à tous  ')).toEqual(['Merci à tous']);
    });

    it('cuts a word longer than a line', () => {
      expect(wrapText(`a ${'y'.repeat(45)} b`)).toEqual([
        'a',
        'y'.repeat(40),
        'yyyyy b',
      ]);
    });
  });
});
