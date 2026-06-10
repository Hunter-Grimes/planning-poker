// @vitest-environment node
//
// Runs in the *node* environment on purpose. Under jsdom (the default for this
// repo) `crypto.subtle.sign/verify` reject buffers created in the app realm with
// "argument is not instance of ArrayBuffer" — a jsdom↔Node realm mismatch, not a
// browser bug. That artifact made the previous version of this test silently fall
// into its degraded branch and "pass" without ever exercising the real signature
// path the live HTTPS app uses for the preferred-host handoff. Pinning the env to
// node gives a single realm, so this is genuine coverage of that path.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  cryptoAvailable,
  createHostKeypair,
  signClaim,
  verifyClaim,
  randomNonce,
} from '../../src/lib/hostIdentity';

describe('hostIdentity — real ECDSA path (mirrors the live HTTPS handoff)', () => {
  it('produces distinct, non-empty nonces', () => {
    const a = randomNonce();
    const b = randomNonce();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('signs and verifies a genuine claim', async () => {
    expect(cryptoAvailable()).toBe(true);
    const kp = await createHostKeypair();
    expect(kp).not.toBeNull();
    const sig = await signClaim(kp!.privJwk, 'ROOM01', 3, 'nonce-1');
    expect(sig).not.toBeNull();
    expect(await verifyClaim(kp!.pubB64url, sig!, 'ROOM01', 3, 'nonce-1')).toBe(true);
  });

  it('rejects a tampered room code, epoch, or nonce', async () => {
    const kp = (await createHostKeypair())!;
    const sig = (await signClaim(kp.privJwk, 'ROOM01', 3, 'nonce-1'))!;
    expect(await verifyClaim(kp.pubB64url, sig, 'ROOM02', 3, 'nonce-1')).toBe(false);
    expect(await verifyClaim(kp.pubB64url, sig, 'ROOM01', 4, 'nonce-1')).toBe(false);
    expect(await verifyClaim(kp.pubB64url, sig, 'ROOM01', 3, 'nonce-2')).toBe(false);
  });

  it('rejects a signature made with a different key', async () => {
    const a = (await createHostKeypair())!;
    const b = (await createHostKeypair())!;
    const sig = (await signClaim(a.privJwk, 'ROOM01', 3, 'nonce-1'))!;
    expect(await verifyClaim(b.pubB64url, sig, 'ROOM01', 3, 'nonce-1')).toBe(false);
  });

  // storage.saveHostKey/getHostKey persist the keypair via JSON.stringify/parse,
  // so a host returning by reopening a closed tab signs with a *re-hydrated*
  // private JWK and the temp host verifies against the re-hydrated public key.
  // This is the exact path behind the "host reopens tab and reclaims" scenario.
  it('round-trips through JSON persistence (reopened-tab reclaim path)', async () => {
    const kp = (await createHostKeypair())!;
    const persisted = JSON.parse(JSON.stringify(kp)) as typeof kp;
    const sig = await signClaim(persisted.privJwk, 'ROOM01', 7, 'nonce-x');
    expect(sig).not.toBeNull();
    expect(await verifyClaim(persisted.pubB64url, sig!, 'ROOM01', 7, 'nonce-x')).toBe(true);
  });
});

describe('hostIdentity — degraded contract (no secure crypto)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('degrades to null/false without throwing when crypto.subtle is absent', async () => {
    const realCrypto = globalThis.crypto;
    // Keep getRandomValues (insecure contexts still have it) but remove subtle.
    vi.stubGlobal('crypto', {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    });
    expect(cryptoAvailable()).toBe(false);
    expect(await createHostKeypair()).toBeNull();
    expect(await signClaim({}, 'ROOM01', 1, 'n')).toBeNull();
    expect(await verifyClaim('pub', 'sig', 'ROOM01', 1, 'n')).toBe(false);
  });
});
