-- ==========================================================
-- Water System RPCs — Fixed all geography/geometry conflicts
-- Root causes:
--   1. ST_DWithin missing ::geography cast on point argument
--   2. ST_Distance mixing geometry and geography types
--   3. factory_name_bn ambiguous column reference
--   4. farmers.farm_location may be geometry not geography
-- ==========================================================

-- ─────────────────────────────────────────
-- RPC: upsert_water_source (fixed)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_water_source(
  p_farmer_id UUID,
  p_land_id   UUID,
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_type      TEXT,
  p_name_bn   TEXT,
  p_color     TEXT,
  p_odor      BOOLEAN,
  p_fish_kill BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source_id UUID;
  v_risk_zone TEXT := 'safe';
BEGIN
  IF p_color IN ('black','foamy') OR p_fish_kill THEN
    v_risk_zone := 'danger';
  ELSIF p_color IN ('brown','green') THEN
    v_risk_zone := 'warning';
  ELSIF p_odor THEN
    v_risk_zone := 'watch';
  END IF;

  INSERT INTO water_sources (
    source_name_bn, source_type,
    location,
    reported_by,
    risk_zone, last_color_report,
    fish_kill_reports, verified_count, updated_at
  ) VALUES (
    p_name_bn,
    p_type,
    -- Always store as geography
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_farmer_id,
    v_risk_zone,
    p_color,
    CASE WHEN p_fish_kill THEN 1 ELSE 0 END,
    1,
    NOW()
  )
  RETURNING source_id INTO v_source_id;

  RETURN v_source_id;
END;
$$;

-- ─────────────────────────────────────────
-- RPC: get_water_sources_near (fixed)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_water_sources_near(
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
  source_id            UUID,
  source_name_bn       TEXT,
  source_type          TEXT,
  risk_zone            TEXT,
  risk_reason          TEXT,
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  verified_count       INTEGER,
  fish_kill_reports    INTEGER,
  last_color_report    TEXT,
  distance_m           DOUBLE PRECISION,
  factory_name_bn      TEXT,
  distance_to_hotspot_m DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Build reference point ONCE as geography — used everywhere
  v_ref_point GEOGRAPHY(Point, 4326);
BEGIN
  v_ref_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  RETURN QUERY
  SELECT
    s.source_id,
    s.source_name_bn,
    s.source_type,
    s.risk_zone,
    NULL::TEXT                                        AS risk_reason,
    -- Cast to geometry only for coordinate extraction
    ST_Y(s.location::geometry)                        AS lat,
    ST_X(s.location::geometry)                        AS lng,
    COALESCE(s.verified_count, 0)                     AS verified_count,
    COALESCE(s.fish_kill_reports, 0)                  AS fish_kill_reports,
    s.last_color_report,
    -- Both sides are geography → no type conflict
    ST_Distance(s.location, v_ref_point)              AS distance_m,
    -- Explicit alias from LATERAL to avoid ambiguity
    ih.nearest_factory_name                           AS factory_name_bn,
    CASE
      WHEN ih.nearest_factory_loc IS NULL THEN NULL::DOUBLE PRECISION
      -- Both sides geography
      ELSE ST_Distance(s.location, ih.nearest_factory_loc::geography)
    END                                               AS distance_to_hotspot_m
  FROM water_sources s
  LEFT JOIN LATERAL (
    SELECT
      factory_name_bn  AS nearest_factory_name,
      location         AS nearest_factory_loc
    FROM industrial_hotspots
    WHERE location IS NOT NULL
    ORDER BY location <-> s.location::geometry
    LIMIT 1
  ) ih ON TRUE
  WHERE s.location IS NOT NULL
    -- v_ref_point is geography, so no cast needed on right side
    AND ST_DWithin(s.location, v_ref_point, p_radius_km * 1000.0)
  ORDER BY distance_m ASC;
END;
$$;

-- ─────────────────────────────────────────
-- RPC: get_water_alerts_near_farmer (fixed)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_water_alerts_near_farmer(
  p_farmer_id UUID,
  p_radius_km DOUBLE PRECISION DEFAULT 5
)
RETURNS TABLE (
  event_id         UUID,
  source_id        UUID,
  source_name_bn   TEXT,
  source_type      TEXT,
  severity         TEXT,
  alert_message_bn TEXT,
  factory_name_bn  TEXT,
  water_color      TEXT,
  fish_kill        BOOLEAN,
  farmer_count     INTEGER,
  distance_m       DOUBLE PRECISION,
  reported_at      TIMESTAMPTZ,
  is_read          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_farm_location GEOGRAPHY(Point, 4326);
BEGIN
  -- Get farmer location — cast to geography regardless of stored type
  -- Handles both geometry and geography storage
  SELECT
    CASE
      WHEN GeometryType(farm_location::geometry) IS NOT NULL
      THEN farm_location::geometry::geography
      ELSE NULL
    END
  INTO v_farm_location
  FROM farmers
  WHERE id = p_farmer_id;

  -- Fallback: try direct geography cast
  IF v_farm_location IS NULL THEN
    SELECT farm_location::geography
    INTO v_farm_location
    FROM farmers
    WHERE id = p_farmer_id;
  END IF;

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
    -- Explicit table prefix to avoid ambiguity
    ih.factory_name_bn                              AS factory_name_bn,
    e.water_color,
    e.fish_kill,
    COALESCE(s.verified_count, 0)                   AS farmer_count,
    -- Both geography → no ST_DistanceSphere needed
    ST_Distance(s.location, v_farm_location)        AS distance_m,
    e.reported_at,
    (r.event_id IS NOT NULL)                        AS is_read
  FROM water_pollution_events e
  JOIN water_sources s
    ON s.source_id = e.water_source_id
  LEFT JOIN industrial_hotspots ih
    ON ih.id = e.hotspot_id
  LEFT JOIN water_alert_reads r
    ON r.event_id = e.event_id
   AND r.farmer_id = p_farmer_id
  WHERE e.is_active = TRUE
    AND s.location IS NOT NULL
    -- Both geography → consistent types
    AND ST_DWithin(s.location, v_farm_location, p_radius_km * 1000.0)
  ORDER BY e.reported_at DESC;
END;
$$;

-- ─────────────────────────────────────────
-- RPC: mark_water_alert_read (unchanged)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_water_alert_read(
  p_farmer_id UUID,
  p_event_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO water_alert_reads (farmer_id, event_id)
  VALUES (p_farmer_id, p_event_id)
  ON CONFLICT (farmer_id, event_id) DO NOTHING;
END;
$$;

-- ─────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_water_alerts_near_farmer TO authenticated;
GRANT EXECUTE ON FUNCTION get_water_sources_near       TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_water_source          TO authenticated;
GRANT EXECUTE ON FUNCTION mark_water_alert_read        TO authenticated;
