import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HostRoom } from './HostRoom';
import type { UsePeerHostReturn } from '../hooks/usePeerHost';
import { usePeerHost } from '../hooks/usePeerHost';
import { makeGameState, makePlayer, makeStory } from '../test/factories';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../hooks/usePeerHost', () => ({ usePeerHost: vi.fn() }));

const usePeerHostMock = vi.mocked(usePeerHost);

const ROOM = 'ROOM01';

function hostHook(overrides: Partial<UsePeerHostReturn> = {}): UsePeerHostReturn {
  return {
    roomId: ROOM,
    gameState: makeGameState({
      hostId: ROOM,
      players: [makePlayer({ id: ROOM, name: 'Host' })],
    }),
    pendingPlayers: [],
    error: null,
    reveal: vi.fn(),
    newRound: vi.fn(),
    approvePlayer: vi.fn(),
    denyPlayer: vi.fn(),
    kickPlayer: vi.fn(),
    castHostVote: vi.fn(),
    castHostActive: vi.fn(),
    addStory: vi.fn(),
    removeStory: vi.fn(),
    toggleStory: vi.fn(),
    renameStory: vi.fn(),
    nextStory: vi.fn(),
    newSprint: vi.fn(),
    ...overrides,
  };
}

function renderHost(overrides: Partial<UsePeerHostReturn> = {}, onClose = vi.fn()) {
  const hook = hostHook(overrides);
  usePeerHostMock.mockReturnValue(hook);
  render(<HostRoom hostName="Host" roomCode={ROOM} onClose={onClose} />);
  return { hook, onClose };
}

beforeEach(() => {
  localStorage.clear();
  usePeerHostMock.mockReset();
});

describe('HostRoom — connection states', () => {
  it('shows a loading message before the room id is assigned', () => {
    renderHost({ roomId: null });
    expect(screen.getByText('Creating room…')).toBeInTheDocument();
  });

  it('shows the error screen and returns home on click', async () => {
    const user = userEvent.setup();
    const { onClose } = renderHost({ error: 'boom' });
    expect(screen.getByText(/Connection error: boom/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('HostRoom — voting phase', () => {
  it('renders the round and the voted counter', () => {
    renderHost();
    expect(screen.getByText('Round')).toBeInTheDocument();
    expect(screen.getByText('0/1 voted')).toBeInTheDocument();
  });

  it('disables Restart and Reveal until at least one vote is in', () => {
    renderHost();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reveal Votes/ })).toBeDisabled();
  });

  it('labels Reveal with progress until everyone has voted', () => {
    renderHost({
      gameState: makeGameState({
        hostId: ROOM,
        players: [makePlayer({ id: ROOM, name: 'Host' }), makePlayer({ id: 'g1', name: 'A' })],
      }),
    });
    expect(screen.getByRole('button', { name: 'Reveal Votes (0/2)' })).toBeInTheDocument();
  });

  it('shows the bare Reveal label and calls reveal() once all have voted', async () => {
    const user = userEvent.setup();
    const { hook } = renderHost({
      gameState: makeGameState({
        hostId: ROOM,
        players: [makePlayer({ id: ROOM, name: 'Host', vote: 5 })],
      }),
    });
    const revealBtn = screen.getByRole('button', { name: 'Reveal Votes' });
    expect(revealBtn).toBeEnabled();
    await user.click(revealBtn);
    expect(hook.reveal).toHaveBeenCalled();
  });

  it('auto-reveals when the toggle is on and everyone has voted', async () => {
    const user = userEvent.setup();
    const { hook } = renderHost({
      gameState: makeGameState({
        hostId: ROOM,
        players: [makePlayer({ id: ROOM, name: 'Host', vote: 5 })],
      }),
    });
    expect(hook.reveal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Auto/ }));
    expect(hook.reveal).toHaveBeenCalled();
  });

  it('casts the host vote when a card is clicked', async () => {
    const user = userEvent.setup();
    const { hook } = renderHost();
    await user.click(screen.getByRole('button', { name: '8' }));
    expect(hook.castHostVote).toHaveBeenCalledWith(8);
  });
});

describe('HostRoom — pending approvals', () => {
  it('approves and denies waiting players', async () => {
    const user = userEvent.setup();
    const { hook } = renderHost({
      pendingPlayers: [{ id: 'g1', name: 'Alice', persistentId: 'pid-a' }],
    });
    expect(screen.getByText('Waiting to join (1)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(hook.approvePlayer).toHaveBeenCalledWith('g1');

    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(hook.denyPlayer).toHaveBeenCalledWith('g1');
  });
});

describe('HostRoom — revealed and summary controls', () => {
  it('offers Re-vote and Finish on the last story', async () => {
    const user = userEvent.setup();
    const { hook } = renderHost({
      gameState: makeGameState({
        hostId: ROOM,
        revealed: true,
        activeStoryId: 's1',
        stories: [makeStory({ id: 's1', label: 'Only', average: null })],
        players: [makePlayer({ id: ROOM, name: 'Host', vote: 5 })],
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Re-vote' }));
    expect(hook.newRound).toHaveBeenCalled();

    const finish = screen.getByRole('button', { name: 'Finish' });
    await user.click(finish);
    expect(hook.nextStory).toHaveBeenCalled();
  });

  it('labels the advance button "Next Component" when more stories remain', () => {
    renderHost({
      gameState: makeGameState({
        hostId: ROOM,
        revealed: true,
        activeStoryId: 's1',
        stories: [makeStory({ id: 's1' }), makeStory({ id: 's2' })],
        players: [makePlayer({ id: ROOM, name: 'Host', vote: 5 })],
      }),
    });
    expect(screen.getByRole('button', { name: 'Next Component' })).toBeInTheDocument();
  });

  it('renders the summary with a total and starts a new ticket', async () => {
    const user = userEvent.setup();
    const { hook } = renderHost({
      gameState: makeGameState({
        hostId: ROOM,
        phase: 'summary',
        activeStoryId: null,
        stories: [
          makeStory({ id: 's1', label: 'A', average: 3 }),
          makeStory({ id: 's2', label: 'B', average: 5 }),
        ],
        players: [makePlayer({ id: ROOM, name: 'Host' })],
      }),
    });
    expect(screen.getByText('Estimate Summary')).toBeInTheDocument();
    const totalRow = screen.getByText('Total').closest('div')!;
    expect(within(totalRow).getByText('8.0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New Ticket' }));
    expect(hook.newSprint).toHaveBeenCalled();
  });
});

describe('HostRoom — sprint backlog', () => {
  const withActiveStory = () =>
    renderHost({
      gameState: makeGameState({
        hostId: ROOM,
        activeStoryId: 's1',
        stories: [makeStory({ id: 's1', label: 'Active', enabled: true, average: null })],
        players: [makePlayer({ id: ROOM, name: 'Host' })],
      }),
    });

  it('adds a component through the expandable panel', async () => {
    const user = userEvent.setup();
    const { hook } = renderHost();
    await user.click(screen.getByRole('button', { name: /Components/ }));
    await user.type(screen.getByPlaceholderText('Add a component…'), 'Login flow');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(hook.addStory).toHaveBeenCalledWith('Login flow');
  });

  it('toggles a story in and out of voting', async () => {
    const user = userEvent.setup();
    const { hook } = withActiveStory();
    await user.click(screen.getByRole('button', { name: /Components/ }));
    await user.click(screen.getByTitle('Exclude from voting'));
    expect(hook.toggleStory).toHaveBeenCalledWith('s1');
  });

  it('removes a story', async () => {
    const user = userEvent.setup();
    const { hook } = withActiveStory();
    await user.click(screen.getByRole('button', { name: /Components/ }));
    await user.click(screen.getByTitle('Remove component'));
    expect(hook.removeStory).toHaveBeenCalledWith('s1');
  });

  it('renames the active story on Enter', async () => {
    const user = userEvent.setup();
    const { hook } = withActiveStory();
    await user.click(screen.getByRole('button', { name: /Components/ }));
    await user.click(screen.getByRole('button', { name: 'Rename component' }));
    const input = screen.getByDisplayValue('Active');
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    expect(hook.renameStory).toHaveBeenCalledWith('s1', 'Renamed');
  });
});

describe('HostRoom — copy room code', () => {
  it('flips to a copied indicator when the code button is clicked', async () => {
    const user = userEvent.setup();
    renderHost();
    await user.click(screen.getByRole('button', { name: 'Copy room code' }));
    expect(await screen.findByText('Code copied')).toBeInTheDocument();
  });
});
