import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '../../testUtils/initTestI18n';
import PassageStrip, { StripPassage } from './PassageStrip';

const passages: StripPassage[] = [
  { start: 95, excerpt: 'on ouvre la séance' },
  { start: 1012, excerpt: 'le budget est voté' },
  { start: 2560, excerpt: 'conclusion du budget' },
];

let trackWidth = 1000;
const OriginalResizeObserver = (global as { ResizeObserver?: unknown })
  .ResizeObserver;

beforeEach(() => {
  trackWidth = 1000;
  class ResizeObserverStub {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: trackWidth } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  (global as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  (global as { ResizeObserver?: unknown }).ResizeObserver =
    OriginalResizeObserver;
});

const renderStrip = (
  props: Partial<React.ComponentProps<typeof PassageStrip>> = {},
) => {
  const onSeek = jest.fn();
  const utils = render(
    <PassageStrip
      duration={2712}
      passages={passages}
      currentTime={0}
      isTouch={false}
      onSeek={onSeek}
      {...props}
    />,
  );
  return { onSeek, ...utils };
};

describe('PassageStrip', () => {
  it('renders nothing without passages or without a known duration', () => {
    const { container, rerender } = renderStrip({ passages: [] });
    expect(container).toBeEmptyDOMElement();
    rerender(
      <PassageStrip
        duration={null}
        passages={passages}
        currentTime={0}
        isTouch={false}
        onSeek={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <PassageStrip
        duration={0}
        passages={passages}
        currentTime={0}
        isTouch={false}
        onSeek={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('seeks on click', () => {
    const { onSeek } = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: /Aller à 16:52/ }));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(1012);
  });

  it('labels markers for screen readers', () => {
    renderStrip();
    expect(
      screen.getByRole('button', {
        name: 'Aller à 16:52 : le budget est voté',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: /Aller à 1:35 : / }),
    ).toHaveAttribute('type', 'button');
  });

  it('highlights the current passage', () => {
    const { rerender } = renderStrip({ currentTime: 1100 });
    const current = screen.getByRole('button', { name: /Aller à 16:52/ });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: /Aller à 1:35/ }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('button', { name: /Aller à 42:40/ }),
    ).not.toHaveAttribute('aria-current');
    // before the first passage: nothing is current
    rerender(
      <PassageStrip
        duration={2712}
        passages={passages}
        currentTime={10}
        isTouch={false}
        onSeek={jest.fn()}
      />,
    );
    screen.getAllByRole('button').forEach((button) => {
      expect(button).not.toHaveAttribute('aria-current');
    });
  });

  it('shows a tooltip on hover only without touch', () => {
    const { unmount } = renderStrip();
    const button = screen.getByRole('button', { name: /Aller à 16:52/ });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '16:52 · le budget est voté',
    );
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    unmount();

    renderStrip({ isTouch: true });
    const touchButton = screen.getByRole('button', { name: /Aller à 16:52/ });
    fireEvent.mouseEnter(touchButton);
    fireEvent.focus(touchButton);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('groups markers that are too close, with a count', () => {
    trackWidth = 331;
    const close: StripPassage[] = [
      { start: 100, excerpt: 'premier' },
      { start: 101, excerpt: 'deuxième' },
      { start: 102, excerpt: 'troisième' },
      { start: 2000, excerpt: 'loin' },
    ];
    const { onSeek } = renderStrip({ passages: close, isTouch: true });
    expect(screen.getAllByRole('button')).toHaveLength(2);
    const group = screen.getByRole('button', {
      name: 'Aller à 1:40 : premier (+2 passages)',
    });
    expect(group).toHaveTextContent('3');
    fireEvent.click(group);
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it('reaches a passage with a fractional start from its whole second', () => {
    renderStrip({
      passages: [
        { start: 95, excerpt: 'on ouvre la séance' },
        { start: 1012.48, excerpt: 'le budget est voté' },
      ],
      currentTime: 1012,
    });
    expect(
      screen.getByRole('button', { name: /Aller à 16:52/ }),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: /Aller à 1:35/ }),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks a group as current when it contains the current passage', () => {
    trackWidth = 331;
    const close: StripPassage[] = [
      { start: 100, excerpt: 'premier' },
      { start: 101, excerpt: 'deuxième' },
      { start: 2000, excerpt: 'loin' },
    ];
    renderStrip({ passages: close, isTouch: true, currentTime: 101.5 });
    expect(
      screen.getByRole('button', { name: /Aller à 1:40/ }),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('shows a playback cursor that follows the current time', () => {
    const { container } = renderStrip({ currentTime: 1356 });
    const cursor = container.querySelector('[data-testid="passage-cursor"]');
    expect(cursor).toHaveAttribute('aria-hidden', 'true');
    expect(cursor).toHaveStyle({ left: '50%' });
  });

  it('keeps the cursor inside the strip', () => {
    const { container } = renderStrip({ currentTime: 99999 });
    expect(
      container.querySelector('[data-testid="passage-cursor"]'),
    ).toHaveStyle({ left: '100%' });
  });

  it('works without ResizeObserver', () => {
    (global as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    renderStrip();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('updates the grouping when the track is resized', () => {
    let notify: (width: number) => void = () => {};
    (global as { ResizeObserver?: unknown }).ResizeObserver = class {
      private callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        notify = (width) =>
          act(() => {
            this.callback(
              [{ contentRect: { width } } as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            );
          });
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const close: StripPassage[] = [
      { start: 100, excerpt: 'a' },
      { start: 160, excerpt: 'b' },
    ];
    renderStrip({ passages: close, isTouch: true });
    expect(screen.getAllByRole('button')).toHaveLength(2);
    notify(300);
    // 60 s on 2712 s over 300 px is about 6.6 px: grouped under 44 px
    expect(screen.getAllByRole('button')).toHaveLength(1);
    notify(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
