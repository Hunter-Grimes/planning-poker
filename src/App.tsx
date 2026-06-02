import { useState } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { JoinScreen } from './components/JoinScreen';
import { HostRoom } from './components/HostRoom';
import { GuestRoom } from './components/GuestRoom';
import { storage } from './storage';
import { randomId } from './types';

type AppState =
  | { screen: 'home' }
  | { screen: 'hosting'; hostName: string; roomCode?: string }
  | { screen: 'join-form'; roomId: string }
  | { screen: 'guest'; roomId: string; playerName: string; persistentId: string };

function getInitialState(): AppState {
  // URL param takes priority (shared invite link)
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) return { screen: 'join-form', roomId: room };

  // Restore host session if one exists
  const hostSession = storage.getHost();
  if (hostSession) {
    return { screen: 'hosting', hostName: hostSession.hostName, roomCode: hostSession.roomCode };
  }

  // No host session: any persisted stories are orphans from a tab close or
  // crash and would otherwise resurface in a fresh room — drop them.
  storage.clearStories();

  // Restore guest session if one exists
  const guestSession = storage.getGuest();
  if (guestSession) {
    return {
      screen: 'guest',
      roomId: guestSession.roomCode,
      playerName: guestSession.playerName,
      persistentId: guestSession.persistentId,
    };
  }

  return { screen: 'home' };
}

export function App() {
  const [state, setState] = useState<AppState>(getInitialState);

  const goHome = () => setState({ screen: 'home' });

  if (state.screen === 'home') {
    return (
      <HomeScreen
        onCreateRoom={(name) => setState({ screen: 'hosting', hostName: name })}
        onJoinRoom={(code, name) =>
          setState({
            screen: 'guest',
            roomId: code,
            playerName: name,
            persistentId: randomId(),
          })
        }
      />
    );
  }

  if (state.screen === 'join-form') {
    return (
      <JoinScreen
        roomId={state.roomId}
        onJoin={(name) =>
          setState({
            screen: 'guest',
            roomId: state.roomId,
            playerName: name,
            persistentId: randomId(),
          })
        }
      />
    );
  }

  if (state.screen === 'hosting') {
    return (
      <HostRoom
        hostName={state.hostName}
        roomCode={state.roomCode}
        onClose={goHome}
      />
    );
  }

  if (state.screen === 'guest') {
    return (
      <GuestRoom
        roomId={state.roomId}
        playerName={state.playerName}
        persistentId={state.persistentId}
        onLeave={goHome}
      />
    );
  }

  return null;
}
