-- ══════════════════════════════════════════════════════════════════════════════
-- AGROSENTINEL DEMO: ABIOTIC DETECTION SETUP
-- ══════════════════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor to set up abiotic detection demo
--
-- BEFORE RUNNING: Replace these placeholders with actual values:
--   YOUR_FARMER_ID  → Your test farmer's UUID
--   YOUR_LAND_ID    → Your test land's UUID
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ STEP 0: Find your farmer_id and land_id                                     │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- Run this first to get your IDs:
SELECT
  f.id as farmer_id,
  f.name_bn as farmer_name,
  fl.land_id,
  fl.land_name
FROM farmers f
JOIN farmer_lands fl ON fl.farmer_id = f.id
LIMIT 10;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ STEP 1: Insert Heavy Metal Report (adds +0.40 to abiotic score)            │
-- └─────────────────────────────────────────────────────────────────────────────┘

INSERT INTO heavy_metal_reports (
  land_id,
  farmer_id,
  metal_type,
  severity,
  confidence_score,
  reported_at,
  reported_via
)
VALUES (
  'YOUR_LAND_ID',      -- Replace with actual land_id
  'YOUR_FARMER_ID',    -- Replace with actual farmer_id
  'chromium',          -- Metal type: lead, chromium, arsenic, cadmium
  'high',              -- Severity: 'critical' (+0.70), 'high' (+0.40), 'moderate' (+0.35)
  0.88,
  NOW(),
  'auto_inference'     -- Required field: 'auto_inference', 'farmer_report', 'lab_test'
)
ON CONFLICT (land_id) DO UPDATE SET
  metal_type = EXCLUDED.metal_type,
  severity = EXCLUDED.severity,
  confidence_score = EXCLUDED.confidence_score,
  reported_at = EXCLUDED.reported_at;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ STEP 2: Update Farm Profile with pollution signals                          │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- This adds: smoke (+0.08) + canal (+0.15) + water_risk (+0.07) = +0.30
UPDATE farm_profiles
SET
  smoke_exposure = true,           -- +0.08 abiotic signal
  canal_contamination = true,      -- +0.15 abiotic signal
  water_risk = 'Chemical',         -- +0.07 abiotic signal
  neighbor_problem = true,         -- +0.05 abiotic signal
  updated_at = NOW()
WHERE farmer_id = 'YOUR_FARMER_ID'
  AND land_id = 'YOUR_LAND_ID';

-- If farm_profile doesn't exist, insert it:
INSERT INTO farm_profiles (
  farmer_id,
  land_id,
  smoke_exposure,
  canal_contamination,
  water_risk,
  neighbor_problem,
  scan_context,
  updated_at
)
VALUES (
  'YOUR_FARMER_ID',
  'YOUR_LAND_ID',
  true,
  true,
  'Chemical',
  true,
  'Demo: High pollution zone near factory',
  NOW()
)
ON CONFLICT (farmer_id, land_id) DO UPDATE SET
  smoke_exposure = true,
  canal_contamination = true,
  water_risk = 'Chemical',
  neighbor_problem = true,
  updated_at = NOW();

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ STEP 3: (Optional) Insert Water Pollution Event (+0.15)                     │
-- └─────────────────────────────────────────────────────────────────────────────┘

INSERT INTO water_pollution_events (
  pollution_type,
  severity,
  is_active,
  reported_at,
  description_bn
)
VALUES (
  'industrial_discharge',
  'high',
  true,
  NOW(),
  'কারখানার বর্জ্য পানি নদীতে ফেলা হচ্ছে'
)
ON CONFLICT DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ STEP 4: (Optional) Add Industrial Hotspot for Plume Detection              │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- If you want plume detection, add a factory near the farm location
-- Get farm coordinates first:
SELECT
  fl.land_id,
  ST_Y(f.location::geometry) as lat,
  ST_X(f.location::geometry) as lng
FROM farmer_lands fl
JOIN farmers f ON f.id = fl.farmer_id
WHERE fl.land_id = 'YOUR_LAND_ID';

-- Then insert hotspot (replace lat/lng with values ~1-3km from farm):
INSERT INTO industrial_hotspots (
  factory_name_bn,
  factory_type,
  location,
  max_plume_km,
  plume_cone_deg,
  is_currently_active,
  active_months
)
VALUES (
  'ডেমো ট্যানারি কারখানা',
  'tannery',
  ST_SetSRID(ST_MakePoint(90.4125, 23.7461), 4326)::geography,  -- Replace with nearby coords
  3.0,
  120,
  true,
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]
)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULT AFTER SETUP:
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Abiotic Score Breakdown:
--   Heavy Metal (high):     +0.40
--   Smoke Exposure:         +0.08
--   Canal Contamination:    +0.15
--   Water Risk (Chemical):  +0.07
--   Neighbor Problem:       +0.05
--   ─────────────────────────────
--   TOTAL:                   0.75 (triggers hard override at >= 0.60)
--
-- When you scan this land, you should see:
--   ✅ disease_type: "Abiotic"
--   ✅ stress_subtype: "Abiotic_Pollution"
--   ✅ spray_suppressed: true
--   ✅ overrides_applied: ["SPRAY_SUPPRESSED_abiotic>=0.60"]
--
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ VERIFICATION QUERY: Check your setup                                        │
-- └─────────────────────────────────────────────────────────────────────────────┘

SELECT
  'Farm Profile' as source,
  fp.smoke_exposure,
  fp.canal_contamination,
  fp.water_risk,
  fp.neighbor_problem,
  (
    CASE WHEN fp.smoke_exposure THEN 0.08 ELSE 0 END +
    CASE WHEN fp.canal_contamination THEN 0.15 ELSE 0 END +
    CASE WHEN fp.water_risk IN ('Chemical', 'Contaminated') THEN 0.07 ELSE 0 END +
    CASE WHEN fp.neighbor_problem THEN 0.05 ELSE 0 END
  ) as profile_contribution
FROM farm_profiles fp
WHERE fp.land_id = 'YOUR_LAND_ID';

SELECT
  'Heavy Metal Report' as source,
  hmr.metal_type,
  hmr.severity,
  CASE
    WHEN hmr.severity = 'critical' THEN 0.70
    WHEN hmr.severity = 'high' THEN 0.40
    WHEN hmr.severity = 'moderate' THEN 0.35
    ELSE 0.18
  END as metal_contribution
FROM heavy_metal_reports hmr
WHERE hmr.land_id = 'YOUR_LAND_ID'
ORDER BY hmr.reported_at DESC
LIMIT 1;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ CLEANUP: Reset to normal (run after demo)                                   │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- Uncomment and run to reset:
/*
UPDATE farm_profiles
SET
  smoke_exposure = false,
  canal_contamination = false,
  water_risk = 'None',
  neighbor_problem = false
WHERE farmer_id = 'YOUR_FARMER_ID' AND land_id = 'YOUR_LAND_ID';

DELETE FROM heavy_metal_reports
WHERE land_id = 'YOUR_LAND_ID' AND reported_via = 'auto_inference';

DELETE FROM water_pollution_events
WHERE description_bn = 'কারখানার বর্জ্য পানি নদীতে ফেলা হচ্ছে';
*/
