import { toWebVtt } from '../../transcription/webvtt';
import { parseWebVtt } from './webvtt-parser';

describe('parseWebVtt', () => {
  it('parses toWebVtt output', () => {
    const vtt = toWebVtt([{ start: 1, end: 2.5, text: 'Bonjour & bienvenue' }]);

    expect(parseWebVtt(vtt as string)).toEqual([
      { start: 1, end: 2.5, text: 'Bonjour & bienvenue' },
    ]);
  });

  it('parses an SRT converted to VTT', () => {
    const vtt =
      'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nLigne un\nligne deux\n';

    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 2, text: 'Ligne un ligne deux' },
    ]);
  });

  it('skips NOTE, STYLE, REGION blocks and cue identifiers', () => {
    const vtt = [
      'WEBVTT - titre',
      '',
      'NOTE un commentaire',
      'sur deux lignes',
      '',
      'STYLE',
      '::cue { color: red }',
      '',
      'REGION',
      'id:r1',
      '',
      'intro',
      '00:00:01.000 --> 00:00:02.000',
      'Premier',
      '',
      '00:00:03.000 --> 00:00:04.000',
      'Second',
      '',
    ].join('\n');

    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 2, text: 'Premier' },
      { start: 3, end: 4, text: 'Second' },
    ]);
  });

  it('accepts mm:ss.mmm and ignores cue settings', () => {
    const vtt =
      'WEBVTT\n\n01:02.500 --> 01:04.000 align:start position:10%\nBonjour\n';

    expect(parseWebVtt(vtt)).toEqual([
      { start: 62.5, end: 64, text: 'Bonjour' },
    ]);
  });

  it('strips voice, class, italic, bold and inline timestamp tags', () => {
    const vtt =
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Marie><i>Salut</i> <c.red>toi</c><00:00:03.000></v>\n\n' +
      '00:00:05.000 --> 00:00:06.000\n<b>gras</b> <u>souligné</u> <c>classe</c>\n\n' +
      '00:00:07.000 --> 00:00:08.000\n<c.bg-red>hi</c>\n\n' +
      // Removing the inner tags must not leave a new tag behind.
      '00:00:09.000 --> 00:00:10.000\n<scr<b>ipt>alert(1)</scr</b>ipt>\n';

    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 4, text: 'Salut toi' },
      { start: 5, end: 6, text: 'gras souligné classe' },
      { start: 7, end: 8, text: 'hi' },
      { start: 9, end: 10, text: 'alert(1)' },
    ]);
  });

  it('decodes entities', () => {
    const vtt =
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na &amp; b &lt;c&gt;&nbsp;d &amp;lt; e\n';

    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 2, text: 'a & b <c> d &lt; e' },
    ]);
  });

  it('handles CRLF', () => {
    const vtt =
      'WEBVTT\r\n\r\n1\r\n00:00:01.000 --> 00:00:02.000\r\nLigne un\r\nligne deux\r\n\r\n00:00:03.000 --> 00:00:04.000\r\nSuite\r\n';

    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 2, text: 'Ligne un ligne deux' },
      { start: 3, end: 4, text: 'Suite' },
    ]);
  });

  it('keeps both apostrophes', () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nl'école l’école\n";

    expect(parseWebVtt(vtt)).toEqual([
      { start: 1, end: 2, text: "l'école l’école" },
    ]);
  });

  it('sorts cues by start and keeps zero-duration cues', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:10.000 --> 00:00:11.000',
      'dix',
      '',
      '00:00:02.000 --> 00:00:03.000',
      'deux',
      '',
      '00:00:05.000 --> 00:00:05.000',
      'cinq',
      '',
    ].join('\n');

    expect(parseWebVtt(vtt).map((cue) => cue.start)).toEqual([2, 5, 10]);
    expect(parseWebVtt(vtt)[1]).toEqual({ start: 5, end: 5, text: 'cinq' });

    // A reversed cue is clamped (no negative duration) and its text is kept.
    const [reversed] = parseWebVtt(
      'WEBVTT\n\n00:00:05.000 --> 00:00:02.000\ninversé\n',
    );
    expect(reversed).toEqual({ start: 5, end: 5, text: 'inversé' });
  });

  it('returns [] for an empty or header-only file', () => {
    expect(parseWebVtt('')).toEqual([]);
    expect(parseWebVtt('WEBVTT\n')).toEqual([]);
    expect(
      parseWebVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<i> </i>\n'),
    ).toEqual([]);
  });
});
