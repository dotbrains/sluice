WITH batch AS (
  SELECT ctid FROM public.trigger_test
    WHERE status = 'pending'
    ORDER BY ctid
    FOR UPDATE
    LIMIT 3
)
UPDATE public.trigger_test SET status = 'done'
  FROM batch
  WHERE public.trigger_test.ctid = batch.ctid;
