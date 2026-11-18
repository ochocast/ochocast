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
const mockT = (key: string) => key;
jest.mock('react-router-dom', () => ({
  Link: ({ children }: any) => <span>{children}</span>,
  useNavigate: () => mockNavigate,
  useParams: () => ({ videoId: 'video' }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('./EditPreview', () => ({
  __esModule: true,
  default: ({ url }: any) => <div data-testid="source">{url}</div>,
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
