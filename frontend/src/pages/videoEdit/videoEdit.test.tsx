jest.mock('./SilenceAnalysisPanel', () => ({
  __esModule: true,
  default: () => null,
}));
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VideoEditPage from './videoEdit';
import {
  createVideoEdit,
  getVideo,
  getVideoEdit,
  getVideoEditSource,
  getVideoEditRenderStatus,
  saveVideoEdit,
} from '../../utils/api';
const mockNavigate = jest.fn();
const mockSigninSilent = jest.fn();
jest.mock('react-oidc-context', () => ({
  useAuth: () => ({ signinSilent: mockSigninSilent }),
}));
const mockT = (key: string) => key;
jest.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => ({ videoId: 'video' }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('./EditPreview', () => ({
  __esModule: true,
  default: ({
    url,
    onTime,
  }: {
    url: string;
    onTime: (time: number) => void;
  }) => (
    <div data-testid="source">
      {url}
      {/* The playhead as playback leaves it: far too precise. */}
      <button onClick={() => onTime(5.558422046246841)}>playhead</button>
    </div>
  ),
}));
jest.mock('../../utils/api', () => ({
  createVideoEdit: jest.fn(),
  getVideo: jest.fn(),
  getVideoEdit: jest.fn(),
  getVideoEditSource: jest.fn(),
  getVideoEditRenderStatus: jest.fn(),
  saveVideoEdit: jest.fn(),
  revertVideoEdit: jest.fn(),
}));
const edit = {
  version: 4,
  renderStatus: 'draft',
  renderError: null,
  segments: [{ sourceStart: 0, sourceEnd: 20, textLayers: [] }],
};
beforeEach(() => {
  jest.clearAllMocks();
  (getVideoEditSource as jest.Mock).mockResolvedValue({
    ok: true,
    data: 'original-url',
  });
  (getVideo as jest.Mock).mockResolvedValue({
    ok: true,
    data: [{ id: 'video', title: 'Video', duration: 20 }],
  });
  (getVideoEdit as jest.Mock).mockResolvedValue({ ok: true, data: edit });
});
it('loads the protected original and saves the entire montage with its version', async () => {
  (saveVideoEdit as jest.Mock).mockResolvedValue({
    ok: false,
    status: 400,
    data: { message: ['first problem', 'second problem'] },
  });
  render(<VideoEditPage />);
  expect(await screen.findByTestId('source')).toHaveTextContent('original-url');
  fireEvent.click(screen.getByText('videoEdit.save'));
  await waitFor(() =>
    expect(saveVideoEdit).toHaveBeenCalledWith('video', {
      version: 4,
      segments: edit.segments,
    }),
  );
  expect(await screen.findByText('first problem')).toBeInTheDocument();
  expect(screen.getByText('second problem')).toBeInTheDocument();
  expect(createVideoEdit).not.toHaveBeenCalled();
});
it('does not create a montage when source access is refused', async () => {
  (getVideoEditSource as jest.Mock).mockResolvedValue({
    ok: false,
    status: 403,
    data: { message: 'videonotallowedit' },
  });
  render(<VideoEditPage />);
  expect(await screen.findByText('videonotallowedit')).toBeInTheDocument();
  expect(getVideoEdit).not.toHaveBeenCalled();
  expect(createVideoEdit).not.toHaveBeenCalled();
});
// An editor opened with an expired token gets 401 for the original: the
// session is renewed once and the original read again.
it('renews an expired session once to read the original', async () => {
  (getVideoEditSource as jest.Mock)
    .mockResolvedValueOnce({ ok: false, status: 401, data: {} })
    .mockResolvedValue({ ok: true, data: 'original-url' });
  mockSigninSilent.mockResolvedValue({ access_token: 'fresh-token' });
  render(<VideoEditPage />);
  expect(await screen.findByTestId('source')).toHaveTextContent('original-url');
  expect(mockSigninSilent).toHaveBeenCalledTimes(1);
  expect(getVideoEditSource).toHaveBeenCalledTimes(2);
});
it('says the session expired when it cannot be renewed', async () => {
  (getVideoEditSource as jest.Mock).mockResolvedValue({
    ok: false,
    status: 401,
    data: {},
  });
  mockSigninSilent.mockRejectedValue(new Error('login_required'));
  render(<VideoEditPage />);
  expect(
    await screen.findByText('videoEdit.sessionExpired'),
  ).toBeInTheDocument();
  expect(getVideoEditSource).toHaveBeenCalledTimes(1);
  expect(getVideoEdit).not.toHaveBeenCalled();
});
it('does not renew the session for a refused access', async () => {
  (getVideoEditSource as jest.Mock).mockResolvedValue({
    ok: false,
    status: 403,
    data: { message: 'videonotallowedit' },
  });
  render(<VideoEditPage />);
  await screen.findByText('videonotallowedit');
  expect(mockSigninSilent).not.toHaveBeenCalled();
});
it('creates the initial montage only after source authorization', async () => {
  (getVideoEdit as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
  (createVideoEdit as jest.Mock).mockResolvedValue({ ok: true, data: edit });
  render(<VideoEditPage />);
  await screen.findByTestId('source');
  expect(createVideoEdit).toHaveBeenCalledWith('video');
});
it('blocks a first save beyond 45 minutes and keeps cancel local', async () => {
  (getVideo as jest.Mock).mockResolvedValue({
    ok: true,
    data: [{ duration: 3000 }],
  });
  (getVideoEdit as jest.Mock).mockResolvedValue({
    ok: true,
    data: {
      ...edit,
      segments: [{ sourceStart: 0, sourceEnd: 3000, textLayers: [] }],
    },
  });
  render(<VideoEditPage />);
  expect(
    await screen.findByText('videoEdit.validation.durationLimit'),
  ).toBeInTheDocument();
  expect(screen.getByText('videoEdit.save')).toBeDisabled();
  fireEvent.click(screen.getByText('videoEdit.cancel'));
  expect(mockNavigate).toHaveBeenCalledWith('/video/video');
  expect(saveVideoEdit).not.toHaveBeenCalled();
});
it('keeps local edits on a version conflict', async () => {
  (saveVideoEdit as jest.Mock).mockResolvedValue({
    ok: false,
    status: 409,
    data: { message: 'current version 5' },
  });
  render(<VideoEditPage />);
  await screen.findByTestId('source');
  fireEvent.click(screen.getByText('videoEdit.save'));
  expect(await screen.findByText('current version 5')).toBeInTheDocument();
  expect(screen.getByTestId('source')).toHaveTextContent('original-url');
});
it.each(['ready', 'failed'])(
  'polls rendering until %s and returns to the video page',
  async (status) => {
    (getVideoEdit as jest.Mock).mockResolvedValue({
      ok: true,
      data: { ...edit, renderStatus: 'pending' },
    });
    (getVideoEditRenderStatus as jest.Mock).mockResolvedValue({
      ok: true,
      data: { renderStatus: status },
    });
    render(<VideoEditPage />);
    await screen.findByText('videoEdit.processing');
    await waitFor(
      () =>
        expect(mockNavigate).toHaveBeenCalledWith(
          '/video/video',
          expect.objectContaining({ state: expect.anything() }),
        ),
      { timeout: 2500 },
    );
  },
);

it('adds a text and cuts at the playhead on 0.1 s, and sends short values', async () => {
  (saveVideoEdit as jest.Mock).mockResolvedValue({ ok: true, data: edit });
  render(<VideoEditPage />);
  await screen.findByTestId('source');
  fireEvent.click(screen.getByText('playhead'));
  fireEvent.click(screen.getByText('videoEdit.addText'));
  // The new text starts at the playhead, rounded.
  expect(
    (screen.getByLabelText('videoEdit.textStart') as HTMLInputElement).value,
  ).toBe('5.6');
  fireEvent.change(screen.getByLabelText('videoEdit.content'), {
    target: { value: 'Titre' },
  });
  // The cut too: 5.6 s keeps 5 s on each side of the 20 s passage.
  fireEvent.click(screen.getByText('videoEdit.cut'));
  fireEvent.click(screen.getByText('videoEdit.save'));
  await waitFor(() => expect(saveVideoEdit).toHaveBeenCalled());
  const sent = (saveVideoEdit as jest.Mock).mock.calls[0][1];
  expect(
    sent.segments.map((s: { sourceStart: number; sourceEnd: number }) => [
      s.sourceStart,
      s.sourceEnd,
    ]),
  ).toEqual([
    [0, 5.6],
    [5.6, 20],
  ]);
  // The text, at the start of the second passage, kept its 5 s.
  expect(sent.segments[1].textLayers).toEqual([
    {
      content: 'Titre',
      position: 'bottom',
      color: 'white',
      startOffset: 0,
      duration: 5,
    },
  ]);
});
