import React from 'react';
import { act, render } from '@testing-library/react';
import EditPreview from './EditPreview';
let mockTime = 0;
let mockProps: any;
const mockSeek = jest.fn((seconds: number) => {
  mockTime = seconds;
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-player/lazy', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      mockProps = props;
      React.useImperativeHandle(ref, () => ({
        getCurrentTime: () => mockTime,
        seekTo: mockSeek,
      }));
      return <video />;
    }),
  };
});
it('does not seek again on repeated canplay events at the desired location', () => {
  mockTime = 0;
  mockSeek.mockReset().mockImplementation((seconds: number) => {
    mockTime = seconds;
  });
  render(
    <EditPreview
      url="original.mp4"
      segments={[
        { key: 'one', sourceStart: 120, sourceEnd: 140, textLayers: [] },
      ]}
      time={0}
      onTime={jest.fn()}
    />,
  );
  expect(mockSeek).toHaveBeenCalledWith(120, 'seconds');
  mockSeek.mockClear();
  act(() => mockProps.onReady());
  act(() => mockProps.onReady());
  expect(mockSeek).not.toHaveBeenCalled();
});
