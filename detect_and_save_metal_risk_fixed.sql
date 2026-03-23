-- ============================================================
-- detect_and_save_metal_risk — FIXED VERSION
--
-- Bugs fixed:
-- 1. farmer_land_profile → farm_profiles (V2 table)
--    Column renames: arsenic_risk ✓, iron_toxicity_risk → iron_risk,
--    zinc_deficiency_risk (removed — not in V2),
--    canal_contamination ✓, soil_ph_status → soil_ph,
--    water_color_status → water_color, fish_kill_reported → fish_kill
--
-- 2. survey_responses → surveys (V2 table)
--    Column renames: water_contamination_risk → water_risk,
--    environment_stress → env_stress, soil_ph_risk → soil_ph_risk ✓
--    survey_inference_logs removed (table dropped in V2)
--
-- 3. Pre-scan prior: Layer 1 + Layer 5 now work with ZERO scans
--    Cold start problem solved — static data gives baseline score
--
-- 4. DECLARE block inside loop fixed (nested DECLARE removed)
--
-- 5. v_hotspot_data SELECT fixed — was wrong variable reuse
-- ============================================================

CREATE OR REPLACE FUNCTION detect_and_save_metal_risk(p_land_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    -- Base Data
    v_farmer_id           UUID;
    v_zone_id             TEXT;
    v_zone                public.kb_zones%ROWTYPE;
    v_profile             public.farm_profiles%ROWTYPE;   -- FIX 1: V2 table
    v_land_centroid       GEOGRAPHY;
    v_district            TEXT;

    -- Evidence Layers
    v_scans               RECORD;
    v_surveys             RECORD;
    v_hotspot_loop        RECORD;
    v_nearest_industry    TEXT;  -- FIX 5: separate variable for metal type lookup

    -- Scoring
    v_layer1_zone         INT := 0;
    v_layer2_soil         INT := 0;
    v_layer3_scans        INT := 0;
    v_layer4_surveys      INT := 0;
    v_layer5_proximity    INT := 0;
    v_total_score         INT := 0;
    v_hotspot_pts         FLOAT := 0;

    -- Output Variables
    v_metal_type          TEXT := 'mixed';
    v_severity            TEXT := 'low';
    v_notes               TEXT := '';
    v_nearest_factory_id  UUID := NULL;
    v_nearest_factory_name TEXT := NULL;
    v_nearest_factory_dist FLOAT := NULL;
    v_latest_scan_id      UUID := NULL;
    v_inserted            BOOLEAN := false;
BEGIN
    -- ══════════════════════════════════════════════════════
    -- STEP 1: Fetch Base Land Data
    -- ══════════════════════════════════════════════════════
    SELECT
        fl.farmer_id,
        fl.zone_id,
        ST_Centroid(fl.boundary)::geography
    INTO v_farmer_id, v_zone_id, v_land_centroid
    FROM public.farmer_lands fl
    WHERE fl.land_id = p_land_id;

    IF v_farmer_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Land ID not found: ' || p_land_id);
    END IF;

    -- FIX 1: Read from farm_profiles (V2) not farmer_land_profile (V1)
    SELECT * INTO v_profile
    FROM public.farm_profiles
    WHERE land_id = p_land_id
    LIMIT 1;

    SELECT * INTO v_zone
    FROM public.kb_zones
    WHERE zone_id = v_zone_id;

    v_district := v_zone.district;

    -- ══════════════════════════════════════════════════════
    -- STEP 2: LAYER 1 — Zone Static Data (max 20 pts)
    -- STATIC: works even with zero scans (pre-scan prior)
    -- ══════════════════════════════════════════════════════
    IF v_zone.heavy_metal_risk = true THEN
        v_layer1_zone := v_layer1_zone + 15;
    END IF;

    -- arsenic_zone_risk column — added in V2 migration
    -- Safe fallback if column doesn't exist yet
    BEGIN
        IF v_zone.arsenic_zone_risk = 'High'   THEN v_layer1_zone := v_layer1_zone + 5; END IF;
        IF v_zone.arsenic_zone_risk = 'Medium' THEN v_layer1_zone := v_layer1_zone + 3; END IF;
    EXCEPTION WHEN undefined_column THEN
        NULL; -- column not yet added, skip silently
    END;

    v_layer1_zone := LEAST(v_layer1_zone, 20);

    -- ══════════════════════════════════════════════════════
    -- STEP 3: LAYER 2 — Soil Profile (max 20 pts)
    -- FIX 1: V2 column names
    -- ══════════════════════════════════════════════════════
    IF v_profile IS NOT NULL THEN
        -- arsenic_risk: same name in V2 ✓
        IF v_profile.arsenic_risk = true THEN
            v_layer2_soil := v_layer2_soil + 8;
        END IF;

        -- FIX: iron_toxicity_risk → iron_risk in V2
        IF v_profile.iron_risk = true THEN
            v_layer2_soil := v_layer2_soil + 4;
        END IF;

        -- canal_contamination: same name in V2 ✓
        IF v_profile.canal_contamination = true THEN
            v_layer2_soil := v_layer2_soil + 5;
        END IF;

        -- FIX: soil_ph_status → soil_ph in V2
        -- V2 values: 'Normal', 'Acidic', 'Alkaline'
        IF v_profile.soil_ph IN ('Acidic') THEN
            v_layer2_soil := v_layer2_soil + 4;
        END IF;

        -- FIX: water_color_status → water_color in V2
        -- V2 values: 'clear', 'yellow_orange', 'rust_red', etc.
        IF v_profile.water_color NOT IN ('clear', 'slightly_turbid') AND
           v_profile.water_color IS NOT NULL THEN
            v_layer2_soil := v_layer2_soil + 3;
        END IF;

        -- FIX: fish_kill_reported → fish_kill in V2
        IF v_profile.fish_kill = true THEN
            v_layer2_soil := v_layer2_soil + 5;
        END IF;

        -- FIX: water_risk is a derived column in V2 (not in V1)
        -- Extra signal from V2 that V1 didn't have
        IF v_profile.water_risk IN ('Contaminated', 'Chemical') THEN
            v_layer2_soil := v_layer2_soil + 3;
        END IF;
    END IF;

    v_layer2_soil := LEAST(v_layer2_soil, 20);

    -- ══════════════════════════════════════════════════════
    -- STEP 4: LAYER 3 — Scan Log Evidence (max 30 pts)
    -- NOTE: This is 0 on first scan — that is expected.
    -- Pre-scan prior from Layer 1+5 covers cold start.
    -- ══════════════════════════════════════════════════════
    FOR v_scans IN
        SELECT id, ai_confidence, verification_status, environmental_context
        FROM public.scan_logs
        WHERE farmer_id = v_farmer_id
          AND stress_type = 'Abiotic_Pollution'
        ORDER BY created_at DESC
        LIMIT 3
    LOOP
        v_layer3_scans := v_layer3_scans + 6;

        IF v_latest_scan_id IS NULL THEN
            v_latest_scan_id := v_scans.id;
        END IF;

        IF (v_scans.environmental_context->>'plume_score')::FLOAT > 0.6 THEN
            v_layer3_scans := v_layer3_scans + 3;
        END IF;

        IF (v_scans.environmental_context->>'plume_exposure_hours_7d')::FLOAT > 24 THEN
            v_layer3_scans := v_layer3_scans + 3;
        END IF;

        -- canal_contamination in env_context is boolean stored as string
        IF v_scans.environmental_context->>'canal_contamination' = 'true' THEN
            v_layer3_scans := v_layer3_scans + 2;
        END IF;

        IF v_scans.ai_confidence > 0.75 THEN
            v_layer3_scans := v_layer3_scans + 2;
        END IF;

        IF v_scans.verification_status = 'verified' THEN
            v_layer3_scans := v_layer3_scans + 4;
        END IF;
    END LOOP;

    v_layer3_scans := LEAST(v_layer3_scans, 30);

    -- ══════════════════════════════════════════════════════
    -- STEP 5: LAYER 4 — Survey Evidence (max 15 pts)
    -- FIX 2: V2 table = surveys, V2 columns
    -- survey_inference_logs removed (dropped in V2)
    -- ══════════════════════════════════════════════════════
    FOR v_surveys IN
        SELECT water_risk, env_stress, soil_ph_risk
        FROM public.surveys                      -- FIX: was survey_responses
        WHERE farmer_id = v_farmer_id
          AND land_id   = p_land_id
        ORDER BY submitted_at DESC
        LIMIT 2
    LOOP
        -- FIX: water_contamination_risk → water_risk in V2
        IF v_surveys.water_risk = 'Industrial'   THEN v_layer4_surveys := v_layer4_surveys + 6; END IF;
        IF v_surveys.water_risk = 'Chemical'     THEN v_layer4_surveys := v_layer4_surveys + 5; END IF;
        IF v_surveys.water_risk = 'Contaminated' THEN v_layer4_surveys := v_layer4_surveys + 4; END IF;

        -- FIX: environment_stress → env_stress in V2
        -- V2 values: 'Smoke_Heavy', 'Smoke_Moderate', 'Smoke_Light', 'Heat', 'Cold', 'Flood', 'None'
        IF v_surveys.env_stress ILIKE '%smoke%'      THEN v_layer4_surveys := v_layer4_surveys + 3; END IF;
        IF v_surveys.env_stress IN ('Heat', 'Flood') THEN v_layer4_surveys := v_layer4_surveys + 1; END IF;

        -- soil_ph_risk: same column name in V2 ✓
        IF v_surveys.soil_ph_risk IN ('Acidic', 'high') THEN
            v_layer4_surveys := v_layer4_surveys + 3;
        END IF;
    END LOOP;

    -- NOTE: survey_inference_logs was dropped in V2 migration.
    -- The surveys.env_stress derived value replaces it.

    v_layer4_surveys := LEAST(v_layer4_surveys, 15);

    -- ══════════════════════════════════════════════════════
    -- STEP 6: LAYER 5 — Industrial Proximity (max 15 pts)
    -- STATIC: works even with zero scans (pre-scan prior)
    -- FIX 4: DECLARE block removed from inside loop
    -- ══════════════════════════════════════════════════════
    IF v_land_centroid IS NOT NULL THEN
        FOR v_hotspot_loop IN
            SELECT
                id,
                factory_name_bn,
                industry_type,
                ST_Distance(location::geography, v_land_centroid) / 1000.0 AS dist_km
            FROM public.industrial_hotspots
            WHERE ST_DWithin(location::geography, v_land_centroid, 10000)
              AND is_currently_active = true
            ORDER BY dist_km ASC
        LOOP
            IF v_nearest_factory_id IS NULL THEN
                v_nearest_factory_id   := v_hotspot_loop.id;
                v_nearest_factory_name := v_hotspot_loop.factory_name_bn;
                v_nearest_factory_dist := v_hotspot_loop.dist_km;
            END IF;

            -- FIX 4: No nested DECLARE — use module-level variable
            v_hotspot_pts := 0;

            IF    v_hotspot_loop.dist_km < 1  THEN v_hotspot_pts := 12;
            ELSIF v_hotspot_loop.dist_km < 3  THEN v_hotspot_pts := 8;
            ELSIF v_hotspot_loop.dist_km < 5  THEN v_hotspot_pts := 5;
            ELSIF v_hotspot_loop.dist_km <= 10 THEN v_hotspot_pts := 2;
            END IF;

            IF v_hotspot_loop.industry_type ILIKE '%tannery%'  THEN v_hotspot_pts := v_hotspot_pts * 1.5; END IF;
            IF v_hotspot_loop.industry_type ILIKE '%dyeing%'   THEN v_hotspot_pts := v_hotspot_pts * 1.3; END IF;
            IF v_hotspot_loop.industry_type ILIKE '%battery%'  THEN v_hotspot_pts := v_hotspot_pts * 1.4; END IF;
            IF v_hotspot_loop.industry_type ILIKE '%textile%'  THEN v_hotspot_pts := v_hotspot_pts * 1.2; END IF;
            IF v_hotspot_loop.industry_type ILIKE '%brick%'    THEN v_hotspot_pts := v_hotspot_pts * 1.2; END IF;

            v_layer5_proximity := v_layer5_proximity + v_hotspot_pts::INT;
        END LOOP;
    END IF;

    v_layer5_proximity := LEAST(v_layer5_proximity, 15);

    -- ══════════════════════════════════════════════════════
    -- STEP 7: Metal Type Determination
    -- FIX 5: Use separate v_nearest_industry variable
    -- ══════════════════════════════════════════════════════
    IF v_nearest_factory_id IS NOT NULL THEN
        SELECT industry_type
        INTO v_nearest_industry              -- FIX 5: was v_hotspot_data (wrong shape)
        FROM public.industrial_hotspots
        WHERE id = v_nearest_factory_id;

        IF    v_nearest_industry ILIKE '%tannery%'    OR
              v_nearest_industry ILIKE '%leather%'    OR
              v_nearest_industry ILIKE '%dyeing%'     OR
              v_nearest_industry ILIKE '%textile%'
        THEN  v_metal_type := 'chromium';

        ELSIF v_nearest_industry ILIKE '%battery%'   OR
              v_nearest_industry ILIKE '%electronics%' OR
              v_nearest_industry ILIKE '%steel%'     OR
              v_nearest_industry ILIKE '%foundry%'
        THEN  v_metal_type := 'lead';

        ELSIF v_nearest_industry ILIKE '%fertilizer%' OR
              v_nearest_industry ILIKE '%brick%'
        THEN  v_metal_type := 'arsenic';
        END IF;
    END IF;

    -- Zone fallback if still mixed
    BEGIN
        IF v_metal_type = 'mixed' AND
           v_zone.known_metal_types IS NOT NULL AND
           array_length(v_zone.known_metal_types, 1) > 0
        THEN
            v_metal_type := v_zone.known_metal_types[1];
        END IF;
    EXCEPTION WHEN undefined_column THEN
        NULL;
    END;

    -- ══════════════════════════════════════════════════════
    -- STEP 8: Total Score + Severity
    -- ══════════════════════════════════════════════════════
    v_total_score := v_layer1_zone + v_layer2_soil + v_layer3_scans
                   + v_layer4_surveys + v_layer5_proximity;
    v_total_score := LEAST(v_total_score, 100);

    IF    v_total_score < 25 THEN v_severity := 'low';
    ELSIF v_total_score < 50 THEN v_severity := 'moderate';
    ELSIF v_total_score < 75 THEN v_severity := 'high';
    ELSE                          v_severity := 'critical';
    END IF;

    -- Bengali notes
    v_notes := 'মাল্টি-লেয়ার এআই বিশ্লেষণ: ';
    IF v_layer3_scans > 0  THEN v_notes := v_notes || 'মাঠে সরাসরি দূষণের প্রমাণ পাওয়া গেছে। '; END IF;
    IF v_layer5_proximity > 10 THEN
        v_notes := v_notes || 'আশেপাশে ঝুঁকিপূর্ণ শিল্পকারখানা অবস্থিত ('
                || COALESCE(v_nearest_factory_name, 'অজানা') || ')। ';
    END IF;
    IF v_layer2_soil > 10  THEN v_notes := v_notes || 'মাটির স্বাস্থ্য প্রোফাইলে ভারী ধাতুর লক্ষণ রয়েছে। '; END IF;
    IF v_layer1_zone > 5   THEN
        v_notes := v_notes || 'এই জোনটি ঐতিহাসিকভাবে '
                || v_metal_type || ' দূষণের জন্য ঝুঁকিপূর্ণ। ';
    END IF;
    IF v_layer4_surveys > 5 THEN v_notes := v_notes || 'সাপ্তাহিক সার্ভেতে দূষণের তথ্য পাওয়া গেছে। '; END IF;

    -- ══════════════════════════════════════════════════════
    -- STEP 9: Save Report (if severity != low)
    -- ══════════════════════════════════════════════════════
    IF v_severity != 'low' THEN
        INSERT INTO public.heavy_metal_reports (
            land_id, farmer_id, scan_log_id,
            reported_via, metal_type, confidence_score,
            source_factory_id, geom, district,
            severity, verified, notes, is_anonymized_for_export
        ) VALUES (
            p_land_id, v_farmer_id, v_latest_scan_id,
            'multi_layer_inference', v_metal_type, (v_total_score::FLOAT / 100.0),
            v_nearest_factory_id, v_land_centroid, v_district,
            v_severity, false, v_notes, true
        )
        ON CONFLICT DO NOTHING;

        v_inserted := true;
    END IF;

    -- ══════════════════════════════════════════════════════
    -- STEP 10: Return
    -- ══════════════════════════════════════════════════════
    RETURN jsonb_build_object(
        'metal_risk_score',           v_total_score,
        'severity',                   v_severity,
        'metal_type',                 v_metal_type,
        'layer_scores', jsonb_build_object(
            'zone_static',            v_layer1_zone,
            'soil_profile',           v_layer2_soil,
            'scan_evidence',          v_layer3_scans,
            'survey_evidence',        v_layer4_surveys,
            'industrial_proximity',   v_layer5_proximity
        ),
        'cold_start_prior',           (v_layer3_scans = 0),
        'prior_score',                (v_layer1_zone + v_layer5_proximity),
        'nearest_factory_name_bn',    v_nearest_factory_name,
        'nearest_factory_distance_km', v_nearest_factory_dist,
        'inserted',                   v_inserted,
        'notes_bn',                   v_notes
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[detect_and_save_metal_risk] Error: %', SQLERRM;
    RETURN jsonb_build_object(
        'error',      SQLERRM,
        'land_id',    p_land_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_and_save_metal_risk(UUID) TO authenticated;
