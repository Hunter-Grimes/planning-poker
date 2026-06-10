import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { log, logEnabled, ppLog } from '../../src/lib/logger';

describe('logger', () => {
  beforeEach(() => {
    // Silence the console mirror; we assert on the buffer, not stdout.
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    ppLog.clear();
    ppLog.disable();
  });
  afterEach(() => vi.restoreAllMocks());

  it('is a no-op when disabled (near-zero cost in production)', () => {
    expect(logEnabled()).toBe(false);
    log('room', 'becomeHost', { a: 1 });
    expect(ppLog.dump()).toHaveLength(0);
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('captures structured, timestamped entries when enabled', () => {
    ppLog.enable();
    expect(logEnabled()).toBe(true);
    log('room', 'becomeHost', { kind: 'preferred' });
    const entries = ppLog.dump();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      tag: 'room',
      event: 'becomeHost',
      data: { kind: 'preferred' },
    });
    expect(typeof entries[0].t).toBe('number');
  });

  it('text() renders a one-line-per-event transcript with the data inlined', () => {
    ppLog.enable();
    log('room', 'kickoff', { pref: true });
    log('room', 'claim:sent', { epoch: 2 });
    const lines = ppLog.text().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('[room] kickoff');
    expect(lines[0]).toContain('"pref":true');
    expect(lines[1]).toContain('claim:sent');
  });

  it('persists the toggle so it survives a reload (deployed-build use)', () => {
    ppLog.enable();
    expect(localStorage.getItem('pp_debug')).toBe('1');
    ppLog.disable();
    expect(localStorage.getItem('pp_debug')).toBeNull();
  });

  it('bounds the ring buffer so a long session cannot grow without limit', () => {
    ppLog.enable();
    for (let i = 0; i < 2010; i++) log('room', 'e', { i });
    const entries = ppLog.dump();
    expect(entries.length).toBeLessThanOrEqual(2000);
    // Oldest entries are dropped; the most recent survive.
    const last = entries[entries.length - 1];
    expect((last.data as { i: number }).i).toBe(2009);
  });
});
