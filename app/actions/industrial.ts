'use server'

import { createClient } from '../utils/supabase/server'
import type { Hotspot } from '../components/ImpactMap'
import type { CommunitySprayPlot } from '../components/OverviewMap'

export async function getHotspotsWithPlume(
  farmerLat:    number,
  farmerLng:    number,
  windFromDeg:  number,
  windSpeedKmh: number,
): Promise<Hotspot[]> {
  if (!isFinite(farmerLat) || !isFinite(farmerLng)) {
    console.warn('[Industrial] Invalid coordinates:', farmerLat, farmerLng)
    return []
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('check_pollution_hazards', {
    p_farmer_lat:     farmerLat,
    p_farmer_lng:     farmerLng,
    p_wind_from_deg:  windFromDeg,
    p_wind_speed_kmh: windSpeedKmh,
  })

  if (error) {
    console.error('[Industrial] check_pollution_hazards error:', error.message)
    return []
  }

  if (!data || data.length === 0) return []

  return (data as any[])
    // Guard: skip rows with missing or invalid coords
    .filter(row =>
      typeof row.factory_lat === 'number' && isFinite(row.factory_lat) &&
      typeof row.factory_lng === 'number' && isFinite(row.factory_lng)
    )
    .map(row => ({
      hotspot_id:        row.hotspot_id        as string,
      factory_name:      row.factory_name      as string,
      factory_name_bn:   row.factory_name_bn   as string,
      industry_type:     row.industry_type     as string,
      factory_lat:       row.factory_lat       as number,
      factory_lng:       row.factory_lng       as number,
      distance_km:       row.distance_km       as number,
      max_plume_km:      row.max_plume_km      as number,
      plume_cone_deg:    row.plume_cone_deg    as number,
      wind_to_deg:       row.wind_to_deg       as number,
      is_in_plume:       row.is_in_plume       as boolean,
      primary_pollutant: row.primary_pollutant as string,
      risk_level:        row.risk_level        as string,
      remedy_id:         (row.remedy_id        as string) ?? null,
    }))
}

// Neighbour spray risk measured from own land boundaries (PostGIS polygon edge
// to polygon edge — agronomically correct for drift calculation).
export async function getCommunitySprayForLands(
  farmerId: string,
  radiusKm: number = 1.0
): Promise<CommunitySprayPlot[]> {
  if (!farmerId) return []

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_community_spray_risk_for_lands', {
    p_farmer_id: farmerId,
    p_radius_km: radiusKm,
  })

  if (error) {
    console.error('[Industrial] get_community_spray_risk_for_lands error:', error.message)
    return []
  }

  return (data ?? []) as CommunitySprayPlot[]
}