import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '../../testUtils/initTestI18n';
import { api } from '../../utils/api';
import {
  getTranscript,
  SearchApiError,
  TranscriptResult,
} from '../../utils/searchApi';
import TranscriptPanel from './TranscriptPanel';

jest.mock('../../utils/searchApi', () => ({
  getTranscript: jest.fn(),
  SearchApiError: class SearchApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Reached only through the real `getTranscript`, for the malformed answers.
jest.mock('../../utils/api', () => ({ api: { get: jest.fn() } }));

const mockedGetTranscript = getTranscript as jest.MockedFunction<
  typeof getTranscript
>;

/** Lets the real `getTranscript` read `data` as a 200 answer. */
const answerWith = (data: unknown) => {
  (api.get as jest.Mock).mockResolvedValue({ ok: true, status: 200, data });
  const actual = jest.requireActual<typeof import('../../utils/searchApi')>(
    '../../utils/searchApi',
  );
  mockedGetTranscript.mockImplementation(actual.getTranscript);
};

const LINES: Array<[number, string]> = [
  [12, 'Bonjour à tous, merci d’être venus à cette conférence.'],
  [95, 'On a choisi Kubernetes parce qu’on voulait redéployer.'],
  [260, 'Le cluster tourne sur Talos, chez Scaleway.'],
  [498, 'Le transcodage passe par FFmpeg dans des conteneurs.'],
  [754, 'Notre première erreur : des pods sans limite de mémoire.'],
  [1012, 'Kubernetes redémarre le pod, mais la vidéo est perdue.'],
  [1290, 'Les données personnelles restent dans la base managée.'],
  [1544, 'Pour les sauvegardes, on s’appuie sur celles de l’hébergeur.'],
  [1870, 'Les sous-titres sont générés la nuit.'],
  [2210, 'Si c’était à refaire, on commencerait avec moins de microservices.'],
  [2560, 'Merci, je prends vos questions sur Kubernetes et sur le reste.'],
];

/** Splits a line around the word « Kubernetes » when `highlight` is set. */
const toParts = (text: string, highlight: boolean) => {
  const index = highlight ? text.indexOf('Kubernetes') : -1;
  if (index < 0) return [{ text, hit: false }];
  return [
    { text: text.slice(0, index), hit: false },
    { text: 'Kubernetes', hit: true },
    { text: text.slice(index + 'Kubernetes'.length), hit: false },
  ].filter((part) => part.text !== '');
};

const k8s = (
  options: { highlight?: boolean; source?: 'auto' | 'provided' } = {},
): TranscriptResult => {
  const highlight = options.highlight ?? false;
  return {
    videoId: 'k8s',
    source: options.source ?? 'auto',
    status: 'ready',
    segments: LINES.map(([start, text], index) => ({
      start,
      end: LINES[index + 1]?.[0] ?? start + 5,
      parts: toParts(text, highlight),
    })),
    matches: highlight ? [1, 5, 10] : [],
  };
};

const empty = (status: 'pending' | 'none'): TranscriptResult => ({
  videoId: 'k8s',
  source: 'auto',
  status,
  segments: [],
  matches: [],
});

const flush = () => act(async () => {});

const renderPanel = async (
  props: Partial<React.ComponentProps<typeof TranscriptPanel>> = {},
) => {
  const onSeek = jest.fn();
  const onMatchesChange = jest.fn();
  const utils = render(
    <TranscriptPanel
      videoId="k8s"
      initialQuery=""
      currentTime={0}
      transcriptionStatus="ready"
      onSeek={onSeek}
      onMatchesChange={onMatchesChange}
      {...props}
    />,
  );
  await flush();
  return { onSeek, onMatchesChange, ...utils };
};

const lineButtons = () =>
  screen
    .getAllByRole('button')
    .filter((button) => /^\d+:\d{2}/.test(button.textContent ?? ''));

beforeEach(() => {
  mockedGetTranscript.mockResolvedValue(k8s());
});

afterEach(() => {
  jest.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('TranscriptPanel', () => {
  it('marks the active segment with aria-current', async () => {
    await renderPanel({ currentTime: 1015 });

    const active = lineButtons().filter(
      (button) => button.getAttribute('aria-current') === 'true',
    );
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('16:52');
    expect(lineButtons()).toHaveLength(11);
  });

  it('keeps the last segment active until the end', async () => {
    await renderPanel({ currentTime: 9999 });

    const active = lineButtons().filter(
      (button) => button.getAttribute('aria-current') === 'true',
    );
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('42:40');
  });

  it('seeks when a segment is clicked', async () => {
    const { onSeek } = await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /12:34/ }));

    expect(onSeek).toHaveBeenCalledWith(754);
  });

  it('prefills the search field with the initial query and fetches with it', async () => {
    mockedGetTranscript.mockResolvedValue(k8s({ highlight: true }));
    await renderPanel({ initialQuery: 'kubernetes' });

    const field = screen.getByRole('searchbox', {
      name: 'Rechercher dans cette vidéo',
    });
    expect(field).toHaveValue('kubernetes');
    expect(mockedGetTranscript).toHaveBeenCalledTimes(1);
    expect(mockedGetTranscript).toHaveBeenCalledWith('k8s', 'kubernetes');
  });

  it('refetches after 300 ms of typing', async () => {
    jest.useFakeTimers();
    await renderPanel();
    expect(mockedGetTranscript).toHaveBeenCalledTimes(1);

    const field = screen.getByRole('searchbox');
    fireEvent.change(field, { target: { value: 'kube' } });
    fireEvent.change(field, { target: { value: 'kubernetes' } });
    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(mockedGetTranscript).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockedGetTranscript).toHaveBeenCalledTimes(2);
    expect(mockedGetTranscript).toHaveBeenLastCalledWith('k8s', 'kubernetes');
  });

  it('ignores a stale response arriving after a newer one', async () => {
    jest.useFakeTimers();
    let resolveOld: (value: TranscriptResult) => void = () => {};
    mockedGetTranscript
      .mockResolvedValueOnce(k8s())
      .mockImplementationOnce(
        () =>
          new Promise<TranscriptResult>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(k8s({ highlight: true }));
    const { onMatchesChange } = await renderPanel();

    const field = screen.getByRole('searchbox');
    fireEvent.change(field, { target: { value: 'kube' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.change(field, { target: { value: 'kubernetes' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText('0 / 3')).toBeInTheDocument();

    await act(async () => {
      resolveOld({ ...k8s(), matches: [2] });
    });

    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    expect(onMatchesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ start: 95 }),
      expect.objectContaining({ start: 1012 }),
      expect.objectContaining({ start: 2560 }),
    ]);
  });

  it('moves between occurrences and announces 2 / 3', async () => {
    mockedGetTranscript.mockResolvedValue(k8s({ highlight: true }));
    const { onSeek } = await renderPanel({
      initialQuery: 'kubernetes',
      currentTime: 1015,
    });

    const counter = screen.getByText('2 / 3');
    expect(counter).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(
      screen.getByRole('button', { name: 'Occurrence précédente' }),
    );
    expect(onSeek).toHaveBeenLastCalledWith(95);

    fireEvent.click(
      screen.getByRole('button', { name: 'Occurrence suivante' }),
    );
    expect(onSeek).toHaveBeenLastCalledWith(2560);
  });

  it('starts at 0 / 3 before the first match and goes to the first one', async () => {
    mockedGetTranscript.mockResolvedValue(k8s({ highlight: true }));
    const { onSeek } = await renderPanel({
      initialQuery: 'kubernetes',
      currentTime: 20,
    });

    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Occurrence précédente' }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Occurrence suivante' }),
    );
    expect(onSeek).toHaveBeenCalledWith(95);
  });

  it('reaches a fractional start from its whole second', async () => {
    const result = k8s({ highlight: true });
    result.segments[5].start = 1012.48;
    mockedGetTranscript.mockResolvedValue(result);
    await renderPanel({ initialQuery: 'kubernetes', currentTime: 1012 });

    const active = lineButtons().filter(
      (button) => button.getAttribute('aria-current') === 'true',
    );
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('16:52');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('disables next on the last occurrence', async () => {
    mockedGetTranscript.mockResolvedValue(k8s({ highlight: true }));
    await renderPanel({ initialQuery: 'kubernetes', currentTime: 2562 });

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Occurrence suivante' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Occurrence précédente' }),
    ).toBeEnabled();
  });

  it('shows no counter and no buttons without occurrence, and says so for a query', async () => {
    await renderPanel();
    expect(screen.queryByText(/\d \/ \d/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Occurrence suivante' }),
    ).not.toBeInTheDocument();

    mockedGetTranscript.mockResolvedValue(k8s());
    await renderPanel({ initialQuery: 'zzz' });
    expect(screen.getByText('Aucune occurrence')).toBeInTheDocument();
  });

  it('highlights the found words with mark elements', async () => {
    mockedGetTranscript.mockResolvedValue(k8s({ highlight: true }));
    await renderPanel({ initialQuery: 'kubernetes' });

    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(3);
    expect(marks[0]).toHaveTextContent('Kubernetes');
  });

  it('reports the matching passages', async () => {
    mockedGetTranscript.mockResolvedValue(k8s({ highlight: true }));
    const { onMatchesChange } = await renderPanel({
      initialQuery: 'kubernetes',
    });

    expect(onMatchesChange).toHaveBeenLastCalledWith([
      {
        start: 95,
        excerpt: 'On a choisi Kubernetes parce qu’on voulait redéployer.',
      },
      {
        start: 1012,
        excerpt: 'Kubernetes redémarre le pod, mais la vidéo est perdue.',
      },
      {
        start: 2560,
        excerpt:
          'Merci, je prends vos questions sur Kubernetes et sur le reste.',
      },
    ]);
  });

  it('reports no passage when the query is empty', async () => {
    const { onMatchesChange } = await renderPanel();

    expect(onMatchesChange).toHaveBeenLastCalledWith([]);
  });

  it('labels the transcript as automatic or provided', async () => {
    const { unmount } = await renderPanel();
    expect(
      screen.getByText('Transcription · générée automatiquement'),
    ).toBeInTheDocument();
    unmount();

    mockedGetTranscript.mockResolvedValue(k8s({ source: 'provided' }));
    await renderPanel();
    expect(screen.getByText('Transcription · fournie')).toBeInTheDocument();
    expect(
      screen.queryByText('Transcription · générée automatiquement'),
    ).not.toBeInTheDocument();
  });

  it('renders preparing when status is pending', async () => {
    mockedGetTranscript.mockResolvedValue(empty('pending'));
    const { onMatchesChange } = await renderPanel();

    expect(
      screen.getByText('Transcription en préparation'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(onMatchesChange).toHaveBeenLastCalledWith([]);
  });

  it('renders preparing when the video is still being transcribed', async () => {
    mockedGetTranscript.mockResolvedValue(empty('none'));
    const { unmount } = await renderPanel({
      transcriptionStatus: 'processing',
    });
    expect(
      screen.getByText('Transcription en préparation'),
    ).toBeInTheDocument();
    unmount();

    mockedGetTranscript.mockRejectedValue(new Error('not deployed'));
    await renderPanel({ transcriptionStatus: 'pending' });
    expect(
      screen.getByText('Transcription en préparation'),
    ).toBeInTheDocument();
  });

  it('renders nothing when transcript status is none', async () => {
    mockedGetTranscript.mockResolvedValue(empty('none'));
    const { container, onMatchesChange } = await renderPanel();

    expect(container).toBeEmptyDOMElement();
    expect(onMatchesChange).toHaveBeenLastCalledWith([]);
  });

  it('renders nothing and reports no passage when the request fails', async () => {
    mockedGetTranscript.mockRejectedValue(new Error('404'));
    const { container, onMatchesChange } = await renderPanel({
      transcriptionStatus: 'failed',
    });

    expect(container).toBeEmptyDOMElement();
    expect(onMatchesChange).toHaveBeenLastCalledWith([]);
  });

  it('shows markup in a segment literally', async () => {
    const result = k8s();
    result.segments[2].parts = [{ text: '<b>test</b>', hit: false }];
    mockedGetTranscript.mockResolvedValue(result);
    await renderPanel();

    expect(screen.getByText('<b>test</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  describe('with a malformed 200 answer', () => {
    it('shows lines whose parts and matches are missing', async () => {
      answerWith({
        videoId: 'k8s',
        status: 'ready',
        segments: [{ start: 12, end: 17 }, { start: 95 }, { start: 'x' }],
      });
      const { onMatchesChange } = await renderPanel({
        initialQuery: 'kubernetes',
      });

      expect(lineButtons()).toHaveLength(2);
      expect(lineButtons()[1]).toHaveTextContent('1:35');
      expect(screen.getByText('Aucune occurrence')).toBeInTheDocument();
      expect(onMatchesChange).toHaveBeenLastCalledWith([]);
    });

    it('shows an empty panel when the segments are missing', async () => {
      answerWith({ status: 'ready' });
      await renderPanel({ initialQuery: 'kubernetes' });

      expect(screen.getByRole('searchbox')).toBeInTheDocument();
      expect(screen.getByTestId('transcript-list')).toBeEmptyDOMElement();
    });

    it('renders nothing for a body that is not an object', async () => {
      answerWith('<html>Bad gateway</html>');
      const { container } = await renderPanel();

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('when a search in the panel fails', () => {
    const typeAndFlush = async (value: string) => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
    };

    const renderReady = async () => {
      jest.useFakeTimers();
      mockedGetTranscript.mockResolvedValueOnce(k8s({ highlight: true }));
      return renderPanel({ initialQuery: 'kubernetes', currentTime: 1015 });
    };

    const expectPanelKept = (typed: string) => {
      expect(screen.getByRole('searchbox')).toHaveValue(typed);
      expect(lineButtons()).toHaveLength(11);
      expect(document.querySelector('mark')).toBeNull();
      expect(screen.queryByText(/\d \/ \d/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Occurrence suivante' }),
      ).not.toBeInTheDocument();
    };

    it('keeps the panel and says the search is too long on a 400', async () => {
      const { onMatchesChange } = await renderReady();
      mockedGetTranscript.mockRejectedValueOnce(
        new SearchApiError('too long', 400),
      );

      await typeAndFlush('un deux trois');

      expectPanelKept('un deux trois');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Recherche trop longue : 10 mots ou expressions et 200 caractères au plus.',
      );
      expect(onMatchesChange).toHaveBeenLastCalledWith([]);
    });

    it('keeps the panel and says the search is unavailable otherwise', async () => {
      const { onMatchesChange } = await renderReady();
      mockedGetTranscript.mockRejectedValueOnce(
        new SearchApiError('down', 503),
      );

      await typeAndFlush('cluster');

      expectPanelKept('cluster');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Recherche indisponible pour le moment.',
      );
      expect(onMatchesChange).toHaveBeenLastCalledWith([]);
    });

    it('recovers when the next search succeeds', async () => {
      const { onMatchesChange } = await renderReady();
      mockedGetTranscript.mockRejectedValueOnce(
        new SearchApiError('too long', 400),
      );
      await typeAndFlush('un deux trois');
      expect(screen.getByRole('status')).toBeInTheDocument();

      mockedGetTranscript.mockResolvedValueOnce(k8s({ highlight: true }));
      await typeAndFlush('kubernetes');

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(document.querySelectorAll('mark')).toHaveLength(3);
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
      expect(onMatchesChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ start: 95 }),
        expect.objectContaining({ start: 1012 }),
        expect.objectContaining({ start: 2560 }),
      ]);
    });
  });

  describe('auto-scroll', () => {
    const stubLayout = () => {
      const proto = HTMLElement.prototype;
      Object.defineProperty(proto, 'offsetTop', {
        configurable: true,
        get() {
          const index = Number(this.getAttribute?.('data-index') ?? -1);
          return index >= 0 ? index * 40 : 0;
        },
      });
      Object.defineProperty(proto, 'offsetHeight', {
        configurable: true,
        get() {
          return this.hasAttribute?.('data-index') ? 40 : 0;
        },
      });
      Object.defineProperty(proto, 'clientHeight', {
        configurable: true,
        get() {
          return this.getAttribute?.('data-testid') === 'transcript-list'
            ? 200
            : 0;
        },
      });
    };

    afterEach(() => {
      delete (HTMLElement.prototype as { offsetTop?: unknown }).offsetTop;
      delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
      delete (HTMLElement.prototype as { clientHeight?: unknown }).clientHeight;
    });

    it('scrolls the list container to the active line', async () => {
      stubLayout();
      await renderPanel({ currentTime: 1015 });

      // line 5 sits at 200..240 in a 200 px viewport: centered on it
      expect(screen.getByTestId('transcript-list').scrollTop).toBe(120);
    });

    it('does not auto-scroll with prefers-reduced-motion', async () => {
      stubLayout();
      window.matchMedia = jest.fn().mockReturnValue({
        matches: true,
      }) as unknown as typeof window.matchMedia;
      await renderPanel({ currentTime: 1015 });

      expect(screen.getByTestId('transcript-list').scrollTop).toBe(0);
    });
  });
});
