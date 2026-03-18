-- INTENTIONALLY BROKEN BACKFILL SQL TO TEST CYCLE DETECTION
-- This example forces a cycle, as SET does not fully satisfy the WHERE condition for all rows in the batch. 
-- The next execution will pick up the same rows again, leading to an infinite loop if not detected.

WITH batch AS (
  SELECT ctid FROM public.cycle_detection_test
    WHERE status != 'done'
    ORDER BY ctid
    FOR UPDATE
    LIMIT 6
)
UPDATE public.cycle_detection_test
  SET status = CASE WHEN id % 2 = 0 THEN 'done' ELSE 'partial' END
  FROM batch
  WHERE public.cycle_detection_test.ctid = batch.ctid;
