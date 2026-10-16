import { act, render, screen } from '@testing-library/react';
import { getVideoProcessing } from '../utils/api';
import { UploadProvider, useUploadContext } from './UploadContext';
import { uploadCompletedUpdate } from './uploadProcessing';

jest.mock('../utils/api', () => ({ getVideoProcessing: jest.fn() }));

const mockedGet = getVideoProcessing as jest.Mock;

const reply = (state: string, reason: string | null = null) => ({
  ok: true,
  status: 200,
  data: { state, since: null, reason },
});

const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flushPromises();
  });
};

let context: ReturnType<typeof useUploadContext>;
const Probe = () => {
  context = useUploadContext();
  return (
    <>
      {context.uploads.map((u) => (
        <p key={u.id} data-testid={`upload-${u.id}`}>
          {u.status}|{u.videoId ?? ''}|{u.errorMessage ?? ''}
        </p>
      ))}
      {context.notifications.map((n) => (
        <p key={n.id} data-testid={`notification-${n.id}`}>
          {n.type}|{n.message}|{n.videoId ?? ''}
        </p>
      ))}
    </>
  );
};

const storeProcessingUpload = (id = 'u1', videoId = 'v1') =>
  localStorage.setItem(
    'ochocast_uploads',
    JSON.stringify([
      {
        id,
        fileName: 'keynote.mp4',
        title: 'Keynote',
        progress: 100,
        status: 'processing',
        videoId,
        createdAt: new Date().toISOString(),
      },
    ]),
  );

const renderProvider = async () => {
  render(
    <UploadProvider>
      <Probe />
    </UploadProvider>,
  );
  await act(flushPromises);
};

let hidden = false;
beforeAll(() => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  hidden = false;
  localStorage.clear();
  mockedGet.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('UploadProvider processing poller', () => {
  it('waits through queued, processing and retrying, then announces the video is online', async () => {
    storeProcessingUpload();
    mockedGet
      .mockResolvedValueOnce(reply('queued'))
      .mockResolvedValueOnce(reply('processing'))
      .mockResolvedValueOnce(reply('retrying'))
      .mockResolvedValueOnce(reply('ready'));

    await renderProvider();
    expect(mockedGet).toHaveBeenCalledWith('v1');
    expect(screen.getByTestId('upload-u1')).toHaveTextContent('processing|v1|');

    await advance(5000);
    await advance(10000);
    expect(screen.getByTestId('upload-u1')).toHaveTextContent('processing');
    expect(screen.queryByTestId('notification-u1')).not.toBeInTheDocument();

    await advance(20000);
    expect(mockedGet).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId('upload-u1')).toHaveTextContent('completed|v1|');
    expect(screen.getByTestId('notification-u1')).toHaveTextContent(
      'success|Votre vidéo est en ligne|v1',
    );

    await advance(120000);
    expect(mockedGet).toHaveBeenCalledTimes(4);
  });

  it('reports a final failure with its plain reason', async () => {
    storeProcessingUpload();
    mockedGet.mockResolvedValueOnce(reply('failed', 'invalid_source'));

    await renderProvider();

    const reason =
      "Le fichier envoyé n'a pas pu être lu. Publiez à nouveau la vidéo avec un autre fichier.";
    expect(screen.getByTestId('upload-u1')).toHaveTextContent(
      `error|v1|${reason}`,
    );
    expect(screen.getByTestId('notification-u1')).toHaveTextContent(
      `error|${reason}`,
    );

    await advance(120000);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('backs off from 5 s up to 30 s between checks', async () => {
    storeProcessingUpload();
    mockedGet.mockResolvedValue(reply('queued'));

    await renderProvider();
    expect(mockedGet).toHaveBeenCalledTimes(1);

    await advance(5000); // +5 s
    expect(mockedGet).toHaveBeenCalledTimes(2);
    await advance(5000);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    await advance(5000); // +10 s
    expect(mockedGet).toHaveBeenCalledTimes(3);
    await advance(15000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
    await advance(5000); // +20 s
    expect(mockedGet).toHaveBeenCalledTimes(4);
    await advance(25000);
    expect(mockedGet).toHaveBeenCalledTimes(4);
    await advance(5000); // +30 s
    expect(mockedGet).toHaveBeenCalledTimes(5);
    await advance(30000); // stays at 30 s
    expect(mockedGet).toHaveBeenCalledTimes(6);
  });

  it('keeps trying after a network error', async () => {
    storeProcessingUpload();
    mockedGet
      .mockResolvedValueOnce({ ok: false, status: null, data: null })
      .mockResolvedValueOnce(reply('ready'));

    await renderProvider();
    expect(screen.getByTestId('upload-u1')).toHaveTextContent('processing');

    await advance(5000);
    expect(screen.getByTestId('upload-u1')).toHaveTextContent('completed');
  });

  it('stops when the video no longer exists', async () => {
    storeProcessingUpload();
    mockedGet.mockResolvedValue({ ok: false, status: 404, data: {} });

    await renderProvider();

    expect(screen.getByTestId('upload-u1')).toHaveTextContent(
      "error|v1|Cette vidéo n'est plus disponible.",
    );
    await advance(120000);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('does not check while the tab is hidden', async () => {
    hidden = true;
    storeProcessingUpload();
    mockedGet.mockResolvedValue(reply('ready'));

    await renderProvider();
    await advance(60000);
    expect(mockedGet).not.toHaveBeenCalled();

    hidden = false;
    await advance(5000);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('upload-u1')).toHaveTextContent('completed');
  });

  it('follows an upload from the end of the transfer to the video being online', async () => {
    mockedGet.mockResolvedValue(reply('processing'));
    await renderProvider();

    act(() =>
      context.addUpload({
        id: 'u2',
        fileName: 'talk.mp4',
        title: 'Talk',
        progress: 0,
        status: 'uploading',
      }),
    );
    act(() => context.updateUpload('u2', uploadCompletedUpdate({ id: 'v2' })));

    // The bytes landed: nothing is announced as done yet.
    expect(screen.getByTestId('upload-u2')).toHaveTextContent('processing|v2|');
    expect(screen.queryByTestId('notification-u2')).not.toBeInTheDocument();

    await advance(5000);
    expect(mockedGet).toHaveBeenCalledWith('v2');
    expect(screen.getByTestId('upload-u2')).toHaveTextContent('processing');

    mockedGet.mockResolvedValue(reply('ready'));
    await advance(10000);
    expect(screen.getByTestId('upload-u2')).toHaveTextContent('completed|v2|');
    expect(screen.getByTestId('notification-u2')).toHaveTextContent(
      'success|Votre vidéo est en ligne|v2',
    );
  });
});
