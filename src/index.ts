// Runners
export { runBackfills } from './runner';
export { runMigrations } from './migration-runner';
export { runMigrationsAndBackfills, buildDependencySteps, parseAnnotation } from './interleave';

// Postgrator wrapper
export { getCurrentVersion, getLocalMigrations, getMaxVersion, migrate, parseFilename } from './migrations';

// Utilities
export {
  parseBatchLimit,
  shouldWarnLongRunning,
  cleanStaleVersions,
  checkVersionGaps,
  ensureCompletedColumn,
  markCompleted,
  DEFAULT_BATCH_DELAY_MS,
} from './backfill-utils';

// Renumber & switch-branch
export { renumberMigrations, buildRenumberPlan } from './renumber';
export type { RenumberConfig, RenumberPlan, RenumberEntry, BackfillAnnotationUpdate, GitMode } from './renumber';
export { switchBranch } from './switch-branch';
export type { SwitchBranchConfig, SwitchBranchResult } from './switch-branch';

// Types
export type {
  BackfillRunnerConfig,
  Database,
  InterleaveRunnerConfig,
  LocalMigration,
  Logger,
  MigrationMetadata,
  MigrationResult,
  MigrationRunnerConfig,
  RunnerType,
} from './types';
export { defaultLogger } from './types';
export type { DependencyStep } from './interleave';
