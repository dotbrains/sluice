import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,
    include: ['**/*.db.test.ts'],
    globalSetup: ['./test/global-setup.db.ts'],
    // Avoid restarting the container between test files
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
