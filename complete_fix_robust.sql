-- ============================================================================
-- COMPLETE FIX: MOD Error + Add Dhaka Area Factory Data (ROBUST VERSION)
-- ============================================================================
-- This version handles missing primary_pollutant column automatically
-- and includes all your original functionality

-- ============================================================================
-- STEP 1: Add missing column if it doesn't exist
-- ============================================================================
ALTER TABLE public.industrial_hotspots
ADD COLUMN IF NOT EXISTS primary_pollutant VARCHAR(50);

-- Optional compatibility column used by some older app SQL functions
ALTER TABLE public.industrial_hotspots
ADD COLUMN IF NOT EXISTS remedy_id UUID;

-- Update existing rows with default pollutants first
UPDATE public.industrial_hotspots
SET primary_pollutant = CASE
    WHEN industry_type = 'Textile/Dyeing' THEN 'Chemical Dyes'
    WHEN industry_type = 'Tannery' THEN 'Chromium'
    WHEN industry_type = 'Brick_Kiln' THEN 'PM2.5'
    WHEN industry_type = 'Chemical' THEN 'SO2'
    WHEN industry_type = 'Garment_Factory' THEN 'Dyes'
    ELSE 'Unknown'
END
WHERE primary_pollutant IS NULL;

-- Backfill required english name if schema enforces NOT NULL on factory_name
UPDATE public.industrial_hotspots
SET factory_name = COALESCE(factory_name, factory_name_bn, industry_type, 'Unknown Factory')
WHERE factory_name IS NULL;

-- ============================================================================
-- STEP 2: Drop existing functions to avoid conflicts (your original code)
-- ============================================================================
DROP FUNCTION IF EXISTS check_pollution_hazards(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS check_pollution_hazards(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);
DROP FUNCTION IF EXISTS public.check_pollution_hazards CASCADE;

-- ============================================================================
-- STEP 3: Add missing factory data around Dhaka (your original data)
-- ============================================================================
INSERT INTO public.industrial_hotspots (
    factory_name,
    factory_name_bn,
    industry_type,
    location,
    max_plume_km,
    plume_cone_deg,
    is_currently_active,
    primary_pollutant
) VALUES
    -- Hazaribagh Tannery (the one from your bug report)
    ('Hazaribagh Tannery', 'হাজারীবাগ ট্যানারি', 'Tannery', 'SRID=4326;POINT(90.4152 23.7940)'::geometry, 8.0, 60.0, true, 'Chromium'),

    -- Savar Industrial Area
    ('Savar EPZ Garments', 'সাভার ইন্ডাস্ট্রিয়াল এলাকা', 'Garment_Factory', 'SRID=4326;POINT(90.2669 23.8583)'::geometry, 6.0, 50.0, true, 'Dyes'),

    -- Gazipur Industrial Area
    ('Gazipur Textile Cluster', 'গাজীপুর টেক্সটাইল', 'Textile/Dyeing', 'SRID=4326;POINT(90.4203 23.9999)'::geometry, 7.0, 55.0, true, 'Chemical'),

    -- Narayanganj Industrial Area
    ('Narayanganj Textile Mills', 'নারায়ণগঞ্জ মিল', 'Textile/Dyeing', 'SRID=4326;POINT(90.4833 23.6333)'::geometry, 5.0, 45.0, true, 'Chemical'),

    -- Keraniganj Brick Kiln (close to your farm location)
    ('Keraniganj Brick Kiln', 'কেরানীগঞ্জ ইটভাটা', 'Brick_Kiln', 'SRID=4326;POINT(90.4000 23.7800)'::geometry, 4.0, 70.0, true, 'PM2.5'),

    -- Tongi Industrial Area
    ('Tongi Chemical Industries', 'টঙ্গী ইন্ডাস্ট্রিয়াল', 'Chemical', 'SRID=4326;POINT(90.4037 23.8979)'::geometry, 10.0, 60.0, true, 'SO2')

ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 4: Create the corrected function (MOD error fixed - your original code)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_pollution_hazards(
    p_farmer_lat DOUBLE PRECISION,
    p_farmer_lng DOUBLE PRECISION,
    p_wind_from_deg DOUBLE PRECISION,
    p_wind_speed_kmh DOUBLE PRECISION
)
RETURNS TABLE(
    hotspot_id UUID,
    factory_name VARCHAR,
    factory_name_bn VARCHAR,
    industry_type VARCHAR,
    factory_lat DOUBLE PRECISION,
    factory_lng DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    max_plume_km DOUBLE PRECISION,
    plume_cone_deg DOUBLE PRECISION,
    wind_to_deg DOUBLE PRECISION,
    is_in_plume BOOLEAN,
    primary_pollutant VARCHAR,
    risk_level VARCHAR,
    remedy_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wind_to_deg DOUBLE PRECISION;
    v_bearing_to_farm DOUBLE PRECISION;
    v_angle_diff DOUBLE PRECISION;
    v_is_in_plume BOOLEAN;
    v_distance_km DOUBLE PRECISION;
    v_risk_level VARCHAR;
    hotspot_rec RECORD;

    -- Earth's radius in kilometers
    EARTH_RADIUS CONSTANT DOUBLE PRECISION := 6371.0;
BEGIN
    -- Convert wind_from to wind_to (direction smoke travels)
    -- FIX: Use modulo without MOD function to avoid data type issues
    v_wind_to_deg := (p_wind_from_deg + 180.0) - FLOOR((p_wind_from_deg + 180.0) / 360.0) * 360.0;

    -- Loop through all active industrial hotspots
    FOR hotspot_rec IN
        SELECT
            h.id::UUID AS id,
            COALESCE(h.factory_name_bn, h.factory_name, 'Unknown')::VARCHAR AS factory_name,
            COALESCE(h.factory_name_bn, h.factory_name, 'Unknown')::VARCHAR AS factory_name_bn,
            COALESCE(h.industry_type, 'Unknown')::VARCHAR AS industry_type,
            ST_Y(h.location::geometry) AS lat,
            ST_X(h.location::geometry) AS lng,
            h.max_plume_km,
            h.plume_cone_deg,
            COALESCE(
                h.primary_pollutant,
                h.primary_pollutant_id,
                'Unknown'
            )::VARCHAR AS primary_pollutant,
            NULL::UUID AS remedy_id
        FROM industrial_hotspots h
        WHERE h.is_currently_active = true
          AND h.location IS NOT NULL
          AND ST_Y(h.location::geometry) IS NOT NULL
          AND ST_X(h.location::geometry) IS NOT NULL
    LOOP
        -- Calculate distance using Haversine formula
        v_distance_km := EARTH_RADIUS * acos(
            GREATEST(-1.0, LEAST(1.0,
                cos(radians(p_farmer_lat)) * cos(radians(hotspot_rec.lat)) *
                cos(radians(hotspot_rec.lng - p_farmer_lng)) +
                sin(radians(p_farmer_lat)) * sin(radians(hotspot_rec.lat))
            ))
        );

        -- Skip if outside maximum plume range
        IF v_distance_km > hotspot_rec.max_plume_km THEN
            v_is_in_plume := FALSE;
        ELSE
            -- Calculate bearing FROM factory TO farm using forward azimuth
            v_bearing_to_farm := degrees(
                atan2(
                    sin(radians(p_farmer_lng - hotspot_rec.lng)) * cos(radians(p_farmer_lat)),
                    cos(radians(hotspot_rec.lat)) * sin(radians(p_farmer_lat)) -
                    sin(radians(hotspot_rec.lat)) * cos(radians(p_farmer_lat)) *
                    cos(radians(p_farmer_lng - hotspot_rec.lng))
                )
            );

            -- Normalize bearing to 0-360 degrees (FIX: avoid MOD function)
            v_bearing_to_farm := (v_bearing_to_farm + 360.0) - FLOOR((v_bearing_to_farm + 360.0) / 360.0) * 360.0;

            -- Calculate angular difference (shortest arc around circle)
            v_angle_diff := abs(v_wind_to_deg - v_bearing_to_farm);
            IF v_angle_diff > 180.0 THEN
                v_angle_diff := 360.0 - v_angle_diff;
            END IF;

            -- Farm is in plume if wind direction aligns with factory→farm direction
            v_is_in_plume := (v_angle_diff <= (hotspot_rec.plume_cone_deg / 2.0));
        END IF;

        -- Determine risk level
        IF v_is_in_plume THEN
            IF v_distance_km <= 1.0 THEN
                v_risk_level := 'Critical';
            ELSIF v_distance_km <= 3.0 THEN
                v_risk_level := 'High';
            ELSE
                v_risk_level := 'Moderate';
            END IF;
        ELSE
            v_risk_level := 'Low';
        END IF;

        -- Return this hotspot's data
        RETURN QUERY SELECT
            hotspot_rec.id::UUID,
            hotspot_rec.factory_name::VARCHAR,
            hotspot_rec.factory_name_bn::VARCHAR,
            hotspot_rec.industry_type::VARCHAR,
            hotspot_rec.lat::DOUBLE PRECISION,
            hotspot_rec.lng::DOUBLE PRECISION,
            ROUND(v_distance_km::NUMERIC, 2)::DOUBLE PRECISION,
            hotspot_rec.max_plume_km::DOUBLE PRECISION,
            hotspot_rec.plume_cone_deg::DOUBLE PRECISION,
            v_wind_to_deg::DOUBLE PRECISION,
            v_is_in_plume::BOOLEAN,
            hotspot_rec.primary_pollutant::VARCHAR,
            v_risk_level::VARCHAR,
            hotspot_rec.remedy_id::UUID;
    END LOOP;

    RETURN;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_pollution_hazards(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) TO authenticated;

-- ============================================================================
-- STEP 4B: Fallback function for Overview map visibility
-- ============================================================================
-- Why: if the main function signature or internals drift, overview still gets
-- hotspot rows and keeps industrial markers visible.
CREATE OR REPLACE FUNCTION get_hotspots_for_overview(
    p_farmer_lat DOUBLE PRECISION,
    p_farmer_lng DOUBLE PRECISION,
    p_wind_from_deg DOUBLE PRECISION,
    p_wind_speed_kmh DOUBLE PRECISION
)
RETURNS TABLE(
    hotspot_id UUID,
    factory_name VARCHAR,
    factory_name_bn VARCHAR,
    industry_type VARCHAR,
    factory_lat DOUBLE PRECISION,
    factory_lng DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    max_plume_km DOUBLE PRECISION,
    plume_cone_deg DOUBLE PRECISION,
    wind_to_deg DOUBLE PRECISION,
    is_in_plume BOOLEAN,
    primary_pollutant VARCHAR,
    risk_level VARCHAR,
    remedy_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wind_to_deg DOUBLE PRECISION;
    v_bearing_to_farm DOUBLE PRECISION;
    v_angle_diff DOUBLE PRECISION;
    v_is_in_plume BOOLEAN;
    v_distance_km DOUBLE PRECISION;
    v_risk_level VARCHAR;
    hotspot_rec RECORD;

    EARTH_RADIUS CONSTANT DOUBLE PRECISION := 6371.0;
BEGIN
    v_wind_to_deg := (p_wind_from_deg + 180.0) - FLOOR((p_wind_from_deg + 180.0) / 360.0) * 360.0;

    FOR hotspot_rec IN
        SELECT
            h.id::UUID AS hotspot_id,
            COALESCE(h.factory_name_bn, h.factory_name, 'Unknown')::VARCHAR AS factory_name,
            COALESCE(h.factory_name_bn, h.factory_name, 'Unknown')::VARCHAR AS factory_name_bn,
            COALESCE(h.industry_type, 'Unknown')::VARCHAR AS industry_type,
            ST_Y(h.location::geometry) AS factory_lat,
            ST_X(h.location::geometry) AS factory_lng,
            COALESCE(h.max_plume_km, 5.0) AS max_plume_km,
            COALESCE(h.plume_cone_deg, 90.0) AS plume_cone_deg,
            COALESCE(
                h.primary_pollutant,
                h.primary_pollutant_id,
                'Unknown'
            )::VARCHAR AS primary_pollutant,
            NULL::UUID AS remedy_id
        FROM industrial_hotspots h
        WHERE h.is_currently_active = true
          AND h.location IS NOT NULL
          AND ST_Y(h.location::geometry) IS NOT NULL
          AND ST_X(h.location::geometry) IS NOT NULL
    LOOP
        v_distance_km := EARTH_RADIUS * acos(
            GREATEST(-1.0, LEAST(1.0,
                cos(radians(p_farmer_lat)) * cos(radians(hotspot_rec.factory_lat)) *
                cos(radians(hotspot_rec.factory_lng - p_farmer_lng)) +
                sin(radians(p_farmer_lat)) * sin(radians(hotspot_rec.factory_lat))
            ))
        );

        IF v_distance_km > hotspot_rec.max_plume_km THEN
            v_is_in_plume := FALSE;
        ELSE
            v_bearing_to_farm := degrees(
                atan2(
                    sin(radians(p_farmer_lng - hotspot_rec.factory_lng)) * cos(radians(p_farmer_lat)),
                    cos(radians(hotspot_rec.factory_lat)) * sin(radians(p_farmer_lat)) -
                    sin(radians(hotspot_rec.factory_lat)) * cos(radians(p_farmer_lat)) *
                    cos(radians(p_farmer_lng - hotspot_rec.factory_lng))
                )
            );

            v_bearing_to_farm := (v_bearing_to_farm + 360.0) - FLOOR((v_bearing_to_farm + 360.0) / 360.0) * 360.0;

            v_angle_diff := abs(v_wind_to_deg - v_bearing_to_farm);
            IF v_angle_diff > 180.0 THEN
                v_angle_diff := 360.0 - v_angle_diff;
            END IF;

            v_is_in_plume := (v_angle_diff <= (hotspot_rec.plume_cone_deg / 2.0));
        END IF;

        IF v_is_in_plume THEN
            IF v_distance_km <= 1.0 THEN
                v_risk_level := 'Critical';
            ELSIF v_distance_km <= 3.0 THEN
                v_risk_level := 'High';
            ELSE
                v_risk_level := 'Moderate';
            END IF;
        ELSE
            v_risk_level := 'Low';
        END IF;

        RETURN QUERY
        SELECT
            hotspot_rec.hotspot_id::UUID,
            hotspot_rec.factory_name::VARCHAR,
            hotspot_rec.factory_name_bn::VARCHAR,
            hotspot_rec.industry_type::VARCHAR,
            hotspot_rec.factory_lat::DOUBLE PRECISION,
            hotspot_rec.factory_lng::DOUBLE PRECISION,
            ROUND(v_distance_km::NUMERIC, 2)::DOUBLE PRECISION,
            hotspot_rec.max_plume_km::DOUBLE PRECISION,
            hotspot_rec.plume_cone_deg::DOUBLE PRECISION,
            v_wind_to_deg::DOUBLE PRECISION,
            v_is_in_plume::BOOLEAN,
            hotspot_rec.primary_pollutant::VARCHAR,
            v_risk_level::VARCHAR,
            hotspot_rec.remedy_id::UUID;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION get_hotspots_for_overview(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) TO authenticated;

-- ============================================================================
-- Step 5: Add index for performance (optional but recommended)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_industrial_hotspots_pollutant
ON public.industrial_hotspots(primary_pollutant);

-- ============================================================================
-- DEBUGGING: Check that factories were added successfully
-- ============================================================================
-- Run this query to verify data:
SELECT
    factory_name_bn,
    industry_type,
    primary_pollutant,
    ST_AsText(location),
    is_currently_active
FROM industrial_hotspots
WHERE is_currently_active = true;

-- Test the function with Keraniganj coordinates
-- SELECT * FROM check_pollution_hazards(23.8050, 90.4262, 45.0, 12.0);

-- ============================================================================
-- Success! Issues fixed:
-- 1. ✅ primary_pollutant column added automatically
-- 2. ✅ MOD function error resolved
-- 3. ✅ Added Dhaka area factory data
-- 4. ✅ Enhanced error handling in distance calculation
-- ============================================================================
