-- Check what's actually in the database
SELECT 
  id,
  farmer_id,
  land_id,
  week_number,
  year,
  jsonb_pretty(answers) as answers,
  soil_ph_risk,
  water_risk,
  pest_level,
  env_stress,
  submitted_at
FROM surveys
ORDER BY submitted_at DESC
LIMIT 3;

-- Check farm_profiles
SELECT 
  id,
  farmer_id,
  land_id,
  scan_context,
  last_survey_week,
  updated_at
FROM farm_profiles
ORDER BY updated_at DESC
LIMIT 3;
