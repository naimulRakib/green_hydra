'use server'

import { createClient } from '../utils/supabase/server'
import type { Hotspot } from '../components/ImpactMap'
import type { CommunitySprayPlot } from '../components/OverviewMap'

export interface SatelliteWaterData {
  id: string
  lat: number
  lng: number
  water_quality_index: number
  turbidity: number
  color_estimate: string
  suspected_pollution: boolean
  distance_km: number
}

type HazardRow = {
  hotspot_id:        string
  factory_name:      string
  factory_name_bn:   string
  industry_type:     string
  factory_lat:       number
  factory_lng:       number
  distance_km:       number
  max_plume_km:      number
  plume_cone_deg:    number
  wind_to_deg:       number
  is_in_plume:       boolean
  primary_pollutant: string
  risk_level:        string
  remedy_id?:        string | null
}

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

  const rows = (data ?? []) as HazardRow[]
  return rows
    // Guard: skip rows with missing or invalid coords
    .filter(row =>
      typeof row.factory_lat === 'number' && isFinite(row.factory_lat) &&
      typeof row.factory_lng === 'number' && isFinite(row.factory_lng)
    )
    .map(row => ({
      hotspot_id:        row.hotspot_id,
      factory_name:      row.factory_name,
      factory_name_bn:   row.factory_name_bn,
      industry_type:     row.industry_type,
      factory_lat:       row.factory_lat,
      factory_lng:       row.factory_lng,
      distance_km:       row.distance_km,
      max_plume_km:      row.max_plume_km,
      plume_cone_deg:    row.plume_cone_deg,
      wind_to_deg:       row.wind_to_deg,
      is_in_plume:       row.is_in_plume,
      primary_pollutant: row.primary_pollutant,
      risk_level:        row.risk_level,
      remedy_id:         row.remedy_id ?? null,
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

export async function getSatelliteWaterData(
  lat: number,
  lng: number,
  radiusKm: number = 15.0
): Promise<SatelliteWaterData[]> {
  if (!isFinite(lat) || !isFinite(lng)) return []

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_satellite_water_data', {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  })

  if (error) {
    console.error('[Industrial] get_satellite_water_data error:', error.message)
    return []
  }

  return (data ?? []) as SatelliteWaterData[]
}

/**
 * 🛰️ MOCK SATELLITE INGESTION SCRIPT
 * In production, this would be a Python cron job calling Sentinel-2 APIs
 * For now, this Next.js Server Action acts as the "External System"
 */
export async function fetchSatelliteWaterData(lat: number, lng: number) {
  if (!isFinite(lat) || !isFinite(lng)) return { success: false, error: 'Invalid coordinates' }

  const supabase = await createClient()

  type ExternalSatelliteResponse = {
    grid_cell_id?: string
    water_quality_index?: number
    turbidity?: number
    chlorophyll?: number
    suspected_pollution?: boolean
    color_estimate?: string
    ndwi?: number
  }

  const apiUrl = process.env.SATELLITE_WATER_API_URL
  const apiKey = process.env.SATELLITE_WATER_API_KEY

  let response: ExternalSatelliteResponse | null = null

  if (apiUrl) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ lat, lng }),
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`Satellite API HTTP ${res.status}`)
      }

      const body = await res.json() as ExternalSatelliteResponse
      response = body
    } catch (error) {
      console.error('[Satellite] External fetch failed, using fallback:', error)
    }
  }

  // Fallback mock when external API is not configured or fails
  if (!response) {
    const isPolluted = Math.random() > 0.5
    response = {
      grid_cell_id: `grid_${Math.round(lat * 100)}_${Math.round(lng * 100)}`,
      water_quality_index: isPolluted ? (Math.random() * 40) : (60 + Math.random() * 40),
      turbidity: isPolluted ? (50 + Math.random() * 100) : (5 + Math.random() * 20),
      chlorophyll: isPolluted ? (20 + Math.random() * 80) : (2 + Math.random() * 10),
      suspected_pollution: isPolluted,
      color_estimate: isPolluted ? (Math.random() > 0.5 ? 'Dark Red/Black' : 'Unnatural Green') : 'Clear/Blue',
      ndwi: isPolluted ? 0.1 : 0.45,
    }
  }

  const record = {
    grid_cell_id: response.grid_cell_id ?? `grid_${Math.round(lat * 100)}_${Math.round(lng * 100)}`,
    location: `SRID=4326;POINT(${lng} ${lat})`,
    water_quality_index: response.water_quality_index ?? 50,
    turbidity: response.turbidity ?? 0,
    chlorophyll: response.chlorophyll ?? 0,
    suspected_pollution: Boolean(response.suspected_pollution),
    color_estimate: response.color_estimate ?? 'Unknown',
  }

  // 2. Insert into the database
  const { error } = await supabase
    .from('satellite_water_data')
    .insert([record])

  if (error) {
    console.error('[Satellite] Failed to ingest data:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true, data: { ...record, lat, lng, ndwi: response.ndwi ?? null } }
}
