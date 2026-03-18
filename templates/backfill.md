# Backfill Template

File naming: `<version>.do.<descriptive-name>.sql` (versions must be sequential, no undo files)

All backfills must use this pattern:

```sql
-- @migration <version>.do.<name>.sql

WITH batch AS (
  SELECT ctid FROM <schema>.<table>
    WHERE <filter that excludes already-updated rows>
    ORDER BY ctid
    FOR UPDATE
    LIMIT 25000
)
UPDATE <schema>.<table> SET <columns> = <values>
  FROM batch
  WHERE <schema>.<table>.ctid = batch.ctid;
```

## Migration dependency annotation (required for interleaved mode)

Every backfill's **first line** must be a `-- @migration` annotation declaring which
migration it depends on. The interleaved runner (`runMigrationsAndBackfills`) parses this
to run migrations and backfills in the correct order.

```sql
-- @migration 504.do.add-new-column.sql

WITH batch AS (
  ...
```

The value must be the exact filename of an existing migration. If your backfill has no
specific migration dependency, reference the latest migration.

## Trigger control (optional)

If you configure `gucs` in your sluice config, the runner sets those GUC values to `'true'`
at session level before executing any backfills. This can be used to bypass triggers.

If you need triggers to fire for a specific backfill, override per-transaction:

```sql
SET LOCAL "myapp.is_backfill" = 'false';

WITH batch AS (
  ...
```

`SET LOCAL` overrides the session-level value within the transaction and auto-reverts on commit.

## Pattern breakdown

- **`WITH batch AS (SELECT ctid ...)`** — selects which rows to process. `ctid` is PostgreSQL's internal row address.
- **`WHERE <filter>`** — must exclude rows that have already been updated. The `UPDATE SET` must fully satisfy this filter for every row it touches. If any updated row still matches the WHERE, the runner will detect a cycle and throw.
- **`ORDER BY ctid`** — stable iteration order, prevents deadlocks.
- **`FOR UPDATE`** — locks only the selected batch rows, not the entire table.
- **`LIMIT 25000`** — caps rows locked per pass. Controls lock scope, WAL size, and replica lag. Adjust based on row size.
- **`UPDATE ... FROM batch WHERE table.ctid = batch.ctid`** — applies the change to only the locked rows.
