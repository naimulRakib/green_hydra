-- ============================================
-- Real-World Test Farm Profile
-- Based on actual survey data with pollution signals
-- ============================================

INSERT INTO farm_profiles (
  land_id,
  location_name,
  lat,
  lon,

  -- Water contamination signals (from survey)
  canal_contamination,
  water_risk,
  arsenic_risk,
  iron_risk,

  -- Environmental signals
  smoke_exposure,

  -- Survey metadata (if you have these columns)
  soil_type,
  drainage_status,
  water_source,
  recent_fish_kill

) VALUES (
  'TEST_REAL_WORLD_001',
  'High Contamination Farm (Survey Data)',
  23.7850,
  90.4085,

  -- Strong pollution signals from survey
  true,  -- canal_contamination (sometimes polluted + 100-500m)
  'Contaminated',  -- water_risk (yellow, metallic, salty, arsenic unsafe)
  true,  -- arsenic_risk (survey says "unsafe")
  true,  -- iron_risk (yellow water + metallic odor)

  -- Moderate smoke
  false,  -- smoke_exposure (rarely = not continuous, set false for now)

  -- Survey details (if columns exist)
  'loam',
  'waterlogged',
  'canal_govt',
  true  -- recent fish kill

) ON CONFLICT (land_id) DO UPDATE SET
  canal_contamination = EXCLUDED.canal_contamination,
  water_risk = EXCLUDED.water_risk,
  arsenic_risk = EXCLUDED.arsenic_risk,
  iron_risk = EXCLUDED.iron_risk,
  smoke_exposure = EXCLUDED.smoke_exposure;

-- Verify
SELECT
  land_id,
  location_name,
  canal_contamination,
  water_risk,
  arsenic_risk,
  iron_risk,
  smoke_exposure
FROM farm_profiles
WHERE land_id = 'TEST_REAL_WORLD_001';
