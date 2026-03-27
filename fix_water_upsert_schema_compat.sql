-- Fix upsert_water_source for current water_sources schema
-- (water_sources has risk_updated_at/last_reported_at, not updated_at)

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
      source_name_bn,
      source_type,
      location,
      reported_by,
      risk_zone,
      risk_updated_at,
      last_reported_at,
      last_color_report,
      last_odor_report,
      fish_kill_reports,
      verified_count,
      total_reports,
      danger_reports
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

GRANT EXECUTE ON FUNCTION upsert_water_source(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN)
TO authenticated;
