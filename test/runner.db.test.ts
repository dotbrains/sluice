import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { runBackfills } from '../src/runner';
import { withTestDatabase } from './db-test-utils';
import type { MigrationResult } from '../src/types';

const BATCH_LOOP_FOLDER = path.join(__dirname, 'fixtures', 'batch-loop');
const SEQUENTIAL_FOLDER = path.join(__dirname, 'fixtures', 'sequential');
const CYCLE_DETECTION_FOLDER = path.join(__dirname, 'fixtures', 'cycle-detection');
const MISSING_LIMIT_FOLDER = path.join(__dirname, 'fixtures', 'missing-limit');

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('backfill runner (db)', () => {
  it('batch loop processes all rows', async () => {
    await withTestDatabase(async (db) => {
      await db.none(
        'CREATE TABLE public.batch_loop_test (id SERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT $1)',
        'pending',
      );
      await db.none(
        'INSERT INTO public.batch_loop_test (status) SELECT $1 FROM generate_series(1, 10)',
        'pending',
      );

      const result = await runBackfills({
        database: db,
        backfillsFolder: BATCH_LOOP_FOLDER,
        targetVersion: 1,
        logger: silentLogger,
      });

      expect(result).toStrictEqual<MigrationResult>({
        startVersion: 0,
        endVersion: 1,
        targetVersion: 1,
      });

      const pending = await db.one<{ count: string }>(
        "SELECT count(*) FROM public.batch_loop_test WHERE status = 'pending'",
      );
      expect(Number(pending.count)).toBe(0);

      const done = await db.one<{ count: string }>(
        "SELECT count(*) FROM public.batch_loop_test WHERE status = 'done'",
      );
      expect(Number(done.count)).toBe(10);
    });
  });

  it('idempotent — second run is a no-op', async () => {
    await withTestDatabase(async (db) => {
      await db.none(
        'CREATE TABLE public.batch_loop_test (id SERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT $1)',
        'pending',
      );
      await db.none(
        'INSERT INTO public.batch_loop_test (status) SELECT $1 FROM generate_series(1, 10)',
        'pending',
      );

      await runBackfills({
        database: db,
        backfillsFolder: BATCH_LOOP_FOLDER,
        targetVersion: 1,
        logger: silentLogger,
      });

      const result = await runBackfills({
        database: db,
        backfillsFolder: BATCH_LOOP_FOLDER,
        targetVersion: 1,
        logger: silentLogger,
      });

      expect(result).toStrictEqual<MigrationResult>({
        startVersion: 1,
        endVersion: 1,
        targetVersion: 1,
      });

      const done = await db.one<{ count: string }>(
        "SELECT count(*) FROM public.batch_loop_test WHERE status = 'done'",
      );
      expect(Number(done.count)).toBe(10);
    });
  });

  it('sequential execution — backfills run in order', async () => {
    await withTestDatabase(async (db) => {
      await db.none(
        'CREATE TABLE public.sequential_test (id SERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT $1)',
        'pending',
      );
      await db.none(
        'INSERT INTO public.sequential_test (status) SELECT $1 FROM generate_series(1, 10)',
        'pending',
      );

      const result = await runBackfills({
        database: db,
        backfillsFolder: SEQUENTIAL_FOLDER,
        targetVersion: 2,
        logger: silentLogger,
      });

      expect(result).toStrictEqual<MigrationResult>({
        startVersion: 0,
        endVersion: 2,
        targetVersion: 2,
      });

      const done = await db.one<{ count: string }>(
        "SELECT count(*) FROM public.sequential_test WHERE status = 'done'",
      );
      expect(Number(done.count)).toBe(10);
    });
  });

  it('cycle detection throws for broken WHERE clause', async () => {
    await withTestDatabase(async (db) => {
      await db.none(
        'CREATE TABLE public.cycle_detection_test (id SERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT $1)',
        'pending',
      );
      await db.none(
        "INSERT INTO public.cycle_detection_test (status) SELECT 'pending' FROM generate_series(1, 10)",
      );

      await expect(
        runBackfills({
          database: db,
          backfillsFolder: CYCLE_DETECTION_FOLDER,
          targetVersion: 1,
          logger: silentLogger,
        }),
      ).rejects.toThrow('cycle detected');
    });
  });

  it('throws when backfill SQL is missing LIMIT clause', async () => {
    await withTestDatabase(async (db) => {
      await db.none(
        'CREATE TABLE public.missing_limit_test (id SERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT $1)',
        'pending',
      );

      await expect(
        runBackfills({
          database: db,
          backfillsFolder: MISSING_LIMIT_FOLDER,
          targetVersion: 1,
          logger: silentLogger,
        }),
      ).rejects.toThrow('missing a LIMIT clause');
    });
  });

  it('resume incomplete backfills', async () => {
    await withTestDatabase(async (db) => {
      await db.none(
        'CREATE TABLE public.batch_loop_test (id SERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT $1)',
        'pending',
      );
      await db.none(
        'INSERT INTO public.batch_loop_test (status) SELECT $1 FROM generate_series(1, 10)',
        'pending',
      );

      // Run to completion
      await runBackfills({
        database: db,
        backfillsFolder: BATCH_LOOP_FOLDER,
        targetVersion: 1,
        logger: silentLogger,
      });

      // Simulate interrupted backfill
      await db.none("UPDATE public.batch_loop_test SET status = 'pending' WHERE id <= 5");
      await db.none('UPDATE public.backfillversion SET completed = false WHERE version = 1');

      // Re-run should resume
      const result = await runBackfills({
        database: db,
        backfillsFolder: BATCH_LOOP_FOLDER,
        targetVersion: 1,
        logger: silentLogger,
      });

      expect(result).toStrictEqual<MigrationResult>({
        startVersion: 1,
        endVersion: 1,
        targetVersion: 1,
      });

      const done = await db.one<{ count: string }>(
        "SELECT count(*) FROM public.batch_loop_test WHERE status = 'done'",
      );
      expect(Number(done.count)).toBe(10);
    });
  });
});
