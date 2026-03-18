WITH batch AS (
  SELECT ctid FROM public.batch_loop_test
    WHERE status = 'pending'
    ORDER BY ctid
    FOR UPDATE
    LIMIT 3
)
UPDATE public.batch_loop_test SET status = 'done'
  FROM batch
  WHERE public.batch_loop_test.ctid = batch.ctid;
