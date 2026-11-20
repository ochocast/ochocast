import React from 'react';
import { render, screen } from '@testing-library/react';
import HighlightedText from './HighlightedText';

describe('HighlightedText', () => {
  it('renders hits in mark elements', () => {
    const { container } = render(
      <HighlightedText
        parts={[
          { text: 'On a choisi ', hit: false },
          { text: 'Kubernetes', hit: true },
          { text: ' parce que', hit: false },
        ]}
      />,
    );

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('Kubernetes');
    expect(container.textContent).toBe('On a choisi Kubernetes parce que');
  });

  it('renders markup literally', () => {
    const { container } = render(
      <HighlightedText parts={[{ text: '<b>test</b>', hit: false }]} />,
    );

    expect(screen.getByText('<b>test</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });
});
