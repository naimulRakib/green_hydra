-- ═══════════════════════════════════════════════════════════════════════════
-- ABIOTIC STRESS SURVEY DATA - Designed to trigger Abiotic diagnosis
-- ═══════════════════════════════════════════════════════════════════════════
-- This script creates survey data with STRONG pollution/environmental signals
-- that will make the AI lean heavily toward Abiotic (pollution) diagnosis
-- ═══════════════════════════════════════════════════════════════════════════

-- First, find or create a test farmer and land
DO $$
DECLARE
  v_farmer_id UUID;
  v_land_id UUID;
  v_week INTEGER;
  v_year INTEGER;
  v_survey_id UUID;
  v_context TEXT;
BEGIN
  v_week := EXTRACT(WEEK FROM NOW())::INTEGER;
  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  -- ─── Get existing farmer ID or use a specific one ───
  -- Replace with your actual farmer ID if you have one
  SELECT id INTO v_farmer_id FROM farmers LIMIT 1;

  IF v_farmer_id IS NULL THEN
    RAISE EXCEPTION 'No farmer found. Please create a farmer first.';
  END IF;

  -- ─── Get existing land ID or use first available ───
  SELECT land_id INTO v_land_id FROM farmer_lands WHERE farmer_id = v_farmer_id LIMIT 1;

  IF v_land_id IS NULL THEN
    RAISE EXCEPTION 'No land found for farmer. Please create a land first.';
  END IF;

  RAISE NOTICE 'Using Farmer ID: %, Land ID: %', v_farmer_id, v_land_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BUILD ABIOTIC/POLLUTION CONTEXT STRING (45 fields)
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Key pollution indicators:
  -- - Water: dark_brown color, chemical odor, yes_recent fish kill, chemical deposits
  -- - Smoke: daily exposure from factory_chimney, <500m distance
  -- - Canal: yes_untreated pollution, <100m distance
  -- - Soil: poor drainage (waterlogged), gray color (chemical damage)
  -- - Environment: whole_area neighbors affected (suggests pollution, not epidemic)
  -- - Extreme weather: heat_wave (combined stress)
  -- ═══════════════════════════════════════════════════════════════════════════

  v_context :=
    -- SOIL (13 fields) - Signs of chemical/pollution damage
    'Soil:clay,' ||                           -- Poor drainage soil type
    'Drain:waterlogged,' ||                   -- Severe drainage problem (pollution indicator)
    'SoilColor:gray_white,' ||                -- Chemical damage/acidic soil
    'Compact:very_hard,' ||                   -- Soil degradation
    'Algae:thick_green,' ||                   -- Algae bloom (pollution indicator)
    'Roots:black_rotting,' ||                 -- Root damage from contamination
    'YellowPattern:uniform_pale,' ||          -- Widespread yellowing (abiotic)
    'Organic:never,' ||                       -- No organic matter = acidic
    'Fert:urea_only,' ||                      -- Acidifying fertilizer
    'Lime:never,' ||                          -- No pH correction
    'Mono:more_than_10,' ||                   -- Soil exhaustion
    'Yield:severe_decrease,' ||               -- Severe yield loss (pollution)
    'PrevCrop:wheat,' ||

    -- WATER (9 fields) - STRONG POLLUTION SIGNALS
    'WaterSrc:canal_govt,' ||                 -- Canal water (polluted source)
    'WaterAvail:regular_shortage,' ||
    'WaterColor:dark_brown,' ||               -- MAJOR pollution indicator
    'WaterOdor:chemical,' ||                  -- MAJOR pollution indicator
    'Deposits:oily_film,' ||                  -- Industrial pollution marker
    'Taste:bitter,' ||                        -- Chemical contamination
    'FishKill:yes_recent,' ||                 -- CRITICAL pollution signal
    'Arsenic:unsafe,' ||                      -- Heavy metal contamination
    'IrrigFreq:every_day,' ||

    -- CROP (7 fields) - Uniform damage (abiotic pattern)
    'CropType:rice,' ||
    'Variety:brri_hybrid,' ||
    'Stage:tillering,' ||
    'Leaf:uniform_yellow,' ||                 -- Uniform = abiotic (not spotted = biotic)
    'Stem:normal,' ||                         -- No biotic damage on stem
    'Tillers:5_10,' ||                        -- Reduced tillering
    'Height:stunted,' ||                      -- Growth inhibition (pollution)

    -- PEST (7 fields) - Low pest activity (suggests abiotic, not biotic)
    'Pests:none,' ||                          -- No pests = abiotic
    'Diseases:none,' ||                       -- No visible disease = abiotic
    'DamageLevel:none,' ||
    'DamageSpot:-,' ||
    'Beneficial:none,' ||
    'Pesticide:never,' ||                     -- No pesticide use
    'Weather:hot_humid,' ||

    -- ENVIRONMENT (9 fields) - MAXIMUM POLLUTION SIGNALS
    'Smoke:daily,' ||                         -- CRITICAL pollution signal
    'SmokeSrc:factory_chimney,' ||            -- INDUSTRIAL SOURCE
    'SmokeDist:less_than_500m,' ||            -- VERY CLOSE factory
    'CanalPoll:yes_untreated,' ||             -- CRITICAL pollution signal
    'CanalDist:less_than_100m,' ||            -- VERY CLOSE contaminated canal
    'Neighbor:whole_area,' ||                 -- Entire area affected = environmental
    'NeighborSpray:no,' ||                    -- Not pesticide drift
    'Adjacent:factory,' ||                    -- Factory adjacent to farm
    'Extreme:heat_wave,' ||                   -- Combined stress

    -- DERIVED RISKS (auto-calculated to show pollution)
    'pH_Risk:Acidic,' ||                      -- Soil acidification
    'Water_Risk:Chemical,' ||                 -- Chemical contamination
    'Pest_Risk:Low,' ||                       -- Low pest = abiotic
    'Env_Risk:Smoke_Heavy';                   -- Heavy smoke exposure

  RAISE NOTICE 'Context String: %', v_context;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- INSERT SURVEY RECORD
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO surveys (
    farmer_id,
    land_id,
    week_number,
    year,
    soil_ph_risk,
    water_risk,
    pest_level,
    env_stress,
    answers,
    created_at,
    updated_at
  ) VALUES (
    v_farmer_id,
    v_land_id,
    v_week,
    v_year,
    'Acidic',           -- Acidic pH (pollution indicator)
    'Chemical',         -- Chemical water contamination
    'Low',              -- Low pest activity (suggests abiotic)
    'Smoke_Heavy',      -- Heavy smoke exposure
    jsonb_build_object(
      -- Soil answers
      'soil_texture', 'clay',
      'soil_drainage', 'waterlogged',
      'soil_color', 'gray_white',
      'soil_compaction', 'very_hard',
      'algae_on_soil', 'thick_green',
      'root_appearance', 'black_rotting',
      'yellowing_pattern', 'uniform_pale',
      'organic_input', 'never',
      'fertilizer_pattern', 'urea_only',
      'lime_gypsum_use', 'never',
      'monoculture_years', 'more_than_10',
      'yield_trend', 'severe_decrease',
      'previous_crop', 'wheat',

      -- Water answers (STRONG POLLUTION)
      'water_source', 'canal_govt',
      'water_availability', 'regular_shortage',
      'water_color', 'dark_brown',
      'water_odor', 'chemical',
      'water_deposits', 'oily_film',
      'water_taste', 'bitter',
      'fish_kill', 'yes_recent',
      'arsenic_test', 'unsafe',
      'irrigation_frequency', 'every_day',

      -- Crop answers
      'crop_type', 'rice',
      'crop_variety', 'brri_hybrid',
      'crop_stage', 'tillering',
      'leaf_condition', 'uniform_yellow',
      'stem_condition', 'normal',
      'tiller_count', '5_10',
      'plant_height', 'stunted',

      -- Pest answers (LOW - suggests abiotic)
      'pests_seen', '[]'::jsonb,
      'diseases_seen', '[]'::jsonb,
      'pest_damage_level', 'none',
      'beneficial_insects', 'none',
      'pesticide_used', 'never',
      'weekly_weather', 'hot_humid',

      -- Environment answers (MAXIMUM POLLUTION)
      'smoke_exposure', 'daily',
      'smoke_source', 'factory_chimney',
      'smoke_distance', 'less_than_500m',
      'canal_pollution', 'yes_untreated',
      'canal_distance', 'less_than_100m',
      'neighbor_problem', 'whole_area',
      'neighbor_spray', 'no',
      'adjacent_to', 'factory',
      'extreme_weather', 'heat_wave'
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (farmer_id, land_id, week_number, year)
  DO UPDATE SET
    soil_ph_risk = 'Acidic',
    water_risk = 'Chemical',
    pest_level = 'Low',
    env_stress = 'Smoke_Heavy',
    answers = EXCLUDED.answers,
    updated_at = NOW()
  RETURNING id INTO v_survey_id;

  RAISE NOTICE 'Survey ID: %', v_survey_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- UPDATE/INSERT FARM PROFILE with ABIOTIC context
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO farm_profiles (
    farmer_id,
    land_id,
    soil_texture,
    soil_drainage,
    soil_ph,
    soil_organic,
    water_source,
    water_color,
    water_odor,
    water_risk,
    crop_stage,
    fertilizer_pattern,
    monoculture_years,
    yield_trend,
    pest_level,
    pests_seen,
    weekly_weather,
    smoke_exposure,
    canal_contamination,
    neighbor_problem,
    fish_kill,
    scan_context,
    last_survey_week,
    last_survey_year,
    updated_at
  ) VALUES (
    v_farmer_id,
    v_land_id,
    'clay',
    'waterlogged',
    'Acidic',
    'low',
    'canal_govt',
    'dark_brown',
    'chemical',
    'Chemical',
    'tillering',
    'urea_only',
    'more_than_10',
    'severe_decrease',
    'Low',
    ARRAY[]::TEXT[],
    'hot_humid',
    TRUE,                -- smoke_exposure = TRUE
    TRUE,                -- canal_contamination = TRUE
    TRUE,                -- neighbor_problem = TRUE
    TRUE,                -- fish_kill = TRUE (CRITICAL)
    v_context,           -- Full context string
    v_week,
    v_year,
    NOW()
  )
  ON CONFLICT (farmer_id, land_id)
  DO UPDATE SET
    soil_texture = 'clay',
    soil_drainage = 'waterlogged',
    soil_ph = 'Acidic',
    soil_organic = 'low',
    water_source = 'canal_govt',
    water_color = 'dark_brown',
    water_odor = 'chemical',
    water_risk = 'Chemical',
    crop_stage = 'tillering',
    fertilizer_pattern = 'urea_only',
    monoculture_years = 'more_than_10',
    yield_trend = 'severe_decrease',
    pest_level = 'Low',
    pests_seen = ARRAY[]::TEXT[],
    weekly_weather = 'hot_humid',
    smoke_exposure = TRUE,
    canal_contamination = TRUE,
    neighbor_problem = TRUE,
    fish_kill = TRUE,
    scan_context = v_context,
    last_survey_week = v_week,
    last_survey_year = v_year,
    updated_at = NOW();

  RAISE NOTICE '✅ ABIOTIC survey data inserted successfully!';
  RAISE NOTICE '🏭 Strong pollution signals:';
  RAISE NOTICE '   - Daily factory smoke exposure (<500m)';
  RAISE NOTICE '   - Chemical contaminated water (dark brown, chemical odor)';
  RAISE NOTICE '   - Recent fish kill in water source';
  RAISE NOTICE '   - Untreated canal pollution (<100m)';
  RAISE NOTICE '   - Whole area affected (environmental, not epidemic)';
  RAISE NOTICE '   - Low pest activity (rules out biotic)';
  RAISE NOTICE '   - Uniform yellowing (abiotic pattern, not spotted disease)';
  RAISE NOTICE '';
  RAISE NOTICE '📸 Now scan a crop photo - AI should diagnose as ABIOTIC stress!';

END $$;
