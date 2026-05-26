import { useState } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { JoinScreen } from './components/JoinScreen';
import { HostRoom } from './components/HostRoom';
import { GuestRoom } from './components/GuestRoom';

type AppState =
  | { screen: 'home' }
  | { screen: 'hosting'; hostName: string }
  | { screen: 'join-form'; roomId: string }
  | { screen: 'guest'; roomId: string; playerName: string };

function getInitialState(): AppState {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) return { screen: 'join-form', roomId: room };
  return { screen: 'home' };
}

export function App() {
  const [state, setState] = useState<AppState>(getInitialState);

  if (state.screen === 'home') {
    return (
      <HomeScreen
        onCreateRoom={(name) => setState({ screen: 'hosting', hostName: name })}
        onJoinRoom={(code) => setState({ screen: 'join-form', roomId: code })}
      />
    );
  }

  if (state.screen === 'join-form') {
    return (
      <JoinScreen
        roomId={state.roomId}
        onJoin={(name) =>
          setState({ screen: 'guest', roomId: state.roomId, playerName: name })
        }
      />
    );
  }

  if (state.screen === 'hosting') {
    return <HostRoom hostName={state.hostName} />;
  }

  if (state.screen === 'guest') {
    return <GuestRoom roomId={state.roomId} playerName={state.playerName} />;
  }

  return null;
}
