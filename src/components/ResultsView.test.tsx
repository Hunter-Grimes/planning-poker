import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { ResultsView } from './ResultsView';
import { makeGameState, voter } from '../test/factories';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const confettiMock = vi.mocked(confetti);

beforeEach(() => {
  confettiMock.mockClear();
});

describe('ResultsView', () => {
  it('renders a chip per connected vote and the average', () => {
    const state = makeGameState({ players: [voter('Alice', 2), voter('Bob', 8)] });
    render(<ResultsView gameState={state} />);
    expect(screen.getByText('Alice:')).toBeInTheDocument();
    expect(screen.getByText('Bob:')).toBeInTheDocument();
    // (2 + 8) / 2 = 5.0
    expect(screen.getByText('5.0')).toBeInTheDocument();
  });

  it('renders nothing when no one has voted', () => {
    const { container } = render(<ResultsView gameState={makeGameState()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires confetti once when there is consensus', () => {
    const state = makeGameState({ players: [voter('Alice', 5), voter('Bob', 5)] });
    const { rerender } = render(<ResultsView gameState={state} />);
    expect(confettiMock).toHaveBeenCalledTimes(1);

    // A re-render of the same reveal must not re-fire.
    rerender(<ResultsView gameState={{ ...state }} />);
    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  it('does not fire confetti without consensus', () => {
    const state = makeGameState({ players: [voter('Alice', 5), voter('Bob', 8)] });
    render(<ResultsView gameState={state} />);
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('fires again for a new round', () => {
    const players = [voter('Alice', 5), voter('Bob', 5)];
    const { rerender } = render(<ResultsView gameState={makeGameState({ round: 1, players })} />);
    expect(confettiMock).toHaveBeenCalledTimes(1);

    rerender(<ResultsView gameState={makeGameState({ round: 2, players })} />);
    expect(confettiMock).toHaveBeenCalledTimes(2);
  });
});
