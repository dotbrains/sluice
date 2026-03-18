-- Backfill 001: Update status from 'pending' to 'step1'
-- Runs in batches of 3
WITH batch AS (
  SELECT ctid FROM public.sequential_test
    WHERE status = 'pending'
    ORDER BY ctid
    FOR UPDATE
    LIMIT 3
)
UPDATE public.sequential_test SET status = 'step1'
  FROM batch
  WHERE public.sequential_test.ctid = batch.ctid;
