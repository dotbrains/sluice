import * as fs from 'node:fs';
import * as path from 'node:path';
import pgPromise from 'pg-promise';
import type { Database } from '../src/types';

const pgp = pgPromise();

/** Resolve the database URL from env, testcontainer state file, or default. */
function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Read from testcontainers state file written by global-setup.db.ts
  const stateFile = path.join(__dirname, '.pg-container-state.json');
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    return state.url as string;
  }

  return 'postgres://localhost:5432/postgres';
}

/**
 * Create a temporary database for testing, run the callback, then drop it.
 *
 * Resolves the connection URL from (in order):
 * 1. `DATABASE_URL` environment variable
 * 2. Testcontainers state file (written by `global-setup.db.ts`)
 * 3. `postgres://localhost:5432/postgres` fallback
 */
export async function withTestDatabase(
  fn: (db: Database) => Promise<void>,
): Promise<void> {
  const baseUrl = getDatabaseUrl();
  const adminDb = pgp(baseUrl);

  const dbName = `sluice_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await adminDb.none(`CREATE DATABASE "${dbName}"`);

    // Parse the base URL and replace the database name
    const url = new URL(baseUrl);
    url.pathname = `/${dbName}`;
    const testDb = pgp(url.toString()) as unknown as Database;

    try {
      await fn(testDb);
    } finally {
      await (testDb as unknown as ReturnType<typeof pgp>).$pool.end();
    }
  } finally {
    // Force disconnect other connections before dropping
    await adminDb.none(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      dbName,
    );
    await adminDb.none(`DROP DATABASE IF EXISTS "${dbName}"`);
    await adminDb.$pool.end();
  }
}
