import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestRoom } from '../../src/components/GuestRoom';
import type { UsePeerClientReturn, ConnectionStatus } from '../../src/hooks/usePeerClient';
import { usePeerClient } from '../../src/hooks/usePeerClient';
import { storage } from '../../src/storage';
import { makeGameState, makePlayer, makeComponent } from '../helpers/factories';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../src/hooks/usePeerClient', () => ({ usePeerClient: vi.fn() }));

const usePeerClientMock = vi.mocked(usePeerClient);

const ME = 'CLIENT01';

function clientHook(overrides: Partial<UsePeerClientReturn> = {}): UsePeerClientReturn {
  return {
    gameState: null,
    status: 'connected' as ConnectionStatus,
    myId: ME,
    error: null,
    vote: vi.fn(),
    signalActive: vi.fn(),
    ...overrides,
  };
}

function renderGuest(overrides: Partial<UsePeerClientReturn> = {}, onLeave = vi.fn()) {
  const hook = clientHook(overrides);
  usePeerClientMock.mockReturnValue(hook);
  render(<GuestRoom roomId="ROOM01" playerName="Guest" persistentId="pid-g" onLeave={onLeave} />);
  return { hook, onLeave };
}

const connectedState = (overrides = {}) =>
  makeGameState({
    hostId: 'host',
    players: [makePlayer({ id: ME, name: 'Guest' })],
    ...overrides,
  });

beforeEach(() => {
  localStorage.clear();
  usePeerClientMock.mockReset();
});

describe('GuestRoom — connection states', () => {
  it('shows the connecting message', () => {
    renderGuest({ status: 'connecting', gameState: null });
    expect(screen.getByText('Connecting to room…')).toBeInTheDocument();
  });

  it('shows the pending-approval message', () => {
    renderGuest({ status: 'pending', gameState: null });
    expect(screen.getByText(/Waiting for host to approve/)).toBeInTheDocument();
  });

  it('shows the loading message when connected but no state yet', () => {
    renderGuest({ status: 'connected', gameState: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the disconnected screen and leaves on click', async () => {
    const user = userEvent.setup();
    const { onLeave } = renderGuest({ status: 'disconnected', gameState: null });
    expect(screen.getByText('Disconnected from room.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('shows the error reason and clears the saved guest session', async () => {
    const user = userEvent.setup();
    storage.saveGuest({ roomCode: 'ROOM01', playerName: 'Guest', persistentId: 'pid-g' });
    const { onLeave } = renderGuest({ status: 'error', error: 'Room is full', gameState: null });
    expect(screen.getByText('Room is full')).toBeInTheDocument();
    expect(storage.getGuest()).toBeNull(); // cleared by the error effect

    await user.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(onLeave).toHaveBeenCalled();
  });
});

describe('GuestRoom — connected gameplay', () => {
  it('persists the guest session once connected', () => {
    renderGuest({ status: 'connected', gameState: connectedState() });
    expect(storage.getGuest()).toEqual({
      roomCode: 'ROOM01',
      playerName: 'Guest',
      persistentId: 'pid-g',
    });
  });

  it('shows the round, the voted counter and the active component banner', () => {
    renderGuest({
      status: 'connected',
      gameState: connectedState({
        round: 2,
        activeComponentId: 's1',
        components: [makeComponent({ id: 's1', label: 'Checkout' })],
      }),
    });
    expect(screen.getByText('2', { selector: 'span' })).toBeInTheDocument(); // round, not the "2" card
    expect(screen.getByText('0/1 voted')).toBeInTheDocument();
    expect(screen.getByText('Checkout')).toBeInTheDocument();
  });

  it('counts votes from the redacted hasVoted flag', () => {
    renderGuest({
      status: 'connected',
      gameState: connectedState({
        players: [
          makePlayer({ id: ME, name: 'Guest', hasVoted: true, vote: null }),
          makePlayer({ id: 'g2', name: 'Other', hasVoted: false, vote: null }),
        ],
      }),
    });
    expect(screen.getByText('1/2 voted')).toBeInTheDocument();
  });

  it('sends a vote when a card is clicked', async () => {
    const user = userEvent.setup();
    const { hook } = renderGuest({ status: 'connected', gameState: connectedState() });
    await user.click(screen.getByRole('button', { name: '5' }));
    expect(hook.vote).toHaveBeenCalledWith(5);
  });

  it('hides the deck and shows a waiting note once revealed', () => {
    renderGuest({
      status: 'connected',
      gameState: connectedState({
        revealed: true,
        players: [makePlayer({ id: ME, name: 'Guest', vote: 5, hasVoted: true })],
      }),
    });
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for host to continue…')).toBeInTheDocument();
  });

  it('renders the read-only summary in the summary phase', () => {
    renderGuest({
      status: 'connected',
      gameState: connectedState({
        phase: 'summary',
        activeComponentId: null,
        components: [
          makeComponent({ id: 's1', label: 'A', average: 2 }),
          makeComponent({ id: 's2', label: 'B', average: 5 }),
        ],
      }),
    });
    expect(screen.getByText('Estimate Summary')).toBeInTheDocument();
    const totalRow = screen.getByText('Total').closest('div')!;
    expect(within(totalRow).getByText('7.0')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for host to start next ticket/)).toBeInTheDocument();
  });
});
