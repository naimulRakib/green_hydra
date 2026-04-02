-- ══════════════════════════════════════════════════════════════════════════════
-- AGROSENTINEL COMPLETE DEMO BACKUP
-- All scenarios: Biotic, Abiotic, Heavy Metal, Compound Stress
-- ══════════════════════════════════════════════════════════════════════════════
-- Date: 2026-04-02
-- Purpose: Quick setup for demo presentations
-- ══════════════════════════════════════════════════════════════════════════════

-- ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
-- ┃ FIRST: Get your IDs                                                        ┃
-- ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

SELECT
  f.id as farmer_id,
  f.name_bn as farmer_name,
  fl.land_id,
  fl.land_name,
  fl.crop_id
FROM farmers f
JOIN farmer_lands fl ON fl.farmer_id = f.id
LIMIT 10;

-- ══════════════════════════════════════════════════════════════════════════════
-- SCENARIO 1: BIOTIC (Disease Detection) - Clean scan, no pollution
-- Expected: disease_type = "Biotic", spray_suppressed = false
-- ══════════════════════════════════════════════════════════════════════════════

-- Reset farm to clean state for biotic scan
UPDATE farm_profiles
SET
  smoke_exposure = false,
  canal_contamination = false,
  water_risk = 'None',
  neighbor_problem = false,
  pest_level = 'High',              -- High pest = likely biotic
  scan_context = 'Biotic demo: clean environment, visible disease symptoms',
  updated_at = NOW()
WHERE farmer_id = 'YOUR_FARMER_ID'
  AND land_id = 'YOUR_LAND_ID';

-- Remove any heavy metal reports
DELETE FROM heavy_metal_reports
WHERE land_id = 'YOUR_LAND_ID';

-- ══════════════════════════════════════════════════════════════════════════════
-- SCENARIO 2: ABIOTIC (Pollution Detection) - High pollution, spray blocked
-- Expected: disease_type = "Abiotic", spray_suppressed = true, abiotic >= 0.60
-- ══════════════════════════════════════════════════════════════════════════════

-- Set pollution signals in farm profile
UPDATE farm_profiles
SET
  smoke_exposure = true,            -- +0.08
  canal_contamination = true,       -- +0.15
  water_risk = 'Chemical',          -- +0.07
  neighbor_problem = true,          -- +0.05
  pest_level = 'Low',
  scan_context = 'Abiotic demo: factory pollution zone',
  updated_at = NOW()
WHERE farmer_id = 'YOUR_FARMER_ID'
  AND land_id = 'YOUR_LAND_ID';

-- Add heavy metal report for extra signal
INSERT INTO heavy_metal_reports (land_id, farmer_id, metal_type, severity, confidence_score, reported_at, reported_via)
VALUES ('YOUR_LAND_ID', 'YOUR_FARMER_ID', 'chromium', 'high', 0.85, NOW(), 'auto_inference')
ON CONFLICT (land_id) DO UPDATE SET
  severity = 'high',
  metal_type = 'chromium',
  reported_at = NOW();

-- ══════════════════════════════════════════════════════════════════════════════
-- SCENARIO 3: HEAVY METAL (Critical Level) - Early exit, no LLM call
-- Expected: tokens_used = 0, stress_type = "Heavy_Metal_Toxicity"
-- ══════════════════════════════════════════════════════════════════════════════

-- Set critical heavy metal
INSERT INTO heavy_metal_reports (land_id, farmer_id, metal_type, severity, confidence_score, reported_at, reported_via)
VALUES ('YOUR_LAND_ID', 'YOUR_FARMER_ID', 'arsenic', 'critical', 0.92, NOW(), 'auto_inference')
ON CONFLICT (land_id) DO UPDATE SET
  severity = 'critical',
  metal_type = 'arsenic',
  confidence_score = 0.92,
  reported_at = NOW();

-- Minimal other pollution signals
UPDATE farm_profiles
SET
  smoke_exposure = false,
  canal_contamination = true,        -- arsenic often from canal
  water_risk = 'Contaminated',
  scan_context = 'Heavy metal demo: arsenic contaminated water source',
  updated_at = NOW()
WHERE farmer_id = 'YOUR_FARMER_ID'
  AND land_id = 'YOUR_LAND_ID';

-- ══════════════════════════════════════════════════════════════════════════════
-- SCENARIO 4: COMPOUND STRESS (Disease + Pollution together)
-- Expected: compound_stress = true, secondary_cause != null
-- ══════════════════════════════════════════════════════════════════════════════

-- Moderate pollution (not enough to override)
UPDATE farm_profiles
SET
  smoke_exposure = true,             -- +0.08
  canal_contamination = false,
  water_risk = 'Chemical',           -- +0.07
  neighbor_problem = true,           -- +0.05
  pest_level = 'High',               -- suggests biotic too
  scan_context = 'Compound demo: disease with pollution stress',
  updated_at = NOW()
WHERE farmer_id = 'YOUR_FARMER_ID'
  AND land_id = 'YOUR_LAND_ID';

-- Moderate heavy metal (not critical)
INSERT INTO heavy_metal_reports (land_id, farmer_id, metal_type, severity, confidence_score, reported_at, reported_via)
VALUES ('YOUR_LAND_ID', 'YOUR_FARMER_ID', 'lead', 'moderate', 0.65, NOW(), 'auto_inference')
ON CONFLICT (land_id) DO UPDATE SET
  severity = 'moderate',
  metal_type = 'lead',
  confidence_score = 0.65,
  reported_at = NOW();

-- This gives abiotic ~0.35-0.45, allowing biotic to still be primary
-- but compound_stress will be detected

-- ══════════════════════════════════════════════════════════════════════════════
-- SCENARIO 5: FACTORY PLUME (Dynamic wind-based detection)
-- Expected: plume_score > 0.35, spray_suppressed = true
-- ══════════════════════════════════════════════════════════════════════════════

-- First get farm location
SELECT
  fl.land_id,
  ST_Y(f.location::geometry) as farm_lat,
  ST_X(f.location::geometry) as farm_lng
FROM farmer_lands fl
JOIN farmers f ON f.id = fl.farmer_id
WHERE fl.land_id = 'YOUR_LAND_ID';

-- Insert factory hotspot near farm (within 3km)
-- Replace coordinates with values close to your farm
INSERT INTO industrial_hotspots (
  factory_name_bn,
  factory_type,
  location,
  max_plume_km,
  plume_cone_deg,
  is_currently_active,
  active_months,
  primary_pollutant_id
)
VALUES (
  'ডেমো ট্যানারি',
  'tannery',
  ST_SetSRID(ST_MakePoint(90.4125, 23.7461), 4326)::geography,  -- REPLACE WITH NEARBY COORDS
  3.0,           -- 3km plume radius
  120,           -- 120 degree cone
  true,
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  NULL
)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- WEEKLY SURVEY: Ensure survey is completed for land
-- ══════════════════════════════════════════════════════════════════════════════

-- Get current ISO week
SELECT
  EXTRACT(WEEK FROM CURRENT_DATE) as current_week,
  EXTRACT(YEAR FROM CURRENT_DATE) as current_year;

-- Insert survey completion (replace week/year with values from above query)
INSERT INTO surveys (
  farmer_id,
  land_id,
  week_number,
  year,
  responses,
  created_at
)
VALUES (
  'YOUR_FARMER_ID',
  'YOUR_LAND_ID',
  14,              -- Replace with current week number
  2026,            -- Replace with current year
  '{"smoke": true, "canal": true, "pests": "high"}'::jsonb,
  NOW()
)
ON CONFLICT (farmer_id, land_id, week_number, year) DO UPDATE SET
  responses = EXCLUDED.responses,
  created_at = NOW();

-- ══════════════════════════════════════════════════════════════════════════════
-- QUICK SCENARIO SWITCHERS (Copy-paste ready)
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ SWITCH TO BIOTIC (Clean scan)                                               │
-- └─────────────────────────────────────────────────────────────────────────────┘
/*
UPDATE farm_profiles SET smoke_exposure=false, canal_contamination=false, water_risk='None', neighbor_problem=false, pest_level='High' WHERE land_id='YOUR_LAND_ID';
DELETE FROM heavy_metal_reports WHERE land_id='YOUR_LAND_ID';
*/

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ SWITCH TO ABIOTIC (High pollution)                                          │
-- └─────────────────────────────────────────────────────────────────────────────┘
/*
UPDATE farm_profiles SET smoke_exposure=true, canal_contamination=true, water_risk='Chemical', neighbor_problem=true WHERE land_id='YOUR_LAND_ID';
INSERT INTO heavy_metal_reports (land_id, farmer_id, metal_type, severity, confidence_score, reported_at, reported_via) VALUES ('YOUR_LAND_ID', 'YOUR_FARMER_ID', 'chromium', 'high', 0.85, NOW(), 'auto_inference') ON CONFLICT (land_id) DO UPDATE SET severity='high';
*/

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ SWITCH TO HEAVY METAL CRITICAL (Early exit)                                 │
-- └─────────────────────────────────────────────────────────────────────────────┘
/*
INSERT INTO heavy_metal_reports (land_id, farmer_id, metal_type, severity, confidence_score, reported_at, reported_via) VALUES ('YOUR_LAND_ID', 'YOUR_FARMER_ID', 'arsenic', 'critical', 0.92, NOW(), 'auto_inference') ON CONFLICT (land_id) DO UPDATE SET severity='critical', metal_type='arsenic';
*/

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ SWITCH TO COMPOUND (Disease + Pollution)                                    │
-- └─────────────────────────────────────────────────────────────────────────────┘
/*
UPDATE farm_profiles SET smoke_exposure=true, canal_contamination=false, water_risk='Chemical', pest_level='High' WHERE land_id='YOUR_LAND_ID';
INSERT INTO heavy_metal_reports (land_id, farmer_id, metal_type, severity, confidence_score, reported_at, reported_via) VALUES ('YOUR_LAND_ID', 'YOUR_FARMER_ID', 'lead', 'moderate', 0.60, NOW(), 'auto_inference') ON CONFLICT (land_id) DO UPDATE SET severity='moderate';
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Check current state
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  fp.land_id,
  fp.smoke_exposure,
  fp.canal_contamination,
  fp.water_risk,
  fp.neighbor_problem,
  fp.pest_level,
  hmr.severity as metal_severity,
  hmr.metal_type,
  ROUND((
    CASE WHEN fp.smoke_exposure THEN 0.08 ELSE 0 END +
    CASE WHEN fp.canal_contamination THEN 0.15 ELSE 0 END +
    CASE WHEN fp.water_risk IN ('Chemical', 'Contaminated') THEN 0.07 ELSE 0 END +
    CASE WHEN fp.neighbor_problem THEN 0.05 ELSE 0 END +
    CASE
      WHEN hmr.severity = 'critical' THEN 0.70
      WHEN hmr.severity = 'high' THEN 0.40
      WHEN hmr.severity = 'moderate' THEN 0.35
      ELSE 0
    END
  )::numeric, 2) as estimated_abiotic_score,
  CASE
    WHEN (
      CASE WHEN fp.smoke_exposure THEN 0.08 ELSE 0 END +
      CASE WHEN fp.canal_contamination THEN 0.15 ELSE 0 END +
      CASE WHEN fp.water_risk IN ('Chemical', 'Contaminated') THEN 0.07 ELSE 0 END +
      CASE WHEN fp.neighbor_problem THEN 0.05 ELSE 0 END +
      CASE WHEN hmr.severity = 'critical' THEN 0.70 WHEN hmr.severity = 'high' THEN 0.40 WHEN hmr.severity = 'moderate' THEN 0.35 ELSE 0 END
    ) >= 0.60 THEN '🔴 ABIOTIC (spray blocked)'
    WHEN hmr.severity = 'critical' THEN '⚠️ HEAVY METAL CRITICAL (early exit)'
    WHEN (
      CASE WHEN fp.smoke_exposure THEN 0.08 ELSE 0 END +
      CASE WHEN fp.canal_contamination THEN 0.15 ELSE 0 END +
      CASE WHEN fp.water_risk IN ('Chemical', 'Contaminated') THEN 0.07 ELSE 0 END +
      CASE WHEN fp.neighbor_problem THEN 0.05 ELSE 0 END +
      CASE WHEN hmr.severity = 'high' THEN 0.40 WHEN hmr.severity = 'moderate' THEN 0.35 ELSE 0 END
    ) >= 0.30 THEN '🟡 COMPOUND likely'
    ELSE '🟢 BIOTIC (clean)'
  END as expected_result
FROM farm_profiles fp
LEFT JOIN heavy_metal_reports hmr ON hmr.land_id = fp.land_id
WHERE fp.land_id = 'YOUR_LAND_ID';

-- ══════════════════════════════════════════════════════════════════════════════
-- FULL CLEANUP (Reset everything)
-- ══════════════════════════════════════════════════════════════════════════════
/*
UPDATE farm_profiles
SET smoke_exposure=false, canal_contamination=false, water_risk='None', neighbor_problem=false, pest_level='Moderate'
WHERE land_id='YOUR_LAND_ID';

DELETE FROM heavy_metal_reports WHERE land_id='YOUR_LAND_ID' AND reported_via='auto_inference';
DELETE FROM industrial_hotspots WHERE factory_name_bn='ডেমো ট্যানারি';
*/
