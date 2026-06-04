import { describe, it, expect } from 'vitest';
import { createHostKeypair, signClaim, verifyClaim, randomNonce } from '../../src/lib/hostIdentity';

// Probe the *actual* signing capability rather than trusting a feature flag —
// some test environments expose a partial crypto.subtle. The full round-trip is
// asserted where it works; the degrade contract is asserted where it doesn't.
async function signingWorks(): Promise<boolean> {
  const kp = await createHostKeypair();
  if (!kp) return false;
  return !!(await signClaim(kp.privJwk, 'PROBE', 1, 'n'));
}

describe('hostIdentity', () => {
  it('produces distinct, non-empty nonces', () => {
    const a = randomNonce();
    const b = randomNonce();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('round-trips and rejects tampering when signing is supported, else degrades', async () => {
    if (await signingWorks()) {
      const kp = (await createHostKeypair())!;
      const sig = (await signClaim(kp.privJwk, 'ROOM01', 3, 'nonce-1')) as string;
      // Genuine claim verifies.
      expect(await verifyClaim(kp.pubB64url, sig, 'ROOM01', 3, 'nonce-1')).toBe(true);
      // Tampered epoch / nonce / room all fail.
      expect(await verifyClaim(kp.pubB64url, sig, 'ROOM01', 4, 'nonce-1')).toBe(false);
      expect(await verifyClaim(kp.pubB64url, sig, 'ROOM01', 3, 'nonce-2')).toBe(false);
      expect(await verifyClaim(kp.pubB64url, sig, 'ROOM02', 3, 'nonce-1')).toBe(false);
      // A different key's signature fails.
      const other = (await createHostKeypair())!;
      expect(await verifyClaim(other.pubB64url, sig, 'ROOM01', 3, 'nonce-1')).toBe(false);
    } else {
      // Degraded path: never throws; signing yields null, verification false.
      expect(await signClaim({}, 'ROOM01', 1, 'n')).toBeNull();
      expect(await verifyClaim('pub', 'sig', 'ROOM01', 1, 'n')).toBe(false);
    }
  });
});
