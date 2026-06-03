import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';
import { storage } from '../../src/lib/storage';
import { makeComponent } from '../helpers/factories';

// App's only job is routing: pick a screen from the URL + saved sessions and
// wire props in. Stub the screens (as components returning a marker string) so
// these tests exercise that decision in isolation — no peer hooks, no screen
// internals, no mount effects. Markers echo the props App passes down.
vi.mock('../../src/components/screens', () => ({
  HomeScreen: () => 'home-screen',
  JoinScreen: (props: { roomId: string }) => `join-screen:${props.roomId}`,
  HostRoom: (props: { hostName: string; roomCode?: string }) =>
    `host-screen:${props.hostName}:${props.roomCode}`,
  GuestRoom: (props: { roomId: string; playerName: string }) =>
    `guest-screen:${props.roomId}:${props.playerName}`,
}));

beforeEach(() => {
  localStorage.clear();
  // jsdom carries the URL across tests; reset it so a stray ?room= can't leak.
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

  it('restores the host screen from a saved host session', () => {
    storage.saveHost({ hostName: 'Dana', roomCode: 'ABC234', approvedPlayers: {} });
    render(<App />);
    expect(screen.getByText('host-screen:Dana:ABC234')).toBeInTheDocument();
  });

  it('restores the guest screen from a saved guest session', () => {
    storage.saveGuest({ roomCode: 'ABC234', playerName: 'Eve', persistentId: 'pid-2' });
    render(<App />);
    expect(screen.getByText('guest-screen:ABC234:Eve')).toBeInTheDocument();
  });

  it('opens the join form from a ?room= invite link', () => {
    window.history.replaceState({}, '', '/?room=ZZZ234');
    render(<App />);
    expect(screen.getByText('join-screen:ZZZ234')).toBeInTheDocument();
  });

  it('lets an invite link win over a stored host session', () => {
    storage.saveHost({ hostName: 'Dana', roomCode: 'ABC234', approvedPlayers: {} });
    window.history.replaceState({}, '', '/?room=ZZZ234');
    render(<App />);
    expect(screen.getByText('join-screen:ZZZ234')).toBeInTheDocument();
    expect(screen.queryByText(/^host-screen/)).not.toBeInTheDocument();
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
    storage.saveHost({ hostName: 'Dana', roomCode: 'ABC234', approvedPlayers: {} });
    render(<App />);
    expect(storage.getComponents()).toEqual(components);
  });
});
