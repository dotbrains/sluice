import * as fs from 'node:fs';
import { getCurrentVersion, getLocalMigrations, migrate } from './migrations';
import {
  DEFAULT_BATCH_DELAY_MS,
  checkVersionGaps,
  cleanStaleVersions,
  ensureCompletedColumn,
  markCompleted,
  parseBatchLimit,
  shouldWarnLongRunning,
} from './backfill-utils';
import type {
  BackfillRunnerConfig,
  Database,
  LocalMigration,
  Logger,
  MigrationResult,
} from './types';
import { defaultLogger } from './types';
import { getMaxVersion } from './migrations';

// ---------------------------------------------------------------------------
// Single backfill batch loop
// ---------------------------------------------------------------------------

/**
 * Run batch loop for a single backfill until it affects 0 rows.
 *
 * Re-executes the SQL directly (bypassing Postgrator) until `rowCount === 0`.
 * Each execution is wrapped in an explicit transaction so `FOR UPDATE` row
 * locks release between passes.
 *
 * If the pod is killed mid-loop, the version remains incomplete and the next
 * run resumes where the idempotent WHERE clause left off.
 */
async function runSingleBackfillLoop(
  database: Database,
  migration: LocalMigration,
  batchDelayMs: number,
  logger: Logger,
): Promise<void> {
  if (!migration.filePath.endsWith('.sql')) {
    throw new Error(
      `Backfill ${migration.version} (${migration.name}) is not a .sql file. Only SQL backfills are supported.`,
    );
  }

  const sql = fs.readFileSync(migration.filePath, 'utf-8');
  const batchLimit = parseBatchLimit(sql);

  if (batchLimit === null) {
    throw new Error(
      `Backfill ${migration.version} (${migration.name}) is missing a LIMIT clause`,
    );
  }

  const startTime = Date.now();
  let totalRows = 0;
  let pass = 0;
  let lastWarnTime = 0;
  let prevWasPartialBatch = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await database.tx(async (tx) => tx.result(sql));

    if (!result.rowCount) {
      break;
    }

    // Cycle detection: after a partial batch (rowCount < LIMIT), the next
    // pass must return 0 rows. If it doesn't, the WHERE clause isn't
    // excluding already-processed rows and we're in an infinite loop.
    if (prevWasPartialBatch) {
      logger.error('[sluice] Cycle detected in backfill', {
        version: migration.version,
        backfill: migration.name,
        pass: pass + 1,
        rows: result.rowCount,
        batchLimit,
        totalRows,
      });
      throw new Error(
        `Backfill ${migration.version} (${migration.name}) cycle detected: rows returned after partial batch`,
      );
    }

    prevWasPartialBatch = result.rowCount < batchLimit;

    pass++;
    totalRows += result.rowCount;

    const now = Date.now();
    const elapsedMs = now - startTime;
    if (shouldWarnLongRunning(elapsedMs, lastWarnTime, now)) {
      logger.warn('[sluice] Backfill long-running', {
        version: migration.version,
        backfill: migration.name,
        pass,
        totalRows,
        elapsedMs,
      });
      lastWarnTime = now;
    }

    logger.info('[sluice] Backfill batch pass', {
      version: migration.version,
      backfill: migration.name,
      pass,
      rows: result.rowCount,
    });

    await new Promise((r) => setTimeout(r, batchDelayMs));
  }

  await markCompleted(database, migration.version);
  logger.info('[sluice] Backfill complete', {
    version: migration.version,
    backfill: migration.name,
    totalRows,
    passes: pass,
    durationMs: Date.now() - startTime,
  });
}

// ---------------------------------------------------------------------------
// Resume incomplete
// ---------------------------------------------------------------------------

/**
 * Resume any incomplete backfills from previous runs.
 *
 * Handles the case where the process was killed mid-batch-loop. Finds all
 * versions marked incomplete and runs their batch loops to completion in
 * version order.
 */
async function resumeIncompleteBackfills(
  database: Database,
  folder: string,
  batchDelayMs: number,
  logger: Logger,
): Promise<void> {
  const rows = await database.manyOrNone<{ version: string }>(
    `SELECT version FROM public.backfillversion WHERE completed = false ORDER BY version`,
  );
  const incompleteVersions = rows.map((r) => Number(r.version));

  if (incompleteVersions.length === 0) {
    return;
  }

  logger.info('[sluice] Resuming incomplete backfills', {
    versions: incompleteVersions as unknown as Record<string, unknown>,
  });

  const backfillFiles = getLocalMigrations(folder)
    .filter((m) => m.action === 'do')
    .filter((m) => incompleteVersions.includes(m.version))
    .sort((a, b) => a.version - b.version);

  for (const backfill of backfillFiles) {
    await runSingleBackfillLoop(database, backfill, batchDelayMs, logger);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run all pending backfills to completion.
 *
 * Pins a single pooled connection for the entire run. Session-level GUCs
 * (if configured) are set on the pinned connection to bypass triggers.
 */
async function runBackfills(config: BackfillRunnerConfig): Promise<MigrationResult> {
  const {
    database,
    backfillsFolder: folder,
    gucs = [],
    logger = defaultLogger,
  } = config;
  const batchDelayMs = config.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS;
  const targetVersion = config.targetVersion ?? getMaxVersion(folder);

  return database.task(async (t) => {
    const db = t as Database;

    // Set GUCs for trigger bypass
    for (const guc of gucs) {
      await db.none(`SET "${guc}" = 'true'`);
    }

    try {
      let startVersion = await getCurrentVersion(db, 'backfill');

      if (startVersion > 0) {
        await cleanStaleVersions(db, folder, logger);
        startVersion = await getCurrentVersion(db, 'backfill');
      }

      if (startVersion > 0) {
        await resumeIncompleteBackfills(db, folder, batchDelayMs, logger);
        await checkVersionGaps(db, folder, logger);
      }

      // Get pending backfills in order
      const pendingBackfills = getLocalMigrations(folder)
        .filter((m) => m.action === 'do')
        .filter((m) => m.version > startVersion && m.version <= targetVersion)
        .sort((a, b) => a.version - b.version);

      let endVersion = startVersion;

      for (const backfill of pendingBackfills) {
        // Run Postgrator for this version (creates table on first run, first pass)
        const result = await migrate(
          db,
          folder,
          'backfill',
          backfill.version,
          (m) => logger.info(`[sluice] Start backfill ${m.version} (${m.name})`),
          (m) => logger.info(`[sluice] End backfill ${m.version} (${m.name})`),
          false, // rollbackOnFailure — backfills are forward-only
        );

        if (result.failedMigration) {
          return {
            startVersion,
            endVersion: result.endVersion,
            targetVersion,
            failedMigration: result.failedMigration,
            error: result.error,
          };
        }

        endVersion = result.endVersion;

        await ensureCompletedColumn(db);
        await runSingleBackfillLoop(db, backfill, batchDelayMs, logger);
      }

      return { startVersion, endVersion, targetVersion };
    } finally {
      // Reset GUCs before returning connection to pool
      for (const guc of gucs) {
        await db.none(`SET "${guc}" = 'false'`);
      }
    }
  });
}

export { runBackfills, runSingleBackfillLoop };
