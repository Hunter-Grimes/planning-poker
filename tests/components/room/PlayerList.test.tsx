import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerList } from '../../../src/components/room/PlayerList';
import { makeGameState, makePlayer } from '../../helpers/factories';

describe('PlayerList', () => {
  it('shows a "voted" check from the hasVoted flag even when the value is redacted', () => {
    const state = makeGameState({
      players: [makePlayer({ id: 'p1', name: 'Alice', hasVoted: true, vote: null })],
    });
    render(<PlayerList gameState={state} myId={null} hostId={null} />);
    expect(screen.getByLabelText('Alice has voted')).toBeInTheDocument();
  });

  it('falls back to vote !== null when hasVoted is absent', () => {
    const state = makeGameState({
      players: [makePlayer({ id: 'p1', name: 'Bob', vote: 5 })],
    });
    render(<PlayerList gameState={state} myId={null} hostId={null} />);
    expect(screen.getByLabelText('Bob has voted')).toBeInTheDocument();
  });

  it('reveals the vote value only once revealed', () => {
    const state = makeGameState({
      revealed: true,
      players: [makePlayer({ id: 'p1', name: 'Bob', vote: 5, hasVoted: true })],
    });
    render(<PlayerList gameState={state} myId={null} hostId={null} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows a "considering" indicator for an active player who has not voted', () => {
    const state = makeGameState({
      players: [makePlayer({ id: 'p1', name: 'Carol', vote: null, active: true })],
    });
    render(<PlayerList gameState={state} myId={null} hostId={null} />);
    expect(screen.getByLabelText('Carol is considering')).toBeInTheDocument();
  });

  it('renders a kick control for others but not for me', async () => {
    const user = userEvent.setup();
    const onKick = vi.fn();
    const state = makeGameState({
      players: [makePlayer({ id: 'me', name: 'Me' }), makePlayer({ id: 'other', name: 'Other' })],
    });
    render(<PlayerList gameState={state} myId="me" hostId="me" onKick={onKick} />);

    expect(screen.queryByLabelText('Remove Me')).not.toBeInTheDocument();
    const kick = screen.getByLabelText('Remove Other');
    await user.click(kick);
    expect(onKick).toHaveBeenCalledWith('other');
  });

  it('marks the host with a host icon', () => {
    const state = makeGameState({
      players: [makePlayer({ id: 'host', name: 'Host' })],
    });
    render(<PlayerList gameState={state} myId={null} hostId="host" />);
    expect(screen.getByLabelText('Host')).toBeInTheDocument();
  });

  it('hides disconnected players until the round is revealed', () => {
    const state = makeGameState({
      players: [makePlayer({ id: 'gone', name: 'Ghost', connected: false })],
    });
    const { rerender } = render(<PlayerList gameState={state} myId={null} hostId={null} />);
    expect(screen.queryByText('Ghost')).not.toBeInTheDocument();

    rerender(<PlayerList gameState={{ ...state, revealed: true }} myId={null} hostId={null} />);
    expect(screen.getByText('Ghost')).toBeInTheDocument();
  });
});
