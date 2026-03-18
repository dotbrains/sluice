import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { parseBatchLimit, shouldWarnLongRunning } from '../src/backfill-utils';
import { getLocalMigrations } from '../src/migrations';

const BACKFILLS_DIR = path.join(__dirname, 'fixtures', 'batch-loop');

const ONE_HOUR = 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// parseBatchLimit
// ---------------------------------------------------------------------------

describe('parseBatchLimit', () => {
  it('extracts LIMIT from standard backfill template', () => {
    const sql = `WITH batch AS (
  SELECT ctid FROM public.test_table
    WHERE status = 'pending'
    ORDER BY ctid
    FOR UPDATE
    LIMIT 25000
)
UPDATE public.test_table SET status = 'done'
  FROM batch
  WHERE public.test_table.ctid = batch.ctid;`;
    expect(parseBatchLimit(sql)).toBe(25000);
  });

  it('extracts small LIMIT values', () => {
    expect(parseBatchLimit('SELECT ctid FROM t LIMIT 3')).toBe(3);
  });

  it('is case-insensitive', () => {
    expect(parseBatchLimit('SELECT ctid FROM t limit 500')).toBe(500);
  });

  it('handles extra whitespace between LIMIT and number', () => {
    expect(parseBatchLimit('LIMIT   10000')).toBe(10000);
  });

  it('returns null when no LIMIT clause is present', () => {
    expect(parseBatchLimit('UPDATE public.test SET status = true')).toBeNull();
  });

  it('returns null for empty SQL', () => {
    expect(parseBatchLimit('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shouldWarnLongRunning
// ---------------------------------------------------------------------------

describe('shouldWarnLongRunning', () => {
  it('returns false when elapsed time is under 1 hour', () => {
    const elapsedMs = 30 * 60 * 1000;
    expect(shouldWarnLongRunning(elapsedMs, 0, elapsedMs)).toBe(false);
  });

  it('returns false at exactly 1 hour minus 1ms', () => {
    const elapsedMs = ONE_HOUR - 1;
    expect(shouldWarnLongRunning(elapsedMs, 0, elapsedMs)).toBe(false);
  });

  it('returns true at exactly 1 hour', () => {
    expect(shouldWarnLongRunning(ONE_HOUR, 0, ONE_HOUR)).toBe(true);
  });

  it('returns true after 1 hour', () => {
    const elapsedMs = ONE_HOUR + 5 * 60 * 1000;
    expect(shouldWarnLongRunning(elapsedMs, 0, elapsedMs)).toBe(true);
  });

  it('returns false if last warning was less than 10 minutes ago', () => {
    const now = ONE_HOUR + 5 * 60 * 1000;
    const lastWarnTime = ONE_HOUR;
    expect(shouldWarnLongRunning(now, lastWarnTime, now)).toBe(false);
  });

  it('returns false at exactly 10 minutes minus 1ms since last warning', () => {
    const lastWarnTime = ONE_HOUR;
    const now = lastWarnTime + TEN_MINUTES - 1;
    expect(shouldWarnLongRunning(now, lastWarnTime, now)).toBe(false);
  });

  it('returns true at exactly 10 minutes since last warning', () => {
    const lastWarnTime = ONE_HOUR;
    const now = lastWarnTime + TEN_MINUTES;
    expect(shouldWarnLongRunning(now, lastWarnTime, now)).toBe(true);
  });

  it('returns true after 10 minutes since last warning', () => {
    const lastWarnTime = ONE_HOUR;
    const now = lastWarnTime + 15 * 60 * 1000;
    expect(shouldWarnLongRunning(now, lastWarnTime, now)).toBe(true);
  });

  it('handles multiple warning intervals correctly', () => {
    expect(shouldWarnLongRunning(ONE_HOUR, 0, ONE_HOUR)).toBe(true);

    const fiveMinLater = ONE_HOUR + 5 * 60 * 1000;
    expect(shouldWarnLongRunning(fiveMinLater, ONE_HOUR, fiveMinLater)).toBe(false);

    const tenMinLater = ONE_HOUR + TEN_MINUTES;
    expect(shouldWarnLongRunning(tenMinLater, ONE_HOUR, tenMinLater)).toBe(true);

    const fifteenMinLater = ONE_HOUR + 15 * 60 * 1000;
    expect(shouldWarnLongRunning(fifteenMinLater, tenMinLater, fifteenMinLater)).toBe(false);

    const twentyMinLater = ONE_HOUR + 20 * 60 * 1000;
    expect(shouldWarnLongRunning(twentyMinLater, tenMinLater, twentyMinLater)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No duplicate versions
// ---------------------------------------------------------------------------

describe('no duplicate version numbers', () => {
  it('fixture backfills have no duplicate "do" version numbers', () => {
    const backfills = getLocalMigrations(BACKFILLS_DIR).filter((m) => m.action === 'do');
    const seen = new Map<number, string>();

    for (const b of backfills) {
      const existing = seen.get(b.version);
      if (existing) {
        throw new Error(
          `Duplicate backfill version ${b.version}: "${existing}" and "${b.filename}"`,
        );
      }
      seen.set(b.version, b.filename!);
    }
  });
});
