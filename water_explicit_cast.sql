-- Drop first to clear any cached version
DROP FUNCTION IF EXISTS get_water_alerts_near_farmer(UUID, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS get_water_sources_near(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);

-- ─────────────────────────────────────────────────────────────
-- get_water_alerts_near_farmer
-- Every column explicitly cast to match RETURNS TABLE signature
-- ─────────────────────────────────────────────────────────────
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
  farmer_count     BIGINT,
  distance_m       DOUBLE PRECISION,
  reported_at      TIMESTAMPTZ,
  is_read          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_farm_location GEOGRAPHY(Point, 4326);
BEGIN
  -- Extract X/Y manually then rebuild as geography
  -- Avoids any geometry/geography type conflict
  SELECT
    ST_SetSRID(
      ST_MakePoint(
        ST_X(farm_location::geometry),
        ST_Y(farm_location::geometry)
      ), 4326
    )::geography
  INTO v_farm_location
  FROM farmers
  WHERE id = p_farmer_id;

  IF v_farm_location IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.event_id::UUID,
    s.source_id::UUID,
    s.source_name_bn::TEXT,
    s.source_type::TEXT,
    e.severity::TEXT,
    e.alert_message_bn::TEXT,
    ih.factory_name_bn::TEXT,
    e.water_color::TEXT,
    e.fish_kill::BOOLEAN,
    1::BIGINT                                          AS farmer_count,
    ST_Distance(s.location, v_farm_location)::DOUBLE PRECISION AS distance_m,
    e.reported_at::TIMESTAMPTZ,
    (r.event_id IS NOT NULL)::BOOLEAN                  AS is_read
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
    AND ST_DWithin(
      s.location,
      v_farm_location,
      p_radius_km * 1000.0
    )
  ORDER BY e.reported_at DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- get_water_sources_near
-- Every column explicitly cast to match RETURNS TABLE signature
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_water_sources_near(
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
  source_id             UUID,
  source_name_bn        TEXT,
  source_type           TEXT,
  risk_zone             TEXT,
  risk_reason           TEXT,
  lat                   DOUBLE PRECISION,
  lng                   DOUBLE PRECISION,
  verified_count        BIGINT,
  fish_kill_reports     BIGINT,
  last_color_report     TEXT,
  distance_m            DOUBLE PRECISION,
  factory_name_bn       TEXT,
  distance_to_hotspot_m DOUBLE PRECISION
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
    s.source_id::UUID,
    s.source_name_bn::TEXT,
    s.source_type::TEXT,
    s.risk_zone::TEXT,
    NULL::TEXT                                                   AS risk_reason,
    ST_Y(s.location::geometry)::DOUBLE PRECISION                 AS lat,
    ST_X(s.location::geometry)::DOUBLE PRECISION                 AS lng,
    COALESCE(s.verified_count,    0)::BIGINT                     AS verified_count,
    COALESCE(s.fish_kill_reports, 0)::BIGINT                     AS fish_kill_reports,
    s.last_color_report::TEXT,
    ST_Distance(s.location, v_ref)::DOUBLE PRECISION             AS distance_m,
    near.nfn::TEXT                                               AS factory_name_bn,
    CASE
      WHEN near.nfl IS NULL THEN NULL::DOUBLE PRECISION
      ELSE ST_Distance(s.location, near.nfl::geography)::DOUBLE PRECISION
    END                                                          AS distance_to_hotspot_m
  FROM water_sources s
  LEFT JOIN LATERAL (
    SELECT
      ih2.factory_name_bn AS nfn,
      ih2.location        AS nfl
    FROM industrial_hotspots ih2
    WHERE ih2.location IS NOT NULL
    ORDER BY ih2.location::geometry <-> s.location::geometry
    LIMIT 1
  ) near ON TRUE
  WHERE s.location IS NOT NULL
    AND ST_DWithin(s.location, v_ref, p_radius_km * 1000.0)
  ORDER BY distance_m ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_water_alerts_near_farmer(UUID, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION get_water_sources_near(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
