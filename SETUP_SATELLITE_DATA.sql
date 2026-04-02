-- ==========================================================
-- COMPLETE SATELLITE WATER DATA SETUP FOR BANGLADESH
-- ==========================================================
-- 🚀 RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR
-- This will create the table, function, and seed 32 data points
-- ==========================================================

-- ══════════════════════════════════════════════════════════
-- STEP 1: Create the satellite_water_data table
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS satellite_water_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grid_cell_id VARCHAR NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    water_quality_index FLOAT CHECK (water_quality_index >= 0 AND water_quality_index <= 100),
    turbidity FLOAT,
    chlorophyll FLOAT,
    suspected_pollution BOOLEAN DEFAULT false,
    color_estimate VARCHAR
);

-- Create spatial and lookup indexes
CREATE INDEX IF NOT EXISTS idx_satellite_water_location ON satellite_water_data USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_satellite_water_grid ON satellite_water_data(grid_cell_id);
CREATE INDEX IF NOT EXISTS idx_satellite_water_recorded ON satellite_water_data(recorded_at DESC);

-- ══════════════════════════════════════════════════════════
-- STEP 2: Create the RPC function to fetch satellite data
-- ══════════════════════════════════════════════════════════

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_satellite_water_data(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT SELECT ON satellite_water_data TO authenticated;

-- ══════════════════════════════════════════════════════════
-- STEP 3: Clean old data and insert fresh comprehensive data
-- ══════════════════════════════════════════════════════════

-- Delete old test data (optional)
DELETE FROM satellite_water_data WHERE recorded_at < NOW() - INTERVAL '1 day';

-- Insert 32 satellite data points across major Bangladesh regions
INSERT INTO satellite_water_data (grid_cell_id, location, recorded_at, water_quality_index, turbidity, chlorophyll, suspected_pollution, color_estimate)
VALUES
    -- ══════════════════════════════════════════════════════════════
    -- DHAKA REGION (around Keraniganj, Savar, Gazipur) - 11 points
    -- ══════════════════════════════════════════════════════════════
    ('G-DHA-KER-01', ST_SetSRID(ST_MakePoint(90.2400, 23.7100), 4326), NOW(), 15.0, 8.2, 12.0, true, 'Dark Brown / Industrial'),
    ('G-DHA-KER-02', ST_SetSRID(ST_MakePoint(90.2500, 23.7200), 4326), NOW(), 22.0, 7.5, 10.0, true, 'Murky Brown'),
    ('G-DHA-KER-03', ST_SetSRID(ST_MakePoint(90.2600, 23.7000), 4326), NOW(), 45.0, 4.0, 6.0, false, 'Light Brown'),
    ('G-DHA-KER-04', ST_SetSRID(ST_MakePoint(90.2300, 23.7300), 4326), NOW(), 78.0, 1.5, 3.0, false, 'Clear'),

    -- Savar Industrial Zone (Tannery area)
    ('G-DHA-SAV-01', ST_SetSRID(ST_MakePoint(90.2500, 23.8600), 4326), NOW(), 5.0, 9.8, 25.0, true, 'Black / Foamy'),
    ('G-DHA-SAV-02', ST_SetSRID(ST_MakePoint(90.2650, 23.8500), 4326), NOW(), 12.0, 8.5, 20.0, true, 'Dark Reddish'),
    ('G-DHA-SAV-03', ST_SetSRID(ST_MakePoint(90.2800, 23.8700), 4326), NOW(), 35.0, 5.0, 8.0, true, 'Brownish'),
    ('G-DHA-SAV-04', ST_SetSRID(ST_MakePoint(90.3000, 23.8800), 4326), NOW(), 85.0, 1.2, 2.0, false, 'Clear'),

    -- Gazipur (Garment factories)
    ('G-DHA-GAZ-01', ST_SetSRID(ST_MakePoint(90.4100, 23.9900), 4326), NOW(), 18.0, 7.8, 15.0, true, 'Unnatural Blue/Purple'),
    ('G-DHA-GAZ-02', ST_SetSRID(ST_MakePoint(90.4200, 24.0000), 4326), NOW(), 28.0, 6.5, 12.0, true, 'Murky'),
    ('G-DHA-GAZ-03', ST_SetSRID(ST_MakePoint(90.4000, 24.0100), 4326), NOW(), 72.0, 2.0, 4.0, false, 'Slightly Cloudy'),

    -- ══════════════════════════════════════════════════════════════
    -- COMILLA / BURICHANG REGION (Brick kilns) - 4 points
    -- ══════════════════════════════════════════════════════════════
    ('G-CUM-BUR-01', ST_SetSRID(ST_MakePoint(91.1350, 23.5300), 4326), NOW(), 12.5, 8.5, 6.0, true, 'Dark Brown / Toxic'),
    ('G-CUM-BUR-02', ST_SetSRID(ST_MakePoint(91.1250, 23.5100), 4326), NOW(), 25.0, 6.0, 5.0, true, 'Murky Green'),
    ('G-CUM-BUR-03', ST_SetSRID(ST_MakePoint(91.1000, 23.5300), 4326), NOW(), 85.0, 1.2, 2.0, false, 'Clear'),
    ('G-CUM-BUR-04', ST_SetSRID(ST_MakePoint(91.1500, 23.5400), 4326), NOW(), 30.0, 5.5, 4.0, true, 'Ash Grey'),

    -- ══════════════════════════════════════════════════════════════
    -- CHITTAGONG REGION (Port & Ship-breaking) - 3 points
    -- ══════════════════════════════════════════════════════════════
    ('G-CTG-SHB-01', ST_SetSRID(ST_MakePoint(91.8200, 22.3400), 4326), NOW(), 8.0, 9.5, 8.0, true, 'Black / Oily'),
    ('G-CTG-SHB-02', ST_SetSRID(ST_MakePoint(91.8100, 22.3500), 4326), NOW(), 15.0, 8.0, 7.0, true, 'Dark Grey'),
    ('G-CTG-SHB-03', ST_SetSRID(ST_MakePoint(91.8300, 22.3600), 4326), NOW(), 55.0, 3.5, 4.0, false, 'Slightly Murky'),

    -- ══════════════════════════════════════════════════════════════
    -- RAJSHAHI REGION (Agricultural - generally cleaner) - 3 points
    -- ══════════════════════════════════════════════════════════════
    ('G-RAJ-NAO-01', ST_SetSRID(ST_MakePoint(88.9200, 24.6200), 4326), NOW(), 75.0, 2.0, 3.0, false, 'Clear'),
    ('G-RAJ-NAO-02', ST_SetSRID(ST_MakePoint(88.9100, 24.6300), 4326), NOW(), 82.0, 1.5, 2.5, false, 'Clear'),
    ('G-RAJ-NAO-03', ST_SetSRID(ST_MakePoint(88.9300, 24.6100), 4326), NOW(), 68.0, 2.8, 4.0, false, 'Slightly Cloudy'),

    -- ══════════════════════════════════════════════════════════════
    -- KHULNA REGION (Shrimp farms, textile) - 3 points
    -- ══════════════════════════════════════════════════════════════
    ('G-KHU-SAT-01', ST_SetSRID(ST_MakePoint(89.5600, 22.8500), 4326), NOW(), 35.0, 5.5, 8.0, true, 'Greenish Brown'),
    ('G-KHU-SAT-02', ST_SetSRID(ST_MakePoint(89.5700, 22.8600), 4326), NOW(), 50.0, 4.0, 6.0, false, 'Light Brown'),
    ('G-KHU-SAT-03', ST_SetSRID(ST_MakePoint(89.5500, 22.8400), 4326), NOW(), 70.0, 2.5, 4.0, false, 'Clear'),

    -- ══════════════════════════════════════════════════════════════
    -- SYLHET REGION (Tea gardens, generally clean) - 3 points
    -- ══════════════════════════════════════════════════════════════
    ('G-SYL-SRM-01', ST_SetSRID(ST_MakePoint(91.8700, 24.8900), 4326), NOW(), 88.0, 1.0, 2.0, false, 'Crystal Clear'),
    ('G-SYL-SRM-02', ST_SetSRID(ST_MakePoint(91.8800, 24.8800), 4326), NOW(), 92.0, 0.8, 1.5, false, 'Clear'),
    ('G-SYL-SRM-03', ST_SetSRID(ST_MakePoint(91.8600, 24.9000), 4326), NOW(), 85.0, 1.2, 2.0, false, 'Clear'),

    -- ══════════════════════════════════════════════════════════════
    -- MYMENSINGH REGION (Agricultural) - 3 points
    -- ══════════════════════════════════════════════════════════════
    ('G-MYM-NET-01', ST_SetSRID(ST_MakePoint(90.4500, 24.7500), 4326), NOW(), 72.0, 2.2, 3.5, false, 'Slightly Cloudy'),
    ('G-MYM-NET-02', ST_SetSRID(ST_MakePoint(90.4600, 24.7600), 4326), NOW(), 78.0, 1.8, 3.0, false, 'Clear'),
    ('G-MYM-NET-03', ST_SetSRID(ST_MakePoint(90.4400, 24.7400), 4326), NOW(), 65.0, 2.8, 4.5, false, 'Light Brown'),

    -- ══════════════════════════════════════════════════════════════
    -- BOGRA/RANGPUR REGION (Agricultural) - 2 points
    -- ══════════════════════════════════════════════════════════════
    ('G-BOG-RNG-01', ST_SetSRID(ST_MakePoint(89.3700, 24.8500), 4326), NOW(), 80.0, 1.5, 2.5, false, 'Clear'),
    ('G-BOG-RNG-02', ST_SetSRID(ST_MakePoint(89.3800, 24.8600), 4326), NOW(), 75.0, 2.0, 3.0, false, 'Clear')

ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- STEP 4: Verify the setup
-- ══════════════════════════════════════════════════════════

-- Show all inserted data
SELECT
    grid_cell_id,
    ST_Y(location)::NUMERIC(8, 4) as lat,
    ST_X(location)::NUMERIC(8, 4) as lng,
    water_quality_index,
    suspected_pollution,
    color_estimate
FROM satellite_water_data
ORDER BY grid_cell_id;

-- Show count by region
SELECT
    SUBSTRING(grid_cell_id, 1, 5) as region,
    COUNT(*) as data_points,
    AVG(water_quality_index)::INT as avg_quality,
    SUM(CASE WHEN suspected_pollution THEN 1 ELSE 0 END) as polluted_points
FROM satellite_water_data
GROUP BY SUBSTRING(grid_cell_id, 1, 5)
ORDER BY region;

-- Test the function with a Dhaka location
SELECT * FROM get_satellite_water_data(23.8106, 90.4125, 15.0);

-- ══════════════════════════════════════════════════════════
-- ✅ SETUP COMPLETE!
-- ══════════════════════════════════════════════════════════
-- You should see:
-- - 32 satellite data points inserted
-- - Regional summary showing data distribution
-- - Test query returning nearby points
--
-- Now refresh your dashboard and the satellite data
-- will appear on the overview map!
-- ══════════════════════════════════════════════════════════
