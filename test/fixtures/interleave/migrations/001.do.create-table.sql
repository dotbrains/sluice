CREATE TABLE public.interleave_test (
  id SERIAL PRIMARY KEY,
  old_col TEXT NOT NULL DEFAULT 'data',
  new_col TEXT
);

INSERT INTO public.interleave_test (old_col)
  SELECT 'data' FROM generate_series(1, 10);
