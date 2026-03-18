import * as path from 'node:path';
import fg from 'fast-glob';
import Postgrator from 'postgrator';
import type {
  Database,
  LocalMigration,
  MigrationMetadata,
  MigrationResult,
  RunnerType,
} from './types';

// ---------------------------------------------------------------------------
// Schema table mapping
// ---------------------------------------------------------------------------

const SCHEMA_TABLES: Record<RunnerType, string> = {
  migration: 'public.schemaversion',
  backfill: 'public.backfillversion',
};

// ---------------------------------------------------------------------------
// Postgrator factory
// ---------------------------------------------------------------------------

function getPostgrator(database: Database, folder: string, runnerType: RunnerType): Postgrator {
  return new Postgrator({
    driver: 'pg',
    migrationPattern: path.join(folder, '*'),
    schemaTable: SCHEMA_TABLES[runnerType],
    execQuery: async (query) => {
      if (!query || query.trim() === '') {
        return { rows: [] };
      }
      return { rows: (await database.query(query)) as Record<string, unknown>[] };
    },
    validateChecksums: false,
  });
}

// ---------------------------------------------------------------------------
// Filename parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Postgrator-style filename into metadata.
 *
 * Supported formats:
 * - `001.do.create-table.sql`
 * - `001.undo.sql`
 */
function parseFilename(filename: string): MigrationMetadata {
  const split = path.basename(filename).split('.');
  const action = split[1];

  if (action !== 'do' && action !== 'undo') {
    throw new Error(`Unexpected migration action "${action}" in ${filename}`);
  }

  return {
    version: Number(split[0]),
    action,
    name: split.length === 4 ? split[2] : '',
    filename: path.basename(filename),
  };
}

// ---------------------------------------------------------------------------
// Local file discovery
// ---------------------------------------------------------------------------

/**
 * Discover migration/backfill files in a folder.
 * Excludes test files (`*.test.*`).
 */
function getLocalMigrations(folder: string): LocalMigration[] {
  const files = fg.globSync(['*.{sql,js,mjs,cjs}', '!*.test.{ts,js,mjs,cjs}'], {
    cwd: path.join(folder),
  });
  return files.map((filename) => ({
    ...parseFilename(filename),
    filePath: path.join(folder, filename),
  }));
}

/**
 * Find the largest version number in a folder.
 */
function getMaxVersion(folder: string, filter: 'do' | 'undo' = 'do'): number {
  const versions = getLocalMigrations(folder)
    .filter(({ action }) => action === filter)
    .map(({ version }) => version);
  return Math.max(...versions);
}

// ---------------------------------------------------------------------------
// Version queries
// ---------------------------------------------------------------------------

async function getCurrentVersion(database: Database, runnerType: RunnerType): Promise<number> {
  const postgrator = getPostgrator(database, '', runnerType);
  return postgrator.getDatabaseVersion();
}

// ---------------------------------------------------------------------------
// Migrate
// ---------------------------------------------------------------------------

/**
 * Run migrations (or backfills) from the current version to `to` using
 * Postgrator. On failure, rolls back to the starting version unless
 * `rollbackOnFailure` is `false`.
 */
async function migrate(
  database: Database,
  folder: string,
  runnerType: RunnerType,
  to?: number,
  onMigrationStarted?: Postgrator.MigrationEventCallback,
  onMigrationFinished?: Postgrator.MigrationEventCallback,
  rollbackOnFailure = true,
): Promise<MigrationResult> {
  const postgrator = getPostgrator(database, folder, runnerType);

  const fromVersion = await postgrator.getDatabaseVersion();
  const toVersion = to ?? (await postgrator.getMaxVersion());
  let lastMigrationStarted: MigrationMetadata | undefined;

  postgrator.on('migration-started', (migration) => {
    lastMigrationStarted = migration;
  });

  if (onMigrationStarted) {
    postgrator.on('migration-started', onMigrationStarted);
  }
  if (onMigrationFinished) {
    postgrator.on('migration-finished', onMigrationFinished);
  }

  try {
    await postgrator.migrate(toVersion.toString());

    return {
      startVersion: fromVersion,
      endVersion: await postgrator.getDatabaseVersion(),
      targetVersion: toVersion,
    };
  } catch (error: unknown) {
    const failedMigration = lastMigrationStarted;

    if (rollbackOnFailure) {
      await postgrator.migrate(fromVersion.toString());
    }

    return {
      startVersion: fromVersion,
      endVersion: await postgrator.getDatabaseVersion(),
      failedMigration,
      error,
      targetVersion: toVersion,
    };
  }
}

export { getCurrentVersion, getLocalMigrations, getMaxVersion, migrate, parseFilename };
