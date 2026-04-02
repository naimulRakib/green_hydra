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

type FallbackHazardRow = {
  hotspot_id:        string
  factory_name:      string | null
  factory_name_bn:   string | null
  industry_type:     string | null
  factory_lat:       number | null
  factory_lng:       number | null
  distance_km:       number | null
  max_plume_km:      number | null
  plume_cone_deg:    number | null
  wind_to_deg:       number | null
  is_in_plume:       boolean | null
  primary_pollutant: string | null
  risk_level:        string | null
  remedy_id?:        string | null
}

type HotspotTableRow = {
  id: string
  factory_name?: string | null
  factory_name_bn: string | null
  industry_type: string | null
  max_plume_km: number | null
  plume_cone_deg: number | null
  primary_pollutant?: string | null
  is_currently_active: boolean | null
  location: unknown
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthR = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return earthR * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDeg(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const phi1 = toRad(fromLat)
  const phi2 = toRad(toLat)
  const dLam = toRad(toLng - fromLng)
  const y = Math.sin(dLam) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function riskFromDistance(distance: number, inPlume: boolean): string {
  if (!inPlume) return 'Low'
  if (distance <= 1.0) return 'Critical'
  if (distance <= 3.0) return 'High'
  return 'Moderate'
}

function parseLocationToLatLng(location: unknown): { lat: number; lng: number } | null {
  if (!location) return null

  if (typeof location === 'string') {
    // Handles both "POINT(lng lat)" and "SRID=4326;POINT(lng lat)"
    const pointMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i)
    if (!pointMatch) return null
    const lng = Number(pointMatch[1])
    const lat = Number(pointMatch[2])
    if (!isFinite(lat) || !isFinite(lng)) return null
    return { lat, lng }
  }

  if (typeof location === 'object') {
    const rec = location as Record<string, unknown>
    const coordinates = rec.coordinates
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const lng = Number(coordinates[0])
      const lat = Number(coordinates[1])
      if (!isFinite(lat) || !isFinite(lng)) return null
      return { lat, lng }
    }
  }

  return null
}

function toHotspots(rows: FallbackHazardRow[], windFromDeg: number): Hotspot[] {
  return rows
    .filter(row =>
      typeof row.factory_lat === 'number' && isFinite(row.factory_lat) &&
      typeof row.factory_lng === 'number' && isFinite(row.factory_lng)
    )
    .map(row => ({
      hotspot_id:        row.hotspot_id,
      factory_name:      row.factory_name ?? row.factory_name_bn ?? 'Unknown',
      factory_name_bn:   row.factory_name_bn ?? row.factory_name ?? 'Unknown',
      industry_type:     row.industry_type ?? 'Unknown',
      factory_lat:       row.factory_lat as number,
      factory_lng:       row.factory_lng as number,
      distance_km:       row.distance_km ?? 0,
      max_plume_km:      row.max_plume_km ?? 5,
      plume_cone_deg:    row.plume_cone_deg ?? 90,
      wind_to_deg:       row.wind_to_deg ?? ((windFromDeg + 180) % 360),
      is_in_plume:       Boolean(row.is_in_plume),
      primary_pollutant: row.primary_pollutant ?? 'Unknown',
      risk_level:        row.risk_level ?? 'Low',
      remedy_id:         row.remedy_id ?? null,
    }))
}

function tableRowsToHotspots(
  rows: HotspotTableRow[],
  farmerLat: number,
  farmerLng: number,
  windFromDeg: number,
  windSpeedKmh: number,
): Hotspot[] {
  const windToDeg = (windFromDeg + 180) % 360

  const hotspots: Hotspot[] = []

  for (const row of rows) {
    if (row.is_currently_active === false) continue

    const coords = parseLocationToLatLng(row.location)
    if (!coords) continue

    const distance = distanceKm(coords.lat, coords.lng, farmerLat, farmerLng)
    const maxPlume = row.max_plume_km ?? 5
    const coneDeg = row.plume_cone_deg ?? 90
    const bearing = bearingDeg(coords.lat, coords.lng, farmerLat, farmerLng)
    const inCone = angleDiffDeg(windToDeg, bearing) <= (coneDeg / 2)
    const isInPlume = windSpeedKmh >= 1 && distance <= maxPlume && inCone

    hotspots.push({
      hotspot_id: row.id,
      factory_name: row.factory_name ?? row.factory_name_bn ?? 'Unknown',
      factory_name_bn: row.factory_name_bn ?? row.factory_name ?? 'Unknown',
      industry_type: row.industry_type ?? 'Unknown',
      factory_lat: coords.lat,
      factory_lng: coords.lng,
      distance_km: Number(distance.toFixed(2)),
      max_plume_km: maxPlume,
      plume_cone_deg: coneDeg,
      wind_to_deg: windToDeg,
      is_in_plume: isInPlume,
      primary_pollutant: row.primary_pollutant ?? 'Unknown',
      risk_level: riskFromDistance(distance, isInPlume),
      remedy_id: null,
    })
  }

  return hotspots
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

    // Fallback path: keep overview factories visible even if main RPC is broken
    // by DB drift (e.g. renamed/missing column).
    const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_hotspots_for_overview', {
      p_farmer_lat: farmerLat,
      p_farmer_lng: farmerLng,
      p_wind_from_deg: windFromDeg,
      p_wind_speed_kmh: windSpeedKmh,
    })

    if (fallbackError) {
      console.error('[Industrial] get_hotspots_for_overview fallback error:', fallbackError.message)

      // Final fallback: compute plume status in app from industrial_hotspots
      // so overview still renders factories when DB functions are out of sync.
      const withPollutant = await supabase
        .from('industrial_hotspots')
        .select('id, factory_name, factory_name_bn, industry_type, max_plume_km, plume_cone_deg, primary_pollutant, is_currently_active, location')
        .eq('is_currently_active', true)

      let tableRows: HotspotTableRow[] | null = null

      if (withPollutant.error) {
        console.error('[Industrial] industrial_hotspots read (with primary_pollutant) error:', withPollutant.error.message)

        const withPollutantId = await supabase
          .from('industrial_hotspots')
          .select('id, factory_name, factory_name_bn, industry_type, max_plume_km, plume_cone_deg, primary_pollutant:primary_pollutant_id, is_currently_active, location')
          .eq('is_currently_active', true)

        if (withPollutantId.error) {
          console.error('[Industrial] industrial_hotspots read (with primary_pollutant_id) error:', withPollutantId.error.message)
          const withoutPollutant = await supabase
            .from('industrial_hotspots')
            .select('id, factory_name, factory_name_bn, industry_type, max_plume_km, plume_cone_deg, is_currently_active, location')
            .eq('is_currently_active', true)

          if (withoutPollutant.error) {
            console.error('[Industrial] industrial_hotspots read fallback error:', withoutPollutant.error.message)
            return []
          }
          tableRows = (withoutPollutant.data ?? []) as HotspotTableRow[]
        } else {
          tableRows = (withPollutantId.data ?? []) as HotspotTableRow[]
        }
      } else {
        tableRows = (withPollutant.data ?? []) as HotspotTableRow[]
      }

      return tableRowsToHotspots(tableRows, farmerLat, farmerLng, windFromDeg, windSpeedKmh)
    }

    return toHotspots((fallbackData ?? []) as FallbackHazardRow[], windFromDeg)
  }

  if (!data || data.length === 0) return []

  return toHotspots((data ?? []) as HazardRow[], windFromDeg)
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
