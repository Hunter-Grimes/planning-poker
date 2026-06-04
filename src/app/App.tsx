import { useState } from 'react';
import { HomeScreen, JoinScreen, Room } from '../components/screens';
import { storage } from '../lib/storage';
import { generateRoomCode } from '../domain/gameLogic';
import type { RoomIntent } from '../hooks/useRoom';

type AppState =
  | { screen: 'home' }
  | { screen: 'join-form'; roomId: string; pinnedPubKey: string | null }
  | {
      screen: 'room';
      roomCode: string;
      playerName: string;
      intent: RoomIntent;
      pinnedPubKey: string | null;
    };

// Read the preferred-host public key from the invite-link fragment (#k=...).
// Fragments never reach the broker/server, so this is a P2P-only channel.
function pinnedPubKeyFromHash(): string | null {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    return new URLSearchParams(hash).get('k');
  } catch {
    return null;
  }
}

// Decide which screen to open on first load. NOTE: this also clears orphaned
// components when there's no host session to own them.
function resolveInitialState(): AppState {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    return { screen: 'join-form', roomId: room, pinnedPubKey: pinnedPubKeyFromHash() };
  }

  // Restore a host session → reclaim the room as the preferred host.
  const hostSession = storage.getHost();
  if (hostSession) {
    return {
      screen: 'room',
      roomCode: hostSession.roomCode,
      playerName: hostSession.hostName,
      intent: 'create',
      pinnedPubKey: null,
    };
  }

  // No host session: any persisted components are orphans — drop them.
  storage.clearComponents();

  // Restore a guest session → rejoin (and re-elect a host if needed).
  const guestSession = storage.getGuest();
  if (guestSession) {
    return {
      screen: 'room',
      roomCode: guestSession.roomCode,
      playerName: guestSession.playerName,
      intent: 'join',
      pinnedPubKey: null,
    };
  }

  return { screen: 'home' };
}

export function App() {
  const [state, setState] = useState<AppState>(resolveInitialState);

  const goHome = () => setState({ screen: 'home' });

  switch (state.screen) {
    case 'home':
      return (
        <HomeScreen
          onCreateRoom={(name) =>
            setState({
              screen: 'room',
              roomCode: generateRoomCode(),
              playerName: name,
              intent: 'create',
              pinnedPubKey: null,
            })
          }
          onJoinRoom={(code, name) =>
            setState({
              screen: 'room',
              roomCode: code,
              playerName: name,
              intent: 'join',
              pinnedPubKey: null,
            })
          }
        />
      );
    case 'join-form':
      return (
        <JoinScreen
          roomId={state.roomId}
          onJoin={(name) =>
            setState({
              screen: 'room',
              roomCode: state.roomId,
              playerName: name,
              intent: 'join',
              pinnedPubKey: state.pinnedPubKey,
            })
          }
        />
      );
    case 'room':
      return (
        <Room
          roomCode={state.roomCode}
          playerName={state.playerName}
          intent={state.intent}
          pinnedPubKey={state.pinnedPubKey}
          onExit={goHome}
        />
      );
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
