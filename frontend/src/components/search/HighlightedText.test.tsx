import React from 'react';
import { render, screen } from '@testing-library/react';
import HighlightedText from './HighlightedText';

describe('HighlightedText', () => {
  it('renders hits in mark elements', () => {
    render(
      <p>
        <HighlightedText
          parts={[
            { text: 'On a choisi ', hit: false },
            { text: 'Kubernetes', hit: true },
            { text: ' parce que', hit: false },
          ]}
        />
      </p>,
    );

    const marks = screen.getAllByText('Kubernetes', { selector: 'mark' });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('Kubernetes');
    expect(screen.getByText('On a choisi', { exact: false })).toHaveTextContent(
      'On a choisi Kubernetes parce que',
    );
  });

  it('renders markup literally', () => {
    render(<HighlightedText parts={[{ text: '<b>test</b>', hit: false }]} />);

    expect(screen.getByText('<b>test</b>')).toBeInTheDocument();
  });
});
