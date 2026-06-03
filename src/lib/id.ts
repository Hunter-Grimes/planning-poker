// crypto.randomUUID is only exposed in secure contexts. Fall back to a
// Math.random-based id so plain-http intranets (a common planning-poker
// deployment) don't crash on app start.
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  // Not cryptographically secure, but adequate as a session-scoped opaque id.
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${rand()}-${rand()}-${rand()}-${Date.now().toString(36)}`;
}
