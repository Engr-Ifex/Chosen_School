import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],

    // The in-memory MongoDB binary is pinned so every machine and CI run uses
    // the same server version instead of downloading whatever is newest. Ping
    // behaviour is identical across versions; raise this deliberately.
    env: { MONGOMS_VERSION: '6.0.14' },

    // Starting an in-memory mongod is slow the first time (it may download the
    // binary) and moderately slow afterwards.
    testTimeout: 120_000,
    hookTimeout: 240_000,
  },
});
