import { describe, it, expect } from 'vitest';
import { CARD_COLORS, getCardColors } from './cardColors';
import { FIBONACCI_CARDS } from './types';

describe('getCardColors', () => {
  it('maps every card value to a color set', () => {
    for (const card of FIBONACCI_CARDS) {
      expect(CARD_COLORS).toContain(getCardColors(card));
    }
  });

  it("maps '?' to the last (slate) color set", () => {
    expect(getCardColors('?')).toBe(CARD_COLORS[CARD_COLORS.length - 1]);
  });

  it('maps the lowest card to the first color set', () => {
    expect(getCardColors(1)).toBe(CARD_COLORS[0]);
  });

  it('is stable across calls', () => {
    expect(getCardColors(8)).toBe(getCardColors(8));
  });
});
