import React, { useState } from 'react';
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

it('steps by 0.01 s and shows two decimals, even for a saved montage', () => {
  const { start, length } = panel(text(5.558422046246841, 3.20000000001));
  expect(start).toHaveAttribute('step', '0.01');
  expect(length).toHaveAttribute('step', '0.01');
  expect(start.value).toBe('5.56');
  expect(length.value).toBe('3.20');
});

/** The panel inside an editor that keeps the text it is given. */
function Editing({ initial }: { initial: EditText }) {
  const [layer, setLayer] = useState(initial);
  return (
    <TextLayerEditor
      text={layer}
      duration={20}
      onChange={(patch) => setLayer((l) => ({ ...l, ...patch }))}
      onRemove={jest.fn()}
    />
  );
}

it('keeps what is typed, then shows the rounded value on validation', () => {
  render(<Editing initial={text(2, 3)} />);
  const start = screen.getByLabelText(
    'videoEdit.textStart',
  ) as HTMLInputElement;
  fireEvent.change(start, { target: { value: '5.558422' } });
  // Typing is never rewritten under the cursor.
  expect(start.value).toBe('5.558422');
  fireEvent.blur(start);
  expect(start.value).toBe('5.56');
  // Enter validates too.
  fireEvent.change(start, { target: { value: '7.1' } });
  fireEvent.keyDown(start, { key: 'Enter' });
  expect(start.value).toBe('7.10');
});

it('rounds a start typed or pasted with too many decimals', () => {
  const { start, onChange } = panel(text(2, 3));
  fireEvent.change(start, { target: { value: '5.558422046246841' } });
  expect(onChange).toHaveBeenLastCalledWith({
    startOffset: 5.56,
    duration: 3,
  });
});

it('rounds a duration typed or pasted with too many decimals', () => {
  const { length, onChange } = panel(text(2, 3));
  fireEvent.change(length, { target: { value: '1.2345' } });
  expect(onChange).toHaveBeenLastCalledWith({
    startOffset: 2,
    duration: 1.23,
  });
});

it('keeps the text within its passage rather than past its end', () => {
  // Passage of 8 s: a start at 6.04 leaves 1.96 s, so a 3 s text is shortened.
  const { start, length, onChange } = panel(text(2, 3), 8);
  fireEvent.change(start, { target: { value: '6.041' } });
  expect(onChange).toHaveBeenLastCalledWith({
    startOffset: 6.04,
    duration: 1.96,
  });
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
