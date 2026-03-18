import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { buildRenumberPlan } from '../src/renumber';
import type { RenumberPlan } from '../src/renumber';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpBase: string;

function shell(cmd: string, cwd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Create a fresh git repo with an initial commit and return its path. */
function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(tmpBase, 'repo-'));
  shell('git init', dir);
  shell('git config user.email "test@test.com"', dir);
  shell('git config user.name "Test"', dir);

  // Initial commit so HEAD exists
  fs.writeFileSync(path.join(dir, '.gitkeep'), '');
  shell('git add .', dir);
  shell('git commit -m "init"', dir);

  return dir;
}

function writeMigration(dir: string, version: number, name: string, content = 'SELECT 1;\n'): void {
  const migrationsDir = path.join(dir, 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.writeFileSync(path.join(migrationsDir, `${version}.do.${name}.sql`), content);
}

function writeUndo(dir: string, version: number): void {
  const migrationsDir = path.join(dir, 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.writeFileSync(path.join(migrationsDir, `${version}.undo.sql`), `-- undo ${version}\n`);
}

function writeBackfill(dir: string, version: number, name: string, migrationFile: string): void {
  const backfillsDir = path.join(dir, 'backfills');
  fs.mkdirSync(backfillsDir, { recursive: true });
  fs.writeFileSync(
    path.join(backfillsDir, `${version}.do.${name}.sql`),
    `-- @migration ${migrationFile}\nSELECT 1 LIMIT 100;\n`,
  );
}

beforeAll(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-renumber-'));
});

afterAll(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// buildRenumberPlan
// ---------------------------------------------------------------------------

describe('buildRenumberPlan', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = initRepo();
    process.chdir(repoDir);
  });

  it('returns null when no branch-only migrations exist', () => {
    // Both branches have the same migrations
    writeMigration(repoDir, 1, 'init');
    writeMigration(repoDir, 2, 'add-users');
    shell('git add . && git commit -m "base migrations"', repoDir);

    shell('git checkout -b feature', repoDir);
    // No new migrations on feature

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      targetRef: 'master',
    });
    expect(plan).toBeNull();
  });

  it('returns null when branch migrations do not collide', () => {
    writeMigration(repoDir, 1, 'init');
    writeMigration(repoDir, 2, 'add-users');
    shell('git add . && git commit -m "base"', repoDir);

    // Target adds migration 3
    shell('git checkout -b target', repoDir);
    writeMigration(repoDir, 3, 'target-mig');
    shell('git add . && git commit -m "target mig"', repoDir);

    // Feature branch adds migration 4 (no collision)
    shell('git checkout master', repoDir);
    shell('git checkout -b feature', repoDir);
    writeMigration(repoDir, 4, 'feature-mig');
    shell('git add . && git commit -m "feature mig"', repoDir);

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      targetRef: 'target',
    });
    expect(plan).toBeNull();
  });

  it('detects collision and builds renumber plan', () => {
    writeMigration(repoDir, 1, 'init');
    shell('git add . && git commit -m "base"', repoDir);

    // Target adds migrations 2 and 3
    shell('git checkout -b target', repoDir);
    writeMigration(repoDir, 2, 'target-a');
    writeMigration(repoDir, 3, 'target-b');
    shell('git add . && git commit -m "target migrations"', repoDir);

    // Feature also adds migration 2 (collision!)
    shell('git checkout master', repoDir);
    shell('git checkout -b feature', repoDir);
    writeMigration(repoDir, 2, 'feature-a');
    shell('git add . && git commit -m "feature migration"', repoDir);

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      targetRef: 'target',
    });

    expect(plan).not.toBeNull();
    expect(plan!.targetMaxVersion).toBe(3);
    expect(plan!.startVersion).toBe(4);
    expect(plan!.entries).toHaveLength(1);
    expect(plan!.entries[0].oldVersion).toBe(2);
    expect(plan!.entries[0].newVersion).toBe(4);
    expect(plan!.entries[0].oldDo).toBe('2.do.feature-a.sql');
    expect(plan!.entries[0].newDo).toBe('4.do.feature-a.sql');
  });

  it('renumbers multiple branch migrations sequentially', () => {
    writeMigration(repoDir, 1, 'init');
    shell('git add . && git commit -m "base"', repoDir);

    // Target adds migration 2-4
    shell('git checkout -b target', repoDir);
    writeMigration(repoDir, 2, 'target-a');
    writeMigration(repoDir, 3, 'target-b');
    writeMigration(repoDir, 4, 'target-c');
    shell('git add . && git commit -m "target"', repoDir);

    // Feature adds 2 and 3 (both collide)
    shell('git checkout master', repoDir);
    shell('git checkout -b feature', repoDir);
    writeMigration(repoDir, 2, 'feat-x');
    writeMigration(repoDir, 3, 'feat-y');
    shell('git add . && git commit -m "feature"', repoDir);

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      targetRef: 'target',
    });

    expect(plan).not.toBeNull();
    expect(plan!.entries).toHaveLength(2);
    expect(plan!.entries[0]).toMatchObject({ oldVersion: 2, newVersion: 5 });
    expect(plan!.entries[1]).toMatchObject({ oldVersion: 3, newVersion: 6 });
  });

  it('includes undo files when they exist', () => {
    writeMigration(repoDir, 1, 'init');
    shell('git add . && git commit -m "base"', repoDir);

    shell('git checkout -b target', repoDir);
    writeMigration(repoDir, 2, 'target-a');
    shell('git add . && git commit -m "target"', repoDir);

    shell('git checkout master && git checkout -b feature', repoDir);
    writeMigration(repoDir, 2, 'feat-a');
    writeUndo(repoDir, 2);
    shell('git add . && git commit -m "feature"', repoDir);

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      targetRef: 'target',
    });

    expect(plan).not.toBeNull();
    expect(plan!.entries[0].oldUndo).toBe('2.undo.sql');
    expect(plan!.entries[0].newUndo).toBe('3.undo.sql');
  });

  it('does not include undo files when they do not exist', () => {
    writeMigration(repoDir, 1, 'init');
    shell('git add . && git commit -m "base"', repoDir);

    shell('git checkout -b target', repoDir);
    writeMigration(repoDir, 2, 'target-a');
    shell('git add . && git commit -m "target"', repoDir);

    shell('git checkout master && git checkout -b feature', repoDir);
    writeMigration(repoDir, 2, 'feat-a');
    shell('git add . && git commit -m "feature"', repoDir);

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      targetRef: 'target',
    });

    expect(plan!.entries[0].oldUndo).toBeNull();
    expect(plan!.entries[0].newUndo).toBeNull();
  });

  it('detects backfill annotation updates', () => {
    writeMigration(repoDir, 1, 'init');
    shell('git add . && git commit -m "base"', repoDir);

    shell('git checkout -b target', repoDir);
    writeMigration(repoDir, 2, 'target-a');
    shell('git add . && git commit -m "target"', repoDir);

    shell('git checkout master && git checkout -b feature', repoDir);
    writeMigration(repoDir, 2, 'feat-a');
    writeBackfill(repoDir, 1, 'fill', '2.do.feat-a.sql');
    shell('git add . && git commit -m "feature"', repoDir);

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      backfillsFolder: path.join(repoDir, 'backfills'),
      targetRef: 'target',
    });

    expect(plan).not.toBeNull();
    expect(plan!.backfillUpdates).toHaveLength(1);
    expect(plan!.backfillUpdates[0].oldRef).toBe('2.do.feat-a.sql');
    expect(plan!.backfillUpdates[0].newRef).toBe('3.do.feat-a.sql');
  });

  it('handles ourRef override', () => {
    writeMigration(repoDir, 1, 'init');
    shell('git add . && git commit -m "base"', repoDir);

    shell('git checkout -b target', repoDir);
    writeMigration(repoDir, 2, 'target-a');
    shell('git add . && git commit -m "target"', repoDir);

    shell('git checkout master && git checkout -b feature', repoDir);
    writeMigration(repoDir, 2, 'feat-a');
    shell('git add . && git commit -m "feature"', repoDir);

    const featureSha = shell('git rev-parse HEAD', repoDir);

    // Check out some other branch, but still pass feature's SHA as ourRef
    shell('git checkout master', repoDir);

    const plan = buildRenumberPlan({
      migrationsFolder: path.join(repoDir, 'migrations'),
      targetRef: 'target',
      ourRef: featureSha,
    });

    expect(plan).not.toBeNull();
    expect(plan!.entries[0].oldDo).toBe('2.do.feat-a.sql');
  });
});
