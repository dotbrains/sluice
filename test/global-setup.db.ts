/**
 * Vitest globalSetup — starts a PostgreSQL container before all DB tests
 * and tears it down after.
 *
 * Since globalSetup runs in a separate context from the test workers, we
 * write the connection URL to a temp file that `db-test-utils.ts` reads.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export const STATE_FILE = path.join(__dirname, '.pg-container-state.json');

let container: StartedPostgreSqlContainer;

export async function setup(): Promise<void> {
  console.log('[sluice] Starting PostgreSQL container…');

  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('sluice_test')
    .withUsername('sluice')
    .withPassword('sluice')
    .start();

  const url = container.getConnectionUri();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ url }));

  console.log(`[sluice] PostgreSQL container ready at ${url}`);
}

export async function teardown(): Promise<void> {
  console.log('[sluice] Stopping PostgreSQL container…');

  if (container) {
    await container.stop();
  }

  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}
