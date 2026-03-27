import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['*/**/*.{test,spec}.ts'],
    exclude: ['project-assigner/**', 'node_modules/**', '*/dist/**'],
    passWithNoTests: true,
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
