# Backfill Test Template

Tests are colocated with their SQL files using the naming convention `<version>.do.<name>.test.ts`:

```
backfills/
├── 002.do.migrate-data.sql
├── 002.do.migrate-data.test.ts  ← colocated test
├── 003.do.add-defaults.sql
├── 003.do.add-defaults.test.ts  ← colocated test
```

## Test pattern

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database } from 'sluice';

const SQL = fs.readFileSync(path.join(__dirname, '002.do.my-backfill.sql'), 'utf-8');

/** Run SQL in a loop until it affects 0 rows (same as the runner does) */
async function runBatchLoop(db: Database, sql: string): Promise<number> {
  let totalRows = 0;
  let rowCount: number;
  do {
    const result = await db.result(sql);
    rowCount = result.rowCount ?? 0;
    totalRows += rowCount;
  } while (rowCount > 0);
  return totalRows;
}

describe('002.do.my-backfill', () => {
  it('migrates data correctly', async () => {
    // Seed test data in the "before" state
    // Run the backfill
    const totalRows = await runBatchLoop(database, SQL);
    expect(totalRows).toBeGreaterThan(0);
    // Verify "after" state
  });

  it('skips already-migrated rows', async () => {
    // Seed row in fully-migrated state
    const totalRows = await runBatchLoop(database, SQL);
    expect(totalRows).toBe(0);
  });

  it('idempotent: running twice produces same result', async () => {
    // Seed test data, run the backfill twice
    await runBatchLoop(database, SQL);
    const secondRunRows = await runBatchLoop(database, SQL);
    expect(secondRunRows).toBe(0);
  });
});
```
