// ECDSA P-256 identity for the *preferred host*, used only to authenticate the
// host handoff (the `claim-host` takeover message) — the hot voting path is
// never signed. SubtleCrypto requires a secure context (HTTPS / localhost); the
// app deliberately supports plain-http intranets (see lib/id.ts, lib/peerConfig.ts),
// so every primitive here degrades gracefully: key generation returns null and
// signing yields null, after which clients fall back to a handle match plus a
// visible "host changed" warning. Never throws on app start.

const KEY_ALGO: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

export interface HostKeypair {
  pubB64url: string; // raw public key — shared via the invite link + broadcast state
  privJwk: JsonWebKey; // private key — persisted only by the preferred host
}

function subtle(): SubtleCrypto | null {
  try {
    return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
  } catch {
    return null;
  }
}

/** Whether real signing/verification is possible (secure context). */
export function cryptoAvailable(): boolean {
  return subtle() !== null;
}

function toB64url(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Random nonce for replay protection. Uses getRandomValues, which — unlike
// crypto.subtle — is available in insecure contexts too, so this works
// everywhere; only sign/verify are gated on a secure context.
export function randomNonce(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toB64url(bytes);
  } catch {
    return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
}

// Copy into a fresh ArrayBuffer so the value satisfies SubtleCrypto's
// BufferSource (which excludes SharedArrayBuffer-backed views).
function ab(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}

// The exact bytes signed and verified for a takeover claim.
function claimPayload(roomCode: string, epoch: number, nonce: string): ArrayBuffer {
  return ab(new TextEncoder().encode(`${roomCode}|${epoch}|${nonce}`));
}

/** Generate a preferred-host keypair, or null in an insecure context. */
export async function createHostKeypair(): Promise<HostKeypair | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const kp = await s.generateKey(KEY_ALGO, true, ['sign', 'verify']);
    const pubRaw = await s.exportKey('raw', kp.publicKey);
    const privJwk = await s.exportKey('jwk', kp.privateKey);
    return { pubB64url: toB64url(pubRaw), privJwk };
  } catch {
    return null;
  }
}

/**
 * Sign a takeover claim. Returns null when crypto is unavailable or the key
 * can't be imported — the caller then sends `sig: null` and relies on the
 * degraded handle-match path.
 */
export async function signClaim(
  privJwk: JsonWebKey,
  roomCode: string,
  epoch: number,
  nonce: string,
): Promise<string | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const key = await s.importKey('jwk', privJwk, KEY_ALGO, false, ['sign']);
    const sig = await s.sign(SIGN_ALGO, key, claimPayload(roomCode, epoch, nonce));
    return toB64url(sig);
  } catch {
    return null;
  }
}

/**
 * Verify a takeover claim against the pinned preferred-host public key. Returns
 * false on any error (bad key, bad signature, insecure context) — never throws.
 */
export async function verifyClaim(
  pubB64url: string,
  sig: string,
  roomCode: string,
  epoch: number,
  nonce: string,
): Promise<boolean> {
  const s = subtle();
  if (!s) return false;
  try {
    const key = await s.importKey('raw', ab(fromB64url(pubB64url)), KEY_ALGO, false, ['verify']);
    return await s.verify(SIGN_ALGO, key, ab(fromB64url(sig)), claimPayload(roomCode, epoch, nonce));
  } catch {
    return false;
  }
}
