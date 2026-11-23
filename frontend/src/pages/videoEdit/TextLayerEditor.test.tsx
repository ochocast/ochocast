import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TextLayerEditor from './TextLayerEditor';
import { EditText } from './editorState';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const text = (startOffset: number, duration: number): EditText => ({
  key: 'text',
  content: 'Bonjour',
  position: 'bottom',
  color: 'white',
  startOffset,
  duration,
});

/** The panel for `layer` in a passage of `passage` seconds. */
const panel = (layer: EditText, passage = 20) => {
  const onChange = jest.fn();
  render(
    <TextLayerEditor
      text={layer}
      duration={passage}
      onChange={onChange}
      onRemove={jest.fn()}
    />,
  );
  return {
    onChange,
    start: screen.getByLabelText('videoEdit.textStart') as HTMLInputElement,
    length: screen.getByLabelText('videoEdit.textDuration') as HTMLInputElement,
  };
};

it('steps by 0.1 s and shows one decimal at most, even for a saved montage', () => {
  const { start, length } = panel(text(5.558422046246841, 3.20000000001));
  expect(start).toHaveAttribute('step', '0.1');
  expect(length).toHaveAttribute('step', '0.1');
  expect(start.value).toBe('5.6');
  expect(length.value).toBe('3.2');
});

it('rounds a start typed or pasted with too many decimals', () => {
  const { start, onChange } = panel(text(2, 3));
  fireEvent.change(start, { target: { value: '5.558422046246841' } });
  expect(onChange).toHaveBeenLastCalledWith({ startOffset: 5.6, duration: 3 });
});

it('rounds a duration typed or pasted with too many decimals', () => {
  const { length, onChange } = panel(text(2, 3));
  fireEvent.change(length, { target: { value: '1.2345' } });
  expect(onChange).toHaveBeenLastCalledWith({ startOffset: 2, duration: 1.2 });
});

it('keeps the text within its passage rather than past its end', () => {
  // Passage of 8 s: a start at 6 leaves 2 s, so a 3 s text is shortened.
  const { start, length, onChange } = panel(text(2, 3), 8);
  fireEvent.change(start, { target: { value: '6.04' } });
  expect(onChange).toHaveBeenLastCalledWith({ startOffset: 6, duration: 2 });
  fireEvent.change(length, { target: { value: '9.99' } });
  expect(onChange).toHaveBeenLastCalledWith({ startOffset: 2, duration: 6 });
  // The fields say how far they may go.
  expect(start).toHaveAttribute('max', '7.9');
  expect(length).toHaveAttribute('max', '6');
});

it('keeps the shortest text duration and a start of at least 0', () => {
  const { start, length, onChange } = panel(text(2, 3), 8);
  fireEvent.change(length, { target: { value: '0.01' } });
  expect(onChange).toHaveBeenLastCalledWith({ startOffset: 2, duration: 0.1 });
  fireEvent.change(start, { target: { value: '-1' } });
  expect(onChange).toHaveBeenLastCalledWith({ startOffset: 0, duration: 3 });
});

it('leaves an emptied field empty until it is filled', () => {
  const { start, onChange } = panel(text(2, 3));
  fireEvent.change(start, { target: { value: '' } });
  expect(onChange).toHaveBeenLastCalledWith({ startOffset: NaN });
});
