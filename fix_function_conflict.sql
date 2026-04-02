-- ============================================================================
-- STEP 1: Clean up existing functions to avoid conflicts
-- ============================================================================
-- This removes all versions of check_pollution_hazards to start fresh

-- Drop all versions of the function (this handles any parameter variations)
DROP FUNCTION IF EXISTS check_pollution_hazards(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS check_pollution_hazards(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);
DROP FUNCTION IF EXISTS public.check_pollution_hazards(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS public.check_pollution_hazards(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);

-- Alternative: Drop all overloaded versions at once
DROP FUNCTION IF EXISTS check_pollution_hazards CASCADE;
DROP FUNCTION IF EXISTS public.check_pollution_hazards CASCADE;

-- ============================================================================
-- STEP 2: Create the new corrected function
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
    v_wind_to_deg := (p_wind_from_deg + 180.0) - FLOOR((p_wind_from_deg + 180.0) / 360.0) * 360.0;

    -- Loop through all active industrial hotspots
    FOR hotspot_rec IN
        SELECT
            h.id,
            COALESCE(h.factory_name_bn, 'Unknown') AS factory_name,
            h.factory_name_bn,
            h.industry_type,
            ST_Y(h.location::geometry) AS lat,
            ST_X(h.location::geometry) AS lng,
            h.max_plume_km,
            h.plume_cone_deg,
            COALESCE(h.primary_pollutant, 'Unknown') AS primary_pollutant,
            h.remedy_id
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
            v_bearing_to_farm := degrees(
                atan2(
                    sin(radians(p_farmer_lng - hotspot_rec.lng)) * cos(radians(p_farmer_lat)),
                    cos(radians(hotspot_rec.lat)) * sin(radians(p_farmer_lat)) -
                    sin(radians(hotspot_rec.lat)) * cos(radians(p_farmer_lat)) *
                    cos(radians(p_farmer_lng - hotspot_rec.lng))
                )
            );

            -- Normalize bearing to 0-360 degrees
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
            hotspot_rec.id,
            hotspot_rec.factory_name,
            hotspot_rec.factory_name_bn,
            hotspot_rec.industry_type,
            hotspot_rec.lat,
            hotspot_rec.lng,
            ROUND(v_distance_km::NUMERIC, 2)::DOUBLE PRECISION,
            hotspot_rec.max_plume_km,
            hotspot_rec.plume_cone_deg,
            v_wind_to_deg,
            v_is_in_plume,
            hotspot_rec.primary_pollutant,
            v_risk_level,
            hotspot_rec.remedy_id;
    END LOOP;

    RETURN;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_pollution_hazards(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) TO authenticated;

-- ============================================================================
-- Success! Function conflict resolved and wind calculation fixed.
-- ============================================================================