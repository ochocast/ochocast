import { act, render, screen } from '@testing-library/react';
import VideoProcessingStatus from './VideoProcessingStatus';
import { VideoProcessing } from '../../../../utils/VideoProperties';

const NOW = new Date('2026-10-16T12:00:00.000Z');

const status = (
  state: VideoProcessing['state'],
  extra: Partial<VideoProcessing> = {},
): VideoProcessing => ({
  state,
  since: null,
  reason: null,
  ...extra,
});

const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60000).toISOString();

// The visible stage line, not the live region repeating the state.
const visibleText = (text: string) =>
  screen.getByText(text, { ignore: '[role="status"]' });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('VideoProcessingStatus while the video is prepared', () => {
  it('explains that the page updates by itself, with a polite live region', () => {
    render(<VideoProcessingStatus status={status('queued')} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(
      screen.getByRole('heading', { name: 'Vidéo en cours de traitement' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cette vidéo vient d'être publiée et est en cours de préparation. Elle sera disponible ici automatiquement, inutile de recharger la page.",
      ),
    ).toBeInTheDocument();
  });

  it('shows the queued stage', () => {
    render(<VideoProcessingStatus status={status('queued')} />);

    expect(visibleText("En file d'attente")).toBeInTheDocument();
  });

  it('shows for how long the video has been processed', () => {
    render(
      <VideoProcessingStatus
        status={status('processing', { since: minutesAgo(12) })}
      />,
    );

    expect(
      screen.getByText('Traitement en cours depuis 12 min'),
    ).toBeInTheDocument();
  });

  it('says less than a minute right after processing started, then counts minutes', () => {
    render(
      <VideoProcessingStatus
        status={status('processing', { since: minutesAgo(0.5) })}
      />,
    );
    expect(
      screen.getByText("Traitement en cours depuis moins d'une minute"),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(
      screen.getByText('Traitement en cours depuis 1 min'),
    ).toBeInTheDocument();
  });

  it('does not invent a duration when the start time is unknown or in the future', () => {
    const { rerender } = render(
      <VideoProcessingStatus status={status('processing')} />,
    );
    expect(visibleText('Traitement en cours')).toBeInTheDocument();

    rerender(
      <VideoProcessingStatus
        status={status('processing', { since: 'not a date' })}
      />,
    );
    expect(visibleText('Traitement en cours')).toBeInTheDocument();

    rerender(
      <VideoProcessingStatus
        status={status('processing', { since: minutesAgo(-3) })}
      />,
    );
    expect(
      screen.getByText("Traitement en cours depuis moins d'une minute"),
    ).toBeInTheDocument();
  });

  it('shows a retry as work in progress, not as a failure', () => {
    render(<VideoProcessingStatus status={status('retrying')} />);

    expect(visibleText('Nouvelle tentative en cours')).toBeInTheDocument();
    expect(screen.queryByText(/pas pu être préparée/)).not.toBeInTheDocument();
  });

  it('shows no stage before the first status arrives', () => {
    render(<VideoProcessingStatus status={null} />);

    expect(
      screen.getByRole('heading', { name: 'Vidéo en cours de traitement' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/file d'attente|depuis/)).not.toBeInTheDocument();
  });

  it('never shows an estimated time', () => {
    const { container } = render(
      <VideoProcessingStatus
        status={status('processing', { since: minutesAgo(5) })}
      />,
    );

    expect(container).not.toHaveTextContent(/restant|estim|environ|remaining/i);
  });
});

describe('VideoProcessingStatus after a final failure', () => {
  const failed = (reason: string | null) => status('failed', { reason });

  it('shows visitors a generic message only', () => {
    render(<VideoProcessingStatus status={failed('source_too_large')} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(
      screen.getByRole('heading', {
        name: "Cette vidéo n'a pas pu être préparée.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/volumineux/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Compressez/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Vidéo en cours de traitement'),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      'invalid_source',
      "Le fichier envoyé n'a pas pu être lu.",
      'Publiez à nouveau la vidéo avec un autre fichier.',
    ],
    [
      'source_too_large',
      'Le fichier envoyé est trop volumineux.',
      'Compressez la vidéo (ou réduisez sa résolution), puis publiez-la à nouveau.',
    ],
    [
      'duration_exceeded',
      'La vidéo est trop longue pour être préparée, et son format ne peut pas être lu tel quel.',
      'Convertissez-la en MP4 avec une vidéo H.264, puis publiez-la à nouveau.',
    ],
    [
      'max_attempts',
      'Un problème temporaire a empêché la préparation de la vidéo.',
      'Publiez-la à nouveau, ou contactez le support si le problème persiste.',
    ],
  ])(
    'explains %s to the creator with advice',
    (reason, explanation, advice) => {
      render(<VideoProcessingStatus status={failed(reason)} isCreator />);

      expect(
        screen.getByRole('heading', {
          name: "Cette vidéo n'a pas pu être préparée.",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText(explanation)).toBeInTheDocument();
      expect(screen.getByText(advice)).toBeInTheDocument();
    },
  );

  it('never renders a raw technical error, even an unexpected reason code', () => {
    const { container } = render(
      <VideoProcessingStatus
        status={failed('ffmpeg exited with code 1: moov atom not found')}
        isCreator
      />,
    );

    expect(container).not.toHaveTextContent(/ffmpeg|moov|code 1/);
    expect(
      screen.getByText(
        'Un problème temporaire a empêché la préparation de la vidéo.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the failure of a video already known as failed before its status loads', () => {
    render(<VideoProcessingStatus status={null} failed isCreator />);

    expect(
      screen.getByRole('heading', {
        name: "Cette vidéo n'a pas pu être préparée.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Publiez/)).not.toBeInTheDocument();
  });
});

describe('VideoProcessingStatus for screen readers', () => {
  it('does not announce the elapsed minutes as they tick', () => {
    render(
      <VideoProcessingStatus
        status={status('processing', { since: minutesAgo(0.5) })}
      />,
    );
    const region = screen.getByRole('status');
    const announced = region.textContent;
    expect(announced).toBe('Traitement en cours');

    act(() => {
      jest.advanceTimersByTime(3 * 60000);
    });

    // The counter is still shown, outside the live region.
    const counter = screen.getByText('Traitement en cours depuis 3 min');
    expect(counter.closest('[aria-live]')).toBeNull();
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe(announced);
  });

  it('announces each state change in the same live region', () => {
    const { rerender } = render(<VideoProcessingStatus status={null} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Vidéo en cours de traitement');

    const announcements = (
      [
        status('queued'),
        status('processing', { since: minutesAgo(12) }),
        status('retrying'),
        status('failed', { reason: 'source_too_large' }),
      ] as const
    ).map((next) => {
      rerender(<VideoProcessingStatus status={next} isCreator />);
      // Kept mounted: a freshly inserted live region is often not announced.
      expect(screen.getByRole('status')).toBe(region);
      return region.textContent;
    });

    expect(announcements).toEqual([
      "En file d'attente",
      'Traitement en cours',
      'Nouvelle tentative en cours',
      "Cette vidéo n'a pas pu être préparée.",
    ]);
  });
});
