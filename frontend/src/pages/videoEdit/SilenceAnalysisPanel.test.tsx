import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SilenceAnalysisPanel from './SilenceAnalysisPanel';
import { getSilenceAnalysis, requestSilenceAnalysis } from '../../utils/api';
const mockT = (key: string) => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('../../utils/api', () => ({
  getSilenceAnalysis: jest.fn(),
  requestSilenceAnalysis: jest.fn(),
}));
const segments = [
  { key: 'segment', sourceStart: 0, sourceEnd: 20, textLayers: [] },
];
const job = {
  id: 'job',
  status: 'ready',
  phase: 'complete',
  progress: 100,
  queuedAt: new Date().toISOString(),
  settings: { timeoutMs: 300000 },
  result: { cuts: [10], outcome: 'cuts' },
};
beforeEach(() => {
  jest.clearAllMocks();
  (getSilenceAnalysis as jest.Mock).mockResolvedValue({
    ok: false,
    status: 404,
  });
});
it('only applies proposals after explicit selection and acceptance', async () => {
  (requestSilenceAnalysis as jest.Mock).mockResolvedValue({
    ok: true,
    data: job,
  });
  const apply = jest.fn();
  render(
    <SilenceAnalysisPanel
      videoId="video"
      segments={segments}
      onApply={apply}
    />,
  );
  fireEvent.click(screen.getByText('videoEdit.analysis.request'));
  await screen.findByText('videoEdit.analysis.suggestions');
  expect(apply).not.toHaveBeenCalled();
  expect(screen.getByText('videoEdit.analysis.apply')).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('videoEdit.analysis.apply'));
  expect(apply).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ sourceStart: 0, sourceEnd: 10 }),
      expect.objectContaining({ sourceStart: 10, sourceEnd: 20 }),
    ]),
  );
});
it('clearly describes a video without audio and applies no cuts', async () => {
  (getSilenceAnalysis as jest.Mock).mockResolvedValue({
    ok: true,
    data: { ...job, result: { cuts: [], outcome: 'no_audio' } },
  });
  const apply = jest.fn();
  render(
    <SilenceAnalysisPanel
      videoId="video"
      segments={segments}
      onApply={apply}
    />,
  );
  expect(
    await screen.findByText('videoEdit.analysis.noAudio'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});
it('ignoring the proposals does not change the montage', async () => {
  (getSilenceAnalysis as jest.Mock).mockResolvedValue({ ok: true, data: job });
  const apply = jest.fn();
  render(
    <SilenceAnalysisPanel
      videoId="video"
      segments={segments}
      onApply={apply}
    />,
  );
  await screen.findByRole('checkbox');
  fireEvent.click(screen.getByText('videoEdit.analysis.ignore'));
  expect(apply).not.toHaveBeenCalled();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('explains the wait behind other treatments, then polls without altering local state', async () => {
  const pending = { ...job, status: 'pending', phase: 'queued', result: null };
  (getSilenceAnalysis as jest.Mock)
    .mockResolvedValueOnce({ ok: true, data: pending })
    .mockResolvedValue({
      ok: true,
      data: { ...job, result: { cuts: [], outcome: 'no_silence' } },
    });
  const apply = jest.fn();
  render(
    <SilenceAnalysisPanel
      videoId="video"
      segments={segments}
      onApply={apply}
    />,
  );
  expect(
    await screen.findByText('videoEdit.analysis.queued'),
  ).toBeInTheDocument();
  expect(screen.getByText('videoEdit.analysis.waitHelp')).toBeInTheDocument();
  expect(
    await screen.findByText(
      'videoEdit.analysis.noSilence',
      {},
      { timeout: 2500 },
    ),
  ).toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});
it('disables incompatible cuts after local changes', async () => {
  (getSilenceAnalysis as jest.Mock).mockResolvedValue({ ok: true, data: job });
  render(
    <SilenceAnalysisPanel
      videoId="video"
      segments={[{ ...segments[0], sourceEnd: 12 }]}
      onApply={jest.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole('checkbox'));
  expect(screen.getByText('videoEdit.analysis.short')).toBeInTheDocument();
  expect(screen.getByText('videoEdit.analysis.apply')).toBeDisabled();
});

// Each poll answer is a new job object (its progress moves): the follow-up
// must not restart on it, only when the analysis or its status changes.
it('polls a running analysis every 3 s until it ends, without restarting on each update', async () => {
  jest.useFakeTimers();
  try {
    const at = (status: string, progress: number) => ({
      ok: true,
      data: {
        ...job,
        status,
        phase: status === 'ready' ? 'complete' : 'analyzing',
        progress,
        result: status === 'ready' ? job.result : null,
      },
    });
    (getSilenceAnalysis as jest.Mock)
      .mockResolvedValueOnce(at('processing', 0)) // opening the editor
      .mockResolvedValueOnce(at('processing', 30))
      .mockResolvedValueOnce(at('processing', 60))
      .mockResolvedValueOnce(at('ready', 100));
    const calls = () => (getSilenceAnalysis as jest.Mock).mock.calls.length;
    const flush = () =>
      act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
    const advance = async (ms: number) => {
      act(() => {
        jest.advanceTimersByTime(ms);
      });
      await flush();
    };
    render(
      <SilenceAnalysisPanel
        videoId="video"
        segments={segments}
        onApply={jest.fn()}
      />,
    );
    await flush();
    expect(calls()).toBe(1);
    // First poll 1 s after the running analysis shows.
    await advance(1000);
    expect(calls()).toBe(2);
    // Its answer (progress 30) is no restart: the next poll waits 3 s.
    await advance(2999);
    expect(calls()).toBe(2);
    await advance(1);
    expect(calls()).toBe(3);
    await advance(3000);
    expect(calls()).toBe(4);
    // Ready: the follow-up stops for good.
    expect(
      screen.getByText('videoEdit.analysis.suggestions'),
    ).toBeInTheDocument();
    await advance(30000);
    expect(calls()).toBe(4);
    // Every poll asked for this analysis.
    expect(
      (getSilenceAnalysis as jest.Mock).mock.calls.slice(1).map((c) => c[1]),
    ).toEqual(['job', 'job', 'job']);
  } finally {
    jest.useRealTimers();
  }
});
