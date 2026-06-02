import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDeck } from '../../src/components/CardDeck';
import { FIBONACCI_CARDS } from '../../src/types';

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

  it('disables every card and blocks selection when disabled', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CardDeck selected={null} onSelect={onSelect} disabled />);
    const five = screen.getByRole('button', { name: '5' });
    expect(five).toBeDisabled();
    await user.click(five);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fires onActivate at most once per stage on mouse enter', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const { rerender } = render(
      <CardDeck selected={null} onSelect={vi.fn()} onActivate={onActivate} stageKey="round-1" />,
    );

    await user.hover(screen.getByRole('button', { name: '3' }));
    await user.hover(screen.getByRole('button', { name: '5' }));
    expect(onActivate).toHaveBeenCalledTimes(1);

    // Stage changes → one more activation allowed.
    rerender(
      <CardDeck selected={null} onSelect={vi.fn()} onActivate={onActivate} stageKey="round-2" />,
    );
    await user.hover(screen.getByRole('button', { name: '8' }));
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('does not fire onActivate when disabled', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <CardDeck
        selected={null}
        onSelect={vi.fn()}
        onActivate={onActivate}
        stageKey="round-1"
        disabled
      />,
    );
    await user.hover(screen.getByRole('button', { name: '3' }));
    expect(onActivate).not.toHaveBeenCalled();
  });
});
