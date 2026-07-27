import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { findTags, findUsers } from '../../../../utils/api';
import GlobalSearchBar from './GlobalSearchBar';

jest.mock('../../../../utils/api', () => ({
  findTags: jest.fn(),
  findUsers: jest.fn(),
}));

jest.mock('../../BrandingImage/BrandingImage', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockedFindTags = findTags as jest.Mock;
const mockedFindUsers = findUsers as jest.Mock;

describe('GlobalSearchBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('debounces the search while the user is typing', async () => {
    mockedFindTags.mockResolvedValue({ ok: true, status: 200, data: [] });
    mockedFindUsers.mockResolvedValue({ ok: true, status: 200, data: [] });
    const onSearch = jest.fn();

    render(<GlobalSearchBar onSearch={onSearch} placeholder="Rechercher" />);

    const input = screen.getByPlaceholderText('Rechercher');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(onSearch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('abc');
  });

  it('keeps rendering when suggestion endpoints return an HTTP error', async () => {
    mockedFindTags.mockResolvedValue({
      ok: false,
      status: 401,
      data: { message: 'Unauthorized' },
    });
    mockedFindUsers.mockResolvedValue({
      ok: false,
      status: 401,
      data: { message: 'Unauthorized' },
    });

    render(<GlobalSearchBar onSearch={jest.fn()} placeholder="Rechercher" />);

    const input = screen.getByPlaceholderText('Rechercher');
    fireEvent.change(input, { target: { value: 'test' } });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockedFindTags).toHaveBeenCalledWith('test');
      expect(mockedFindUsers).toHaveBeenCalledWith('test');
    });
    expect(input).toHaveValue('test');
  });
});
