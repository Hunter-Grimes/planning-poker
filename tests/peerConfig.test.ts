import { describe, it, expect, afterEach, vi } from 'vitest';

// STUN pool size in src/peerConfig.ts — fetched servers are appended after these.
const STUN_COUNT = 3;

// peerConfig reads VITE_ICE_ENDPOINT into a module-level const at import time, so
// each case stubs the env, resets modules, and re-imports to pick it up.
async function loadWithEndpoint(endpoint: string) {
  vi.resetModules();
  vi.stubEnv('VITE_ICE_ENDPOINT', endpoint);
  return import('../src/peerConfig');
}

function iceServers(mod: { getPeerConfig: () => { config?: { iceServers?: unknown[] } } }) {
  return mod.getPeerConfig().config?.iceServers ?? [];
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('peerConfig.initPeerConfig', () => {
  it('stays STUN-only and does not fetch when no endpoint is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const mod = await loadWithEndpoint('');
    await mod.initPeerConfig();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(iceServers(mod)).toHaveLength(STUN_COUNT);
  });

  it('merges a bare array response after the STUN pool', async () => {
    const turn = [
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'turn:turn.example.com:80', username: 'u', credential: 'c' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => turn }));
    const mod = await loadWithEndpoint('https://example.test/ice');
    await mod.initPeerConfig();
    const servers = iceServers(mod);
    expect(servers).toHaveLength(STUN_COUNT + 2);
    expect(servers).toContainEqual({
      urls: 'turn:turn.example.com:80',
      username: 'u',
      credential: 'c',
    });
  });

  it('accepts a wrapped { iceServers } object', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ iceServers: [{ urls: 'turn:t.example:3478' }] }),
        }),
    );
    const mod = await loadWithEndpoint('https://example.test/ice');
    await mod.initPeerConfig();
    expect(iceServers(mod)).toHaveLength(STUN_COUNT + 1);
  });

  it('drops entries without usable urls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ urls: '' }, {}, { urls: 'turn:ok.example:3478' }],
      }),
    );
    const mod = await loadWithEndpoint('https://example.test/ice');
    await mod.initPeerConfig();
    const servers = iceServers(mod);
    expect(servers).toHaveLength(STUN_COUNT + 1);
    expect(servers[servers.length - 1]).toEqual({ urls: 'turn:ok.example:3478' });
  });

  it('falls back to STUN-only on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await loadWithEndpoint('https://example.test/ice');
    await mod.initPeerConfig();
    expect(iceServers(mod)).toHaveLength(STUN_COUNT);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to STUN-only when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await loadWithEndpoint('https://example.test/ice');
    await mod.initPeerConfig();
    expect(iceServers(mod)).toHaveLength(STUN_COUNT);
  });

  it('falls back to STUN-only on an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await loadWithEndpoint('https://example.test/ice');
    await mod.initPeerConfig();
    expect(iceServers(mod)).toHaveLength(STUN_COUNT);
  });
});
