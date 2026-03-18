import type { Database, Logger, LocalMigration } from './types';
import { getLocalMigrations } from './migrations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pause between batch passes to limit database pressure. */
const DEFAULT_BATCH_DELAY_MS = 200;

/** Log a warning after a backfill has been running for this long. */
const WARN_DURATION_MS = 60 * 60 * 1000; // 1 hour

/** After the first warning, repeat every N ms. */
const WARN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Batch limit parsing
// ---------------------------------------------------------------------------

/**
 * Extract the LIMIT value from a backfill SQL file.
 * Returns the limit as a number, or `null` if no LIMIT clause is found.
 */
function parseBatchLimit(sql: string): number | null {
  const match = sql.match(/LIMIT\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Long-running detection
// ---------------------------------------------------------------------------

/**
 * Determines if a warning should be logged for a long-running backfill.
 * Returns `true` if elapsed time exceeds the threshold and enough time has
 * passed since the last warning.
 */
function shouldWarnLongRunning(elapsedMs: number, lastWarnTime: number, now: number): boolean {
  return elapsedMs >= WARN_DURATION_MS && now - lastWarnTime >= WARN_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Version tracking helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the backfillversion table has the `completed` column.
 *
 * Postgrator creates the version table on first run. We add our own
 * `completed` column to track which backfills have finished their batch loop.
 */
async function ensureCompletedColumn(database: Database): Promise<void> {
  await database.none(
    `ALTER TABLE public.backfillversion ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT false`,
  );
  // Postgrator inserts a version-0 baseline row — mark it completed so it
  // doesn't appear in resume queries or stale-version cleanup.
  await database.none(
    `UPDATE public.backfillversion SET completed = true WHERE version = 0 AND completed = false`,
  );
}

async function markCompleted(database: Database, version: number): Promise<void> {
  await database.none(
    `UPDATE public.backfillversion SET completed = true WHERE version = $1`,
    version,
  );
}

// ---------------------------------------------------------------------------
// Stale version cleanup
// ---------------------------------------------------------------------------

/**
 * Remove backfillversion records that have no corresponding local file.
 *
 * This handles branch switching during development: branch-A might apply
 * backfill 002, then the developer switches to branch-B which has a
 * different 002 (or none at all). Without cleanup, the stale record would
 * prevent the correct version from running or inflate the max version.
 *
 * Safe because backfill SQL is idempotent — if the file reappears later
 * (branch switch back), the WHERE clause finds 0 already-processed rows
 * and completes instantly.
 */
async function cleanStaleVersions(
  database: Database,
  folder: string,
  logger: Logger,
): Promise<void> {
  const localByVersion = new Map(
    getLocalMigrations(folder)
      .filter((m) => m.action === 'do')
      .map((m) => [m.version, m.name]),
  );

  const dbVersions = await database.manyOrNone<{ version: string; name: string }>(
    `SELECT version, name FROM public.backfillversion ORDER BY version`,
  );

  const staleVersions = dbVersions
    .map((r) => ({ version: Number(r.version), name: r.name }))
    .filter(
      (r) =>
        r.version > 0 &&
        (!localByVersion.has(r.version) || localByVersion.get(r.version) !== r.name),
    );

  if (staleVersions.length === 0) {
    return;
  }

  const versions = staleVersions.map((r) => r.version);

  logger.warn('[sluice] Removing stale backfill version records', {
    staleVersions: staleVersions as unknown as Record<string, unknown>,
  });

  await database.none(`DELETE FROM public.backfillversion WHERE version IN ($1:csv)`, [versions]);
}

// ---------------------------------------------------------------------------
// Version gap detection
// ---------------------------------------------------------------------------

/**
 * Check for gaps in the version sequence and log an error if found.
 * This should never happen in normal operation but catches data corruption.
 */
async function checkVersionGaps(
  database: Database,
  folder: string,
  logger: Logger,
): Promise<void> {
  const dbVersions = await database.manyOrNone<{ version: string }>(
    `SELECT version FROM public.backfillversion ORDER BY version`,
  );
  const appliedVersions = new Set(dbVersions.map((r) => Number(r.version)));

  if (appliedVersions.size === 0) {
    return;
  }

  const localBackfills = getLocalMigrations(folder)
    .filter((m) => m.action === 'do')
    .map((m) => m.version)
    .sort((a, b) => a - b);

  const maxApplied = Math.max(...appliedVersions);
  const expectedVersions = localBackfills.filter((v) => v <= maxApplied);

  const missingVersions = expectedVersions.filter((v) => !appliedVersions.has(v));
  if (missingVersions.length > 0) {
    logger.error('[sluice] Version gap detected — backfill versions missing from database', {
      missingVersions: missingVersions as unknown as Record<string, unknown>,
      maxApplied,
    });
  }
}

export {
  DEFAULT_BATCH_DELAY_MS,
  WARN_DURATION_MS,
  WARN_INTERVAL_MS,
  checkVersionGaps,
  cleanStaleVersions,
  ensureCompletedColumn,
  markCompleted,
  parseBatchLimit,
  shouldWarnLongRunning,
};
export type { LocalMigration };
