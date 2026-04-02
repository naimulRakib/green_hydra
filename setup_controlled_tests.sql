-- ============================================
-- Controlled Test Setup for Demo Accuracy
-- Creates 5 test scenarios with known outcomes
-- ============================================

-- Clean up previous test data
DELETE FROM farm_profiles WHERE land_id LIKE 'TEST_%';

-- ============================================
-- Test 1: Pure Biotic (Clear blast symptoms)
-- Expected: biotic primary, spray=true
-- ============================================
INSERT INTO farm_profiles (
  land_id,
  location_name,
  lat,
  lon,
  canal_contamination,
  smoke_exposure,
  water_risk,
  arsenic_risk,
  iron_risk,
  chromium_risk
) VALUES (
  'TEST_BIOTIC_001',
  'Pure Biotic Test Farm',
  23.7850,
  90.4085,
  false,
  false,
  'Clear',
  false,
  false,
  false
) ON CONFLICT (land_id) DO UPDATE SET
  canal_contamination = EXCLUDED.canal_contamination,
  smoke_exposure = EXCLUDED.smoke_exposure,
  water_risk = EXCLUDED.water_risk,
  arsenic_risk = EXCLUDED.arsenic_risk,
  iron_risk = EXCLUDED.iron_risk,
  chromium_risk = EXCLUDED.chromium_risk;

-- ============================================
-- Test 2: Pure Abiotic (High pollution)
-- Expected: abiotic primary, spray=false
-- ============================================
INSERT INTO farm_profiles (
  land_id,
  location_name,
  lat,
  lon,
  canal_contamination,
  smoke_exposure,
  water_risk,
  arsenic_risk,
  iron_risk,
  chromium_risk
) VALUES (
  'TEST_ABIOTIC_001',
  'High Pollution Test Farm',
  23.7850,
  90.4085,
  true,
  true,
  'Contaminated',
  false,
  false,
  false
) ON CONFLICT (land_id) DO UPDATE SET
  canal_contamination = EXCLUDED.canal_contamination,
  smoke_exposure = EXCLUDED.smoke_exposure,
  water_risk = EXCLUDED.water_risk,
  arsenic_risk = EXCLUDED.arsenic_risk,
  iron_risk = EXCLUDED.iron_risk,
  chromium_risk = EXCLUDED.chromium_risk;

-- ============================================
-- Test 3: Heavy Metal Zone
-- Expected: metal_score > 0.20, warning shown
-- ============================================
INSERT INTO farm_profiles (
  land_id,
  location_name,
  lat,
  lon,
  canal_contamination,
  smoke_exposure,
  water_risk,
  arsenic_risk,
  iron_risk,
  chromium_risk
) VALUES (
  'TEST_METAL_001',
  'Heavy Metal Zone Test Farm',
  23.7850,
  90.4085,
  false,
  false,
  'Clear',
  true,
  true,
  true
) ON CONFLICT (land_id) DO UPDATE SET
  canal_contamination = EXCLUDED.canal_contamination,
  smoke_exposure = EXCLUDED.smoke_exposure,
  water_risk = EXCLUDED.water_risk,
  arsenic_risk = EXCLUDED.arsenic_risk,
  iron_risk = EXCLUDED.iron_risk,
  chromium_risk = EXCLUDED.chromium_risk;

-- ============================================
-- Test 4: Early Exit (abioticScore >= 0.60)
-- Expected: LLM skipped, tokens_used=0
-- ============================================
INSERT INTO farm_profiles (
  land_id,
  location_name,
  lat,
  lon,
  canal_contamination,
  smoke_exposure,
  water_risk,
  arsenic_risk,
  iron_risk,
  chromium_risk
) VALUES (
  'TEST_EARLY_EXIT_001',
  'Early Exit High Abiotic Test Farm',
  23.7850,
  90.4085,
  true,
  true,
  'Contaminated',
  true,
  true,
  true
) ON CONFLICT (land_id) DO UPDATE SET
  canal_contamination = EXCLUDED.canal_contamination,
  smoke_exposure = EXCLUDED.smoke_exposure,
  water_risk = EXCLUDED.water_risk,
  arsenic_risk = EXCLUDED.arsenic_risk,
  iron_risk = EXCLUDED.iron_risk,
  chromium_risk = EXCLUDED.chromium_risk;

-- ============================================
-- Test 5: Compound Stress
-- Expected: compound_stress=true
-- ============================================
INSERT INTO farm_profiles (
  land_id,
  location_name,
  lat,
  lon,
  canal_contamination,
  smoke_exposure,
  water_risk,
  arsenic_risk,
  iron_risk,
  chromium_risk
) VALUES (
  'TEST_COMPOUND_001',
  'Compound Stress Test Farm',
  23.7850,
  90.4085,
  true,
  false,
  'Moderate',
  true,
  false,
  false
) ON CONFLICT (land_id) DO UPDATE SET
  canal_contamination = EXCLUDED.canal_contamination,
  smoke_exposure = EXCLUDED.smoke_exposure,
  water_risk = EXCLUDED.water_risk,
  arsenic_risk = EXCLUDED.arsenic_risk,
  iron_risk = EXCLUDED.iron_risk,
  chromium_risk = EXCLUDED.chromium_risk;

-- Add industrial hotspot near Test 2 (Pure Abiotic)
INSERT INTO industrial_hotspots (
  location_name,
  lat,
  lon,
  type,
  primary_pollutant,
  severity
) VALUES (
  'Test Industrial Zone',
  23.7870,  -- 2km north of test farm
  90.4085,
  'Tannery',
  'chromium',
  'high'
) ON CONFLICT DO NOTHING;

-- Verify setup
SELECT
  land_id,
  location_name,
  canal_contamination,
  smoke_exposure,
  water_risk,
  arsenic_risk,
  iron_risk,
  chromium_risk
FROM farm_profiles
WHERE land_id LIKE 'TEST_%'
ORDER BY land_id;
