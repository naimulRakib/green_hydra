-- ============================================================================
-- FIX: Correct Wind Direction Vector Calculation in Plume Risk Assessment
-- ============================================================================
-- This fixes the critical bug where farms are incorrectly flagged as being
-- in pollution plumes when wind is blowing smoke AWAY from them.
--
-- Deploy this to Supabase SQL Editor to fix the issue.
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
    -- Avoid MOD(double precision, numeric) signature mismatch on some DBs
    v_wind_to_deg := (p_wind_from_deg + 180.0) - FLOOR((p_wind_from_deg + 180.0) / 360.0) * 360.0;

    -- Loop through all active industrial hotspots
    FOR hotspot_rec IN
        SELECT
            h.id,
            COALESCE(h.factory_name_bn, 'Unknown')::VARCHAR AS factory_name, -- Use Bengali name as primary
            COALESCE(h.factory_name_bn, h.factory_name, 'Unknown')::VARCHAR AS factory_name_bn,
            COALESCE(h.industry_type, 'Unknown')::VARCHAR AS industry_type,
            ST_Y(h.location::geometry) AS lat,
            ST_X(h.location::geometry) AS lng,
            h.max_plume_km,
            h.plume_cone_deg,
            COALESCE(h.primary_pollutant, h.primary_pollutant_id, 'Unknown')::VARCHAR AS primary_pollutant,
            NULL::UUID AS remedy_id
        FROM industrial_hotspots h
        WHERE h.is_currently_active = true
          AND h.location IS NOT NULL
    LOOP
        -- Skip if coordinates are invalid
        IF hotspot_rec.lat IS NULL OR hotspot_rec.lng IS NULL THEN
            CONTINUE;
        END IF;

        -- Calculate distance using Haversine formula
        v_distance_km := EARTH_RADIUS * acos(
            cos(radians(p_farmer_lat)) * cos(radians(hotspot_rec.lat)) *
            cos(radians(hotspot_rec.lng - p_farmer_lng)) +
            sin(radians(p_farmer_lat)) * sin(radians(hotspot_rec.lat))
        );

        -- Skip if outside maximum plume range
        IF v_distance_km > hotspot_rec.max_plume_km THEN
            v_is_in_plume := FALSE;
        ELSE
            -- Calculate bearing FROM factory TO farm using forward azimuth
            -- This is the direction the factory "points toward" the farm
            v_bearing_to_farm := degrees(
                atan2(
                    sin(radians(p_farmer_lng - hotspot_rec.lng)) * cos(radians(p_farmer_lat)),
                    cos(radians(hotspot_rec.lat)) * sin(radians(p_farmer_lat)) -
                    sin(radians(hotspot_rec.lat)) * cos(radians(p_farmer_lat)) *
                    cos(radians(p_farmer_lng - hotspot_rec.lng))
                )
            );

            -- Normalize bearing to 0-360 degrees
            -- Avoid MOD(double precision, numeric) signature mismatch on some DBs
            v_bearing_to_farm := (v_bearing_to_farm + 360.0) - FLOOR((v_bearing_to_farm + 360.0) / 360.0) * 360.0;

            -- Calculate angular difference (shortest arc around circle)
            v_angle_diff := abs(v_wind_to_deg - v_bearing_to_farm);
            IF v_angle_diff > 180.0 THEN
                v_angle_diff := 360.0 - v_angle_diff;
            END IF;

            -- Farm is in plume if wind direction aligns with factory→farm direction
            -- within the plume cone angle
            v_is_in_plume := (v_angle_diff <= (hotspot_rec.plume_cone_deg / 2.0));
        END IF;

        -- Determine risk level based on plume exposure and distance
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

        -- Return this hotspot's data using SELECT
        RETURN QUERY SELECT
            hotspot_rec.id::UUID,
            hotspot_rec.factory_name::VARCHAR, -- This is now the Bengali name
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

-- ============================================================================
-- Grant permissions for authenticated users
-- ============================================================================
GRANT EXECUTE ON FUNCTION check_pollution_hazards(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) TO authenticated;

-- ============================================================================
-- Test cases to verify the fix
-- ============================================================================
-- Uncomment these to test after deployment:

/*
-- Test Case 1: Wind blowing away from farm (should be FALSE)
-- Factory at (25.0, 89.0), Farm at (25.01, 89.01), Wind from North (0°) = blows South
-- SELECT * FROM check_pollution_hazards(25.01, 89.01, 0.0, 15.0);

-- Test Case 2: Wind blowing toward farm (should be TRUE)
-- Factory at (25.0, 89.0), Farm at (25.01, 89.01), Wind from South (180°) = blows North
-- SELECT * FROM check_pollution_hazards(25.01, 89.01, 180.0, 15.0);

-- Test Case 3: Your specific bug case
-- Factory WSW of farm, wind blowing SW (should be FALSE)
-- SELECT * FROM check_pollution_hazards(23.7940, 90.4152, 45.0, 12.0);
*/

-- ============================================================================
-- DEPLOYMENT NOTES:
-- 1. Run this in Supabase SQL Editor
-- 2. Test with the commented test cases above
-- 3. Verify the map shows correct plume warnings
-- 4. Monitor for any errors in the logs
-- ============================================================================
