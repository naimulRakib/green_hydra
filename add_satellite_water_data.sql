-- ==========================================================
-- SATELLITE WATER DATA MOCKUP SCRIPT
-- ==========================================================
-- Run this in the Supabase SQL editor to create the mocked 
-- "Google Satellite" water quality layer.

-- 1. Create the table for satellite grid data
CREATE TABLE IF NOT EXISTS satellite_water_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grid_cell_id VARCHAR NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    water_quality_index FLOAT CHECK (water_quality_index >= 0 AND water_quality_index <= 100),
    turbidity FLOAT, -- Proxy for muddiness/suspended solids
    chlorophyll FLOAT, -- Proxy for algae bloom  
    suspected_pollution BOOLEAN DEFAULT false,
    color_estimate VARCHAR
);

-- 2. Create spatial and lookup indexes
CREATE INDEX IF NOT EXISTS idx_satellite_water_location ON satellite_water_data USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_satellite_water_grid ON satellite_water_data(grid_cell_id);

-- 3. Insert mock data near the default zones (Burichang & Savar)
INSERT INTO satellite_water_data (grid_cell_id, location, recorded_at, water_quality_index, turbidity, suspected_pollution, color_estimate)
VALUES 
    -- Burichang Area - River/Canal highly polluted near factory
    ('G-CUM-BUR', ST_SetSRID(ST_MakePoint(91.1350, 23.5300), 4326), NOW(), 12.5, 8.5, true, 'Dark Brown / Toxic'),
    ('G-CUM-BUR', ST_SetSRID(ST_MakePoint(91.1250, 23.5100), 4326), NOW(), 25.0, 6.0, true, 'Murky Green'),
    ('G-CUM-BUR', ST_SetSRID(ST_MakePoint(91.1000, 23.5300), 4326), NOW(), 85.0, 1.2, false, 'Clear'),
    
    -- Savar Area (Tannery nearby)
    ('G-DHA-SAV', ST_SetSRID(ST_MakePoint(90.2500, 23.8600), 4326), NOW(), 5.0, 9.8, true, 'Black / Foamy'),
    ('G-DHA-SAV', ST_SetSRID(ST_MakePoint(90.2650, 23.8500), 4326), NOW(), 18.0, 7.5, true, 'Dark Reddish'),
    ('G-DHA-SAV', ST_SetSRID(ST_MakePoint(90.2900, 23.8700), 4326), NOW(), 90.0, 0.5, false, 'Clear')
ON CONFLICT DO NOTHING;

-- 4. Create the RPC function to fetch satellite data by radius
CREATE OR REPLACE FUNCTION get_satellite_water_data(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 15.0
)
RETURNS TABLE (
    id UUID,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    water_quality_index FLOAT,
    turbidity FLOAT,
    color_estimate VARCHAR,
    suspected_pollution BOOLEAN,
    distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_ref GEOGRAPHY(Point, 4326);
BEGIN
    v_ref := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

    RETURN QUERY
    SELECT 
        s.id,
        ST_Y(s.location) AS lat,
        ST_X(s.location) AS lng,
        s.water_quality_index,
        s.turbidity,
        s.color_estimate,
        s.suspected_pollution,
        (ST_Distance(s.location::geography, v_ref) / 1000.0)::DOUBLE PRECISION AS distance_km
    FROM satellite_water_data s
    WHERE ST_DWithin(s.location::geography, v_ref, p_radius_km * 1000.0)
    ORDER BY distance_km ASC;
END;
$$;
