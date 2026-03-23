-- ==============================================================================
-- AGRO-SENTINEL: FULL DATABASE SEEDER (DUMMY DATA)
-- ==============================================================================
-- এই স্ক্রিপ্টটি আপনার ডাটাবেজে আপনার অ্যাকাউন্টের বিপরীতে প্রচুর রিয়েল-টাইম ডামি ডেটা (Dummy Data) 
-- যুক্ত করবে, যাতে আপনার ড্যাশবোর্ডটি পুরোপুরি জীবন্ত (Interactive) ও ডেটায় ভরপুর দেখায়।
-- ==============================================================================

DO $$
DECLARE
    v_farmer_id UUID;
    v_zone_id VARCHAR := 'Z-RANG-01'; -- Rangpur Zone
    v_crop_id VARCHAR := 'rice_boro';
    v_land_id_1 UUID;
    v_land_id_2 UUID;
    v_hotspot_id UUID;
    v_scan_id UUID;
    v_remedy_id VARCHAR;
    v_disease_id VARCHAR;
    v_pollutant_id VARCHAR;
    v_survey_id UUID;
    v_water_source_id UUID;
    v_risk_id UUID;
BEGIN

    -- ১. বর্তমান কৃষকের আইডি খুঁজে বের করা (প্রথম যে কৃষক পাওয়া যাবে)
    SELECT id INTO v_farmer_id FROM public.farmers LIMIT 1;
    
    IF v_farmer_id IS NULL THEN
        RAISE EXCEPTION 'কোনো কৃষক পাওয়া যায়নি! দয়া করে আগে অ্যাপে একবার লগইন/সাইনআপ করুন।';
    END IF;

    -- Update farmer badge and scans to look experienced
    UPDATE public.farmers 
SET badge_level = 'Agronomist',  -- was 'Expert'
    total_scans = 15, 
    verified_scans = 12, 
    trust_score = 0.95
WHERE id = v_farmer_id;

    -- ২. রেমেডি (Remedy), ডিজিজ (Disease), এবং পলুট্যান্ট (Pollutant) নিশ্চিত করা
    SELECT remedy_id INTO v_remedy_id FROM public.kb_remedies LIMIT 1;
    IF v_remedy_id IS NULL THEN
        INSERT INTO public.kb_remedies (remedy_id, title_en, title_bn, remedy_type, severity, headline_bn, action_steps_bn)
        VALUES ('REM-BLAST-01', 'Blast Control', 'ব্লাস্ট রোগ নিয়ন্ত্রণ', 'chemical', 'high', 'অবিলম্বে ট্রাইসাইক্লাজল স্প্রে করুন', '["ক্ষেতের পানি শুকিয়ে ফেলুন", "প্রতি লিটার পানিতে ১ গ্রাম ট্রাইসাইক্লাজল মেশান"]')
        RETURNING remedy_id INTO v_remedy_id;
    END IF;

    SELECT disease_id INTO v_disease_id FROM public.kb_diseases LIMIT 1;
    IF v_disease_id IS NULL THEN
        INSERT INTO public.kb_diseases (disease_id, disease_name_en, disease_name_bn, disease_type)
        VALUES ('DIS-BLAST', 'Rice Blast', 'ধানের ব্লাস্ট রোগ', 'Biotic_Fungal')
        RETURNING disease_id INTO v_disease_id;
    END IF;

    SELECT pollutant_id INTO v_pollutant_id FROM public.kb_industrial_pollutants LIMIT 1;
    IF v_pollutant_id IS NULL THEN
        INSERT INTO public.kb_industrial_pollutants (pollutant_id, pollutant_name)
        VALUES ('POL-SO2', 'Sulfur Dioxide')
        RETURNING pollutant_id INTO v_pollutant_id;
    END IF;

    -- ৩. ডামি জমি তৈরি করা (Land Plots)
    INSERT INTO public.farmer_lands (farmer_id, land_name, land_name_bn, boundary, area_bigha, crop_id, zone_id)
    VALUES (v_farmer_id, 'North Field', 'উত্তরের জমি', 'SRID=4326;POLYGON((89.2 25.7, 89.201 25.7, 89.201 25.701, 89.2 25.701, 89.2 25.7))'::geometry, 3.5, v_crop_id, v_zone_id)
    ON CONFLICT DO NOTHING
    RETURNING land_id INTO v_land_id_1;

    INSERT INTO public.farmer_lands (farmer_id, land_name, land_name_bn, boundary, area_bigha, crop_id, zone_id)
    VALUES (v_farmer_id, 'South Field', 'দক্ষিণের জমি (কারখানার পাশে)', 'SRID=4326;POLYGON((89.205 25.705, 89.206 25.705, 89.206 25.706, 89.205 25.706, 89.205 25.705))'::geometry, 2.0, v_crop_id, v_zone_id)
    ON CONFLICT DO NOTHING
    RETURNING land_id INTO v_land_id_2;

    -- Ensure we have land IDs if they already existed
    IF v_land_id_1 IS NULL THEN SELECT land_id INTO v_land_id_1 FROM public.farmer_lands WHERE farmer_id = v_farmer_id LIMIT 1 OFFSET 0; END IF;
    IF v_land_id_2 IS NULL THEN SELECT land_id INTO v_land_id_2 FROM public.farmer_lands WHERE farmer_id = v_farmer_id LIMIT 1 OFFSET 1; END IF;
    IF v_land_id_2 IS NULL THEN v_land_id_2 := v_land_id_1; END IF;

    -- ৪. জমির প্রোফাইল (Farmer Land Profile)
    INSERT INTO public.farmer_land_profile (farmer_id, land_id, soil_ph_status, pest_pressure, recent_smoke_exposure, water_color_status)
    VALUES (v_farmer_id, v_land_id_1, 'Normal', 'low', false, 'clear')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.farmer_land_profile (farmer_id, land_id, soil_ph_status, pest_pressure, recent_smoke_exposure, water_color_status, canal_contamination)
    VALUES (v_farmer_id, v_land_id_2, 'Acidic', 'high', true, 'black', true)
    ON CONFLICT DO NOTHING;

    -- ৫. আবহাওয়া ডেটা (Weather Data)
    INSERT INTO public.weather_details (farmer_id, weather_data)
    VALUES (v_farmer_id, '{
        "current": {
            "temperature_2m": 29.5,
            "relative_humidity_2m": 88,
            "wind_speed_10m": 12.4,
            "wind_direction_10m": 135,
            "precipitation": 2.5
        },
        "daily": {
            "temperature_2m_max": [31.2]
        },
        "computed": {
            "consecutive_wet_days": 4
        }
    }'::jsonb)
    ON CONFLICT DO NOTHING;

    -- ৬. শিল্পাঞ্চল বা কারখানা (Industrial Hotspot)
    INSERT INTO public.industrial_hotspots (factory_name_bn, industry_type, location, max_plume_km, plume_cone_deg, is_currently_active)
    VALUES ('রংপুর টেক্সটাইল মিলস্', 'Textile/Dyeing', 'SRID=4326;POINT(89.207 25.707)'::geometry, 10.0, 60.0, true)
    RETURNING id INTO v_hotspot_id;

    -- ৭. স্ক্যান লগ (Scan Logs - AI Diagnosis)
    INSERT INTO public.scan_logs (farmer_id, crop_id, scan_location, vision_output, stress_type, confirmed_disease_id, ai_confidence, verification_status, image_url)
    VALUES (v_farmer_id, v_crop_id, 'SRID=4326;POINT(89.2 25.7)'::geometry, '{"detected_crop": "Rice", "visual_symptoms": "Brown diamond-shaped lesions on leaves."}'::jsonb, 'Biotic_Fungal', v_disease_id, 0.92, 'verified', 'https://via.placeholder.com/400x400.png?text=Rice+Leaf')
    RETURNING id INTO v_scan_id;

    INSERT INTO public.scan_logs (farmer_id, crop_id, scan_location, vision_output, stress_type, confirmed_pollutant_id, ai_confidence, verification_status, image_url)
    VALUES (v_farmer_id, v_crop_id, 'SRID=4326;POINT(89.205 25.705)'::geometry, '{"detected_crop": "Rice", "visual_symptoms": "Leaf tips are bleached white, interveinal necrosis."}'::jsonb, 'Abiotic_Pollution', v_pollutant_id, 0.88, 'verified', 'https://via.placeholder.com/400x400.png?text=Pollution+Burn');

    -- ৮. প্রতিবেশী স্প্রে এলার্ট (Community Spray Events)
    INSERT INTO public.spray_events (land_id, farmer_id, chemical_name, chemical_type, sprayed_at, expires_at, harm_radius_m, risk_level)
    VALUES (v_land_id_1, v_farmer_id, 'সাইপারমেথ্রিন (Cypermethrin)', 'Insecticide', now() - interval '1 day', now() + interval '2 days', 100, 'red');

    -- ৯. খালের পানি দূষণ এলার্ট (Water Pollution Events)
    INSERT INTO public.water_sources (source_name_bn, source_type, location, reported_by, risk_zone)
    VALUES ('ঘাঘট নদী খাল', 'River/Canal', ST_SetSRID(ST_MakePoint(89.205, 25.706), 4326)::geography, v_farmer_id, 'danger')
    RETURNING source_id INTO v_water_source_id;

    INSERT INTO public.water_pollution_events (water_source_id, hotspot_id, pollution_type, severity, water_color, alert_message_bn, is_active)
    VALUES (v_water_source_id, v_hotspot_id, 'Chemical Dye', 'High', 'Black/Red', 'খালের পানি কালো হয়ে গেছে, কারখানার নির্গমন চলছে। এই পানি সেচ দেবেন না।', true);

    -- ১০. রিস্ক এবং লস একাউন্টিং (Risk & Loss Estimates)
    INSERT INTO public.farm_risk_scores (land_id, farmer_id, risk_score, risk_level, dominant_threat, breakdown, advice_bn)
    VALUES (v_land_id_2, v_farmer_id, 75, 'High', 'Industrial Pollution', '{"plume_exposure": 40, "water_toxicity": 35}', 'আপনার জমির মাটি মারাত্মক অম্লীয় হয়ে গেছে। জিপসাম সার ব্যবহার করুন এবং খালের পানি সেচ বন্ধ রাখুন।')
    RETURNING id INTO v_risk_id;

    INSERT INTO public.loss_estimates (land_id, farmer_id, risk_score_id, expected_loss_bdt, loss_percentage, crop_name, estimated_at)
    VALUES (v_land_id_2, v_farmer_id, v_risk_id, 12500, 35.0, 'Boro Rice', now());

    -- ১১. ভারি ধাতু বা Heavy Metal Report (আপনার লেটেস্ট ফিচার)
    INSERT INTO public.heavy_metal_reports (land_id, farmer_id, reported_via, metal_type, confidence_score, severity, notes, district)
    VALUES (v_land_id_2, v_farmer_id, 'auto_inference', 'chromium', 0.85, 'high', 'রংপুর টেক্সটাইল মিল ও অম্লীয় মাটির কারণে ক্রোমিয়াম দূষণের ব্যাপক সম্ভাবনা।', 'Rangpur');

    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'SUCCESS! সাকসেস! আপনার ডাটাবেজে সমস্ত ডামি ডেটা সফলভাবে যোগ করা হয়েছে।';
    RAISE NOTICE 'Farmer ID: %', v_farmer_id;
    RAISE NOTICE 'Land 1: %', v_land_id_1;
    RAISE NOTICE 'Land 2: %', v_land_id_2;
    RAISE NOTICE 'Hotspot: %', v_hotspot_id;
    RAISE NOTICE 'Heavy Metal & Risk Reports Generated.';
    RAISE NOTICE 'এখন ড্যাশবোর্ডে গিয়ে পেজ রিলোড দিন। ম্যাজিক দেখুন!';
    RAISE NOTICE '=======================================================';
END $$;
