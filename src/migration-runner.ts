import { getMaxVersion, migrate } from './migrations';
import type { MigrationRunnerConfig, MigrationResult } from './types';
import { defaultLogger } from './types';

/**
 * Run schema migrations forward to the target version (or latest).
 *
 * This is a thin wrapper around Postgrator that provides consistent logging
 * and integrates with the sluice config interface.
 */
async function runMigrations(config: MigrationRunnerConfig): Promise<MigrationResult> {
  const {
    database,
    migrationsFolder: folder,
    logger = defaultLogger,
  } = config;
  const targetVersion = config.targetVersion ?? getMaxVersion(folder);

  const result = await migrate(
    database,
    folder,
    'migration',
    targetVersion,
    (m) => logger.info(`[sluice] Start migration ${m.version} (${m.name})`),
    (m) => logger.info(`[sluice] End migration ${m.version} (${m.name})`),
    true, // rollbackOnFailure
  );

  if (result.failedMigration) {
    logger.error(`[sluice] Migration ${result.failedMigration.version} failed`, {
      migration: result.failedMigration.name,
      error: result.error,
    });
  } else {
    logger.info(`[sluice] Migrations complete at version ${result.endVersion}`);
  }

  return result;
}

export { runMigrations };
