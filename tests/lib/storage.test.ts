import { describe, it, expect, beforeEach } from 'vitest';
import { storage, HostSession, GuestSession } from '../../src/lib/storage';
import { makeComponent } from '../helpers/factories';

const host: HostSession = {
  hostName: 'Dana',
  roomCode: 'ABC123',
  approvedPlayers: { 'pid-1': 'Alice' },
};

const guest: GuestSession = {
  roomCode: 'ABC123',
  playerName: 'Eve',
  persistentId: 'pid-2',
};

beforeEach(() => {
  localStorage.clear();
});

describe('host session', () => {
  it('round-trips through save/get', () => {
    storage.saveHost(host);
    expect(storage.getHost()).toEqual(host);
  });

  it('returns null when absent', () => {
    expect(storage.getHost()).toBeNull();
  });

  it('clears the stored host', () => {
    storage.saveHost(host);
    storage.clearHost();
    expect(storage.getHost()).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    localStorage.setItem('pp_host', '{not json');
    expect(storage.getHost()).toBeNull();
  });
});

describe('approved players', () => {
  it('adds a player without disturbing existing entries', () => {
    storage.saveHost(host);
    storage.addApprovedPlayer('pid-9', 'Frank');
    expect(storage.getHost()!.approvedPlayers).toEqual({ 'pid-1': 'Alice', 'pid-9': 'Frank' });
  });

  it('removes a player', () => {
    storage.saveHost(host);
    storage.removeApprovedPlayer('pid-1');
    expect(storage.getHost()!.approvedPlayers).toEqual({});
  });

  it('is a no-op when there is no host session', () => {
    storage.addApprovedPlayer('pid-1', 'Alice');
    expect(storage.getHost()).toBeNull();
  });
});

describe('guest session', () => {
  it('round-trips and clears', () => {
    storage.saveGuest(guest);
    expect(storage.getGuest()).toEqual(guest);
    storage.clearGuest();
    expect(storage.getGuest()).toBeNull();
  });
});

describe('components', () => {
  it('round-trips a list', () => {
    const components = [makeComponent({ id: 's1' }), makeComponent({ id: 's2' })];
    storage.saveComponents(components);
    expect(storage.getComponents()).toEqual(components);
  });

  it('defaults to an empty array when absent or malformed', () => {
    expect(storage.getComponents()).toEqual([]);
    localStorage.setItem('pp_components', 'oops');
    expect(storage.getComponents()).toEqual([]);
  });

  it('clears stored components', () => {
    storage.saveComponents([makeComponent()]);
    storage.clearComponents();
    expect(storage.getComponents()).toEqual([]);
  });
});

describe('key isolation', () => {
  it('clearing the host leaves the guest session intact', () => {
    storage.saveHost(host);
    storage.saveGuest(guest);
    storage.clearHost();
    expect(storage.getGuest()).toEqual(guest);
  });
});
