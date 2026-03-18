-- @migration 001.do.create-table.sql

WITH batch AS (
  SELECT ctid FROM public.interleave_test
    WHERE new_col IS NULL
    ORDER BY ctid
    FOR UPDATE
    LIMIT 3
)
UPDATE public.interleave_test SET new_col = old_col
  FROM batch
  WHERE public.interleave_test.ctid = batch.ctid;
