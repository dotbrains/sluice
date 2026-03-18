import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCurrentVersion, getLocalMigrations, getMaxVersion } from './migrations';
import { runMigrations } from './migration-runner';
import { runBackfills } from './runner';
import type { InterleaveRunnerConfig, Logger } from './types';
import { defaultLogger } from './types';

// ---------------------------------------------------------------------------
// Annotation parsing
// ---------------------------------------------------------------------------

const ANNOTATION_RE = /^--\s*@migration\s+(\S+)/;

/**
 * Read the first line of a backfill `.do.sql` file and extract the
 * `-- @migration <filename>` annotation. Throws if missing.
 */
function parseAnnotation(filePath: string): string {
  const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n')[0];
  const match = firstLine.match(ANNOTATION_RE);
  if (!match) {
    throw new Error(
      `Backfill ${path.basename(filePath)} is missing a "-- @migration <file>" annotation on line 1`,
    );
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Dependency step computation
// ---------------------------------------------------------------------------

type DependencyStep = { migration: number; backfill: number };

/**
 * Scan all backfill `.do.sql` files, parse their `@migration` annotations,
 * resolve the referenced migration filename to a version number, and group
 * backfills by their target migration.
 */
function buildDependencySteps(backfillsFolder: string, migrationsFolder: string): DependencyStep[] {
  const backfills = getLocalMigrations(backfillsFolder).filter((m) => m.action === 'do');

  const migrationFileNames = new Set(
    getLocalMigrations(migrationsFolder)
      .filter((m) => m.action === 'do')
      .map((m) => m.filename!),
  );

  const groups = new Map<number, number[]>();

  for (const bf of backfills) {
    const annotationFile = parseAnnotation(bf.filePath);

    if (!migrationFileNames.has(annotationFile)) {
      throw new Error(
        `Backfill ${path.basename(bf.filePath)} references migration "${annotationFile}", but no such file exists in ${migrationsFolder}`,
      );
    }

    const migrationVersion = Number(annotationFile.split('.')[0]);
    const existing = groups.get(migrationVersion) ?? [];
    existing.push(bf.version);
    groups.set(migrationVersion, existing);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([migration, bfVersions]) => ({
      migration,
      backfill: Math.max(...bfVersions),
    }));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run migrations and backfills in interleaved order based on `@migration`
 * annotations in backfill files.
 *
 * For each dependency step: run migrations up to N, then run backfills up to M.
 * After all steps, run any remaining migrations.
 */
async function runMigrationsAndBackfills(config: InterleaveRunnerConfig): Promise<void> {
  const {
    database,
    migrationsFolder,
    backfillsFolder,
    gucs = [],
    batchDelayMs,
    logger = defaultLogger,
  } = config;

  const steps = buildDependencySteps(backfillsFolder, migrationsFolder);
  const migrationMaxVersion = getMaxVersion(migrationsFolder);
  const maxBackfillVersion = getMaxVersion(backfillsFolder);

  let currentMigrationVersion = await getCurrentVersion(database, 'migration');
  let currentBackfillVersion = await getCurrentVersion(database, 'backfill');

  // Fast path: everything is already up to date
  if (
    currentMigrationVersion >= migrationMaxVersion &&
    currentBackfillVersion >= maxBackfillVersion
  ) {
    logger.info('[sluice] Already up to date', {
      migrationVersion: currentMigrationVersion,
      backfillVersion: currentBackfillVersion,
    });
    return;
  }

  logger.info('[sluice] Starting interleaved run', {
    currentMigrationVersion,
    targetMigrationVersion: migrationMaxVersion,
    currentBackfillVersion,
    targetBackfillVersion: maxBackfillVersion,
    totalSteps: steps.length,
  });

  for (const [i, step] of steps.entries()) {
    const willMigrate = step.migration > currentMigrationVersion;
    const willBackfill = step.backfill > currentBackfillVersion;

    if (!willMigrate && !willBackfill) {
      continue;
    }

    const parts: string[] = [];
    if (willMigrate) parts.push(`migrations up to ${step.migration}`);
    if (willBackfill) parts.push(`backfills up to ${step.backfill}`);
    logger.info(`[sluice] Step [${i + 1}/${steps.length}] ${parts.join(', ')}`);

    if (willMigrate) {
      const migrationResult = await runMigrations({
        database,
        migrationsFolder,
        targetVersion: step.migration,
        logger,
      });

      if (migrationResult.failedMigration) {
        throw new Error(`Migration to step ${step.migration} failed`);
      }

      currentMigrationVersion = migrationResult.endVersion;
    }

    if (willBackfill) {
      const bfResult = await runBackfills({
        database,
        backfillsFolder,
        targetVersion: step.backfill,
        gucs,
        batchDelayMs,
        logger,
      });

      if (bfResult.failedMigration) {
        throw new Error(`Backfill up to ${step.backfill} failed`);
      }

      currentBackfillVersion = step.backfill;
    }
  }

  // Run remaining migrations past the last step
  if (migrationMaxVersion > currentMigrationVersion) {
    logger.info(`[sluice] Final migrations up to ${migrationMaxVersion}`);

    const finalResult = await runMigrations({
      database,
      migrationsFolder,
      targetVersion: migrationMaxVersion,
      logger,
    });

    if (finalResult.failedMigration) {
      throw new Error(`Final migration to ${migrationMaxVersion} failed`);
    }
  }

  logger.info('[sluice] Interleaved run complete');
}

export { buildDependencySteps, parseAnnotation, runMigrationsAndBackfills };
export type { DependencyStep };
