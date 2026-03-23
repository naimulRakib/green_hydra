-- ============================================================================
-- TEST SURVEY SUBMISSION
-- Run this in Supabase SQL Editor to check what's happening
-- ============================================================================

-- 1. Check if RPC functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('submit_survey', 'get_survey_questions', 'get_farm_profile', 'check_survey_status')
ORDER BY routine_name;

-- 2. Check survey_questions table
SELECT 
  category,
  COUNT(*) as question_count
FROM survey_questions
WHERE is_active = TRUE
GROUP BY category
ORDER BY category;

-- 3. Check recent surveys
SELECT 
  week_number,
  year,
  jsonb_object_keys(answers) as answer_keys,
  submitted_at
FROM surveys
ORDER BY submitted_at DESC
LIMIT 1;

-- 4. Check farm_profiles scan_context
SELECT 
  LEFT(scan_context, 100) as context_preview,
  last_survey_week,
  updated_at
FROM farm_profiles
ORDER BY updated_at DESC
LIMIT 1;

-- 5. Test submit_survey function directly
-- Replace these UUIDs with your actual farmer_id and land_id
/*
SELECT submit_survey(
  'YOUR_FARMER_ID'::uuid,
  'YOUR_LAND_ID'::uuid,
  '{"soil_texture": "loam", "water_color": "clear"}'::jsonb
);
*/
