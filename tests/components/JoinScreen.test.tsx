import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoinScreen } from '../../src/components/JoinScreen';

describe('JoinScreen', () => {
  it('displays the room code', () => {
    render(<JoinScreen roomId="ABC234" onJoin={vi.fn()} />);
    expect(screen.getByText('ABC234')).toBeInTheDocument();
  });

  it('disables Join until a name is entered, then sends the trimmed name', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<JoinScreen roomId="ABC234" onJoin={onJoin} />);

    const btn = screen.getByRole('button', { name: 'Join Session' });
    expect(btn).toBeDisabled();

    await user.type(screen.getByPlaceholderText('e.g. Bob'), '  Carol  ');
    expect(btn).toBeEnabled();

    await user.click(btn);
    expect(onJoin).toHaveBeenCalledWith('Carol');
  });

  it('joins on Enter when a name is present', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<JoinScreen roomId="ABC234" onJoin={onJoin} />);
    await user.type(screen.getByPlaceholderText('e.g. Bob'), 'Dave{Enter}');
    expect(onJoin).toHaveBeenCalledWith('Dave');
  });
});
