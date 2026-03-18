import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from './types';
import { defaultLogger } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenumberEntry {
  oldVersion: number;
  newVersion: number;
  oldDo: string;
  newDo: string;
  oldUndo: string | null;
  newUndo: string | null;
  oldTest: string | null;
  newTest: string | null;
}

export interface BackfillAnnotationUpdate {
  filePath: string;
  oldRef: string;
  newRef: string;
}

export interface RenumberPlan {
  /** Migration files that will be renumbered. */
  entries: RenumberEntry[];
  /** Backfill files whose @migration annotations will be updated. */
  backfillUpdates: BackfillAnnotationUpdate[];
  /** The max migration version on the target branch. */
  targetMaxVersion: number;
  /** The first version your branch's migrations will be renumbered to. */
  startVersion: number;
}

export interface RenumberConfig {
  /** Path to the migrations directory. */
  migrationsFolder: string;
  /** Path to the backfills directory. Optional — if provided, @migration annotations are updated. */
  backfillsFolder?: string;
  /** Target branch or ref to renumber against (e.g. 'master', 'origin/main'). */
  targetRef: string;
  /** If true, return the plan without making changes. */
  dryRun?: boolean;
  logger?: Logger;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args: string, cwd?: string): string {
  return execSync(`git ${args}`, {
    encoding: 'utf-8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function resolveRef(ref: string): string {
  try {
    git(`rev-parse --verify ${ref}`);
    return ref;
  } catch {
    // Try origin/<ref>
    try {
      git(`rev-parse --verify origin/${ref}`);
      return `origin/${ref}`;
    } catch {
      throw new Error(`Branch '${ref}' not found locally or on origin`);
    }
  }
}

/** List .do. migration filenames at a given git ref. */
function listDoFilesAtRef(ref: string, migrationsFolder: string): string[] {
  try {
    const output = git(`ls-tree -r --name-only ${ref} -- ${migrationsFolder}/`);
    return output
      .split('\n')
      .map((f) => path.basename(f))
      .filter((f) => f.includes('.do.'))
      .filter((f) => !f.endsWith('.test.ts'))
      .sort((a, b) => versionFromFile(a) - versionFromFile(b));
  } catch {
    return [];
  }
}

function maxVersionAtRef(ref: string, migrationsFolder: string): number {
  const files = listDoFilesAtRef(ref, migrationsFolder);
  if (files.length === 0) return 0;
  return Math.max(...files.map(versionFromFile));
}

function versionFromFile(filename: string): number {
  const match = path.basename(filename).match(/^(\d+)\./);
  return match ? Number(match[1]) : 0;
}

// ---------------------------------------------------------------------------
// Detect merge/rebase state
// ---------------------------------------------------------------------------

export type GitMode = 'proactive' | 'merge' | 'rebase';

interface GitState {
  mode: GitMode;
  targetRef: string;
  ourRef: string;
}

function detectGitState(targetArg: string | undefined): GitState {
  const gitDir = git('rev-parse --git-dir');

  // Check for in-progress merge
  if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
    const mergeHead = fs.readFileSync(path.join(gitDir, 'MERGE_HEAD'), 'utf-8').trim();
    return { mode: 'merge', targetRef: targetArg ? resolveRef(targetArg) : mergeHead, ourRef: 'HEAD' };
  }

  // Check for in-progress rebase
  for (const dir of ['rebase-merge', 'rebase-apply']) {
    const ontoPath = path.join(gitDir, dir, 'onto');
    if (fs.existsSync(ontoPath)) {
      const onto = fs.readFileSync(ontoPath, 'utf-8').trim();
      const origHeadPath = path.join(gitDir, dir, 'orig-head');
      const ourRef = fs.existsSync(origHeadPath)
        ? fs.readFileSync(origHeadPath, 'utf-8').trim()
        : 'ORIG_HEAD';
      return { mode: 'rebase', targetRef: targetArg ? resolveRef(targetArg) : onto, ourRef };
    }
  }

  // Proactive mode
  if (!targetArg) {
    throw new Error('Not in a merge or rebase — pass a target branch to renumber proactively.');
  }
  return { mode: 'proactive', targetRef: resolveRef(targetArg), ourRef: 'HEAD' };
}

// ---------------------------------------------------------------------------
// Core: build renumbering plan
// ---------------------------------------------------------------------------

/**
 * Detect version collisions between the current branch's migrations and a
 * target branch, and compute a renumbering plan.
 */
export function buildRenumberPlan(config: {
  migrationsFolder: string;
  backfillsFolder?: string;
  targetRef: string;
  ourRef?: string;
}): RenumberPlan | null {
  const { migrationsFolder, backfillsFolder, targetRef } = config;
  const ourRef = config.ourRef ?? 'HEAD';

  const mergeBase = git(`merge-base ${ourRef} ${targetRef}`);
  const targetMax = maxVersionAtRef(targetRef, migrationsFolder);
  const commonMax = maxVersionAtRef(mergeBase, migrationsFolder);

  if (targetMax === 0 || commonMax === 0) {
    return null;
  }

  // Identify branch-only .do files (in ours but not in the common ancestor)
  const ourDoFiles = listDoFilesAtRef(ourRef, migrationsFolder);
  const baseDoFiles = new Set(listDoFilesAtRef(mergeBase, migrationsFolder));
  const branchOnlyDo = ourDoFiles.filter((f) => !baseDoFiles.has(f));

  if (branchOnlyDo.length === 0) {
    return null;
  }

  // Check if any need renumbering
  const needsFix = branchOnlyDo.some((f) => versionFromFile(f) <= targetMax);
  if (!needsFix) {
    return null;
  }

  // Build plan
  let nextVersion = targetMax + 1;
  const seenVersions = new Set<number>();
  const entries: RenumberEntry[] = [];
  const backfillUpdates: BackfillAnnotationUpdate[] = [];

  for (const doFile of branchOnlyDo) {
    const oldVersion = versionFromFile(doFile);
    if (seenVersions.has(oldVersion)) continue;
    seenVersions.add(oldVersion);

    const newDo = doFile.replace(new RegExp(`^${oldVersion}\\.`), `${nextVersion}.`);
    const oldUndo = `${oldVersion}.undo.sql`;
    const newUndo = `${nextVersion}.undo.sql`;

    // Check for colocated .test.ts
    const baseNoExt = doFile.replace(/\.sql$/, '').replace(/\.ts$/, '');
    const candidateTest = `${baseNoExt}.test.ts`;
    let oldTest: string | null = null;
    let newTest: string | null = null;

    // Check if test exists at our ref or on disk
    try {
      git(`cat-file -e ${ourRef}:${migrationsFolder}/${candidateTest}`);
      oldTest = candidateTest;
      newTest = candidateTest.replace(new RegExp(`^${oldVersion}\\.`), `${nextVersion}.`);
    } catch {
      if (fs.existsSync(path.join(migrationsFolder, candidateTest))) {
        oldTest = candidateTest;
        newTest = candidateTest.replace(new RegExp(`^${oldVersion}\\.`), `${nextVersion}.`);
      }
    }

    // Check if the undo file actually exists
    let hasUndo = false;
    try {
      git(`cat-file -e ${ourRef}:${migrationsFolder}/${oldUndo}`);
      hasUndo = true;
    } catch {
      hasUndo = fs.existsSync(path.join(migrationsFolder, oldUndo));
    }

    entries.push({
      oldVersion,
      newVersion: nextVersion,
      oldDo: doFile,
      newDo,
      oldUndo: hasUndo ? oldUndo : null,
      newUndo: hasUndo ? newUndo : null,
      oldTest,
      newTest,
    });

    // Check for backfill @migration references
    if (backfillsFolder && fs.existsSync(backfillsFolder)) {
      const sqlFiles = fs.readdirSync(backfillsFolder).filter((f) => f.endsWith('.sql'));
      for (const bf of sqlFiles) {
        const bfPath = path.join(backfillsFolder, bf);
        const content = fs.readFileSync(bfPath, 'utf-8');
        if (content.includes(`-- @migration ${doFile}`)) {
          backfillUpdates.push({
            filePath: bfPath,
            oldRef: doFile,
            newRef: newDo,
          });
        }
      }
    }

    nextVersion++;
  }

  return {
    entries,
    backfillUpdates,
    targetMaxVersion: targetMax,
    startVersion: targetMax + 1,
  };
}

// ---------------------------------------------------------------------------
// Apply renumbering
// ---------------------------------------------------------------------------

function applyProactive(plan: RenumberPlan, migrationsFolder: string): void {
  for (const entry of plan.entries) {
    const oldDoPath = path.join(migrationsFolder, entry.oldDo);
    const newDoPath = path.join(migrationsFolder, entry.newDo);
    if (fs.existsSync(oldDoPath)) {
      fs.renameSync(oldDoPath, newDoPath);
    }

    if (entry.oldUndo && entry.newUndo) {
      const oldUndoPath = path.join(migrationsFolder, entry.oldUndo);
      const newUndoPath = path.join(migrationsFolder, entry.newUndo);
      if (fs.existsSync(oldUndoPath)) {
        fs.renameSync(oldUndoPath, newUndoPath);
      }
    }

    if (entry.oldTest && entry.newTest) {
      const oldTestPath = path.join(migrationsFolder, entry.oldTest);
      const newTestPath = path.join(migrationsFolder, entry.newTest);
      if (fs.existsSync(oldTestPath)) {
        fs.renameSync(oldTestPath, newTestPath);
      }
    }
  }
}

function applyMergeRebase(
  plan: RenumberPlan,
  migrationsFolder: string,
  state: GitState,
): void {
  const targetDoFiles = new Set(listDoFilesAtRef(state.targetRef, migrationsFolder));

  for (const entry of plan.entries) {
    // Extract our version of the .do file from our ref
    const newDoPath = path.join(migrationsFolder, entry.newDo);
    try {
      const content = git(`show ${state.ourRef}:${migrationsFolder}/${entry.oldDo}`);
      fs.writeFileSync(newDoPath, content);
    } catch { /* file might already be on disk */ }

    // Remove old-numbered .do only if it's ours (target doesn't have the same name)
    const oldDoPath = path.join(migrationsFolder, entry.oldDo);
    if (fs.existsSync(oldDoPath) && !targetDoFiles.has(entry.oldDo)) {
      fs.unlinkSync(oldDoPath);
    }

    // Handle colocated .test.ts
    if (entry.oldTest && entry.newTest) {
      const newTestPath = path.join(migrationsFolder, entry.newTest);
      try {
        const content = git(`show ${state.ourRef}:${migrationsFolder}/${entry.oldTest}`);
        fs.writeFileSync(newTestPath, content);
      } catch { /* may not exist */ }

      const oldTestPath = path.join(migrationsFolder, entry.oldTest);
      if (fs.existsSync(oldTestPath)) {
        fs.unlinkSync(oldTestPath);
      }
    }

    // Handle undo: write our version to the new number
    if (entry.oldUndo && entry.newUndo) {
      const newUndoPath = path.join(migrationsFolder, entry.newUndo);
      try {
        const content = git(`show ${state.ourRef}:${migrationsFolder}/${entry.oldUndo}`);
        fs.writeFileSync(newUndoPath, content);
      } catch { /* may not exist */ }

      // For the conflicted old-numbered undo, accept the target's version
      const oldUndoPath = path.join(migrationsFolder, entry.oldUndo);
      try {
        const isConflicted = git(`ls-files -u -- ${oldUndoPath}`);
        if (isConflicted) {
          // In merge: theirs is the target. In rebase: ours is the target (reversed).
          const strategy = state.mode === 'merge' ? '--theirs' : '--ours';
          execSync(`git checkout ${strategy} -- ${oldUndoPath}`, { stdio: 'pipe' });
        }
      } catch { /* not conflicted, no action needed */ }
    }
  }
}

function applyBackfillUpdates(updates: BackfillAnnotationUpdate[]): void {
  for (const update of updates) {
    const content = fs.readFileSync(update.filePath, 'utf-8');
    const updated = content.replace(
      `-- @migration ${update.oldRef}`,
      `-- @migration ${update.newRef}`,
    );
    fs.writeFileSync(update.filePath, updated);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect version collisions and renumber branch-only migrations to avoid them.
 *
 * Works in three modes:
 * - **merge**: During an in-progress `git merge` with conflicts
 * - **rebase**: During an in-progress `git rebase` with conflicts
 * - **proactive**: Before merging, to avoid conflicts entirely
 *
 * Returns the plan that was applied (or would be applied in dry-run mode).
 */
export function renumberMigrations(config: RenumberConfig): RenumberPlan | null {
  const { migrationsFolder, backfillsFolder, dryRun = false, logger = defaultLogger } = config;

  const state = detectGitState(config.targetRef);
  logger.info(`[sluice] Mode: ${state.mode}, target: ${state.targetRef}`);

  const plan = buildRenumberPlan({
    migrationsFolder,
    backfillsFolder,
    targetRef: state.targetRef,
    ourRef: state.ourRef,
  });

  if (!plan) {
    logger.info('[sluice] No version collisions found — nothing to renumber.');
    return null;
  }

  logger.info(`[sluice] Renumbering ${plan.entries.length} migration(s) to start at ${plan.startVersion}`);
  for (const entry of plan.entries) {
    logger.info(`  ${entry.oldDo} → ${entry.newDo}`);
    if (entry.oldUndo && entry.newUndo) {
      logger.info(`  ${entry.oldUndo} → ${entry.newUndo}`);
    }
    if (entry.oldTest && entry.newTest) {
      logger.info(`  ${entry.oldTest} → ${entry.newTest}`);
    }
  }
  for (const update of plan.backfillUpdates) {
    logger.info(`  backfill ${path.basename(update.filePath)}: @migration ${update.oldRef} → ${update.newRef}`);
  }

  if (dryRun) {
    logger.info('[sluice] [dry-run] No changes made.');
    return plan;
  }

  // Apply file changes
  if (state.mode === 'proactive') {
    applyProactive(plan, migrationsFolder);
  } else {
    applyMergeRebase(plan, migrationsFolder, state);
  }

  // Apply backfill annotation updates
  if (plan.backfillUpdates.length > 0) {
    applyBackfillUpdates(plan.backfillUpdates);
    logger.info(`[sluice] Updated ${plan.backfillUpdates.length} backfill @migration annotation(s)`);
  }

  // Stage changes
  try {
    git(`add ${migrationsFolder}`);
    if (backfillsFolder && plan.backfillUpdates.length > 0) {
      git(`add ${backfillsFolder}`);
    }
  } catch {
    // Staging might fail outside a git repo (e.g., in tests)
  }

  logger.info(`[sluice] Migrations renumbered to start at ${plan.startVersion}.`);
  return plan;
}
