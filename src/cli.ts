#!/usr/bin/env node
import 'dotenv/config';
import * as path from 'node:path';
import pgPromise from 'pg-promise';
import { runBackfills } from './runner';
import { runMigrations } from './migration-runner';
import { runMigrationsAndBackfills } from './interleave';
import { renumberMigrations } from './renumber';
import { switchBranch } from './switch-branch';
import type { Database } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(message: string): never {
  console.error(`sluice: ${message}`);
  process.exit(1);
}

function getDatabase(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    die('DATABASE_URL environment variable is required');
  }

  const pgp = pgPromise();
  return pgp({
    connectionString: url,
    // Disable timeouts for long-running migrations/backfills
    query_timeout: 0,
    statement_timeout: 0,
    idle_in_transaction_session_timeout: 0,
  }) as unknown as Database;
}

function getGucs(): string[] {
  const raw = process.env.SLUICE_GUCS;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseTargetVersion(args: string[]): number | undefined {
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  if (nonFlags.length === 0) return undefined;
  const v = Number.parseInt(nonFlags[0], 10);
  if (Number.isNaN(v)) die(`Invalid target version: ${nonFlags[0]}`);
  return v;
}

function parseFlag(args: string[], flag: string, alias?: string): string | undefined {
  for (const arg of args) {
    if (arg.startsWith(`--${flag}=`)) return arg.split('=')[1];
    if (alias && arg.startsWith(`-${alias}=`)) return arg.split('=')[1];
  }
  return undefined;
}

function resolvePath(p: string): string {
  return path.resolve(process.cwd(), p);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdBackfill(args: string[]): Promise<void> {
  const folder = parseFlag(args, 'folder', 'f') ?? die('--folder is required for backfill');
  const db = getDatabase();
  const result = await runBackfills({
    database: db,
    backfillsFolder: resolvePath(folder),
    targetVersion: parseTargetVersion(args.filter((a) => !a.startsWith('-'))),
    gucs: getGucs(),
    batchDelayMs: Number(process.env.SLUICE_BATCH_DELAY_MS) || undefined,
  });

  if (result.failedMigration) {
    die(`Backfill ${result.failedMigration.version} failed`);
  }
  console.log(`Backfills complete at version ${result.endVersion}`);
}

async function cmdMigrate(args: string[]): Promise<void> {
  const folder = parseFlag(args, 'folder', 'f') ?? die('--folder is required for migrate');
  const db = getDatabase();
  const result = await runMigrations({
    database: db,
    migrationsFolder: resolvePath(folder),
    targetVersion: parseTargetVersion(args.filter((a) => !a.startsWith('-'))),
  });

  if (result.failedMigration) {
    die(`Migration ${result.failedMigration.version} failed`);
  }
  console.log(`Migrations complete at version ${result.endVersion}`);
}

async function cmdRun(args: string[]): Promise<void> {
  const migrations = parseFlag(args, 'migrations') ?? die('--migrations is required for run');
  const backfills = parseFlag(args, 'backfills') ?? die('--backfills is required for run');
  const db = getDatabase();

  await runMigrationsAndBackfills({
    database: db,
    migrationsFolder: resolvePath(migrations),
    backfillsFolder: resolvePath(backfills),
    gucs: getGucs(),
    batchDelayMs: Number(process.env.SLUICE_BATCH_DELAY_MS) || undefined,
  });

  console.log('Interleaved run complete');
}

// ---------------------------------------------------------------------------
// Renumber command
// ---------------------------------------------------------------------------

function cmdRenumber(args: string[]): void {
  const migrations = parseFlag(args, 'migrations') ?? parseFlag(args, 'folder') ?? parseFlag(args, 'f');
  if (!migrations) die('--migrations (or --folder) is required for renumber');
  const backfills = parseFlag(args, 'backfills');
  const dryRun = args.includes('--dry-run');

  // Target branch is the first non-flag arg (or auto-detected from merge/rebase state)
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  const targetRef = nonFlags[0] ?? '';

  const plan = renumberMigrations({
    migrationsFolder: resolvePath(migrations),
    backfillsFolder: backfills ? resolvePath(backfills) : undefined,
    targetRef,
    dryRun,
  });

  if (!plan) {
    console.log('No version collisions found.');
  } else {
    console.log(`Renumbered ${plan.entries.length} migration(s) to start at ${plan.startVersion}`);
  }
}

// ---------------------------------------------------------------------------
// Switch command
// ---------------------------------------------------------------------------

async function cmdSwitch(args: string[]): Promise<void> {
  const migrations = parseFlag(args, 'migrations') ?? parseFlag(args, 'folder') ?? parseFlag(args, 'f');
  if (!migrations) die('--migrations (or --folder) is required for switch');
  const dryRun = args.includes('--dry-run');

  const nonFlags = args.filter((a) => !a.startsWith('-'));
  if (nonFlags.length === 0) die('Target branch is required for switch');
  const targetBranch = nonFlags[0];

  const db = getDatabase();
  const result = await switchBranch({
    database: db,
    migrationsFolder: resolvePath(migrations),
    targetBranch,
    dryRun,
  });

  console.log(`Switched to '${result.targetBranch}' — DB at version ${result.finalVersion}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const USAGE = `
Usage: sluice <command> [options]

Commands:
  backfill   Run backfills only
  migrate    Run schema migrations only
  run        Run interleaved migrations + backfills
  renumber   Renumber branch migrations to avoid version collisions
  switch     Safely switch database to a different git branch

backfill options:
  --folder, -f   Folder containing backfill SQL files (required)
  [version]      Target version (defaults to latest)

migrate options:
  --folder, -f   Folder containing migration SQL files (required)
  [version]      Target version (defaults to latest)

run options:
  --migrations   Folder containing migration SQL files (required)
  --backfills    Folder containing backfill SQL files (required)

renumber options:
  --migrations   Folder containing migration SQL files (required)
  --backfills    Folder containing backfill SQL files (optional)
  --dry-run      Show plan without making changes
  [target]       Target branch (auto-detected during merge/rebase)

switch options:
  --migrations   Folder containing migration SQL files (required)
  --dry-run      Show plan without making changes
  <target>       Target branch to switch to (required)

Environment:
  DATABASE_URL           PostgreSQL connection string (required)
  SLUICE_GUCS            Comma-separated GUC names to set during backfills
  SLUICE_BATCH_DELAY_MS  Delay between batch passes (default: 200)
`.trim();

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === '-h' || command === '--help') {
    console.log(USAGE);
    process.exit(0);
  }

  switch (command) {
    case 'backfill':
      return cmdBackfill(args);
    case 'migrate':
      return cmdMigrate(args);
    case 'run':
      return cmdRun(args);
    case 'renumber':
      return cmdRenumber(args);
    case 'switch':
      return cmdSwitch(args);
    default:
      die(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
