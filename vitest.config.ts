import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Use 'forks' pool to avoid @rollup/rollup-win32-x64-msvc native dep
    // on Windows where the optional rollup native binary may not be installed.
    pool: 'forks',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/benchmarks/**', 'tests/fixtures/generate-large.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/pro/worker.ts', // Worker thread — runs in separate context
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 10_000,
  },
});
