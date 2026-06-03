import { useState } from 'react';
import { GuestRoom, HomeScreen, HostRoom, JoinScreen } from '../components/screens';
import { storage } from '../lib/storage';
import { randomId } from '../lib/id';

type AppState =
  | { screen: 'home' }
  | { screen: 'hosting'; hostName: string; roomCode?: string }
  | { screen: 'join-form'; roomId: string }
  | { screen: 'guest'; roomId: string; playerName: string; persistentId: string };

// Decide which screen to open on first load. NOTE: this also has a side effect —
// it clears orphaned components when there's no host session to own them (see
// below). Called once via the lazy useState initializer.
function resolveInitialState(): AppState {
  // URL param takes priority (shared invite link)
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) return { screen: 'join-form', roomId: room };

  // Restore host session if one exists
  const hostSession = storage.getHost();
  if (hostSession) {
    return { screen: 'hosting', hostName: hostSession.hostName, roomCode: hostSession.roomCode };
  }

  // No host session: any persisted components are orphans from a tab close or
  // crash and would otherwise resurface in a fresh room — drop them.
  storage.clearComponents();

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
  const [state, setState] = useState<AppState>(resolveInitialState);

  const goHome = () => setState({ screen: 'home' });

  switch (state.screen) {
    case 'home':
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
    case 'join-form':
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
    case 'hosting':
      return <HostRoom hostName={state.hostName} roomCode={state.roomCode} onClose={goHome} />;
    case 'guest':
      return (
        <GuestRoom
          roomId={state.roomId}
          playerName={state.playerName}
          persistentId={state.persistentId}
          onLeave={goHome}
        />
      );
    default: {
      // Exhaustiveness guard: if a new screen is added to AppState without a
      // matching case above, this assignment fails to compile.
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
