import { defineConfig } from 'vitest/config';
import path from 'path';

// Standalone test config. We deliberately do NOT reuse vite.config.ts because
// its build/prerender plugins (source-locator, atoms, sitemap) are irrelevant
// to unit tests and only slow them down. We just need the `@` alias so test
// files and the modules under test resolve imports the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Pure logic tests need no DOM. Add 'jsdom' later for component tests.
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
  },
});
