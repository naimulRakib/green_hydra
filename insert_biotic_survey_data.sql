-- ═══════════════════════════════════════════════════════════════════════════
-- BIOTIC STRESS SURVEY DATA - Designed to trigger Biotic (disease/pest) diagnosis
-- ═══════════════════════════════════════════════════════════════════════════
-- This script creates survey data with STRONG disease/pest signals
-- that will make the AI lean heavily toward Biotic diagnosis
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- ─── Get existing farmer ID ───
  SELECT id INTO v_farmer_id FROM farmers LIMIT 1;
  IF v_farmer_id IS NULL THEN
    RAISE EXCEPTION 'No farmer found. Please create a farmer first.';
  END IF;

  -- ─── Get existing land ID ───
  SELECT land_id INTO v_land_id FROM farmer_lands WHERE farmer_id = v_farmer_id LIMIT 1;
  IF v_land_id IS NULL THEN
    RAISE EXCEPTION 'No land found for farmer. Please create a land first.';
  END IF;

  RAISE NOTICE 'Using Farmer ID: %, Land ID: %', v_farmer_id, v_land_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BUILD BIOTIC/DISEASE CONTEXT STRING
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Key disease indicators:
  -- - Water: clean (rules out pollution)
  -- - No smoke exposure (rules out pollution)
  -- - No canal contamination (rules out pollution)
  -- - High pest/disease pressure
  -- - Spotted/patchy damage (biotic pattern, not uniform)
  -- - Recent rain/humid conditions (favors disease)
  -- - Neighbors have same issue (epidemic, not pollution)
  -- ═══════════════════════════════════════════════════════════════════════════

  v_context :=
    -- SOIL (13 fields) - Good soil (rules out soil issues)
    'Soil:loam,' ||                           -- Good soil type
    'Drain:drains_6hrs,' ||                   -- Normal drainage
    'SoilColor:dark_brown,' ||                -- Healthy soil color
    'Compact:soft,' ||                        -- Good soil structure
    'Algae:none,' ||                          -- No pollution
    'Roots:healthy_white,' ||                 -- Healthy roots
    'YellowPattern:spots_patches,' ||         -- SPOTTED = biotic (not uniform)
    'Organic:regular,' ||                     -- Good organic matter
    'Fert:balanced_npk,' ||                   -- Balanced fertilizer
    'Lime:as_needed,' ||                      -- pH managed
    'Mono:3_5_years,' ||                      -- Moderate rotation
    'Yield:stable,' ||                        -- Stable yield (not pollution)
    'PrevCrop:wheat,' ||

    -- WATER (9 fields) - CLEAN WATER (rules out water pollution)
    'WaterSrc:deep_tubewell,' ||              -- Clean water source
    'WaterAvail:always_available,' ||
    'WaterColor:clear,' ||                    -- CLEAN water
    'WaterOdor:none,' ||                      -- NO chemical odor
    'Deposits:none,' ||                       -- NO pollution deposits
    'Taste:normal,' ||                        -- Normal taste
    'FishKill:never,' ||                      -- NO fish kill
    'Arsenic:safe,' ||                        -- Safe water
    'IrrigFreq:every_2_3_days,' ||

    -- CROP (7 fields) - Disease symptoms
    'CropType:rice,' ||
    'Variety:local_variety,' ||               -- Susceptible variety
    'Stage:flowering,' ||                     -- Vulnerable stage
    'Leaf:brown_spots,' ||                    -- DISEASE symptom
    'Stem:soft_rotting,' ||                   -- DISEASE symptom
    'Tillers:10_15,' ||
    'Height:normal,' ||

    -- PEST (7 fields) - HIGH PEST/DISEASE ACTIVITY
    'Pests:stem_borer+leafhopper+aphid,' ||   -- MULTIPLE pests
    'Diseases:blast+blight,' ||               -- MULTIPLE diseases
    'DamageLevel:severe,' ||                  -- SEVERE damage
    'DamageSpot:spots_patches,' ||            -- Patchy = biotic
    'Beneficial:few,' ||                      -- Low beneficial insects
    'Pesticide:none,' ||                      -- No pesticide used
    'Weather:rainy_foggy,' ||                 -- DISEASE-FAVORABLE weather

    -- ENVIRONMENT (9 fields) - NO POLLUTION SIGNALS
    'Smoke:never,' ||                         -- NO smoke
    'SmokeSrc:-,' ||                          -- NO factory
    'SmokeDist:-,' ||
    'CanalPoll:no,' ||                        -- NO canal pollution
    'CanalDist:-,' ||
    'Neighbor:whole_area,' ||                 -- Epidemic (not pollution)
    'NeighborSpray:no,' ||
    'Adjacent:paddy_field,' ||                -- No factory nearby
    'Extreme:none,' ||                        -- No extreme weather

    -- DERIVED RISKS - Disease favorable
    'pH_Risk:Normal,' ||                      -- Normal pH
    'Water_Risk:Clear,' ||                    -- Clean water
    'Pest_Risk:High,' ||                      -- HIGH pest pressure
    'Env_Risk:None';                          -- NO pollution

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
    'Normal',           -- Normal pH
    'Clear',            -- Clean water
    'High',             -- HIGH pest activity
    'None',             -- NO pollution stress
    jsonb_build_object(
      -- Soil answers (healthy)
      'soil_texture', 'loam',
      'soil_drainage', 'drains_6hrs',
      'soil_color', 'dark_brown',
      'soil_compaction', 'soft',
      'algae_on_soil', 'none',
      'root_appearance', 'healthy_white',
      'yellowing_pattern', 'spots_patches',
      'organic_input', 'regular',
      'fertilizer_pattern', 'balanced_npk',
      'lime_gypsum_use', 'as_needed',
      'monoculture_years', '3_5_years',
      'yield_trend', 'stable',
      'previous_crop', 'wheat',

      -- Water answers (CLEAN - no pollution)
      'water_source', 'deep_tubewell',
      'water_availability', 'always_available',
      'water_color', 'clear',
      'water_odor', 'none',
      'water_deposits', 'none',
      'water_taste', 'normal',
      'fish_kill', 'never',
      'arsenic_test', 'safe',
      'irrigation_frequency', 'every_2_3_days',

      -- Crop answers (disease symptoms)
      'crop_type', 'rice',
      'crop_variety', 'local_variety',
      'crop_stage', 'flowering',
      'leaf_condition', 'brown_spots',
      'stem_condition', 'soft_rotting',
      'tiller_count', '10_15',
      'plant_height', 'normal',

      -- Pest answers (HIGH - disease/pest pressure)
      'pests_seen', '["stem_borer", "leafhopper", "aphid"]'::jsonb,
      'diseases_seen', '["blast", "blight"]'::jsonb,
      'pest_damage_level', 'severe',
      'damage_pattern', 'spots_patches',
      'beneficial_insects', 'few',
      'pesticide_used', 'none',
      'weekly_weather', 'rainy_foggy',

      -- Environment answers (NO pollution)
      'smoke_exposure', 'never',
      'smoke_source', null,
      'smoke_distance', null,
      'canal_pollution', 'no',
      'canal_distance', null,
      'neighbor_problem', 'whole_area',
      'neighbor_spray', 'no',
      'adjacent_to', 'paddy_field',
      'extreme_weather', 'none'
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (farmer_id, land_id, week_number, year)
  DO UPDATE SET
    soil_ph_risk = 'Normal',
    water_risk = 'Clear',
    pest_level = 'High',
    env_stress = 'None',
    answers = EXCLUDED.answers,
    updated_at = NOW()
  RETURNING id INTO v_survey_id;

  RAISE NOTICE 'Survey ID: %', v_survey_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- UPDATE/INSERT FARM PROFILE with BIOTIC context
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
    'loam',
    'drains_6hrs',
    'Normal',
    'high',
    'deep_tubewell',
    'clear',
    'none',
    'Clear',
    'flowering',
    'balanced_npk',
    '3_5_years',
    'stable',
    'High',
    ARRAY['stem_borer', 'leafhopper', 'aphid'],
    'rainy_foggy',
    FALSE,               -- smoke_exposure = FALSE
    FALSE,               -- canal_contamination = FALSE
    TRUE,                -- neighbor_problem = TRUE (epidemic)
    FALSE,               -- fish_kill = FALSE
    v_context,
    v_week,
    v_year,
    NOW()
  )
  ON CONFLICT (farmer_id, land_id)
  DO UPDATE SET
    soil_texture = 'loam',
    soil_drainage = 'drains_6hrs',
    soil_ph = 'Normal',
    soil_organic = 'high',
    water_source = 'deep_tubewell',
    water_color = 'clear',
    water_odor = 'none',
    water_risk = 'Clear',
    crop_stage = 'flowering',
    fertilizer_pattern = 'balanced_npk',
    monoculture_years = '3_5_years',
    yield_trend = 'stable',
    pest_level = 'High',
    pests_seen = ARRAY['stem_borer', 'leafhopper', 'aphid'],
    weekly_weather = 'rainy_foggy',
    smoke_exposure = FALSE,
    canal_contamination = FALSE,
    neighbor_problem = TRUE,
    fish_kill = FALSE,
    scan_context = v_context,
    last_survey_week = v_week,
    last_survey_year = v_year,
    updated_at = NOW();

  RAISE NOTICE '✅ BIOTIC survey data inserted successfully!';
  RAISE NOTICE '🦠 Strong disease/pest signals:';
  RAISE NOTICE '   - Clean water (rules out pollution)';
  RAISE NOTICE '   - NO smoke exposure (rules out pollution)';
  RAISE NOTICE '   - NO canal contamination (rules out pollution)';
  RAISE NOTICE '   - HIGH pest pressure (stem borer, leafhopper, aphid)';
  RAISE NOTICE '   - Severe disease (blast, blight)';
  RAISE NOTICE '   - Rainy/foggy weather (disease-favorable)';
  RAISE NOTICE '   - Spotted/patchy damage (biotic pattern)';
  RAISE NOTICE '   - Whole area affected (epidemic)';
  RAISE NOTICE '';
  RAISE NOTICE '📸 Now scan a crop photo - AI should diagnose as BIOTIC stress!';

END $$;
