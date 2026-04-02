-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY CURRENT SURVEY DATA
-- ═══════════════════════════════════════════════════════════════════════════
-- This script shows what survey data the AI will see for diagnosis
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Show current farm profile context ───
SELECT
  fp.farmer_id,
  fp.land_id,
  l.land_name,
  l.land_name_bn,
  fp.water_risk,
  fp.smoke_exposure,
  fp.canal_contamination,
  fp.fish_kill,
  fp.pest_level,
  fp.last_survey_week,
  fp.last_survey_year,
  fp.updated_at,
  '━━━━━━━━━━━━━ SCAN CONTEXT STRING ━━━━━━━━━━━━━' AS separator,
  fp.scan_context
FROM farm_profiles fp
LEFT JOIN farmer_lands l ON l.land_id = fp.land_id
ORDER BY fp.updated_at DESC
LIMIT 1;

-- ─── 2. Parse key indicators from context ───
SELECT
  CASE
    WHEN scan_context ~ 'WaterColor:(dark_brown|black|yellow_orange|rust_red)' THEN '🔴 POLLUTED WATER'
    WHEN scan_context ~ 'WaterColor:clear' THEN '🟢 CLEAN WATER'
    ELSE '⚪ Unknown water'
  END AS water_indicator,

  CASE
    WHEN scan_context ~ 'Smoke:(daily|often)' THEN '🔴 HEAVY SMOKE EXPOSURE'
    WHEN scan_context ~ 'Smoke:sometimes' THEN '🟡 MODERATE SMOKE'
    WHEN scan_context ~ 'Smoke:(never|rarely)' THEN '🟢 NO SMOKE'
    ELSE '⚪ Unknown smoke'
  END AS smoke_indicator,

  CASE
    WHEN scan_context ~ 'FishKill:(yes_recent|yes_frequent)' THEN '🔴 FISH KILL (CRITICAL)'
    WHEN scan_context ~ 'FishKill:never' THEN '🟢 NO FISH KILL'
    ELSE '⚪ Unknown fish kill'
  END AS fish_kill_indicator,

  CASE
    WHEN scan_context ~ 'CanalPoll:(yes_untreated|yes_treated|sometimes)' THEN '🔴 CANAL POLLUTED'
    WHEN scan_context ~ 'CanalPoll:no' THEN '🟢 CANAL CLEAN'
    ELSE '⚪ Unknown canal'
  END AS canal_indicator,

  CASE
    WHEN scan_context ~ 'Pests:(stem_borer|leafhopper|aphid|wbph)' THEN '🔴 PESTS PRESENT'
    WHEN scan_context ~ 'Pests:(none|-)' THEN '🟢 NO PESTS'
    ELSE '⚪ Unknown pests'
  END AS pest_indicator,

  CASE
    WHEN scan_context ~ 'DamageLevel:(severe|moderate)' THEN '🔴 SEVERE DAMAGE'
    WHEN scan_context ~ 'DamageLevel:(mild|slight)' THEN '🟡 MILD DAMAGE'
    WHEN scan_context ~ 'DamageLevel:none' THEN '🟢 NO DAMAGE'
    ELSE '⚪ Unknown damage'
  END AS damage_indicator,

  CASE
    WHEN scan_context ~ 'YellowPattern:(uniform_pale|uniform_yellow)' THEN '🟠 UNIFORM (Abiotic pattern)'
    WHEN scan_context ~ 'YellowPattern:(spots_patches|interveinal)' THEN '🟣 SPOTTED (Biotic pattern)'
    ELSE '⚪ Unknown pattern'
  END AS yellowing_pattern,

  CASE
    WHEN scan_context ~ 'Adjacent:factory' THEN '🏭 FACTORY ADJACENT'
    WHEN scan_context ~ 'Adjacent:paddy_field' THEN '🌾 FARM ADJACENT'
    ELSE '⚪ Unknown adjacent'
  END AS adjacent_indicator

FROM farm_profiles
ORDER BY updated_at DESC
LIMIT 1;

-- ─── 3. Show AI's expected diagnosis bias ───
SELECT
  CASE
    WHEN (
      scan_context ~ 'WaterColor:(dark_brown|black)' OR
      scan_context ~ 'WaterOdor:chemical' OR
      scan_context ~ 'FishKill:(yes_recent|yes_frequent)' OR
      scan_context ~ 'Smoke:(daily|often)' OR
      scan_context ~ 'CanalPoll:(yes_untreated|sometimes)'
    ) THEN '🏭 ABIOTIC (Pollution) - AI will likely diagnose environmental/pollution stress'

    WHEN (
      scan_context ~ 'Pests:(stem_borer|leafhopper|aphid|wbph)' OR
      scan_context ~ 'Diseases:(blast|blight|sheath)' OR
      scan_context ~ 'DamageLevel:(severe|moderate)' AND
      scan_context ~ 'WaterColor:clear' AND
      scan_context ~ 'Smoke:never'
    ) THEN '🦠 BIOTIC (Disease/Pest) - AI will likely diagnose disease or pest'

    ELSE '⚖️ NEUTRAL - AI will rely heavily on image analysis'
  END AS expected_ai_diagnosis,

  CASE
    WHEN scan_context ~ 'Neighbor:whole_area' AND scan_context ~ 'Smoke:(daily|often)'
      THEN 'Environmental pollution affecting entire area'
    WHEN scan_context ~ 'Neighbor:whole_area' AND scan_context ~ 'Diseases:'
      THEN 'Disease epidemic spreading in community'
    ELSE 'Isolated case'
  END AS spread_pattern

FROM farm_profiles
ORDER BY updated_at DESC
LIMIT 1;

-- ─── 4. Show latest survey answers ───
SELECT
  week_number,
  year,
  soil_ph_risk,
  water_risk,
  pest_level,
  env_stress,
  created_at,
  '━━━━━━━━━━━━━ SURVEY ANSWERS ━━━━━━━━━━━━━' AS separator,
  jsonb_pretty(answers) AS survey_answers
FROM surveys
ORDER BY created_at DESC
LIMIT 1;

-- ─── 5. Summary ───
SELECT
  '═══════════════════════════════════════════════════' AS summary,
  'CURRENT SURVEY DATA LOADED' AS status,
  'Run this script after inserting test data to verify changes' AS note,
  '═══════════════════════════════════════════════════' AS end_line;
