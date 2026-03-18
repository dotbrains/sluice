-- Backfill 002: Update status from 'step1' to 'done'
-- DEPENDS ON 001 completing first - only processes rows that are 'step1'
-- Runs in batches of 3
WITH batch AS (
  SELECT ctid FROM public.sequential_test
    WHERE status = 'step1'
    ORDER BY ctid
    FOR UPDATE
    LIMIT 3
)
UPDATE public.sequential_test SET status = 'done'
  FROM batch
  WHERE public.sequential_test.ctid = batch.ctid;
