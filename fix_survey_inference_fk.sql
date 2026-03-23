-- ⚠️ IMPORTANT: Read before running.
-- Option A (currently active): Uses survey_responses as parent table.
-- Option B (commented): Uses surveys (V2) as parent table.
-- If you have completed V2 migration, comment out Option A
-- and uncomment Option B before running this script.

-- ═══════════════════════════════════════════════════════════════
-- FIX: survey_inference_logs FK violation
-- Confirmed constraints:
--   survey_inference_logs_survey_id_fkey
--   survey_inference_logs_farmer_id_fkey
--   survey_inference_logs_inferred_disease_id_fkey
-- ═══════════════════════════════════════════════════════════════

-- STEP 1: Find what table survey_id references
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name  AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'survey_inference_logs'
  AND tc.constraint_type = 'FOREIGN KEY';

-- STEP 2: Drop the immediate FK
ALTER TABLE public.survey_inference_logs
  DROP CONSTRAINT IF EXISTS survey_inference_logs_survey_id_fkey;

-- STEP 3: Re-add as DEFERRABLE INITIALLY DEFERRED
-- (Check STEP 1 output first to confirm parent table name)
-- Most likely parent is weekly_surveys or survey_responses

-- Option A — survey_responses (current system)
ALTER TABLE public.survey_inference_logs
  ADD CONSTRAINT survey_inference_logs_survey_id_fkey
  FOREIGN KEY (survey_id)
  REFERENCES public.survey_responses(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- Option B — surveys (V2) (uncomment after V2 migration)
-- ALTER TABLE public.survey_inference_logs
--   ADD CONSTRAINT survey_inference_logs_survey_id_fkey
--   FOREIGN KEY (survey_id)
--   REFERENCES public.surveys(id)
--   ON DELETE CASCADE
--   DEFERRABLE INITIALLY DEFERRED;

-- Recommended one-shot fix (safe default for this app):
-- Make survey_inference_logs.survey_id reference survey_responses.id and make it deferrable
-- so inserts inside the same transaction don't fail due to ordering/triggers.
--
-- BEGIN;
-- ALTER TABLE public.survey_inference_logs
--   DROP CONSTRAINT IF EXISTS survey_inference_logs_survey_id_fkey;
-- ALTER TABLE public.survey_inference_logs
--   ADD CONSTRAINT survey_inference_logs_survey_id_fkey
--   FOREIGN KEY (survey_id)
--   REFERENCES public.survey_responses(id)
--   ON DELETE CASCADE
--   DEFERRABLE INITIALLY DEFERRED;
-- COMMIT;

-- STEP 4: Verify fix applied
SELECT conname, condeferrable, condeferred
FROM pg_constraint
WHERE conrelid = 'public.survey_inference_logs'::regclass
  AND contype = 'f';
