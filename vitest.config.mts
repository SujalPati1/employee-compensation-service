import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Removed once the first real tests land (phase 4).
    passWithNoTests: true,
  },
});
