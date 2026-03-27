import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type LandRow = {
  land_id: string
  land_name_bn?: string | null
  land_name?: string | null
  boundary_geojson?: string | null
}

type HotspotRow = {
  id: string
  factory_name_bn: string | null
  industry_type: string | null
  max_plume_km: number | null
  plume_cone_deg: number | null
  is_currently_active: boolean | null
  active_months: number[] | null
  primary_pollutant_id: string | null
}

type HotspotCoordRow = {
  id: string
  factory_lat: number
  factory_lng: number
}

type HotspotWithCoords = HotspotRow & HotspotCoordRow

type HourlyExposurePoint = {
  ts: string
  wind_from_deg: number
  wind_speed_kmh: number
  toward_land_factory_count: number
  in_exposure: boolean
  so2_proxy: number
  black_plume_proxy: number
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDeg(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const dLng = toRad(toLng - fromLng)
  const fLat = toRad(fromLat)
  const tLat = toRad(toLat)
  const y = Math.sin(dLng) * Math.cos(tLat)
  const x = Math.cos(fLat) * Math.sin(tLat) - Math.sin(fLat) * Math.cos(tLat) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) + 360) % 360)
  return d > 180 ? 360 - d : d
}

function getPolygonCentroid(geojsonRaw: string | null | undefined): { lat: number; lng: number } | null {
  if (!geojsonRaw) return null
  try {
    const parsed: unknown = JSON.parse(geojsonRaw)
    const base = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    const geom = base?.geometry && typeof base.geometry === 'object'
      ? (base.geometry as Record<string, unknown>)
      : base

    if (!geom) return null
    const type = geom.type
    const coordinates = geom.coordinates
    let ring: [number, number][] = []

    if (type === 'Polygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
      ring = coordinates[0] as [number, number][]
    } else if (
      type === 'MultiPolygon' &&
      Array.isArray(coordinates) &&
      Array.isArray(coordinates[0]) &&
      Array.isArray(coordinates[0][0])
    ) {
      ring = coordinates[0][0] as [number, number][]
    }

    if (ring.length === 0) return null
    const lng = ring.reduce((sum, c) => sum + c[0], 0) / ring.length
    const lat = ring.reduce((sum, c) => sum + c[1], 0) / ring.length
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

function getProxyRates(industryType: string | null): { so2: number; blackPlume: number } {
  const key = (industryType ?? '').toLowerCase()
  if (key.includes('brick')) return { so2: 1.0, blackPlume: 1.0 }
  if (key.includes('textile')) return { so2: 0.55, blackPlume: 0.35 }
  if (key.includes('chemical')) return { so2: 1.2, blackPlume: 0.5 }
  if (key.includes('steel') || key.includes('metal')) return { so2: 0.85, blackPlume: 0.65 }
  if (key.includes('cement')) return { so2: 0.7, blackPlume: 0.45 }
  return { so2: 0.6, blackPlume: 0.4 }
}

async function authenticate(req: Request): Promise<{ userId: string } | { error: string; status: number }> {
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearerToken) return { error: 'Unauthorized', status: 401 }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${bearerToken}` } } }
  )
  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData?.user) return { error: 'Unauthorized', status: 401 }
  return { userId: authData.user.id }
}

export async function GET(req: Request) {
  try {
    const auth = await authenticate(req)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const url = new URL(req.url)
    const landId = url.searchParams.get('land_id')
    if (!landId) {
      return NextResponse.json({ error: 'land_id required' }, { status: 400 })
    }

    const landsRes = await supabase.rpc('get_farmer_lands', { p_farmer_id: auth.userId })
    if (landsRes.error) {
      return NextResponse.json({ error: 'Failed to read lands' }, { status: 500 })
    }
    const lands = (landsRes.data ?? []) as LandRow[]
    const land = lands.find((l) => l.land_id === landId)
    if (!land) {
      return NextResponse.json({ error: 'Land not found for this user' }, { status: 404 })
    }

    const centroid = getPolygonCentroid(land.boundary_geojson)
    if (!centroid) {
      return NextResponse.json({ error: 'Land boundary/centroid unavailable' }, { status: 422 })
    }

    const [hotspotRowsRes, hotspotCoordsRes] = await Promise.all([
      supabase
        .from('industrial_hotspots')
        .select('id, factory_name_bn, industry_type, max_plume_km, plume_cone_deg, is_currently_active, active_months, primary_pollutant_id')
        .eq('is_currently_active', true),
      supabase.rpc('get_hotspot_coordinates'),
    ])

    if (hotspotRowsRes.error || hotspotCoordsRes.error) {
      return NextResponse.json({ error: 'Failed to load hotspot data' }, { status: 500 })
    }

    const coords = (hotspotCoordsRes.data ?? []) as HotspotCoordRow[]
    const coordMap = new Map(coords.map((c) => [c.id, c]))
    const hotspots = ((hotspotRowsRes.data ?? []) as HotspotRow[])
      .map((h) => {
        const c = coordMap.get(h.id)
        if (!c) return null
        return { ...h, ...c } as HotspotWithCoords
      })
      .filter((h): h is HotspotWithCoords => h !== null)

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${centroid.lat.toFixed(4)}&longitude=${centroid.lng.toFixed(4)}` +
      `&hourly=wind_direction_10m,wind_speed_10m&past_days=7&forecast_days=1&timezone=Asia%2FDhaka`

    const weatherResp = await fetch(weatherUrl, { signal: AbortSignal.timeout(9000) })
    if (!weatherResp.ok) {
      return NextResponse.json({ error: `Open-Meteo error ${weatherResp.status}` }, { status: 503 })
    }
    const weatherJson: unknown = await weatherResp.json()
    const hourly = weatherJson && typeof weatherJson === 'object'
      ? (weatherJson as { hourly?: { time?: string[]; wind_direction_10m?: number[]; wind_speed_10m?: number[] } }).hourly
      : undefined

    const time = hourly?.time ?? []
    const windDirs = hourly?.wind_direction_10m ?? []
    const windSpeeds = hourly?.wind_speed_10m ?? []
    const size = Math.min(time.length, windDirs.length, windSpeeds.length)
    if (size === 0) {
      return NextResponse.json({ error: 'No hourly weather data available' }, { status: 503 })
    }

    const points: HourlyExposurePoint[] = []
    const sourceDoseMap = new Map<string, number>()
    const sourceHourMap = new Map<string, number>()

    for (let i = Math.max(0, size - 168); i < size; i++) {
      const ts = time[i]
      const windFromDeg = windDirs[i]
      const windSpeed = windSpeeds[i] ?? 0
      if (!Number.isFinite(windFromDeg) || !Number.isFinite(windSpeed)) continue

      const plumeDir = (windFromDeg + 180) % 360
      let factoryCount = 0
      let so2Dose = 0
      let blackDose = 0

      for (const h of hotspots) {
        if (h.is_currently_active === false) continue
        const month = new Date(ts).getMonth() + 1
        if (Array.isArray(h.active_months) && h.active_months.length > 0 && !h.active_months.includes(month)) {
          continue
        }

        const maxPlumeKm = Math.max(0, Number(h.max_plume_km ?? 0))
        const coneDeg = Math.max(10, Number(h.plume_cone_deg ?? 60))
        if (!Number.isFinite(maxPlumeKm) || maxPlumeKm <= 0) continue

        const distKm = distanceKm(h.factory_lat, h.factory_lng, centroid.lat, centroid.lng)
        if (distKm > maxPlumeKm || windSpeed < 1 || windSpeed < distKm) continue

        const targetBearing = bearingDeg(h.factory_lat, h.factory_lng, centroid.lat, centroid.lng)
        const diff = angleDiff(targetBearing, plumeDir)
        const inCone = diff <= coneDeg / 2
        if (!inCone) continue

        factoryCount += 1
        const rates = getProxyRates(h.industry_type)
        const distanceDecay = 1 / (distKm + 1)
        const windDilution = Math.min(2.0, 10.0 / Math.max(1.0, windSpeed))
        const alignment = 1.0 - (diff / (coneDeg / 2)) * 0.5
        const doseBase = distanceDecay * windDilution * Math.max(0.25, alignment)

        const so2 = rates.so2 * doseBase
        const black = rates.blackPlume * doseBase
        so2Dose += so2
        blackDose += black

        const sourceKey = h.factory_name_bn ?? h.id
        sourceDoseMap.set(sourceKey, (sourceDoseMap.get(sourceKey) ?? 0) + so2 + black)
        sourceHourMap.set(sourceKey, (sourceHourMap.get(sourceKey) ?? 0) + 1)
      }

      points.push({
        ts,
        wind_from_deg: Number(windFromDeg.toFixed(1)),
        wind_speed_kmh: Number(windSpeed.toFixed(1)),
        toward_land_factory_count: factoryCount,
        in_exposure: factoryCount > 0,
        so2_proxy: Number(so2Dose.toFixed(4)),
        black_plume_proxy: Number(blackDose.toFixed(4)),
      })
    }

    const last24 = points.slice(-24)
    const last7d = points

    const sumBy = (arr: HourlyExposurePoint[], key: 'so2_proxy' | 'black_plume_proxy') =>
      Number(arr.reduce((s, p) => s + p[key], 0).toFixed(4))
    const hoursToward = (arr: HourlyExposurePoint[]) => arr.filter((p) => p.in_exposure).length

    const sortedSources = Array.from(sourceDoseMap.entries()).sort((a, b) => b[1] - a[1])
    const topSource = sortedSources[0]
    const dominantFactoryName = topSource?.[0] ?? 'none'
    const dominantFactoryHours = dominantFactoryName === 'none' ? 0 : (sourceHourMap.get(dominantFactoryName) ?? 0)

    const weatherCoverage = Math.min(1, points.length / 168)
    const hotspotCoverage = hotspots.length > 0 ? 1 : 0
    const signalStrength = Math.min(1, (hoursToward(last7d) / 48))
    const confidence = Number(
      (0.5 * weatherCoverage + 0.3 * hotspotCoverage + 0.2 * signalStrength).toFixed(2)
    )

    return NextResponse.json({
      land_id: landId,
      land_name_bn: land.land_name_bn ?? land.land_name ?? 'Unknown Land',
      center: centroid,
      wind_toward_land_hours_24h: hoursToward(last24),
      wind_toward_land_hours_7d: hoursToward(last7d),
      so2_proxy_24h: sumBy(last24, 'so2_proxy'),
      so2_proxy_7d: sumBy(last7d, 'so2_proxy'),
      black_plume_proxy_24h: sumBy(last24, 'black_plume_proxy'),
      black_plume_proxy_7d: sumBy(last7d, 'black_plume_proxy'),
      source_factory: dominantFactoryName,
      source_factory_hours_7d: dominantFactoryHours,
      confidence,
      timeline: points,
      computed_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

