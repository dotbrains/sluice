import { execSync } from 'node:child_process';
import type { Database, Logger } from './types';
import { defaultLogger } from './types';
import { migrate, getCurrentVersion, getLocalMigrations } from './migrations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwitchBranchConfig {
  /** pg-promise database instance. */
  database: Database;
  /** Path to the migrations directory. */
  migrationsFolder: string;
  /** Target branch to switch to. */
  targetBranch: string;
  /** If true, print what would happen without making changes. */
  dryRun?: boolean;
  logger?: Logger;
}

export interface SwitchBranchResult {
  /** Version the database was rolled back to (the common ancestor version). */
  commonVersion: number;
  /** Branch that was checked out. */
  targetBranch: string;
  /** Version the database was migrated up to after checkout. */
  finalVersion: number;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args: string): string {
  return execSync(`git ${args}`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function resolveRef(ref: string): string {
  try {
    git(`rev-parse --verify ${ref}`);
    return ref;
  } catch {
    try {
      git(`rev-parse --verify origin/${ref}`);
      return `origin/${ref}`;
    } catch {
      throw new Error(`Branch '${ref}' not found locally or on origin`);
    }
  }
}

/**
 * Find the migration version at a given ref by looking at the max version
 * number in the migrations folder at that commit.
 */
function maxVersionAtRef(ref: string, migrationsFolder: string): number {
  try {
    const output = git(`ls-tree -r --name-only ${ref} -- ${migrationsFolder}/`);
    const versions = output
      .split('\n')
      .filter((f) => f.includes('.do.'))
      .filter((f) => !f.endsWith('.test.ts'))
      .map((f) => {
        const basename = f.split('/').pop() ?? '';
        const match = basename.match(/^(\d+)\./);
        return match ? Number(match[1]) : 0;
      })
      .filter((v) => v > 0);

    return versions.length > 0 ? Math.max(...versions) : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Safely switch the database and working tree to a different git branch.
 *
 * The workflow:
 * 1. Find the common merge-base between HEAD and the target branch
 * 2. Determine the max migration version at that common ancestor
 * 3. Migrate the database DOWN to that common version
 * 4. `git checkout` the target branch
 * 5. Migrate the database UP to the target branch's latest version
 */
export async function switchBranch(config: SwitchBranchConfig): Promise<SwitchBranchResult> {
  const { database, migrationsFolder, dryRun = false, logger = defaultLogger } = config;
  const targetRef = resolveRef(config.targetBranch);
  const currentBranch = git('rev-parse --abbrev-ref HEAD');

  logger.info(`[sluice] Switching database from '${currentBranch}' → '${config.targetBranch}'`);

  // 1. Find common ancestor
  const mergeBase = git(`merge-base HEAD ${targetRef}`);
  const commonVersion = maxVersionAtRef(mergeBase, migrationsFolder);
  const currentDbVersion = await getCurrentVersion(database, 'migration');
  const targetMaxVersion = maxVersionAtRef(targetRef, migrationsFolder);

  logger.info(`[sluice] Current DB version: ${currentDbVersion}`);
  logger.info(`[sluice] Common ancestor version: ${commonVersion}`);
  logger.info(`[sluice] Target branch max version: ${targetMaxVersion}`);

  if (commonVersion === 0) {
    throw new Error('Could not determine common migration version between branches');
  }

  if (dryRun) {
    logger.info('[sluice] [dry-run] Would:');
    logger.info(`  1. Migrate DOWN from ${currentDbVersion} → ${commonVersion}`);
    logger.info(`  2. git checkout ${config.targetBranch}`);
    logger.info(`  3. Migrate UP to ${targetMaxVersion}`);
    return {
      commonVersion,
      targetBranch: config.targetBranch,
      finalVersion: targetMaxVersion,
    };
  }

  // 2. Migrate DOWN to common version
  if (currentDbVersion > commonVersion) {
    logger.info(`[sluice] Migrating DOWN: ${currentDbVersion} → ${commonVersion}`);
    await migrate(database, migrationsFolder, 'migration', commonVersion);
  } else {
    logger.info('[sluice] Database already at or below common version, skipping migrate-down');
  }

  // 3. Checkout target branch
  logger.info(`[sluice] Checking out '${config.targetBranch}'`);
  git(`checkout ${config.targetBranch}`);

  // 4. Migrate UP on the target branch
  const localMigrations = await getLocalMigrations(migrationsFolder);
  const maxOnDisk = localMigrations.length > 0
    ? Math.max(...localMigrations.map((m) => Number(m.version)))
    : 0;

  if (maxOnDisk > commonVersion) {
    logger.info(`[sluice] Migrating UP: ${commonVersion} → ${maxOnDisk}`);
    await migrate(database, migrationsFolder, 'migration', maxOnDisk);
  } else {
    logger.info('[sluice] No new migrations on target branch');
  }

  const finalVersion = await getCurrentVersion(database, 'migration');
  logger.info(`[sluice] Switch complete. DB at version ${finalVersion}`);

  return {
    commonVersion,
    targetBranch: config.targetBranch,
    finalVersion,
  };
}
