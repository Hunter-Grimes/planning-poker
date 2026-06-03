import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDeck } from '../../../src/components/room/CardDeck';
import { FIBONACCI_CARDS } from '../../../src/domain/types';

describe('CardDeck', () => {
  it('renders a button for every Fibonacci card', () => {
    render(<CardDeck selected={null} onSelect={vi.fn()} />);
    for (const card of FIBONACCI_CARDS) {
      expect(screen.getByRole('button', { name: String(card) })).toBeInTheDocument();
    }
  });

  it('calls onSelect with the clicked card value', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CardDeck selected={null} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: '8' }));
    expect(onSelect).toHaveBeenCalledWith(8);
  });

  it('fires onActivate at most once per stage after a hover settles', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const { rerender } = render(
      <CardDeck selected={null} onSelect={vi.fn()} onActivate={onActivate} stageKey="round-1" />,
    );

    await user.hover(screen.getByRole('button', { name: '3' }));
    await user.hover(screen.getByRole('button', { name: '5' }));
    await waitFor(() => expect(onActivate).toHaveBeenCalledTimes(1));

    // Stage changes → one more activation allowed.
    rerender(
      <CardDeck selected={null} onSelect={vi.fn()} onActivate={onActivate} stageKey="round-2" />,
    );
    await user.hover(screen.getByRole('button', { name: '8' }));
    await waitFor(() => expect(onActivate).toHaveBeenCalledTimes(2));
  });

  it('cancels the pending active signal when a vote follows the hover', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onSelect = vi.fn();
    render(
      <CardDeck selected={null} onSelect={onSelect} onActivate={onActivate} stageKey="round-1" />,
    );

    // A touch tap synthesizes a hover immediately before the click; the vote
    // must cancel the not-yet-fired active signal.
    const card = screen.getByRole('button', { name: '8' });
    await user.hover(card);
    await user.click(card);

    expect(onSelect).toHaveBeenCalledWith(8);
    // Let the settle window elapse — active must never fire.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(onActivate).not.toHaveBeenCalled();
  });
});
