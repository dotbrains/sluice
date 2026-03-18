import type Postgrator from 'postgrator';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Minimal logger interface. Defaults to `console` when not provided.
 * Compatible with pino, winston, console, or any object that implements
 * these four methods.
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/** Default logger that delegates to `console`. */
export const defaultLogger: Logger = {
  info: (msg, meta) => (meta ? console.log(msg, meta) : console.log(msg)),
  warn: (msg, meta) => (meta ? console.warn(msg, meta) : console.warn(msg)),
  error: (msg, meta) => (meta ? console.error(msg, meta) : console.error(msg)),
  debug: (msg, meta) => (meta ? console.debug(msg, meta) : console.debug(msg)),
};

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/**
 * Subset of the pg-promise database interface that sluice requires.
 * This avoids coupling to a specific pg-promise version while still
 * requiring the APIs needed for pinned connections and transactions.
 */
export interface Database {
  none(query: string, values?: unknown): Promise<void>;
  one<T = unknown>(query: string, values?: unknown): Promise<T>;
  manyOrNone<T = unknown>(query: string, values?: unknown): Promise<T[]>;
  result(query: string, values?: unknown): Promise<{ rowCount: number }>;
  query(query: string, values?: unknown): Promise<unknown[]>;
  task<T>(cb: (t: Database) => Promise<T>): Promise<T>;
  tx<T>(cb: (t: Database) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Runner type
// ---------------------------------------------------------------------------

export type RunnerType = 'migration' | 'backfill';

// ---------------------------------------------------------------------------
// Migration metadata
// ---------------------------------------------------------------------------

/** Metadata parsed from a Postgrator-style filename. */
export type MigrationMetadata = Pick<Postgrator.Migration, 'version' | 'action' | 'name'> &
  Partial<Postgrator.Migration>;

/** Extended metadata for a migration file on disk. */
export type LocalMigration = MigrationMetadata & {
  /** Absolute path to the migration file. */
  filePath: string;
};

/** Result of a migration or backfill run. */
export interface MigrationResult {
  startVersion?: number;
  targetVersion: number;
  endVersion: number;
  failedMigration?: MigrationMetadata;
  error?: unknown;
}

// ---------------------------------------------------------------------------
// Backfill runner config
// ---------------------------------------------------------------------------

export interface BackfillRunnerConfig {
  /** pg-promise database instance. */
  database: Database;
  /** Folder containing backfill SQL files. */
  backfillsFolder: string;
  /** Target version to run to. Defaults to the max version found on disk. */
  targetVersion?: number;
  /**
   * PostgreSQL GUC names to set to `'true'` at session level before running
   * backfills. Use this to bypass triggers during backfills. Each backfill
   * can override with `SET LOCAL "<guc>" = 'false'` to re-enable triggers.
   */
  gucs?: string[];
  /** Delay in ms between batch passes. Defaults to 200. */
  batchDelayMs?: number;
  logger?: Logger;
}

// ---------------------------------------------------------------------------
// Migration runner config
// ---------------------------------------------------------------------------

export interface MigrationRunnerConfig {
  database: Database;
  migrationsFolder: string;
  targetVersion?: number;
  logger?: Logger;
}

// ---------------------------------------------------------------------------
// Interleaved runner config
// ---------------------------------------------------------------------------

export interface InterleaveRunnerConfig {
  database: Database;
  migrationsFolder: string;
  backfillsFolder: string;
  gucs?: string[];
  batchDelayMs?: number;
  logger?: Logger;
}
