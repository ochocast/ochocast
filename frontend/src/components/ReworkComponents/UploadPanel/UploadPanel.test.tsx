import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  UploadProvider,
  useUploadContext,
} from '../../../context/UploadContext';
import UploadPanel from './UploadPanel';

// Jest 27 cannot resolve react-router v7's package exports: stub navigation.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

// Keep the processing poller quiet: the status never comes back.
jest.mock('../../../utils/api', () => ({
  getVideoProcessing: jest.fn(() => new Promise(() => {})),
}));

const storeUpload = (upload: Record<string, unknown>) => {
  localStorage.setItem(
    'ochocast_uploads',
    JSON.stringify([
      {
        id: 'u1',
        fileName: 'keynote.mp4',
        title: 'Keynote',
        progress: 100,
        createdAt: new Date().toISOString(),
        ...upload,
      },
    ]),
  );
  localStorage.setItem('ochocast_upload_panel_open', 'true');
};

let context: ReturnType<typeof useUploadContext>;
const Probe = () => {
  context = useUploadContext();
  return null;
};

const renderPanel = async () => {
  render(
    <UploadProvider>
      <Probe />
      <UploadPanel />
    </UploadProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockReset();
});

describe('UploadPanel', () => {
  it('says the transfer is over and the video is being processed, with a link to it', async () => {
    storeUpload({ status: 'processing', videoId: 'v1' });
    await renderPanel();

    expect(
      screen.getByText('Envoi terminé · Traitement en cours…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Terminé !|avec succès|100%/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Voir la vidéo' }));
    expect(mockNavigate).toHaveBeenCalledWith('/video/v1');
  });

  it('says the video is online once processed', async () => {
    storeUpload({ status: 'processing', videoId: 'v1' });
    await renderPanel();

    act(() => context.updateUpload('u1', { status: 'completed' }));

    expect(screen.getByText('Vidéo en ligne')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Voir la vidéo' }),
    ).toBeInTheDocument();
  });

  it('offers a new attempt when processing failed for good', async () => {
    storeUpload({
      status: 'error',
      videoId: 'v1',
      errorMessage: 'Le fichier envoyé est trop volumineux.',
    });
    await renderPanel();

    expect(
      screen.getByText('Le fichier envoyé est trop volumineux.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle tentative' }));
    expect(mockNavigate).toHaveBeenCalledWith('/video/video-settings');
  });
});
