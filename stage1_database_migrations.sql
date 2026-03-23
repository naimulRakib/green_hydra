-- STAGE 1 — DATABASE MIGRATIONS
-- Run in Supabase SQL Editor in order.

-- SQL 1.1 — Add missing columns to scan_logs
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS land_id UUID
  REFERENCES farmer_lands(land_id) ON DELETE SET NULL;

ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS biotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS abiotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS heavy_metal_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS secondary_cause TEXT;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS compound_stress BOOLEAN DEFAULT FALSE;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS overrides_applied TEXT[];

CREATE INDEX IF NOT EXISTS idx_scan_logs_land_id
  ON scan_logs(land_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_land_stress
  ON scan_logs(land_id, stress_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_abiotic_score
  ON scan_logs(abiotic_score DESC)
  WHERE abiotic_score IS NOT NULL;

-- SQL 1.2 — diagnosis_cache abiotic bucket support
ALTER TABLE diagnosis_cache
  ADD COLUMN IF NOT EXISTS abiotic_bucket TEXT DEFAULT 'low';

ALTER TABLE diagnosis_cache
  ADD COLUMN IF NOT EXISTS pollutant_id TEXT;

DO $$
BEGIN
  ALTER TABLE diagnosis_cache DROP CONSTRAINT IF EXISTS diagnosis_cache_grid_cell_id_weather_hash_symptom_hash_key;
  ALTER TABLE diagnosis_cache DROP CONSTRAINT IF EXISTS diagnosis_cache_unique;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP INDEX IF EXISTS diagnosis_cache_unique_idx;

CREATE UNIQUE INDEX diagnosis_cache_unique_idx
  ON diagnosis_cache (grid_cell_id, weather_hash, symptom_hash, abiotic_bucket);

-- SQL 1.3 — missing kb_zones columns + seed
ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS arsenic_zone_risk TEXT DEFAULT 'Low';
ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS known_metal_types TEXT[] DEFAULT '{}';
ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS recommended_variety_ids TEXT[] DEFAULT '{}';
ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS adaptive_strategy_bn TEXT;

UPDATE kb_zones SET
  arsenic_zone_risk = 'High',
  known_metal_types = ARRAY['arsenic']
WHERE district IN (
  'Chapainawabganj', 'Jessore', 'Comilla', 'Chandpur',
  'Munshiganj', 'Faridpur', 'Gopalganj', 'Madaripur',
  'Shariatpur', 'Noakhali', 'Lakshmipur', 'Brahmanbaria'
);

UPDATE kb_zones SET
  arsenic_zone_risk = 'High',
  known_metal_types = ARRAY['chromium', 'cadmium']
WHERE district IN ('Savar', 'Gazipur', 'Narayanganj')
   OR zone_id IN ('dhaka-savar', 'dhaka-keraniganj', 'dhaka-gazipur');

-- SQL 1.4 — lookup_diagnosis_cache RPC with abiotic bucket
DROP FUNCTION IF EXISTS lookup_diagnosis_cache(
  DOUBLE PRECISION, DOUBLE PRECISION, VARCHAR, VARCHAR
);

CREATE OR REPLACE FUNCTION lookup_diagnosis_cache(
  p_lat            DOUBLE PRECISION,
  p_lng            DOUBLE PRECISION,
  p_weather_hash   VARCHAR,
  p_symptom_hash   VARCHAR,
  p_abiotic_bucket VARCHAR DEFAULT 'low'
)
RETURNS TABLE (
  cache_id          UUID,
  disease_id        VARCHAR,
  pollutant_id      TEXT,
  remedy_id         VARCHAR,
  diagnosis_bn      TEXT,
  hit_count         INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_grid_cell_id VARCHAR;
BEGIN
  v_grid_cell_id := ROUND(p_lat::NUMERIC, 2)::TEXT || '_' || ROUND(p_lng::NUMERIC, 2)::TEXT;

  UPDATE diagnosis_cache
  SET hit_count   = COALESCE(hit_count, 0) + 1,
      last_hit_at = NOW()
  WHERE grid_cell_id   = v_grid_cell_id
    AND weather_hash   = p_weather_hash
    AND symptom_hash   = p_symptom_hash
    AND abiotic_bucket = p_abiotic_bucket
    AND expires_at     > NOW();

  RETURN QUERY
  SELECT
    dc.id,
    dc.confirmed_disease_id,
    dc.pollutant_id,
    dc.remedy_id,
    dc.cached_diagnosis_bn,
    dc.hit_count
  FROM diagnosis_cache dc
  WHERE dc.grid_cell_id   = v_grid_cell_id
    AND dc.weather_hash   = p_weather_hash
    AND dc.symptom_hash   = p_symptom_hash
    AND dc.abiotic_bucket = p_abiotic_bucket
    AND dc.expires_at     > NOW()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_diagnosis_cache(
  DOUBLE PRECISION, DOUBLE PRECISION, VARCHAR, VARCHAR, VARCHAR
) TO authenticated;

-- SQL 1.5 — verification query
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'scan_logs'
   AND column_name IN ('land_id','biotic_score','abiotic_score',
                       'heavy_metal_score','secondary_cause',
                       'compound_stress','overrides_applied')
  ) AS scan_logs_new_columns,

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'diagnosis_cache'
   AND column_name IN ('abiotic_bucket','pollutant_id')
  ) AS cache_new_columns,

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'kb_zones'
   AND column_name IN ('arsenic_zone_risk','known_metal_types',
                       'recommended_variety_ids','adaptive_strategy_bn')
  ) AS zones_new_columns;
