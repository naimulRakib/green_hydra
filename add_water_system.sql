-- ==========================================================
-- Water System: Tables + RPCs (alerts + sources)
-- Fixes missing water_sources.location column
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────
-- 1) Tables (safe create)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS water_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name_bn TEXT,
  source_type TEXT NOT NULL,
  location GEOGRAPHY(Point, 4326),
  reported_by UUID,
  risk_zone TEXT DEFAULT 'safe',
  last_color_report TEXT,
  fish_kill_reports INTEGER DEFAULT 0,
  verified_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_pollution_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  water_source_id UUID REFERENCES water_sources(source_id),
  hotspot_id UUID,
  pollution_type TEXT,
  severity TEXT,
  water_color TEXT,
  alert_message_bn TEXT,
  fish_kill BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS water_alert_reads (
  farmer_id UUID NOT NULL,
  event_id UUID NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (farmer_id, event_id)
);

-- Ensure water_sources.location exists + backfill if lat/lng columns exist
DO $$
DECLARE
  has_location BOOLEAN;
  has_lat BOOLEAN;
  has_lng BOOLEAN;
  has_source_lat BOOLEAN;
  has_source_lng BOOLEAN;
  has_latitude BOOLEAN;
  has_longitude BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'water_sources' AND column_name = 'location'
  ) INTO has_location;

  IF NOT has_location THEN
    ALTER TABLE water_sources ADD COLUMN location GEOGRAPHY(Point, 4326);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'water_sources' AND column_name = 'lat'
  ) INTO has_lat;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'water_sources' AND column_name = 'lng'
  ) INTO has_lng;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'water_sources' AND column_name = 'source_lat'
  ) INTO has_source_lat;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'water_sources' AND column_name = 'source_lng'
  ) INTO has_source_lng;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'water_sources' AND column_name = 'latitude'
  ) INTO has_latitude;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'water_sources' AND column_name = 'longitude'
  ) INTO has_longitude;

  IF has_lat AND has_lng THEN
    EXECUTE
      'UPDATE water_sources
       SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
       WHERE location IS NULL AND lat IS NOT NULL AND lng IS NOT NULL';
  ELSIF has_source_lat AND has_source_lng THEN
    EXECUTE
      'UPDATE water_sources
       SET location = ST_SetSRID(ST_MakePoint(source_lng, source_lat), 4326)::geography
       WHERE location IS NULL AND source_lat IS NOT NULL AND source_lng IS NOT NULL';
  ELSIF has_latitude AND has_longitude THEN
    EXECUTE
      'UPDATE water_sources
       SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
       WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS water_sources_location_gix
  ON water_sources USING GIST (location);

CREATE INDEX IF NOT EXISTS water_events_active_idx
  ON water_pollution_events (is_active);

-- ─────────────────────────────────────────
-- 2) RPC: upsert_water_source
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_water_source(
  p_farmer_id UUID,
  p_land_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_type TEXT,
  p_name_bn TEXT,
  p_color TEXT,
  p_odor BOOLEAN,
  p_fish_kill BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_source_id UUID;
  v_risk_zone TEXT := 'safe';
  v_location_sql_type TEXT;
  v_location_expr TEXT;
  v_insert_sql TEXT;
BEGIN
  IF p_color IN ('black','foamy') OR p_fish_kill THEN
    v_risk_zone := 'danger';
  ELSIF p_color IN ('brown','green') THEN
    v_risk_zone := 'warning';
  ELSIF p_odor THEN
    v_risk_zone := 'watch';
  END IF;

  SELECT c.udt_name
  INTO v_location_sql_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'water_sources'
    AND c.column_name = 'location'
  LIMIT 1;

  IF v_location_sql_type = 'geography' THEN
    v_location_expr := 'ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography';
  ELSE
    v_location_expr := 'ST_SetSRID(ST_MakePoint($3, $4), 4326)::geometry';
  END IF;

  v_insert_sql := format($fmt$
    INSERT INTO water_sources (
      source_name_bn, source_type, location, reported_by,
      risk_zone, risk_updated_at, last_reported_at,
      last_color_report, last_odor_report,
      fish_kill_reports, verified_count, total_reports, danger_reports
    ) VALUES (
      $1, $2, %s, $5, $6, NOW(), NOW(), $7, $8, $9, 1, 1, $10
    )
    RETURNING source_id
  $fmt$, v_location_expr);

  EXECUTE v_insert_sql
    INTO v_source_id
    USING
      p_name_bn,
      p_type,
      p_lng,
      p_lat,
      p_farmer_id,
      v_risk_zone,
      p_color,
      p_odor,
      CASE WHEN p_fish_kill THEN 1 ELSE 0 END,
      CASE WHEN v_risk_zone = 'danger' THEN 1 ELSE 0 END;

  RETURN v_source_id;
END;
$$;

-- ─────────────────────────────────────────
-- 3) RPC: get_water_sources_near
-- ─────────────────────────────────────────
-- DEPRECATED: Use water_explicit_cast.sql for these functions.
-- These are kept for reference only.
/* DEPRECATED
CREATE OR REPLACE FUNCTION get_water_sources_near(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
  source_id UUID,
  source_name_bn TEXT,
  source_type TEXT,
  risk_zone TEXT,
  risk_reason TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  verified_count INTEGER,
  fish_kill_reports INTEGER,
  last_color_report TEXT,
  distance_m DOUBLE PRECISION,
  factory_name_bn TEXT,
  distance_to_hotspot_m DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.source_id,
    s.source_name_bn,
    s.source_type,
    s.risk_zone,
    NULL::TEXT AS risk_reason,
    ST_Y(s.location::geometry) AS lat,
    ST_X(s.location::geometry) AS lng,
    COALESCE(s.verified_count, 0) AS verified_count,
    COALESCE(s.fish_kill_reports, 0) AS fish_kill_reports,
    s.last_color_report,
    ST_Distance(s.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m,
    ih.ih_factory_name_bn AS factory_name_bn,
    CASE WHEN ih.ih_location IS NULL THEN NULL
         ELSE ST_Distance(ih.ih_location::geography, s.location)
    END AS distance_to_hotspot_m
  FROM water_sources s
  LEFT JOIN LATERAL (
    SELECT factory_name_bn AS ih_factory_name_bn, location AS ih_location
    FROM industrial_hotspots
    ORDER BY location::geometry <-> s.location::geometry
    LIMIT 1
  ) ih ON TRUE
  WHERE s.location IS NOT NULL
    AND ST_DWithin(s.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000.0)
  ORDER BY distance_m ASC;
END;
$$;

-- ─────────────────────────────────────────
-- 4) RPC: get_water_alerts_near_farmer
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_water_alerts_near_farmer(
  p_farmer_id UUID,
  p_radius_km DOUBLE PRECISION DEFAULT 5
)
RETURNS TABLE (
  event_id UUID,
  source_id UUID,
  source_name_bn TEXT,
  source_type TEXT,
  severity TEXT,
  alert_message_bn TEXT,
  factory_name_bn TEXT,
  water_color TEXT,
  fish_kill BOOLEAN,
  farmer_count INTEGER,
  distance_m DOUBLE PRECISION,
  reported_at TIMESTAMPTZ,
  is_read BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_farm_location GEOGRAPHY(Point, 4326);
BEGIN
  SELECT farm_location INTO v_farm_location
  FROM farmers
  WHERE id = p_farmer_id;

  IF v_farm_location IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.event_id,
    s.source_id,
    s.source_name_bn,
    s.source_type,
    e.severity,
    e.alert_message_bn,
    ih.factory_name_bn,
    e.water_color,
    e.fish_kill,
    COALESCE(s.verified_count, 0) AS farmer_count,
    ST_Distance(s.location, v_farm_location) AS distance_m,
    e.reported_at,
    (r.event_id IS NOT NULL) AS is_read
  FROM water_pollution_events e
  JOIN water_sources s ON s.source_id = e.water_source_id
  LEFT JOIN industrial_hotspots ih ON ih.id = e.hotspot_id
  LEFT JOIN water_alert_reads r
    ON r.event_id = e.event_id AND r.farmer_id = p_farmer_id
  WHERE e.is_active = TRUE
    AND s.location IS NOT NULL
    AND ST_DWithin(s.location, v_farm_location, p_radius_km * 1000.0)
  ORDER BY e.reported_at DESC;
END;
$$;
*/

-- ─────────────────────────────────────────
-- 5) RPC: mark_water_alert_read
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_water_alert_read(
  p_farmer_id UUID,
  p_event_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO water_alert_reads (farmer_id, event_id)
  VALUES (p_farmer_id, p_event_id)
  ON CONFLICT (farmer_id, event_id) DO NOTHING;
END;
$$;

-- Water RPCs are defined in water_explicit_cast.sql

GRANT EXECUTE ON FUNCTION upsert_water_source(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_water_alert_read(UUID, UUID) TO authenticated;
