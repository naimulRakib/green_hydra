-- ============================================================================
-- AgroSentinel: Survey Submission, Land Profile & Risk Calculation Functions
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- DROP EXISTING FUNCTIONS FIRST (to avoid conflicts)
-- ============================================================================
DROP FUNCTION IF EXISTS submit_weekly_survey(UUID, UUID, VARCHAR, JSONB);
DROP FUNCTION IF EXISTS submit_weekly_survey(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS submit_weekly_survey;
DROP FUNCTION IF EXISTS get_latest_land_profile(UUID, UUID);
DROP FUNCTION IF EXISTS get_latest_land_profile;
DROP FUNCTION IF EXISTS calculate_farm_risk_score(UUID);
DROP FUNCTION IF EXISTS calculate_farm_risk_score;
DROP FUNCTION IF EXISTS estimate_crop_loss(UUID);
DROP FUNCTION IF EXISTS estimate_crop_loss;
DROP FUNCTION IF EXISTS upsert_crop_price(UUID, UUID, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS upsert_crop_price;

-- ============================================================================
-- 1. SUBMIT WEEKLY SURVEY
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_weekly_survey(
  p_farmer_id UUID,
  p_land_id UUID,
  p_template_id VARCHAR,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_week INTEGER;
  v_year INTEGER;
  v_response_id UUID;
  v_soil_ph TEXT := 'Normal';
  v_water_risk TEXT := 'Clear';
  v_pest_level TEXT := 'Low';
  v_env_stress TEXT := 'None';
  v_scan_context TEXT;
  v_existing_profile farmer_land_profile%ROWTYPE;
BEGIN
  -- Get current week and year
  v_week := EXTRACT(WEEK FROM NOW())::INTEGER;
  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  -- ─────────────────────────────────────────────────────────────────
  -- Parse answers based on template type and derive risk indicators
  -- ─────────────────────────────────────────────────────────────────
  
  -- SOIL Survey Processing
  IF p_template_id LIKE 'soil%' THEN
    -- Determine pH risk from soil indicators
    IF p_answers->>'soil_color' IN ('gray_white', 'white_patches') 
       OR p_answers->>'algae_on_soil' = 'thick_green'
       OR p_answers->>'root_appearance' = 'brown_soft' THEN
      v_soil_ph := 'Acidic';
    ELSIF p_answers->>'yellowing_pattern' IN ('interveinal_yellow', 'tip_burn') THEN
      v_soil_ph := 'Alkaline';
    END IF;
  END IF;

  -- WATER Survey Processing
  IF p_template_id LIKE 'water%' THEN
    IF p_answers->>'water_color' IN ('yellow_orange', 'rust_red') 
       OR p_answers->>'water_odor' = 'metallic' THEN
      v_water_risk := 'Iron';
    ELSIF p_answers->>'water_color' IN ('dark_red', 'black')
       OR p_answers->>'water_odor' = 'rotten_egg' THEN
      v_water_risk := 'Contaminated';
    ELSIF p_answers->>'water_foam' = 'persistent_foam' THEN
      v_water_risk := 'Chemical';
    END IF;
  END IF;

  -- PEST Survey Processing
  IF p_template_id LIKE 'pest%' THEN
    DECLARE
      v_pest_count INTEGER := 0;
      v_pest_array JSONB;
    BEGIN
      v_pest_array := p_answers->'weekly_pest_seen';
      IF v_pest_array IS NOT NULL AND jsonb_typeof(v_pest_array) = 'array' THEN
        v_pest_count := jsonb_array_length(v_pest_array);
      END IF;
      
      IF v_pest_count >= 3 THEN
        v_pest_level := 'High';
      ELSIF v_pest_count >= 1 THEN
        v_pest_level := 'Medium';
      ELSE
        v_pest_level := 'Low';
      END IF;
      
      -- Weather affects pest level
      IF p_answers->>'weekly_weather' IN ('hot_humid', 'rainy_flooded') THEN
        IF v_pest_level = 'Medium' THEN v_pest_level := 'High'; END IF;
        IF v_pest_level = 'Low' THEN v_pest_level := 'Medium'; END IF;
      END IF;
      
      -- Weather stress
      IF p_answers->>'weekly_weather' = 'cold_foggy' THEN
        v_env_stress := 'Cold_Fog';
      ELSIF p_answers->>'weekly_weather' = 'hot_humid' THEN
        v_env_stress := 'Heat_Stress';
      END IF;
    END;
  END IF;

  -- ENVIRONMENT Survey Processing
  IF p_template_id LIKE 'environment%' THEN
    IF p_answers->>'smoke_exposure' = 'daily' THEN
      v_env_stress := 'SO2_Daily';
    ELSIF p_answers->>'smoke_exposure' IN ('2_3_days', '4_5_days') THEN
      v_env_stress := 'SO2_Moderate';
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- Build scan context string from all available data
  -- ─────────────────────────────────────────────────────────────────
  v_scan_context := format(
    'Soil:%s,Drain:%s,pH:%s,OM:%s,Water:%s,WaterSrc:%s,Stage:%s,Fert:%s,Pest:%s,Env:%s,Mono:%s,Yield:%s,Neighbor:%s',
    COALESCE(p_answers->>'soil_texture', 'Unknown'),
    COALESCE(p_answers->>'soil_drainage', 'Unknown'),
    v_soil_ph,
    CASE 
      WHEN p_answers->>'organic_input' = 'never' THEN 'Low'
      WHEN p_answers->>'organic_input' IN ('regular', 'compost') THEN 'High'
      ELSE 'Unknown'
    END,
    v_water_risk,
    COALESCE(p_answers->>'water_source', 'Unknown'),
    COALESCE(p_answers->>'growth_stage_weekly', 'Unknown'),
    CASE 
      WHEN p_answers->>'fertilizer_pattern' IS NOT NULL THEN 
        INITCAP(REPLACE(p_answers->>'fertilizer_pattern', '_', ' '))
      ELSE 'Unknown'
    END,
    v_pest_level,
    v_env_stress,
    COALESCE(p_answers->>'monoculture_years', 'Unknown'),
    COALESCE(p_answers->>'yield_trend', 'Unknown'),
    CASE 
      WHEN p_answers->>'neighbor_same_problem' = 'many' THEN 'Many'
      WHEN p_answers->>'neighbor_same_problem' = 'some' THEN 'Some'
      WHEN p_answers->>'neighbor_same_problem' = 'none' THEN 'None'
      ELSE 'Unknown'
    END
  );

  -- ─────────────────────────────────────────────────────────────────
  -- Insert or update survey response (allow re-submission same week)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO survey_responses (
    farmer_id, land_id, template_id, week_number, year,
    answers, soil_ph_risk, water_contamination_risk, 
    pest_pressure_level, environment_stress, scan_context_string
  )
  VALUES (
    p_farmer_id, p_land_id, p_template_id, v_week, v_year,
    p_answers, v_soil_ph, v_water_risk, 
    v_pest_level, v_env_stress, v_scan_context
  )
  ON CONFLICT (farmer_id, land_id, template_id, week_number, year) DO UPDATE SET
    answers = EXCLUDED.answers,
    soil_ph_risk = EXCLUDED.soil_ph_risk,
    water_contamination_risk = EXCLUDED.water_contamination_risk,
    pest_pressure_level = EXCLUDED.pest_pressure_level,
    environment_stress = EXCLUDED.environment_stress,
    scan_context_string = EXCLUDED.scan_context_string,
    submitted_at = NOW()
  RETURNING id INTO v_response_id;

  -- ─────────────────────────────────────────────────────────────────
  -- Upsert farmer_land_profile with survey data
  -- ─────────────────────────────────────────────────────────────────
  
  -- Get existing profile or use defaults
  SELECT * INTO v_existing_profile 
  FROM farmer_land_profile 
  WHERE farmer_id = p_farmer_id AND land_id = p_land_id;

  INSERT INTO farmer_land_profile (
    farmer_id, land_id,
    soil_texture, soil_drainage, soil_ph_status, soil_organic_matter,
    soil_compaction, fertilizer_pattern, consecutive_monoculture, last_season_yield,
    water_source, water_color_status, water_color_last_report, water_odor_status, water_deposits,
    current_growth_stage, pest_pressure, pests_seen, weekly_weather,
    recent_smoke_exposure, canal_contamination, neighbor_same_problem,
    scan_context_string, last_survey_week, last_survey_year, last_updated
  )
  VALUES (
    p_farmer_id, p_land_id,
    COALESCE(p_answers->>'soil_texture', v_existing_profile.soil_texture),
    COALESCE(p_answers->>'soil_drainage', v_existing_profile.soil_drainage),
    v_soil_ph,
    CASE 
      WHEN p_answers->>'organic_input' = 'never' THEN 'low'
      WHEN p_answers->>'organic_input' IN ('regular', 'compost') THEN 'high'
      ELSE COALESCE(v_existing_profile.soil_organic_matter, 'unknown')
    END,
    COALESCE(p_answers->>'soil_compaction', v_existing_profile.soil_compaction),
    COALESCE(p_answers->>'fertilizer_pattern', v_existing_profile.fertilizer_pattern),
    COALESCE(p_answers->>'monoculture_years', v_existing_profile.consecutive_monoculture),
    COALESCE(p_answers->>'yield_trend', v_existing_profile.last_season_yield),
    COALESCE(p_answers->>'water_source', v_existing_profile.water_source),
    CASE WHEN p_answers->>'water_color' IS NOT NULL THEN v_water_risk ELSE v_existing_profile.water_color_status END,
    COALESCE(p_answers->>'water_color', v_existing_profile.water_color_last_report),
    COALESCE(p_answers->>'water_odor', v_existing_profile.water_odor_status),
    COALESCE(p_answers->>'water_deposits', v_existing_profile.water_deposits),
    COALESCE(p_answers->>'growth_stage_weekly', v_existing_profile.current_growth_stage),
    v_pest_level,
    CASE 
      WHEN p_answers->'weekly_pest_seen' IS NOT NULL THEN 
        ARRAY(SELECT jsonb_array_elements_text(p_answers->'weekly_pest_seen'))
      ELSE v_existing_profile.pests_seen
    END,
    COALESCE(p_answers->>'weekly_weather', v_existing_profile.weekly_weather),
    CASE WHEN p_answers->>'smoke_exposure' IN ('daily', '2_3_days', '4_5_days') THEN TRUE ELSE COALESCE(v_existing_profile.recent_smoke_exposure, FALSE) END,
    CASE WHEN p_answers->>'canal_contamination' = 'yes' THEN TRUE ELSE COALESCE(v_existing_profile.canal_contamination, FALSE) END,
    CASE WHEN p_answers->>'neighbor_same_problem' IN ('some', 'many') THEN TRUE ELSE COALESCE(v_existing_profile.neighbor_same_problem, FALSE) END,
    v_scan_context,
    v_week, v_year, NOW()
  )
  ON CONFLICT (farmer_id, land_id) DO UPDATE SET
    soil_texture = COALESCE(EXCLUDED.soil_texture, farmer_land_profile.soil_texture),
    soil_drainage = COALESCE(EXCLUDED.soil_drainage, farmer_land_profile.soil_drainage),
    soil_ph_status = EXCLUDED.soil_ph_status,
    soil_organic_matter = COALESCE(EXCLUDED.soil_organic_matter, farmer_land_profile.soil_organic_matter),
    soil_compaction = COALESCE(EXCLUDED.soil_compaction, farmer_land_profile.soil_compaction),
    fertilizer_pattern = COALESCE(EXCLUDED.fertilizer_pattern, farmer_land_profile.fertilizer_pattern),
    consecutive_monoculture = COALESCE(EXCLUDED.consecutive_monoculture, farmer_land_profile.consecutive_monoculture),
    last_season_yield = COALESCE(EXCLUDED.last_season_yield, farmer_land_profile.last_season_yield),
    water_source = COALESCE(EXCLUDED.water_source, farmer_land_profile.water_source),
    water_color_status = COALESCE(EXCLUDED.water_color_status, farmer_land_profile.water_color_status),
    water_color_last_report = COALESCE(EXCLUDED.water_color_last_report, farmer_land_profile.water_color_last_report),
    water_odor_status = COALESCE(EXCLUDED.water_odor_status, farmer_land_profile.water_odor_status),
    water_deposits = COALESCE(EXCLUDED.water_deposits, farmer_land_profile.water_deposits),
    current_growth_stage = COALESCE(EXCLUDED.current_growth_stage, farmer_land_profile.current_growth_stage),
    pest_pressure = EXCLUDED.pest_pressure,
    pests_seen = COALESCE(EXCLUDED.pests_seen, farmer_land_profile.pests_seen),
    weekly_weather = COALESCE(EXCLUDED.weekly_weather, farmer_land_profile.weekly_weather),
    recent_smoke_exposure = EXCLUDED.recent_smoke_exposure,
    canal_contamination = EXCLUDED.canal_contamination,
    neighbor_same_problem = EXCLUDED.neighbor_same_problem,
    scan_context_string = EXCLUDED.scan_context_string,
    last_survey_week = EXCLUDED.last_survey_week,
    last_survey_year = EXCLUDED.last_survey_year,
    last_updated = NOW();

  -- Return result
  RETURN jsonb_build_object(
    'response_id', v_response_id,
    'week_number', v_week,
    'year', v_year,
    'scan_context', v_scan_context,
    'submitted_at', NOW()
  );
END;
$$;

-- ============================================================================
-- 2. GET LATEST LAND PROFILE
-- ============================================================================
CREATE OR REPLACE FUNCTION get_latest_land_profile(
  p_farmer_id UUID,
  p_land_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile farmer_land_profile%ROWTYPE;
  v_days_since INTEGER;
  v_merged_context TEXT;
  
  -- Context fields - will be populated from profile data
  v_soil TEXT := 'Unknown';
  v_drain TEXT := 'Unknown';
  v_ph TEXT := 'Normal';
  v_om TEXT := 'Unknown';
  v_water TEXT := 'Clear';
  v_water_src TEXT := 'Unknown';
  v_stage TEXT := 'Unknown';
  v_fert TEXT := 'Unknown';
  v_pest TEXT := 'Low';
  v_env TEXT := 'None';
  v_mono TEXT := 'Unknown';
  v_yield TEXT := 'Unknown';
  v_neighbor TEXT := 'Unknown';
BEGIN
  -- Get the profile
  SELECT * INTO v_profile
  FROM farmer_land_profile
  WHERE farmer_id = p_farmer_id AND land_id = p_land_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', FALSE,
      'message_bn', 'এই জমির জন্য কোনো প্রোফাইল নেই। সার্ভে সম্পন্ন করুন।'
    );
  END IF;

  -- Calculate days since last update
  v_days_since := EXTRACT(DAY FROM NOW() - v_profile.last_updated)::INTEGER;

  -- Build merged context from the profile's accumulated data (not raw concatenation)
  v_soil := COALESCE(v_profile.soil_texture, 'Unknown');
  v_drain := COALESCE(v_profile.soil_drainage, 'Unknown');
  v_ph := COALESCE(v_profile.soil_ph_status, 'Normal');
  v_om := COALESCE(v_profile.soil_organic_matter, 'Unknown');
  v_water := COALESCE(v_profile.water_color_status, 'Clear');
  v_water_src := COALESCE(v_profile.water_source, 'Unknown');
  v_stage := COALESCE(v_profile.current_growth_stage, 'Unknown');
  v_fert := COALESCE(INITCAP(REPLACE(v_profile.fertilizer_pattern, '_', ' ')), 'Unknown');
  v_pest := COALESCE(v_profile.pest_pressure, 'Low');
  v_env := CASE 
    WHEN v_profile.recent_smoke_exposure THEN 'Smoke_Exposure'
    ELSE 'None'
  END;
  v_mono := COALESCE(v_profile.consecutive_monoculture, 'Unknown');
  v_yield := COALESCE(v_profile.last_season_yield, 'Unknown');
  v_neighbor := CASE 
    WHEN v_profile.neighbor_same_problem THEN 'Some'
    ELSE 'None'
  END;

  -- Build clean merged context string
  v_merged_context := format(
    'Soil:%s,Drain:%s,pH:%s,OM:%s,Water:%s,WaterSrc:%s,Stage:%s,Fert:%s,Pest:%s,Env:%s,Mono:%s,Yield:%s,Neighbor:%s',
    v_soil, v_drain, v_ph, v_om, v_water, v_water_src, v_stage, v_fert, v_pest, v_env, v_mono, v_yield, v_neighbor
  );

  RETURN jsonb_build_object(
    'found', TRUE,
    'scan_context', v_merged_context,
    'days_since_survey', v_days_since,
    'stale', v_days_since > 14,
    'soil_texture', v_profile.soil_texture,
    'soil_ph_status', v_profile.soil_ph_status,
    'soil_drainage', v_profile.soil_drainage,
    'soil_organic_matter', v_profile.soil_organic_matter,
    'water_source', v_profile.water_source,
    'water_color_status', v_profile.water_color_status,
    'current_growth_stage', v_profile.current_growth_stage,
    'pest_pressure', v_profile.pest_pressure,
    'pests_seen', v_profile.pests_seen,
    'recent_smoke_exposure', v_profile.recent_smoke_exposure,
    'canal_contamination', v_profile.canal_contamination,
    'neighbor_same_problem', v_profile.neighbor_same_problem,
    'arsenic_risk', v_profile.arsenic_risk,
    'iron_toxicity_risk', v_profile.iron_toxicity_risk,
    'fish_kill_reported', v_profile.fish_kill_reported,
    'last_updated', v_profile.last_updated,
    'last_survey_week', v_profile.last_survey_week
  );
END;
$$;

-- ============================================================================
-- 3. CALCULATE FARM RISK SCORE
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_farm_risk_score(p_land_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_land farmer_lands%ROWTYPE;
  v_profile farmer_land_profile%ROWTYPE;
  v_zone kb_zones%ROWTYPE;
  
  -- Risk component scores (0-100)
  v_industrial_risk INTEGER := 0;
  v_water_risk INTEGER := 0;
  v_community_risk INTEGER := 0;
  v_air_risk INTEGER := 0;
  v_soil_risk INTEGER := 0;
  v_weather_risk INTEGER := 0;
  
  v_total_score INTEGER;
  v_risk_level TEXT;
  v_dominant TEXT := 'None';
  v_advice TEXT;
  v_max_risk INTEGER := 0;
  
  -- Scan counts
  v_pollution_scans INTEGER := 0;
  v_active_water_events INTEGER := 0;
  v_neighbor_sprays INTEGER := 0;
  v_heavy_metals INTEGER := 0;
BEGIN
  -- Get land info
  SELECT * INTO v_land FROM farmer_lands WHERE land_id = p_land_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Land not found');
  END IF;

  -- Get profile
  SELECT * INTO v_profile FROM farmer_land_profile WHERE land_id = p_land_id;

  -- Get zone data
  SELECT * INTO v_zone FROM kb_zones WHERE zone_id = v_land.zone_id;

  -- ─────────────────────────────────────────────────────────────────
  -- 1. INDUSTRIAL RISK (factories, hotspots, heavy metals)
  -- ─────────────────────────────────────────────────────────────────
  
  -- Count pollution scans in last 90 days
  SELECT COUNT(*) INTO v_pollution_scans
  FROM scan_logs
  WHERE farmer_id = v_land.farmer_id
    AND stress_type = 'Abiotic_Pollution'
    AND created_at > NOW() - INTERVAL '90 days';
  
  -- Count heavy metal reports
  SELECT COUNT(*) INTO v_heavy_metals
  FROM heavy_metal_reports
  WHERE land_id = p_land_id AND verified = TRUE;

  v_industrial_risk := LEAST(100, 
    (v_pollution_scans * 15) + 
    (v_heavy_metals * 25) +
    CASE WHEN v_zone.heavy_metal_risk THEN 20 ELSE 0 END
  );

  -- ─────────────────────────────────────────────────────────────────
  -- 2. WATER RISK (contamination, iron, arsenic)
  -- ─────────────────────────────────────────────────────────────────
  
  -- Active water pollution events
  SELECT COUNT(*) INTO v_active_water_events
  FROM water_pollution_events
  WHERE is_active = TRUE;

  v_water_risk := LEAST(100,
    CASE 
      WHEN v_profile.water_color_status = 'Contaminated' THEN 50
      WHEN v_profile.water_color_status = 'Iron' THEN 30
      WHEN v_profile.water_color_status = 'Chemical' THEN 40
      ELSE 0
    END +
    CASE WHEN v_profile.arsenic_risk THEN 30 ELSE 0 END +
    CASE WHEN v_profile.iron_toxicity_risk THEN 20 ELSE 0 END +
    CASE WHEN v_profile.fish_kill_reported THEN 25 ELSE 0 END +
    (v_active_water_events * 10)
  );

  -- ─────────────────────────────────────────────────────────────────
  -- 3. COMMUNITY RISK (neighbor sprays, epidemics)
  -- ─────────────────────────────────────────────────────────────────
  
  -- Active neighbor sprays within 2km (simplified)
  SELECT COUNT(*) INTO v_neighbor_sprays
  FROM spray_events
  WHERE is_active = TRUE AND visible_to_neighbors = TRUE;

  v_community_risk := LEAST(100,
    (v_neighbor_sprays * 10) +
    CASE WHEN v_profile.neighbor_same_problem THEN 25 ELSE 0 END +
    CASE WHEN v_profile.canal_contamination THEN 20 ELSE 0 END
  );

  -- ─────────────────────────────────────────────────────────────────
  -- 4. AIR RISK (smoke, SO2)
  -- ─────────────────────────────────────────────────────────────────
  
  v_air_risk := LEAST(100,
    CASE WHEN v_profile.recent_smoke_exposure THEN 40 ELSE 0 END +
    CASE 
      WHEN v_profile.weekly_weather = 'smoke_heavy' THEN 30
      ELSE 0
    END
  );

  -- ─────────────────────────────────────────────────────────────────
  -- 5. SOIL RISK (pH, compaction, monoculture)
  -- ─────────────────────────────────────────────────────────────────
  
  v_soil_risk := LEAST(100,
    CASE 
      WHEN v_profile.soil_ph_status = 'Acidic' THEN 25
      WHEN v_profile.soil_ph_status = 'Alkaline' THEN 20
      ELSE 0
    END +
    CASE 
      WHEN v_profile.soil_compaction = 'hard_cracked' THEN 20
      ELSE 0
    END +
    CASE 
      WHEN v_profile.consecutive_monoculture IN ('5_10_years', 'more_than_10') THEN 15
      WHEN v_profile.consecutive_monoculture = '3_5_years' THEN 10
      ELSE 0
    END +
    CASE 
      WHEN v_profile.soil_organic_matter = 'low' THEN 15
      ELSE 0
    END
  );

  -- ─────────────────────────────────────────────────────────────────
  -- 6. WEATHER RISK (from zone data)
  -- ─────────────────────────────────────────────────────────────────
  
  v_weather_risk := LEAST(100,
    CASE 
      WHEN v_zone.flood_risk_level = 'high' THEN 30
      WHEN v_zone.flood_risk_level = 'medium' THEN 15
      ELSE 0
    END +
    CASE 
      WHEN v_zone.drought_risk_level = 'high' THEN 25
      WHEN v_zone.drought_risk_level = 'medium' THEN 12
      ELSE 0
    END +
    CASE WHEN v_zone.salinity_level = 'high' THEN 20 ELSE 0 END
  );

  -- ─────────────────────────────────────────────────────────────────
  -- Calculate total and determine level
  -- ─────────────────────────────────────────────────────────────────
  
  v_total_score := (
    (v_industrial_risk * 0.25) +
    (v_water_risk * 0.20) +
    (v_community_risk * 0.15) +
    (v_air_risk * 0.15) +
    (v_soil_risk * 0.15) +
    (v_weather_risk * 0.10)
  )::INTEGER;

  -- Determine risk level
  IF v_total_score >= 75 THEN
    v_risk_level := 'CRITICAL';
  ELSIF v_total_score >= 50 THEN
    v_risk_level := 'HIGH';
  ELSIF v_total_score >= 25 THEN
    v_risk_level := 'MEDIUM';
  ELSE
    v_risk_level := 'LOW';
  END IF;

  -- Find dominant threat
  v_max_risk := GREATEST(v_industrial_risk, v_water_risk, v_community_risk, v_air_risk, v_soil_risk, v_weather_risk);
  
  IF v_max_risk = v_industrial_risk AND v_industrial_risk > 0 THEN
    v_dominant := 'শিল্প দূষণ';
    v_advice := 'কারখানার ধোঁয়া থেকে ফসল রক্ষা করুন। সম্ভব হলে জমি পরিবর্তন বিবেচনা করুন।';
  ELSIF v_max_risk = v_water_risk AND v_water_risk > 0 THEN
    v_dominant := 'পানি দূষণ';
    v_advice := 'সেচের পানি পরীক্ষা করুন। বিশুদ্ধ পানির উৎস খুঁজুন।';
  ELSIF v_max_risk = v_community_risk AND v_community_risk > 0 THEN
    v_dominant := 'প্রতিবেশী স্প্রে';
    v_advice := 'প্রতিবেশীদের সাথে স্প্রে শিডিউল সমন্বয় করুন।';
  ELSIF v_max_risk = v_air_risk AND v_air_risk > 0 THEN
    v_dominant := 'বায়ু দূষণ';
    v_advice := 'ধোঁয়ার সময় ফসল ঢেকে রাখুন বা সেচ দিন।';
  ELSIF v_max_risk = v_soil_risk AND v_soil_risk > 0 THEN
    v_dominant := 'মাটি সমস্যা';
    v_advice := 'মাটি পরীক্ষা করান। জৈব সার ব্যবহার বাড়ান।';
  ELSIF v_max_risk = v_weather_risk AND v_weather_risk > 0 THEN
    v_dominant := 'আবহাওয়া ঝুঁকি';
    v_advice := 'উপযুক্ত জাত নির্বাচন করুন। পূর্বাভাস অনুসরণ করুন।';
  ELSE
    v_advice := 'আপনার খামার ভালো অবস্থায় আছে। নিয়মিত পর্যবেক্ষণ চালিয়ে যান।';
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- Save to farm_risk_scores
  -- ─────────────────────────────────────────────────────────────────
  
  -- Mark old scores as not current
  UPDATE farm_risk_scores 
  SET is_current = FALSE 
  WHERE land_id = p_land_id AND is_current = TRUE;

  -- Insert new score
  INSERT INTO farm_risk_scores (
    farmer_id, land_id, risk_score, risk_level,
    breakdown, dominant_threat, advice_bn,
    is_current, calculated_at, valid_until
  ) VALUES (
    v_land.farmer_id, p_land_id, v_total_score, v_risk_level,
    jsonb_build_object(
      'industrial', v_industrial_risk,
      'water', v_water_risk,
      'community', v_community_risk,
      'air', v_air_risk,
      'soil', v_soil_risk,
      'weather', v_weather_risk
    ),
    v_dominant, v_advice,
    TRUE, NOW(), NOW() + INTERVAL '7 days'
  );

  RETURN jsonb_build_object(
    'risk_score', v_total_score,
    'risk_level', v_risk_level,
    'breakdown', jsonb_build_object(
      'industrial', v_industrial_risk,
      'water', v_water_risk,
      'community', v_community_risk,
      'air', v_air_risk,
      'soil', v_soil_risk,
      'weather', v_weather_risk
    ),
    'dominant_threat', v_dominant,
    'advice_bn', v_advice,
    'calculated_at', NOW()
  );
END;
$$;

-- ============================================================================
-- 4. ESTIMATE CROP LOSS
-- ============================================================================
CREATE OR REPLACE FUNCTION estimate_crop_loss(p_land_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_land farmer_lands%ROWTYPE;
  v_risk farm_risk_scores%ROWTYPE;
  v_price crop_market_prices%ROWTYPE;
  v_crop kb_crops%ROWTYPE;
  
  v_area_acres NUMERIC;
  v_yield_per_acre NUMERIC;
  v_price_per_maund NUMERIC;
  v_loss_percentage NUMERIC;
  v_expected_loss NUMERIC;
  v_crop_name TEXT;
BEGIN
  -- Get land
  SELECT * INTO v_land FROM farmer_lands WHERE land_id = p_land_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Land not found');
  END IF;

  -- Get current risk score
  SELECT * INTO v_risk 
  FROM farm_risk_scores 
  WHERE land_id = p_land_id AND is_current = TRUE
  LIMIT 1;

  -- Get crop price
  SELECT * INTO v_price
  FROM crop_market_prices
  WHERE land_id = p_land_id
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Get crop info
  SELECT * INTO v_crop FROM kb_crops WHERE crop_id = v_land.crop_id;

  -- Calculate values
  v_area_acres := (v_land.area_bigha * 0.3306)::NUMERIC; -- bigha to acre
  v_yield_per_acre := COALESCE(v_crop.yield_ton_per_ha_max * 0.4047, 1.5); -- default yield
  v_price_per_maund := COALESCE(v_price.price_per_maund, 1200); -- default price
  v_crop_name := COALESCE(v_price.crop_name, v_crop.crop_name_bn, 'ধান');

  -- Loss percentage based on risk score
  v_loss_percentage := CASE
    WHEN v_risk.risk_level = 'CRITICAL' THEN (30 + (v_risk.risk_score - 75) * 0.5)
    WHEN v_risk.risk_level = 'HIGH' THEN (15 + (v_risk.risk_score - 50) * 0.6)
    WHEN v_risk.risk_level = 'MEDIUM' THEN (5 + (v_risk.risk_score - 25) * 0.4)
    ELSE (v_risk.risk_score * 0.2)
  END;
  
  v_loss_percentage := LEAST(60, GREATEST(0, v_loss_percentage));

  -- Calculate expected loss in BDT
  -- Formula: area * yield * price_per_unit * loss_percentage
  v_expected_loss := (v_area_acres * v_yield_per_acre * 26.67 * v_price_per_maund * v_loss_percentage / 100)::NUMERIC;
  -- 26.67 maund per ton

  -- Save to loss_estimates
  INSERT INTO loss_estimates (
    farmer_id, land_id, risk_score_id,
    crop_name, area_acres, yield_per_acre, price_per_maund,
    loss_percentage, expected_loss_bdt, estimated_at
  ) VALUES (
    v_land.farmer_id, p_land_id, v_risk.id,
    v_crop_name, v_area_acres, v_yield_per_acre, v_price_per_maund,
    v_loss_percentage, v_expected_loss, NOW()
  );

  RETURN jsonb_build_object(
    'expected_loss_bdt', ROUND(v_expected_loss),
    'loss_percentage', ROUND(v_loss_percentage, 1),
    'area_acres', ROUND(v_area_acres, 2),
    'crop_name', v_crop_name,
    'price_per_maund', v_price_per_maund,
    'yield_per_acre', ROUND(v_yield_per_acre, 2),
    'risk_score', v_risk.risk_score,
    'risk_level', v_risk.risk_level
  );
END;
$$;

-- ============================================================================
-- 5. UPSERT CROP PRICE
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_crop_price(
  p_land_id UUID,
  p_farmer_id UUID,
  p_crop_name TEXT,
  p_price_per_maund NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_land farmer_lands%ROWTYPE;
BEGIN
  -- Verify land ownership
  SELECT * INTO v_land 
  FROM farmer_lands 
  WHERE land_id = p_land_id AND farmer_id = p_farmer_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Land not found or not owned');
  END IF;

  -- Upsert price
  INSERT INTO crop_market_prices (
    farmer_id, land_id, crop_id, crop_name, price_per_maund, updated_at
  ) VALUES (
    p_farmer_id, p_land_id, v_land.crop_id, p_crop_name, p_price_per_maund, NOW()
  )
  ON CONFLICT (land_id) DO UPDATE SET
    crop_name = EXCLUDED.crop_name,
    price_per_maund = EXCLUDED.price_per_maund,
    updated_at = NOW();

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ============================================================================
-- 6. ENSURE farmer_land_profile HAS UNIQUE CONSTRAINT
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'farmer_land_profile_farmer_land_unique'
  ) THEN
    ALTER TABLE farmer_land_profile 
    ADD CONSTRAINT farmer_land_profile_farmer_land_unique 
    UNIQUE (farmer_id, land_id);
  END IF;
END $$;

-- ============================================================================
-- 7. ENSURE crop_market_prices HAS UNIQUE CONSTRAINT ON land_id
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'crop_market_prices_land_id_unique'
  ) THEN
    ALTER TABLE crop_market_prices 
    ADD CONSTRAINT crop_market_prices_land_id_unique 
    UNIQUE (land_id);
  END IF;
END $$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION submit_weekly_survey(UUID, UUID, VARCHAR, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_latest_land_profile(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_farm_risk_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION estimate_crop_loss(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_crop_price(UUID, UUID, TEXT, NUMERIC) TO authenticated;
