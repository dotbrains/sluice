-- Override the runner's default is_backfill to re-enable triggers.
SET LOCAL "briefs.is_backfill" = 'false';

WITH batch AS (
  SELECT ctid FROM public.trigger_override_test
    WHERE status = 'pending'
    ORDER BY ctid
    FOR UPDATE
    LIMIT 3
)
UPDATE public.trigger_override_test SET status = 'done'
  FROM batch
  WHERE public.trigger_override_test.ctid = batch.ctid;
