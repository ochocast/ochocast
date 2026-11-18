import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RevertVideoButton from './RevertVideoButton';
import { revertVideoEdit } from '../../utils/api';
jest.mock('../../utils/api', () => ({ revertVideoEdit: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(() => jest.restoreAllMocks());
it('only reverts after confirmation, then refreshes the displayed video', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  const onReverted = jest.fn();
  (revertVideoEdit as jest.Mock).mockClear().mockResolvedValue({ ok: true });
  render(<RevertVideoButton videoId="video" onReverted={onReverted} />);
  fireEvent.click(screen.getByText('videoEdit.revert'));
  expect(revertVideoEdit).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByText('videoEdit.revert'));
  await waitFor(() => expect(onReverted).toHaveBeenCalledTimes(1));
  expect(revertVideoEdit).toHaveBeenCalledWith('video');
});
it('explains why a render in progress prevents reverting', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  (revertVideoEdit as jest.Mock).mockResolvedValue({ ok: false, status: 409 });
  const onReverted = jest.fn();
  render(<RevertVideoButton videoId="video" onReverted={onReverted} />);
  fireEvent.click(screen.getByText('videoEdit.revert'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'videoEdit.conflict',
  );
  expect(onReverted).not.toHaveBeenCalled();
});
