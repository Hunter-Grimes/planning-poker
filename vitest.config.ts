import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/helpers/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/app/main.tsx',
        'src/**/*.d.ts',
        // Presentational primitives and design tokens — no logic of their own;
        // exercised transitively through screen/component tests.
        'src/components/ui/**',
        // Barrel files only re-export.
        'src/**/index.ts',
      ],
    },
  },
});
