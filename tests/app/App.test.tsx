import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';
import { storage } from '../../src/lib/storage';
import { makeComponent } from '../helpers/factories';

// App's only job is routing: pick a screen from the URL + saved sessions and
// wire props in. Stub the screens (as components returning a marker string) so
// these tests exercise that decision in isolation. Markers echo the props.
vi.mock('../../src/components/screens', () => ({
  HomeScreen: () => 'home-screen',
  JoinScreen: (props: { roomId: string }) => `join-screen:${props.roomId}`,
  Room: (props: { roomCode: string; playerName: string; intent: string }) =>
    `room:${props.intent}:${props.roomCode}:${props.playerName}`,
}));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('App — initial routing', () => {
  it('opens the home screen when there is no session or invite link', () => {
    render(<App />);
    expect(screen.getByText('home-screen')).toBeInTheDocument();
  });

  it('restores a create-intent room from a saved host session', () => {
    storage.saveHost({ hostName: 'Dana', roomCode: 'ABC234', approvedHandles: {} });
    render(<App />);
    expect(screen.getByText('room:create:ABC234:Dana')).toBeInTheDocument();
  });

  it('restores a join-intent room from a saved guest session', () => {
    storage.saveGuest({ roomCode: 'ABC234', playerName: 'Eve', persistentId: 'pid-2' });
    render(<App />);
    expect(screen.getByText('room:join:ABC234:Eve')).toBeInTheDocument();
  });

  it('opens the join form from a ?room= invite link', () => {
    window.history.replaceState({}, '', '/?room=ZZZ234');
    render(<App />);
    expect(screen.getByText('join-screen:ZZZ234')).toBeInTheDocument();
  });

  it('lets an invite link win over a stored host session', () => {
    storage.saveHost({ hostName: 'Dana', roomCode: 'ABC234', approvedHandles: {} });
    window.history.replaceState({}, '', '/?room=ZZZ234');
    render(<App />);
    expect(screen.getByText('join-screen:ZZZ234')).toBeInTheDocument();
    expect(screen.queryByText(/^room:/)).not.toBeInTheDocument();
  });

  it('clears orphaned components when restoring without a host session', () => {
    storage.saveComponents([makeComponent({ id: 's1' })]);
    storage.saveGuest({ roomCode: 'ABC234', playerName: 'Eve', persistentId: 'pid-2' });
    render(<App />);
    expect(storage.getComponents()).toEqual([]);
  });

  it('keeps stored components when a host session owns them', () => {
    const components = [makeComponent({ id: 's1' })];
    storage.saveComponents(components);
    storage.saveHost({ hostName: 'Dana', roomCode: 'ABC234', approvedHandles: {} });
    render(<App />);
    expect(storage.getComponents()).toEqual(components);
  });
});
