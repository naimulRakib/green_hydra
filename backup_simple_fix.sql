-- ==============================================================================
-- SIMPLER BACKUP VERSION - If the main fix still has issues, use this version
-- ==============================================================================
-- This is a simplified version using basic RETURN QUERY with a cleaner structure

CREATE OR REPLACE FUNCTION check_pollution_hazards_simple(
    p_farmer_lat DOUBLE PRECISION,
    p_farmer_lng DOUBLE PRECISION,
    p_wind_from_deg DOUBLE PRECISION,
    p_wind_speed_kmh DOUBLE PRECISION
)
RETURNS TABLE(
    hotspot_id TEXT,
    factory_name TEXT,
    factory_name_bn TEXT,
    industry_type TEXT,
    factory_lat DOUBLE PRECISION,
    factory_lng DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    max_plume_km DOUBLE PRECISION,
    plume_cone_deg DOUBLE PRECISION,
    wind_to_deg DOUBLE PRECISION,
    is_in_plume BOOLEAN,
    primary_pollutant TEXT,
    risk_level TEXT,
    remedy_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH wind_calculations AS (
        SELECT
            h.id::TEXT as id,
            COALESCE(h.factory_name_bn, 'Unknown')::TEXT as factory_name,
            h.factory_name_bn::TEXT,
            h.industry_type::TEXT,
            ST_Y(h.location::geometry) as lat,
            ST_X(h.location::geometry) as lng,
            h.max_plume_km,
            h.plume_cone_deg,
            COALESCE(h.primary_pollutant, 'Unknown')::TEXT as primary_pollutant,
            h.remedy_id::TEXT,

            -- Calculate distance
            6371 * acos(
                cos(radians(p_farmer_lat)) * cos(radians(ST_Y(h.location::geometry))) *
                cos(radians(ST_X(h.location::geometry) - p_farmer_lng)) +
                sin(radians(p_farmer_lat)) * sin(radians(ST_Y(h.location::geometry)))
            ) as distance_km,

            -- Wind direction (where smoke goes)
            MOD(p_wind_from_deg + 180.0, 360.0) as wind_to_deg,

            -- Bearing from factory to farm
            MOD(degrees(
                atan2(
                    sin(radians(p_farmer_lng - ST_X(h.location::geometry))) * cos(radians(p_farmer_lat)),
                    cos(radians(ST_Y(h.location::geometry))) * sin(radians(p_farmer_lat)) -
                    sin(radians(ST_Y(h.location::geometry))) * cos(radians(p_farmer_lat)) *
                    cos(radians(p_farmer_lng - ST_X(h.location::geometry)))
                )
            ) + 360.0, 360.0) as bearing_to_farm

        FROM industrial_hotspots h
        WHERE h.is_currently_active = true
          AND h.location IS NOT NULL
    ),
    plume_calculations AS (
        SELECT
            *,
            -- Calculate angular difference
            CASE
                WHEN abs(wind_to_deg - bearing_to_farm) > 180
                THEN 360.0 - abs(wind_to_deg - bearing_to_farm)
                ELSE abs(wind_to_deg - bearing_to_farm)
            END as angle_diff
        FROM wind_calculations
    )
    SELECT
        id,
        factory_name,
        factory_name_bn,
        industry_type,
        lat,
        lng,
        ROUND(distance_km::NUMERIC, 2)::DOUBLE PRECISION as distance_km,
        max_plume_km,
        plume_cone_deg,
        wind_to_deg,

        -- Farm is in plume if within cone angle and distance
        (angle_diff <= (plume_cone_deg / 2.0) AND distance_km <= max_plume_km) as is_in_plume,

        primary_pollutant,

        -- Risk level based on plume exposure and distance
        CASE
            WHEN (angle_diff <= (plume_cone_deg / 2.0) AND distance_km <= max_plume_km) THEN
                CASE
                    WHEN distance_km <= 1.0 THEN 'Critical'
                    WHEN distance_km <= 3.0 THEN 'High'
                    ELSE 'Moderate'
                END
            ELSE 'Low'
        END::TEXT as risk_level,

        remedy_id

    FROM plume_calculations;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_pollution_hazards_simple(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) TO authenticated;