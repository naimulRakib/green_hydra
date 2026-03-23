-- 1. ADD COLUMNS TO kb_zones
ALTER TABLE public.kb_zones ADD COLUMN IF NOT EXISTS arsenic_zone_risk VARCHAR(20) DEFAULT 'Low';
ALTER TABLE public.kb_zones ADD COLUMN IF NOT EXISTS known_metal_types TEXT[] DEFAULT '{}';
ALTER TABLE public.kb_zones ADD COLUMN IF NOT EXISTS metal_risk_source TEXT DEFAULT 'inferred';

-- 2. SEED BANGLADESH-SPECIFIC RISK ZONES
-- High Arsenic Districts
UPDATE public.kb_zones 
SET arsenic_zone_risk = 'High', 
    known_metal_types = array_append(known_metal_types, 'arsenic'),
    metal_risk_source = 'bamwsp_doe_published'
WHERE district IN ('Chapai Nawabganj', 'Jessore', 'Comilla', 'Chandpur', 
                   'Munshiganj', 'Faridpur', 'Gopalganj', 'Madaripur', 
                   'Shariatpur', 'Noakhali', 'Lakshmipur', 'Brahmanbaria');

-- High Chromium Districts (Tannery Areas)
UPDATE public.kb_zones 
SET known_metal_types = array_append(known_metal_types, 'chromium'),
    metal_risk_source = 'bamwsp_doe_published'
WHERE district IN ('Dhaka', 'Gazipur', 'Narayanganj');

-- High Lead Districts
UPDATE public.kb_zones 
SET known_metal_types = array_append(known_metal_types, 'lead'),
    metal_risk_source = 'bamwsp_doe_published'
WHERE district IN ('Dhaka', 'Chittagong');

-- Mixed Industrial Districts
UPDATE public.kb_zones 
SET known_metal_types = ARRAY['chromium', 'lead', 'arsenic'],
    metal_risk_source = 'bamwsp_doe_published'
WHERE district IN ('Narsingdi', 'Manikganj', 'Tangail');


-- 3. CREATE RPC FUNCTION FOR MULTI-LAYER INFERENCE
CREATE OR REPLACE FUNCTION public.detect_and_save_metal_risk(p_land_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    -- Base Data
    v_farmer_id UUID;
    v_zone_id TEXT;
    v_zone public.kb_zones%ROWTYPE;
    v_profile RECORD;
    v_land_centroid GEOGRAPHY;
    v_district TEXT;
    
    -- Evidence Layers
    v_scans RECORD;
    v_surveys RECORD;
    v_inferences RECORD;
    v_hotspot_loop RECORD;
    v_hotspot_data RECORD;
    
    -- Scoring
    v_layer1_zone INT := 0;
    v_layer2_soil INT := 0;
    v_layer3_scans INT := 0;
    v_layer4_surveys INT := 0;
    v_layer5_proximity INT := 0;
    v_total_score INT := 0;
    v_recent_count INT := 0;
    
    -- Output Variables
    v_metal_type TEXT := 'mixed';
    v_severity TEXT := 'low';
    v_notes TEXT := '';
    v_nearest_factory_id UUID := NULL;
    v_nearest_factory_name TEXT := NULL;
    v_nearest_factory_dist FLOAT := NULL;
    v_latest_scan_id UUID := NULL;
    v_inserted BOOLEAN := false;
BEGIN
    -- ==========================================
    -- STEP 1: Fetch Base Land & Profile Data
    -- ==========================================
    SELECT
        fl.farmer_id,
        fl.zone_id,
        ST_Centroid(fl.boundary)::geography
    INTO v_farmer_id, v_zone_id, v_land_centroid
    FROM public.farmer_lands fl
    WHERE fl.land_id = p_land_id;
    
    IF v_farmer_id IS NULL THEN
        RAISE EXCEPTION 'Land ID % not found', p_land_id;
    END IF;

    SELECT * INTO v_profile FROM public.farmer_land_profile WHERE land_id = p_land_id;
    SELECT * INTO v_zone FROM public.kb_zones WHERE zone_id = v_zone_id;
    
    v_district := v_zone.district;

    -- ==========================================
    -- STEP 2: Calculate LAYER 1 (Zone Static) 
    -- Max 20 points
    -- ==========================================
    IF v_zone.heavy_metal_risk = true THEN v_layer1_zone := v_layer1_zone + 15; END IF;
    IF v_zone.arsenic_zone_risk = 'High' THEN v_layer1_zone := v_layer1_zone + 5; END IF;
    IF v_zone.arsenic_zone_risk = 'Medium' THEN v_layer1_zone := v_layer1_zone + 3; END IF;
    
    IF v_layer1_zone > 20 THEN v_layer1_zone := 20; END IF;

    -- ==========================================
    -- STEP 3: Calculate LAYER 2 (Soil Profile)
    -- Max 20 points
    -- ==========================================
    IF v_profile IS NOT NULL THEN
        IF v_profile.arsenic_risk = true THEN v_layer2_soil := v_layer2_soil + 8; END IF;
        IF v_profile.iron_toxicity_risk = true THEN v_layer2_soil := v_layer2_soil + 4; END IF;
        IF v_profile.zinc_deficiency_risk = true THEN v_layer2_soil := v_layer2_soil + 3; END IF;
        IF v_profile.canal_contamination = true THEN v_layer2_soil := v_layer2_soil + 5; END IF;
        
        IF v_profile.soil_ph_status IN ('acidic', 'very_acidic') THEN v_layer2_soil := v_layer2_soil + 4; END IF;
        IF v_profile.water_color_status NOT IN ('clear', 'normal') THEN v_layer2_soil := v_layer2_soil + 3; END IF;
        IF v_profile.fish_kill_reported = true THEN v_layer2_soil := v_layer2_soil + 5; END IF;
    END IF;
    
    IF v_layer2_soil > 20 THEN v_layer2_soil := 20; END IF;

    -- ==========================================
    -- STEP 4: Calculate LAYER 3 (Scan Logs)
    -- Max 30 points (Latest 3 Abiotic Scans)
    -- ==========================================
    FOR v_scans IN 
        SELECT id, ai_confidence, verification_status, environmental_context
        FROM public.scan_logs
        WHERE farmer_id = v_farmer_id
          AND land_id = p_land_id
          AND stress_type = 'Abiotic_Pollution'
          AND created_at > NOW() - INTERVAL '90 days'
        ORDER BY created_at DESC LIMIT 3
    LOOP
        v_layer3_scans := v_layer3_scans + 6; -- Base points per scan
        IF v_latest_scan_id IS NULL THEN v_latest_scan_id := v_scans.id; END IF;
        
        IF COALESCE((v_scans.environmental_context->>'plume_score')::FLOAT, 0) > 0.30 THEN v_layer3_scans := v_layer3_scans + 3; END IF;
        IF COALESCE((v_scans.environmental_context->>'plume_exposure_hours_7d')::FLOAT, 0) > 12 THEN v_layer3_scans := v_layer3_scans + 3; END IF;
        IF COALESCE(v_scans.environmental_context->>'canal_contamination', 'false') = 'true' THEN v_layer3_scans := v_layer3_scans + 2; END IF;
        
        IF v_scans.ai_confidence > 0.65 THEN v_layer3_scans := v_layer3_scans + 2; END IF;
        IF v_scans.verification_status = 'verified' THEN v_layer3_scans := v_layer3_scans + 4; END IF;
    END LOOP;

    -- Frequency bonus: 3 scans in 30 days = persistent exposure
    SELECT COUNT(*) INTO v_recent_count
    FROM public.scan_logs
    WHERE farmer_id = v_farmer_id
      AND land_id = p_land_id
      AND stress_type = 'Abiotic_Pollution'
      AND created_at > NOW() - INTERVAL '30 days';

    IF v_recent_count >= 3 THEN
        v_layer3_scans := v_layer3_scans + 8; -- persistent pattern bonus
    ELSIF v_recent_count >= 2 THEN
        v_layer3_scans := v_layer3_scans + 4;
    END IF;

    IF v_layer3_scans > 30 THEN v_layer3_scans := 30; END IF;

    -- ==========================================
    -- STEP 5: Calculate LAYER 4 (Survey Evidence)
    -- Max 15 points
    -- ==========================================
    FOR v_surveys IN 
        SELECT water_contamination_risk, environment_stress, soil_ph_risk
        FROM public.survey_responses
        WHERE farmer_id = v_farmer_id AND land_id = p_land_id
        ORDER BY submitted_at DESC LIMIT 2
    LOOP
        IF v_surveys.water_contamination_risk = 'Industrial' THEN v_layer4_surveys := v_layer4_surveys + 6; END IF;
        IF v_surveys.water_contamination_risk = 'moderate' THEN v_layer4_surveys := v_layer4_surveys + 3; END IF;
        
        IF v_surveys.environment_stress = 'industrial' THEN v_layer4_surveys := v_layer4_surveys + 5; END IF;
        IF v_surveys.environment_stress = 'chemical' THEN v_layer4_surveys := v_layer4_surveys + 4; END IF;
        IF v_surveys.environment_stress = 'smoke' THEN v_layer4_surveys := v_layer4_surveys + 2; END IF;
        
        IF v_surveys.soil_ph_risk = 'high' THEN v_layer4_surveys := v_layer4_surveys + 3; END IF;
    END LOOP;
    
    FOR v_inferences IN
        SELECT inferred_stress_type, confidence_score
        FROM public.survey_inference_logs
        WHERE farmer_id = v_farmer_id
        ORDER BY created_at DESC LIMIT 2
    LOOP
        IF v_inferences.inferred_stress_type ILIKE '%pollution%' AND v_inferences.confidence_score > 0.6 THEN
            v_layer4_surveys := v_layer4_surveys + 4;
        END IF;
    END LOOP;

    IF v_layer4_surveys > 15 THEN v_layer4_surveys := 15; END IF;

    -- ==========================================
    -- STEP 6: Calculate LAYER 5 (Industrial Proximity)
    -- Max 15 points
    -- ==========================================
    IF v_land_centroid IS NOT NULL THEN
        FOR v_hotspot_loop IN
            SELECT id, factory_name_bn, industry_type, 
                   ST_Distance(location::geography, v_land_centroid) / 1000.0 AS dist_km
            FROM public.industrial_hotspots
            WHERE ST_DWithin(location::geography, v_land_centroid, 10000) AND is_currently_active = true
            ORDER BY dist_km ASC
        LOOP
            IF v_nearest_factory_id IS NULL THEN
                v_nearest_factory_id := v_hotspot_loop.id;
                v_nearest_factory_name := v_hotspot_loop.factory_name_bn;
                v_nearest_factory_dist := v_hotspot_loop.dist_km;
            END IF;

            DECLARE
                v_hotspot_pts FLOAT := 0;
            BEGIN
                IF v_hotspot_loop.dist_km < 1 THEN v_hotspot_pts := 12;
                ELSIF v_hotspot_loop.dist_km < 3 THEN v_hotspot_pts := 8;
                ELSIF v_hotspot_loop.dist_km < 5 THEN v_hotspot_pts := 5;
                ELSIF v_hotspot_loop.dist_km <= 10 THEN v_hotspot_pts := 2;
                END IF;

                IF v_hotspot_loop.industry_type ILIKE '%tannery%' THEN v_hotspot_pts := v_hotspot_pts * 1.5; END IF;
                IF v_hotspot_loop.industry_type ILIKE '%dyeing%' THEN v_hotspot_pts := v_hotspot_pts * 1.3; END IF;
                IF v_hotspot_loop.industry_type ILIKE '%battery%' THEN v_hotspot_pts := v_hotspot_pts * 1.4; END IF;

                v_layer5_proximity := v_layer5_proximity + v_hotspot_pts::INT;
            END;
        END LOOP;
    END IF;

    IF v_layer5_proximity > 15 THEN v_layer5_proximity := 15; END IF;

    -- ==========================================
    -- STEP 7: Identify Metal Type & Calculate Total
    -- ==========================================
    v_total_score := v_layer1_zone + v_layer2_soil + v_layer3_scans + v_layer4_surveys + v_layer5_proximity;
    IF v_total_score > 100 THEN v_total_score := 100; END IF;
    
    IF v_nearest_factory_id IS NOT NULL THEN
        SELECT industry_type INTO v_hotspot_data FROM public.industrial_hotspots WHERE id = v_nearest_factory_id;
        IF v_hotspot_data.industry_type ILIKE '%tannery%' OR v_hotspot_data.industry_type ILIKE '%leather%' OR v_hotspot_data.industry_type ILIKE '%dyeing%' OR v_hotspot_data.industry_type ILIKE '%textile%' THEN v_metal_type := 'chromium';
        ELSIF v_hotspot_data.industry_type ILIKE '%battery%' OR v_hotspot_data.industry_type ILIKE '%electronics%' OR v_hotspot_data.industry_type ILIKE '%steel%' OR v_hotspot_data.industry_type ILIKE '%foundry%' THEN v_metal_type := 'lead';
        ELSIF v_hotspot_data.industry_type ILIKE '%fertilizer%' OR v_hotspot_data.industry_type ILIKE '%brick_kiln%' THEN v_metal_type := 'arsenic';
        END IF;
    END IF;

    -- Fallback to known zone metals if still mixed
    IF v_metal_type = 'mixed' AND v_zone.known_metal_types IS NOT NULL AND array_length(v_zone.known_metal_types, 1) > 0 THEN
        v_metal_type := v_zone.known_metal_types[1];
    END IF;

    -- ==========================================
    -- STEP 8: Determine Severity & Save
    -- ==========================================
    IF v_total_score < 25 THEN v_severity := 'low';
    ELSIF v_total_score < 50 THEN v_severity := 'moderate';
    ELSIF v_total_score < 75 THEN v_severity := 'high';
    ELSE v_severity := 'critical';
    END IF;

    -- Generate Bengali Notes
    v_notes := 'মাল্টি-লেয়ার এআই বিশ্লেষণ: ';
    IF v_layer3_scans > 0 THEN v_notes := v_notes || 'মাঠে সরাসরি দূষণের প্রমাণ পাওয়া গেছে। '; END IF;
    IF v_layer5_proximity > 10 THEN v_notes := v_notes || 'আশেপাশে ঝুঁকিপূর্ণ শিল্পকারখানা অবস্থিত (' || COALESCE(v_nearest_factory_name, 'অজানা') || ')। '; END IF;
    IF v_layer2_soil > 10 THEN v_notes := v_notes || 'মাটির স্বাস্থ্য প্রোফাইলে ভারী ধাতুর উপস্থিতি বা রাসায়নিক ক্ষতির লক্ষণ রয়েছে। '; END IF;
    IF v_layer1_zone > 5 THEN v_notes := v_notes || 'এই জোনটি ঐতিহাসিকভাবে ' || v_metal_type || ' দূষণের জন্য ঝুঁকিপূর্ণ। '; END IF;

    IF v_severity != 'low' THEN
        INSERT INTO public.heavy_metal_reports (
            land_id, farmer_id, scan_log_id, reported_via, metal_type, confidence_score, 
            source_factory_id, geom, district, severity, verified, notes, is_anonymized_for_export
        ) VALUES (
            p_land_id, v_farmer_id, v_latest_scan_id, 'multi_layer_inference', v_metal_type, (v_total_score / 100.0),
            v_nearest_factory_id, v_land_centroid, v_district, v_severity, false, v_notes, true
        )
        ON CONFLICT DO NOTHING;
        
        v_inserted := true;
    END IF;

    -- ==========================================
    -- STEP 9: Return JSON
    -- ==========================================
    RETURN jsonb_build_object(
        'metal_risk_score', v_total_score,
        'severity', v_severity,
        'metal_type', v_metal_type,
        'layer_scores', jsonb_build_object(
            'zone_static', v_layer1_zone,
            'soil_profile', v_layer2_soil,
            'scan_evidence', v_layer3_scans,
            'survey_evidence', v_layer4_surveys,
            'industrial_proximity', v_layer5_proximity
        ),
        'nearest_factory_name_bn', v_nearest_factory_name,
        'nearest_factory_distance_km', v_nearest_factory_dist,
        'inserted', v_inserted,
        'notes_bn', v_notes
    );
END;
$$;
