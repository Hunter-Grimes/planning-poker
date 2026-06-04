import { describe, it, expect, beforeEach } from 'vitest';
import { storage, HostSession, GuestSession } from '../../src/lib/storage';
import { makeComponent } from '../helpers/factories';

const host: HostSession = {
  hostName: 'Dana',
  roomCode: 'ABC123',
  approvedHandles: { 'h-1': 'Alice' },
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

describe('approved handles', () => {
  it('adds a handle without disturbing existing entries', () => {
    storage.saveHost(host);
    storage.addApprovedHandle('h-9', 'Frank');
    expect(storage.getHost()!.approvedHandles).toEqual({ 'h-1': 'Alice', 'h-9': 'Frank' });
  });

  it('removes a handle', () => {
    storage.saveHost(host);
    storage.removeApprovedHandle('h-1');
    expect(storage.getHost()!.approvedHandles).toEqual({});
  });

  it('is a no-op when there is no host session', () => {
    storage.addApprovedHandle('h-1', 'Alice');
    expect(storage.getHost()).toBeNull();
  });
});

describe('room handle', () => {
  it('is stable per room and differs across rooms', () => {
    const a1 = storage.getRoomHandle('ROOM01');
    const a2 = storage.getRoomHandle('ROOM01');
    const b = storage.getRoomHandle('ROOM02');
    expect(a1).toBe(a2); // stable for the same room
    expect(a1).not.toBe(b); // uncorrelatable across rooms
    expect(a1).not.toContain(storage.getClientId()); // not the raw client id
  });
});

describe('host keypair', () => {
  const key = { pubB64url: 'pub', privJwk: { kty: 'EC' } };

  it('round-trips per room and clears', () => {
    storage.saveHostKey('ROOM01', key);
    expect(storage.getHostKey('ROOM01')).toEqual(key);
    expect(storage.getHostKey('ROOM02')).toBeNull(); // namespaced by room
    storage.clearHostKey('ROOM01');
    expect(storage.getHostKey('ROOM01')).toBeNull();
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

describe('auto-reveal preference', () => {
  it('defaults to false when unset', () => {
    expect(storage.getAutoReveal()).toBe(false);
  });

  it('round-trips both values', () => {
    storage.saveAutoReveal(true);
    expect(storage.getAutoReveal()).toBe(true);
    storage.saveAutoReveal(false);
    expect(storage.getAutoReveal()).toBe(false);
  });

  it('survives clearing the host session', () => {
    storage.saveAutoReveal(true);
    storage.saveHost(host);
    storage.clearHost();
    expect(storage.getAutoReveal()).toBe(true);
  });
});

describe('client id', () => {
  it('mints an id on first read and returns the same one thereafter', () => {
    const id = storage.getClientId();
    expect(id).toBeTruthy();
    expect(storage.getClientId()).toBe(id);
  });

  it('survives clearing the host and guest sessions', () => {
    const id = storage.getClientId();
    storage.saveHost(host);
    storage.saveGuest(guest);
    storage.clearHost();
    storage.clearGuest();
    expect(storage.getClientId()).toBe(id);
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
