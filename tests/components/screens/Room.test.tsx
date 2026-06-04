import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Room } from '../../../src/components/screens/Room';
import type { UseRoomReturn } from '../../../src/hooks/useRoom';
import { useRoom } from '../../../src/hooks/useRoom';
import { makeGameState, makePlayer, makeComponent } from '../../helpers/factories';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../../src/hooks/useRoom', () => ({ useRoom: vi.fn() }));

const useRoomMock = vi.mocked(useRoom);
const HOST = 'ROOM01';
const ME = 'CLIENT01';

function hook(overrides: Partial<UseRoomReturn> = {}): UseRoomReturn {
  return {
    role: 'guest',
    isPreferredHost: false,
    roomCode: HOST,
    myId: ME,
    gameState: null,
    status: 'connected',
    stalled: false,
    pendingPlayers: [],
    error: null,
    migrationNotice: null,
    vote: vi.fn(),
    signalActive: vi.fn(),
    reveal: vi.fn(),
    newRound: vi.fn(),
    restartRound: vi.fn(),
    approvePlayer: vi.fn(),
    denyPlayer: vi.fn(),
    kickPlayer: vi.fn(),
    addComponent: vi.fn(),
    removeComponent: vi.fn(),
    toggleComponent: vi.fn(),
    renameComponent: vi.fn(),
    nextComponent: vi.fn(),
    newTicket: vi.fn(),
    closeRoom: vi.fn(),
    ...overrides,
  };
}

function renderRoom(overrides: Partial<UseRoomReturn> = {}, onExit = vi.fn()) {
  const h = hook(overrides);
  useRoomMock.mockReturnValue(h);
  render(
    <Room roomCode={HOST} playerName="Me" intent="join" pinnedPubKey={null} onExit={onExit} />,
  );
  return { h, onExit };
}

const votingState = (overrides = {}) =>
  makeGameState({
    hostId: HOST,
    players: [makePlayer({ id: HOST, name: 'Host' }), makePlayer({ id: ME, name: 'Me' })],
    activeComponentId: 's1',
    components: [makeComponent({ id: 's1', label: 'Checkout' })],
    ...overrides,
  });

beforeEach(() => {
  localStorage.clear();
  useRoomMock.mockReset();
});

describe('Room — connection states', () => {
  it('shows connecting without a back-out before stalling', () => {
    renderRoom({ gameState: null, status: 'connecting', stalled: false });
    expect(screen.getByText('Connecting to room…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Home' })).not.toBeInTheDocument();
  });

  it('offers a back-out once stalled', () => {
    renderRoom({ gameState: null, status: 'connecting', stalled: true });
    expect(screen.getByText('Still trying to reach the room…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Home' })).toBeInTheDocument();
  });

  it('shows the pending-approval message', () => {
    renderRoom({ gameState: null, status: 'pending' });
    expect(screen.getByText(/Waiting for host to approve/)).toBeInTheDocument();
  });

  it('shows the error screen and exits on click', async () => {
    const user = userEvent.setup();
    const { onExit } = renderRoom({ status: 'error', error: 'The host closed the room.' });
    expect(screen.getByText('The host closed the room.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(onExit).toHaveBeenCalled();
  });
});

describe('Room — guest view', () => {
  it('shows Leave and no host controls', () => {
    renderRoom({ role: 'guest', gameState: votingState() });
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close Room' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reveal Votes/ })).not.toBeInTheDocument();
  });

  it('sends a vote when a card is clicked', async () => {
    const user = userEvent.setup();
    const { h } = renderRoom({ role: 'guest', gameState: votingState() });
    await user.click(screen.getByRole('button', { name: '5' }));
    expect(h.vote).toHaveBeenCalledWith(5);
  });

  it('shows a waiting note once revealed', () => {
    renderRoom({
      role: 'guest',
      gameState: votingState({
        revealed: true,
        players: [makePlayer({ id: ME, name: 'Me', vote: 5, hasVoted: true })],
      }),
    });
    expect(screen.getByText('Waiting for host to continue…')).toBeInTheDocument();
  });
});

describe('Room — host view', () => {
  it('shows host controls and the room code', () => {
    renderRoom({ role: 'host', isPreferredHost: true, myId: HOST, gameState: votingState() });
    expect(screen.getByRole('button', { name: 'Close Room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reveal Votes/ })).toBeInTheDocument();
    expect(screen.getByText('Components')).toBeInTheDocument();
  });

  it('closes the room and exits when Close Room is clicked', async () => {
    const user = userEvent.setup();
    const { h, onExit } = renderRoom({
      role: 'host',
      isPreferredHost: true,
      myId: HOST,
      gameState: votingState(),
    });
    await user.click(screen.getByRole('button', { name: 'Close Room' }));
    expect(h.closeRoom).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('flags a temporary host', () => {
    renderRoom({ role: 'host', isPreferredHost: false, myId: HOST, gameState: votingState() });
    expect(screen.getByText(/temporarily hosting/i)).toBeInTheDocument();
  });

  it('surfaces a migration warning notice', () => {
    renderRoom({
      role: 'guest',
      gameState: votingState(),
      migrationNotice: 'Host changed — verify this is expected.',
    });
    expect(screen.getByText(/Host changed — verify this is expected/)).toBeInTheDocument();
  });
});
