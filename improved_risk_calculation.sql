-- ============================================================================
-- IMPROVED RISK CALCULATION WITH SATELLITE + SPRAY INTEGRATION
-- Adds satellite water quality data and proximity-based spray risk
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_farm_risk_score_v2(p_land_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_land farmer_lands%ROWTYPE;
  v_profile farm_profiles%ROWTYPE;
  v_zone kb_zones%ROWTYPE;
  v_coords GEOGRAPHY;
  
  -- Risk component scores (0-100)
  v_industrial_risk INTEGER := 0;
  v_water_risk INTEGER := 0;
  v_satellite_water_risk INTEGER := 0;  -- NEW
  v_community_risk INTEGER := 0;
  v_spray_proximity_risk INTEGER := 0;  -- NEW
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
  v_nutrient_scans INTEGER := 0;
  v_active_water_events INTEGER := 0;
  v_neighbor_sprays INTEGER := 0;
  v_nearby_sprays INTEGER := 0;  -- NEW: within harm radius
  v_heavy_metals INTEGER := 0;
  
  -- Satellite water quality NEW
  v_avg_turbidity NUMERIC := 0;
  v_avg_chlorophyll NUMERIC := 0;
  v_bad_water_cells INTEGER := 0;
  
BEGIN
  -- Get land info
  SELECT * INTO v_land FROM farmer_lands WHERE land_id = p_land_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Land not found');
  END IF;
  
  -- Get coordinates
  v_coords := v_land.boundary;

  -- Get profile
  SELECT * INTO v_profile FROM farm_profiles WHERE land_id = p_land_id;

  -- Get zone data
  SELECT * INTO v_zone FROM kb_zones WHERE zone_id = v_land.zone_id;

  -- ═════════════════════════════════════════════════════════════════
  -- 1. INDUSTRIAL RISK (factories, hotspots, heavy metals)
  -- ═════════════════════════════════════════════════════════════════
  
  -- Count pollution and nutrient scans from scan_logs
  SELECT 
    COUNT(*) FILTER (WHERE stress_type = 'Abiotic_Pollution'),
    COUNT(*) FILTER (WHERE stress_type = 'Abiotic_Nutrient')
  INTO 
    v_pollution_scans,
    v_nutrient_scans
  FROM scan_logs
  WHERE land_id = p_land_id
    AND created_at > NOW() - INTERVAL '90 days';

  -- Count heavy metal reports
  SELECT COUNT(*) INTO v_heavy_metals
  FROM heavy_metal_reports
  WHERE land_id = p_land_id AND verified = TRUE;

  v_industrial_risk := LEAST(100, 
    (v_pollution_scans * 15) +  -- From scan_logs
    (v_heavy_metals * 25) +
    CASE WHEN v_zone.heavy_metal_risk THEN 20 ELSE 0 END
  );

  -- ═════════════════════════════════════════════════════════════════
  -- 2. WATER RISK (contamination, iron, arsenic) - BASELINE
  -- ═════════════════════════════════════════════════════════════════
  
  -- Active water pollution events
  SELECT COUNT(*) INTO v_active_water_events
  FROM water_pollution_events
  WHERE is_active = TRUE;

  v_water_risk := LEAST(100,
    CASE 
      WHEN v_profile.water_color = 'Contaminated' THEN 50
      WHEN v_profile.water_color = 'Iron' THEN 30
      WHEN v_profile.water_color = 'Chemical' THEN 40
      ELSE 0
    END +
    CASE WHEN v_profile.arsenic_risk THEN 30 ELSE 0 END +
    CASE WHEN v_profile.iron_risk THEN 20 ELSE 0 END +
    CASE WHEN v_profile.fish_kill THEN 25 ELSE 0 END +
    (v_active_water_events * 10)
  );

  -- ═════════════════════════════════════════════════════════════════
  -- 2B. SATELLITE WATER QUALITY RISK - NEW!
  -- ═════════════════════════════════════════════════════════════════
  
  IF v_coords IS NOT NULL THEN
    -- Get satellite data within 5km radius (recent 30 days)
    SELECT 
      AVG(turbidity),
      AVG(chlorophyll),
      COUNT(*) FILTER (WHERE water_quality_index < 40)
    INTO 
      v_avg_turbidity,
      v_avg_chlorophyll,
      v_bad_water_cells
    FROM satellite_water_data
    WHERE ST_DWithin(
      location::geography,
      v_coords,
      5000  -- 5km radius
    )
    AND recorded_at > NOW() - INTERVAL '30 days';

    -- Calculate satellite water risk
    v_satellite_water_risk := LEAST(100,
      CASE 
        WHEN v_avg_turbidity > 50 THEN 40  -- High turbidity
        WHEN v_avg_turbidity > 30 THEN 25
        WHEN v_avg_turbidity > 15 THEN 15
        ELSE 0
      END +
      CASE
        WHEN v_avg_chlorophyll > 20 THEN 30  -- Algae bloom risk
        WHEN v_avg_chlorophyll > 10 THEN 15
        ELSE 0
      END +
      (v_bad_water_cells * 5)  -- Poor quality cells nearby
    );
  END IF;

  -- ═════════════════════════════════════════════════════════════════
  -- 3. COMMUNITY RISK (neighbor sprays, epidemics)
  -- ═════════════════════════════════════════════════════════════════
  
  -- Active neighbor sprays globally (old method)
  SELECT COUNT(*) INTO v_neighbor_sprays
  FROM spray_events
  WHERE is_active = TRUE AND visible_to_neighbors = TRUE;

  -- NEW: Sprays within actual harm radius (proximity-based)
  IF v_coords IS NOT NULL THEN
    SELECT COUNT(*) INTO v_nearby_sprays
    FROM spray_events se
    JOIN farmer_lands fl ON se.land_id = fl.land_id
    WHERE se.is_active = TRUE
      AND se.visible_to_neighbors = TRUE
      AND se.expires_at > NOW()
      AND fl.land_id != p_land_id  -- Not our own land
      AND ST_DWithin(
        ST_Centroid(fl.boundary)::geography,
        v_coords,
        COALESCE(se.harm_radius_m, 500)::double precision  -- Use actual harm radius
      );
    
    v_spray_proximity_risk := LEAST(100, v_nearby_sprays * 20);
  END IF;

  v_community_risk := LEAST(100,
    (v_neighbor_sprays * 5) +  -- Reduced weight for global count
    v_spray_proximity_risk +   -- NEW: proximity-based
    CASE WHEN v_profile.neighbor_problem THEN 25 ELSE 0 END +
    CASE WHEN v_profile.canal_contamination THEN 20 ELSE 0 END
  );

  -- ═════════════════════════════════════════════════════════════════
  -- 4. AIR RISK (smoke, SO2)
  -- ═════════════════════════════════════════════════════════════════
  
  v_air_risk := LEAST(100,
    CASE WHEN v_profile.smoke_exposure THEN 40 ELSE 0 END +
    CASE 
      WHEN v_profile.weekly_weather = 'smoke_heavy' THEN 30
      ELSE 0
    END
  );

  -- ═════════════════════════════════════════════════════════════════
  -- 5. SOIL RISK (pH, compaction, monoculture, nutrient deficiency)
  -- ═════════════════════════════════════════════════════════════════
  
  v_soil_risk := LEAST(100,
    CASE 
      WHEN v_profile.soil_ph = 'Acidic' THEN 25
      WHEN v_profile.soil_ph = 'Alkaline' THEN 20
      ELSE 0
    END +
    CASE 
      WHEN v_profile.soil_compaction = 'hard_cracked' THEN 20
      ELSE 0
    END +
    CASE 
      WHEN v_profile.monoculture_years IN ('5_10_years', 'more_than_10') THEN 15
      WHEN v_profile.monoculture_years = '3_5_years' THEN 10
      ELSE 0
    END +
    CASE 
      WHEN v_profile.soil_organic = 'low' THEN 15
      ELSE 0
    END +
    (v_nutrient_scans * 8)  -- Nutrient deficiency scans
  );

  -- ═════════════════════════════════════════════════════════════════
  -- 6. WEATHER RISK (rainfall, temperature)
  -- ═════════════════════════════════════════════════════════════════
  
  v_weather_risk := LEAST(100,
    CASE 
      WHEN v_profile.weekly_weather = 'drought' THEN 35
      WHEN v_profile.weekly_weather = 'flood' THEN 40
      WHEN v_profile.weekly_weather = 'storm' THEN 30
      ELSE 0
    END
  );

  -- ═════════════════════════════════════════════════════════════════
  -- CALCULATE TOTAL SCORE (weighted average)
  -- ═════════════════════════════════════════════════════════════════
  
  v_total_score := (
    (v_industrial_risk * 2) +          -- Weight: 2
    (v_water_risk * 3) +               -- Weight: 3
    (v_satellite_water_risk * 2) +     -- Weight: 2
    (v_community_risk * 2) +           -- Weight: 2
    (v_air_risk * 1) +                 -- Weight: 1
    (v_soil_risk * 2) +                -- Weight: 2
    (v_weather_risk * 1)               -- Weight: 1
  ) / 13;  -- Total weight: 13

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
  v_max_risk := GREATEST(v_industrial_risk, v_water_risk, v_satellite_water_risk, 
                         v_community_risk, v_air_risk, v_soil_risk, v_weather_risk);
  
  IF v_max_risk = v_industrial_risk THEN v_dominant := 'Industrial';
  ELSIF v_max_risk = v_water_risk THEN v_dominant := 'Water';
  ELSIF v_max_risk = v_satellite_water_risk THEN v_dominant := 'Satellite_Water';
  ELSIF v_max_risk = v_community_risk THEN v_dominant := 'Community_Spray';
  ELSIF v_max_risk = v_air_risk THEN v_dominant := 'Air_Pollution';
  ELSIF v_max_risk = v_soil_risk THEN v_dominant := 'Soil';
  ELSIF v_max_risk = v_weather_risk THEN v_dominant := 'Weather';
  END IF;

  -- Generate advice
  v_advice := CASE
    WHEN v_risk_level = 'CRITICAL' THEN 'তাৎক্ষণিক ব্যবস্থা নিন! বিশেষজ্ঞের পরামর্শ নিন।'
    WHEN v_risk_level = 'HIGH' THEN 'দ্রুত সতর্কতামূলক ব্যবস্থা নিন।'
    WHEN v_risk_level = 'MEDIUM' THEN 'নিয়মিত পর্যবেক্ষণ করুন এবং সতর্ক থাকুন।'
    ELSE 'স্বাভাবিক অবস্থা। নিয়মিত পর্যবেক্ষণ চালিয়ে যান।'
  END;

  -- Save to farm_risk_scores
  UPDATE farm_risk_scores
  SET is_current = FALSE
  WHERE land_id = p_land_id AND is_current = TRUE;

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

  -- ═════════════════════════════════════════════════════════════════
  -- RETURN DETAILED BREAKDOWN
  -- ═════════════════════════════════════════════════════════════════
  
  RETURN jsonb_build_object(
    'total_score', v_total_score,
    'risk_level', v_risk_level,
    'dominant_threat', v_dominant,
    'advice', v_advice,
    'components', jsonb_build_object(
      'industrial', v_industrial_risk,
      'water_baseline', v_water_risk,
      'water_satellite', v_satellite_water_risk,
      'community', v_community_risk,
      'spray_proximity', v_spray_proximity_risk,
      'air', v_air_risk,
      'soil', v_soil_risk,
      'weather', v_weather_risk
    ),
    'satellite_data', jsonb_build_object(
      'avg_turbidity_ntu', ROUND(v_avg_turbidity, 2),
      'avg_chlorophyll_ugl', ROUND(v_avg_chlorophyll, 2),
      'poor_quality_cells', v_bad_water_cells
    ),
    'spray_data', jsonb_build_object(
      'nearby_active_sprays', v_nearby_sprays,
      'global_sprays', v_neighbor_sprays
    ),
    'indicators', jsonb_build_object(
      'pollution_scans', v_pollution_scans,
      'nutrient_scans', v_nutrient_scans,
      'heavy_metal_reports', v_heavy_metals,
      'water_pollution_events', v_active_water_events
    )
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_farm_risk_score_v2(UUID) TO authenticated;

-- ============================================================================
-- Optional: Update existing function to use v2
-- ============================================================================
/*
DROP FUNCTION IF EXISTS calculate_farm_risk_score(UUID);
CREATE OR REPLACE FUNCTION calculate_farm_risk_score(p_land_id UUID)
RETURNS JSONB
LANGUAGE SQL
AS $$
  SELECT calculate_farm_risk_score_v2(p_land_id);
$$;
GRANT EXECUTE ON FUNCTION calculate_farm_risk_score(UUID) TO authenticated;
*/
