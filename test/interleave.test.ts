import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseAnnotation, buildDependencySteps } from '../src/interleave';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeFixture(
  backfills: { version: number; name: string; migrationFile: string }[],
  migrations: { version: number; name: string }[],
): { backfillsFolder: string; migrationsFolder: string } {
  const dir = fs.mkdtempSync(path.join(tmpDir, 'fixture-'));
  const backfillsFolder = path.join(dir, 'backfills');
  const migrationsFolder = path.join(dir, 'migrations');
  fs.mkdirSync(backfillsFolder);
  fs.mkdirSync(migrationsFolder);

  for (const bf of backfills) {
    fs.writeFileSync(
      path.join(backfillsFolder, `${String(bf.version).padStart(3, '0')}.do.${bf.name}.sql`),
      `-- @migration ${bf.migrationFile}\nSELECT 1 LIMIT 100;\n`,
    );
  }
  for (const mig of migrations) {
    fs.writeFileSync(
      path.join(migrationsFolder, `${String(mig.version).padStart(3, '0')}.do.${mig.name}.sql`),
      'SELECT 1;\n',
    );
  }

  return { backfillsFolder, migrationsFolder };
}

// ---------------------------------------------------------------------------
// parseAnnotation
// ---------------------------------------------------------------------------

describe('parseAnnotation', () => {
  it('extracts migration filename from first line', () => {
    const { backfillsFolder } = makeFixture(
      [{ version: 1, name: 'a', migrationFile: '005.do.create-table.sql' }],
      [{ version: 5, name: 'create-table' }],
    );
    expect(parseAnnotation(path.join(backfillsFolder, '001.do.a.sql'))).toBe(
      '005.do.create-table.sql',
    );
  });

  it('throws when annotation is missing', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'no-annot-'));
    const filePath = path.join(dir, '001.do.bad.sql');
    fs.writeFileSync(filePath, 'SELECT 1;\n');

    expect(() => parseAnnotation(filePath)).toThrow('missing a "-- @migration <file>" annotation');
  });
});

// ---------------------------------------------------------------------------
// buildDependencySteps
// ---------------------------------------------------------------------------

describe('buildDependencySteps', () => {
  it('builds steps from annotated backfill files', () => {
    const { backfillsFolder, migrationsFolder } = makeFixture(
      [
        { version: 1, name: 'a', migrationFile: '005.do.create-table.sql' },
        { version: 2, name: 'b', migrationFile: '010.do.add-col.sql' },
        { version: 3, name: 'c', migrationFile: '010.do.add-col.sql' },
      ],
      [
        { version: 5, name: 'create-table' },
        { version: 10, name: 'add-col' },
      ],
    );

    expect(buildDependencySteps(backfillsFolder, migrationsFolder)).toEqual([
      { migration: 5, backfill: 1 },
      { migration: 10, backfill: 3 },
    ]);
  });

  it('returns empty when no backfill files exist', () => {
    const { backfillsFolder, migrationsFolder } = makeFixture([], [{ version: 1, name: 'init' }]);
    expect(buildDependencySteps(backfillsFolder, migrationsFolder)).toEqual([]);
  });

  it('sorts steps by migration version', () => {
    const { backfillsFolder, migrationsFolder } = makeFixture(
      [
        { version: 3, name: 'c', migrationFile: '020.do.z.sql' },
        { version: 1, name: 'a', migrationFile: '005.do.x.sql' },
        { version: 2, name: 'b', migrationFile: '010.do.y.sql' },
      ],
      [
        { version: 5, name: 'x' },
        { version: 10, name: 'y' },
        { version: 20, name: 'z' },
      ],
    );

    expect(buildDependencySteps(backfillsFolder, migrationsFolder)).toEqual([
      { migration: 5, backfill: 1 },
      { migration: 10, backfill: 2 },
      { migration: 20, backfill: 3 },
    ]);
  });

  it('throws when annotation references non-existent migration', () => {
    const { backfillsFolder, migrationsFolder } = makeFixture(
      [{ version: 1, name: 'a', migrationFile: '999.do.nope.sql' }],
      [{ version: 5, name: 'create-table' }],
    );

    expect(() => buildDependencySteps(backfillsFolder, migrationsFolder)).toThrow(
      'references migration "999.do.nope.sql", but no such file exists',
    );
  });
});

// ---------------------------------------------------------------------------
// Ascending dependency order
// ---------------------------------------------------------------------------

describe('ascending dependency order', () => {
  it('detects backwards dependency', () => {
    const { backfillsFolder, migrationsFolder } = makeFixture(
      [
        { version: 1, name: 'a', migrationFile: '100.do.later.sql' },
        { version: 2, name: 'b', migrationFile: '050.do.earlier.sql' },
      ],
      [
        { version: 50, name: 'earlier' },
        { version: 100, name: 'later' },
      ],
    );

    const steps = buildDependencySteps(backfillsFolder, migrationsFolder);
    const ascending = steps.every((s, i) => i === 0 || s.backfill > steps[i - 1].backfill);
    expect(ascending).toBe(false);
  });

  it('accepts properly ascending dependencies', () => {
    const { backfillsFolder, migrationsFolder } = makeFixture(
      [
        { version: 1, name: 'a', migrationFile: '050.do.earlier.sql' },
        { version: 2, name: 'b', migrationFile: '100.do.later.sql' },
      ],
      [
        { version: 50, name: 'earlier' },
        { version: 100, name: 'later' },
      ],
    );

    const steps = buildDependencySteps(backfillsFolder, migrationsFolder);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].backfill).toBeGreaterThan(steps[i - 1].backfill);
    }
  });
});
