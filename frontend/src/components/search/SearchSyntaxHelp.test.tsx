import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '../../testUtils/initTestI18n';
import SearchSyntaxHelp from './SearchSyntaxHelp';

const openHelp = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Aide sur la recherche avancée' }),
  );

describe('SearchSyntaxHelp', () => {
  it('opens the advanced search panel from the ? button', () => {
    render(<SearchSyntaxHelp onTryExample={jest.fn()} />);
    const button = screen.getByRole('button', {
      name: 'Aide sur la recherche avancée',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('data-tooltip', 'Recherche avancée');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openHelp();

    const panel = screen.getByRole('dialog', { name: 'Recherche avancée' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', panel.id);
    expect(screen.getByText('ffmpeg or rgpd')).toBeInTheDocument();
    expect(screen.getByText('"données personnelles"')).toBeInTheDocument();
    expect(screen.getByText('kubernetes -docker')).toBeInTheDocument();
  });

  it('runs an example and closes the panel', () => {
    const onTryExample = jest.fn();
    render(<SearchSyntaxHelp onTryExample={onTryExample} />);
    openHelp();

    fireEvent.click(screen.getByText('ffmpeg or rgpd'));

    expect(onTryExample).toHaveBeenCalledWith('ffmpeg or rgpd');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with Escape and gives the focus back to the button', () => {
    render(<SearchSyntaxHelp onTryExample={jest.fn()} />);
    openHelp();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aide sur la recherche avancée' }),
    ).toHaveFocus();
  });

  it('closes with the close button and on an outside click', () => {
    render(
      <div>
        <p>dehors</p>
        <SearchSyntaxHelp onTryExample={jest.fn()} />
      </div>,
    );
    openHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’aide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openHelp();
    fireEvent.mouseDown(screen.getByText('dehors'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
