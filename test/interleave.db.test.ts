import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { runMigrationsAndBackfills } from '../src/interleave';
import { runMigrations } from '../src/migration-runner';
import { withTestDatabase } from './db-test-utils';
import type { Database } from '../src/types';

const INTERLEAVE_FOLDER = path.join(__dirname, 'fixtures', 'interleave');
const MIGRATIONS_FOLDER = path.join(INTERLEAVE_FOLDER, 'migrations');
const BACKFILLS_FOLDER = path.join(INTERLEAVE_FOLDER, 'backfills');

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

async function expectBackfillComplete(db: Database): Promise<void> {
  const rows = await db.one<{ count: string }>(
    "SELECT count(*) FROM public.interleave_test WHERE new_col = 'data'",
  );
  expect(Number(rows.count)).toBe(10);

  const columns = await db.manyOrNone<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'interleave_test' AND table_schema = 'public'",
  );
  const columnNames = columns.map((c) => c.column_name);
  expect(columnNames).toContain('new_col');
  expect(columnNames).not.toContain('old_col');
}

describe('interleaved runner (db)', () => {
  it('interleaves migrations and backfills from empty DB', async () => {
    await withTestDatabase(async (db) => {
      await runMigrationsAndBackfills({
        database: db,
        migrationsFolder: MIGRATIONS_FOLDER,
        backfillsFolder: BACKFILLS_FOLDER,
        logger: silentLogger,
      });

      await expectBackfillComplete(db);
    });
  });

  it('catches up when migrations are ahead of backfills', async () => {
    await withTestDatabase(async (db) => {
      // Run only migration 1 (creates the table with old_col and new_col)
      await runMigrations({
        database: db,
        migrationsFolder: MIGRATIONS_FOLDER,
        targetVersion: 1,
        logger: silentLogger,
      });

      // Verify backfill has NOT run yet
      const before = await db.one<{ count: string }>(
        'SELECT count(*) FROM public.interleave_test WHERE new_col IS NULL',
      );
      expect(Number(before.count)).toBe(10);

      // Run interleaved — should skip migration 1, run backfill 1, then migration 2
      await runMigrationsAndBackfills({
        database: db,
        migrationsFolder: MIGRATIONS_FOLDER,
        backfillsFolder: BACKFILLS_FOLDER,
        logger: silentLogger,
      });

      await expectBackfillComplete(db);
    });
  });

  it('idempotent — re-run is a no-op', async () => {
    await withTestDatabase(async (db) => {
      await runMigrationsAndBackfills({
        database: db,
        migrationsFolder: MIGRATIONS_FOLDER,
        backfillsFolder: BACKFILLS_FOLDER,
        logger: silentLogger,
      });

      // Re-run — should short-circuit
      await runMigrationsAndBackfills({
        database: db,
        migrationsFolder: MIGRATIONS_FOLDER,
        backfillsFolder: BACKFILLS_FOLDER,
        logger: silentLogger,
      });

      await expectBackfillComplete(db);
    });
  });
});
