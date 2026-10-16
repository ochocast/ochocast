import { render, screen, waitFor } from '@testing-library/react';
import Thumbnail, { PreviewMinitureProps } from './Thumbnail';

// Jest 27 cannot resolve react-router v7's package exports: stub navigation.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

jest.mock('../../../../utils/api', () => ({
  getMiniature: jest.fn().mockResolvedValue({ ok: false, data: null }),
  getProfilePicture: jest.fn().mockResolvedValue({ ok: false, data: null }),
  isVideoFavorite: jest.fn().mockResolvedValue(false),
  addToFavorites: jest.fn(),
  removeFromFavorites: jest.fn(),
}));

jest.mock('../../../../context/BrandingContext', () => ({
  useBrandingContext: () => ({
    getImageUrl: jest.fn().mockResolvedValue(null),
  }),
}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../context/UserContext', () => ({
  useUser: () => ({ user: mockUser }),
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  mockUser = null;
});

const renderThumbnail = async (props: Partial<PreviewMinitureProps> = {}) => {
  render(
    <Thumbnail
      Id="v1"
      title="Keynote"
      createBy="alice"
      creatorId="alice-id"
      createdAt={new Date().toISOString()}
      tags={[]}
      {...props}
    />,
  );
  // Let the miniature / favorite / avatar lookups settle.
  await waitFor(() => expect(screen.getByAltText('Keynote')).toBeVisible());
};

describe('Thumbnail processing badges', () => {
  it('flags a video still being processed', async () => {
    await renderThumbnail({ transcodingStatus: 'pending' });

    expect(screen.getByText('En cours de traitement')).toBeInTheDocument();
  });

  it('replaces the views count, meaningless before the video can be watched', async () => {
    await renderThumbnail({ transcodingStatus: 'pending', views: 0 });

    expect(screen.queryByText('Aucune vue')).not.toBeInTheDocument();
  });

  it('shows no badge on a ready video', async () => {
    await renderThumbnail({ transcodingStatus: 'ready', duration: 125 });

    expect(
      screen.queryByText('En cours de traitement'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Échec du traitement')).not.toBeInTheDocument();
    expect(screen.getByText('2:05')).toBeInTheDocument();
  });

  it('shows no badge on videos published before transcoding existed', async () => {
    await renderThumbnail();

    expect(
      screen.queryByText('En cours de traitement'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Échec du traitement')).not.toBeInTheDocument();
  });

  it('tells the owner that processing failed', async () => {
    await renderThumbnail({ transcodingStatus: 'failed', isOwner: true });

    expect(screen.getByText('Échec du traitement')).toBeInTheDocument();
  });

  it('recognises the owner from the signed-in user when isOwner is not given', async () => {
    mockUser = { id: 'alice-id' };
    await renderThumbnail({ transcodingStatus: 'failed' });

    expect(screen.getByText('Échec du traitement')).toBeInTheDocument();
  });

  it('never shows the failure badge to someone else', async () => {
    mockUser = { id: 'bob-id' };
    await renderThumbnail({ transcodingStatus: 'failed' });

    expect(screen.queryByText('Échec du traitement')).not.toBeInTheDocument();
  });
});
