import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom doesn't implement matchMedia, which useTheme relies on. Provide a inert
// stub (reports light mode, no-op listeners) so components render in tests.
// Guarded for the rare `// @vitest-environment node` test (e.g. real-crypto
// round-trips that can't run under jsdom's realm), which has no `window`.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Unmount React trees and clear the DOM between tests so renders don't leak.
afterEach(() => {
  cleanup();
});
