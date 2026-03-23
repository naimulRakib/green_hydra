-- ============================================================
-- detect_and_save_metal_risk — Layer 3 Fixed
--
-- Layer 3 fixes:
-- 1. Added land_id filter to scan query
-- 2. Added 90-day time window
-- 3. Safe JSONB cast with COALESCE
-- 4. Lowered thresholds (plume 0.30, hours 12, confidence 0.65)
-- 5. Added scan frequency bonus (persistent pattern detection)
-- ============================================================

DROP FUNCTION IF EXISTS detect_and_save_metal_risk(UUID);

CREATE OR REPLACE FUNCTION detect_and_save_metal_risk(p_land_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_farmer_id            UUID;
    v_zone_id              TEXT;
    v_zone                 public.kb_zones%ROWTYPE;
    v_profile              public.farm_profiles%ROWTYPE;
    v_land_centroid        GEOGRAPHY;
    v_district             TEXT;
    v_scans                RECORD;
    v_surveys              RECORD;
    v_hotspot_loop         RECORD;
    v_nearest_industry     TEXT;
    v_layer1_zone          INT := 0;
    v_layer2_soil          INT := 0;
    v_layer3_scans         INT := 0;
    v_layer4_surveys       INT := 0;
    v_layer5_proximity     INT := 0;
    v_total_score          INT := 0;
    v_hotspot_pts          FLOAT := 0;
    v_metal_type           TEXT := 'mixed';
    v_severity             TEXT := 'low';
    v_notes                TEXT := '';
    v_nearest_factory_id   UUID := NULL;
    v_nearest_factory_name TEXT := NULL;
    v_nearest_factory_dist FLOAT := NULL;
    v_latest_scan_id       UUID := NULL;
    v_inserted             BOOLEAN := false;

    -- FIX 4: frequency count variable
    v_recent_scan_count    INT := 0;
BEGIN
    -- ══════════════════════════════════════════════════════
    -- STEP 1: Base Land Data
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

    SELECT * INTO v_profile FROM public.farm_profiles
    WHERE land_id = p_land_id LIMIT 1;

    SELECT * INTO v_zone FROM public.kb_zones
    WHERE zone_id = v_zone_id;

    v_district := v_zone.district;

    -- ══════════════════════════════════════════════════════
    -- LAYER 1: Zone Static Data (max 20 pts)
    -- ══════════════════════════════════════════════════════
    IF v_zone.heavy_metal_risk = true THEN
        v_layer1_zone := v_layer1_zone + 15;
    END IF;

    BEGIN
        IF v_zone.arsenic_zone_risk = 'High'   THEN v_layer1_zone := v_layer1_zone + 5; END IF;
        IF v_zone.arsenic_zone_risk = 'Medium' THEN v_layer1_zone := v_layer1_zone + 3; END IF;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;

    v_layer1_zone := LEAST(v_layer1_zone, 20);

    -- ══════════════════════════════════════════════════════
    -- LAYER 2: Soil Profile (max 20 pts)
    -- ══════════════════════════════════════════════════════
    IF v_profile IS NOT NULL THEN
        IF v_profile.arsenic_risk        = true THEN v_layer2_soil := v_layer2_soil + 8; END IF;
        IF v_profile.iron_risk           = true THEN v_layer2_soil := v_layer2_soil + 4; END IF;
        IF v_profile.canal_contamination = true THEN v_layer2_soil := v_layer2_soil + 5; END IF;
        IF v_profile.soil_ph IN ('Acidic')      THEN v_layer2_soil := v_layer2_soil + 4; END IF;
        IF v_profile.water_color NOT IN ('clear', 'slightly_turbid')
           AND v_profile.water_color IS NOT NULL
        THEN v_layer2_soil := v_layer2_soil + 3; END IF;
        IF v_profile.fish_kill           = true THEN v_layer2_soil := v_layer2_soil + 5; END IF;
        IF v_profile.water_risk IN ('Contaminated', 'Chemical')
        THEN v_layer2_soil := v_layer2_soil + 3; END IF;
    END IF;

    v_layer2_soil := LEAST(v_layer2_soil, 20);

    -- ══════════════════════════════════════════════════════
    -- LAYER 3: Scan Log Evidence (max 30 pts)
    --
    -- FIX 1: Added land_id = p_land_id filter
    --        (prevents other land scans contaminating score)
    -- FIX 2: Added 90-day time window
    --        (stale scans should not count)
    -- FIX 3: COALESCE on all JSONB casts
    --        (prevents null cast runtime errors)
    -- FIX 4: Lowered thresholds for realistic scoring
    --        plume_score: 0.60 → 0.30
    --        exposure_hours: 24h → 12h
    --        ai_confidence: 0.75 → 0.65
    -- ══════════════════════════════════════════════════════
    FOR v_scans IN
        SELECT
            id,
            ai_confidence,
            verification_status,
            environmental_context
        FROM public.scan_logs
        WHERE farmer_id = v_farmer_id
          AND land_id   = p_land_id                          -- FIX 1: land-specific
          AND stress_type = 'Abiotic_Pollution'
          AND created_at > NOW() - INTERVAL '90 days'        -- FIX 2: time window
        ORDER BY created_at DESC
        LIMIT 3
    LOOP
        -- Base points per scan
        v_layer3_scans := v_layer3_scans + 6;

        -- Track latest scan id for report linking
        IF v_latest_scan_id IS NULL THEN
            v_latest_scan_id := v_scans.id;
        END IF;

        -- FIX 3+4: Safe JSONB cast + lowered threshold 0.60 → 0.30
        IF COALESCE(
            (v_scans.environmental_context->>'plume_score')::FLOAT, 0
           ) > 0.30
        THEN v_layer3_scans := v_layer3_scans + 3; END IF;

        -- FIX 3+4: Safe JSONB cast + lowered threshold 24h → 12h
        IF COALESCE(
            (v_scans.environmental_context->>'plume_exposure_hours_7d')::FLOAT, 0
           ) > 12
        THEN v_layer3_scans := v_layer3_scans + 3; END IF;

        -- FIX 3: Safe JSONB boolean string check
        IF COALESCE(
            v_scans.environmental_context->>'canal_contamination', 'false'
           ) = 'true'
        THEN v_layer3_scans := v_layer3_scans + 2; END IF;

        -- FIX 4: Lowered confidence threshold 0.75 → 0.65
        IF COALESCE(v_scans.ai_confidence, 0) > 0.65
        THEN v_layer3_scans := v_layer3_scans + 2; END IF;

        -- Verified scan = community-confirmed, highest trust
        IF v_scans.verification_status = 'verified'
        THEN v_layer3_scans := v_layer3_scans + 4; END IF;

    END LOOP;

    -- ──────────────────────────────────────────────────────
    -- FIX 5: Scan Frequency Bonus
    -- Persistent exposure pattern = stronger evidence
    -- 3+ scans in 30 days = chronic/systematic pollution
    -- ──────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_recent_scan_count
    FROM public.scan_logs
    WHERE farmer_id   = v_farmer_id
      AND land_id     = p_land_id
      AND stress_type = 'Abiotic_Pollution'
      AND created_at  > NOW() - INTERVAL '30 days';

    IF    v_recent_scan_count >= 3 THEN v_layer3_scans := v_layer3_scans + 8;  -- chronic pattern
    ELSIF v_recent_scan_count >= 2 THEN v_layer3_scans := v_layer3_scans + 4;  -- recurring
    END IF;

    v_layer3_scans := LEAST(v_layer3_scans, 30);

    -- ══════════════════════════════════════════════════════
    -- LAYER 4: Survey Evidence (max 15 pts)
    -- ══════════════════════════════════════════════════════
    FOR v_surveys IN
        SELECT water_risk, env_stress, soil_ph_risk
        FROM public.surveys
        WHERE farmer_id = v_farmer_id
          AND land_id   = p_land_id
        ORDER BY submitted_at DESC
        LIMIT 2
    LOOP
        IF v_surveys.water_risk = 'Industrial'   THEN v_layer4_surveys := v_layer4_surveys + 6; END IF;
        IF v_surveys.water_risk = 'Chemical'     THEN v_layer4_surveys := v_layer4_surveys + 5; END IF;
        IF v_surveys.water_risk = 'Contaminated' THEN v_layer4_surveys := v_layer4_surveys + 4; END IF;
        IF v_surveys.env_stress ILIKE '%smoke%'  THEN v_layer4_surveys := v_layer4_surveys + 3; END IF;
        IF v_surveys.env_stress IN ('Heat', 'Flood') THEN v_layer4_surveys := v_layer4_surveys + 1; END IF;
        IF v_surveys.soil_ph_risk IN ('Acidic', 'high') THEN v_layer4_surveys := v_layer4_surveys + 3; END IF;
    END LOOP;

    v_layer4_surveys := LEAST(v_layer4_surveys, 15);

    -- ══════════════════════════════════════════════════════
    -- LAYER 5: Industrial Proximity (max 15 pts)
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

            v_hotspot_pts := 0;

            IF    v_hotspot_loop.dist_km < 1   THEN v_hotspot_pts := 12;
            ELSIF v_hotspot_loop.dist_km < 3   THEN v_hotspot_pts := 8;
            ELSIF v_hotspot_loop.dist_km < 5   THEN v_hotspot_pts := 5;
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
    -- Metal Type Determination
    -- ══════════════════════════════════════════════════════
    IF v_nearest_factory_id IS NOT NULL THEN
        SELECT industry_type INTO v_nearest_industry
        FROM public.industrial_hotspots
        WHERE id = v_nearest_factory_id;

        IF    v_nearest_industry ILIKE '%tannery%'    OR
              v_nearest_industry ILIKE '%leather%'    OR
              v_nearest_industry ILIKE '%dyeing%'     OR
              v_nearest_industry ILIKE '%textile%'
        THEN  v_metal_type := 'chromium';

        ELSIF v_nearest_industry ILIKE '%battery%'    OR
              v_nearest_industry ILIKE '%electronics%' OR
              v_nearest_industry ILIKE '%steel%'      OR
              v_nearest_industry ILIKE '%foundry%'
        THEN  v_metal_type := 'lead';

        ELSIF v_nearest_industry ILIKE '%fertilizer%' OR
              v_nearest_industry ILIKE '%brick%'
        THEN  v_metal_type := 'arsenic';
        END IF;
    END IF;

    BEGIN
        IF v_metal_type = 'mixed'
           AND v_zone.known_metal_types IS NOT NULL
           AND array_length(v_zone.known_metal_types, 1) > 0
        THEN
            v_metal_type := v_zone.known_metal_types[1];
        END IF;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;

    -- ══════════════════════════════════════════════════════
    -- Total Score + Severity
    -- ══════════════════════════════════════════════════════
    v_total_score := LEAST(
        v_layer1_zone  +
        v_layer2_soil  +
        v_layer3_scans +
        v_layer4_surveys +
        v_layer5_proximity,
        100
    );

    IF    v_total_score < 25 THEN v_severity := 'low';
    ELSIF v_total_score < 50 THEN v_severity := 'moderate';
    ELSIF v_total_score < 75 THEN v_severity := 'high';
    ELSE                          v_severity := 'critical';
    END IF;

    -- Bengali Notes
    v_notes := 'মাল্টি-লেয়ার এআই বিশ্লেষণ: ';
    IF v_layer3_scans > 0       THEN v_notes := v_notes || 'মাঠে সরাসরি দূষণের প্রমাণ পাওয়া গেছে। '; END IF;
    IF v_recent_scan_count >= 3 THEN v_notes := v_notes || 'গত ৩০ দিনে বারবার দূষণ সনাক্ত হয়েছে — দীর্ঘমেয়াদী ঝুঁকি। '; END IF;
    IF v_layer5_proximity > 10  THEN v_notes := v_notes || 'আশেপাশে ঝুঁকিপূর্ণ শিল্পকারখানা অবস্থিত (' || COALESCE(v_nearest_factory_name, 'অজানা') || ')। '; END IF;
    IF v_layer2_soil > 10       THEN v_notes := v_notes || 'মাটির স্বাস্থ্য প্রোফাইলে ভারী ধাতুর লক্ষণ রয়েছে। '; END IF;
    IF v_layer1_zone > 5        THEN v_notes := v_notes || 'এই জোনটি ঐতিহাসিকভাবে ' || v_metal_type || ' দূষণের জন্য ঝুঁকিপূর্ণ। '; END IF;
    IF v_layer4_surveys > 5     THEN v_notes := v_notes || 'সাপ্তাহিক সার্ভেতে দূষণের তথ্য পাওয়া গেছে। '; END IF;

    -- ══════════════════════════════════════════════════════
    -- Save Report (severity != low)
    -- ══════════════════════════════════════════════════════
    IF v_severity != 'low' THEN
        INSERT INTO public.heavy_metal_reports (
            land_id, farmer_id, scan_log_id,
            reported_via, metal_type, confidence_score,
            source_factory_id, geom,
            district, severity, verified, notes,
            is_anonymized_for_export
        ) VALUES (
            p_land_id, v_farmer_id, v_latest_scan_id,
            'scan_inference',
            v_metal_type, (v_total_score::FLOAT / 100.0),
            v_nearest_factory_id,
            v_land_centroid::geometry,
            v_district, v_severity, false, v_notes, true
        )
        ON CONFLICT DO NOTHING;

        v_inserted := true;
    END IF;

    -- ══════════════════════════════════════════════════════
    -- Return
    -- ══════════════════════════════════════════════════════
    RETURN jsonb_build_object(
        'metal_risk_score',             v_total_score,
        'severity',                     v_severity,
        'metal_type',                   v_metal_type,
        'layer_scores', jsonb_build_object(
            'zone_static',              v_layer1_zone,
            'soil_profile',             v_layer2_soil,
            'scan_evidence',            v_layer3_scans,
            'survey_evidence',          v_layer4_surveys,
            'industrial_proximity',     v_layer5_proximity
        ),
        'cold_start_prior',             (v_layer3_scans = 0),
        'prior_score',                  (v_layer1_zone + v_layer5_proximity),
        'recent_pollution_scans_30d',   v_recent_scan_count,
        'nearest_factory_name_bn',      v_nearest_factory_name,
        'nearest_factory_distance_km',  v_nearest_factory_dist,
        'inserted',                     v_inserted,
        'notes_bn',                     v_notes
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[detect_and_save_metal_risk] Error: %', SQLERRM;
    RETURN jsonb_build_object(
        'error',    SQLERRM,
        'land_id',  p_land_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_and_save_metal_risk(UUID) TO authenticated;
