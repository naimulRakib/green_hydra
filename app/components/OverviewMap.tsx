'use client'
/**
 * OverviewMap — unified overview Leaflet map for AgroSentinel dashboard
 *
 * Renders on ONE map canvas:
 *   🌾  আমার খামার  — pulsing blue GPS marker (farm centroid / manual location)
 *   📐  জমির সীমানা  — each farmer_land polygon, labelled, colour-coded by risk
 *   🏭  কারখানা      — industrial hotspot markers with plume wedges
 *   💨  বাতাসের প্রভাব — wind arrows + per-LAND plume membership (not just farm point)
 *   🧪  pH / স্প্রে  — tooltip shows survey pH + active spray for each plot
 *
 * Per-land wind calculation:
 *   For each land polygon we compute its centroid client-side (mean of vertices
 *   from GeoJSON), then run is_in_plume_client() — same bearing + cone math
 *   the SQL RPC uses — to tell whether THAT LAND (not just the farm house)
 *   is inside a factory's downwind plume cone.  This lets a farmer see that
 *   "my north field is safe but my south field is directly downwind."
 *
 * GPS / manual location:
 *   Accepts optional farmerLat/Lng from the server (saved location).
 *   LiveGPS button inside the map panel calls browser geolocation and
 *   flyTo.  Manual lat/lng inputs also flyTo.  Both update a local ref
 *   so the farm marker moves without a full page reload.
 */

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import WaterSourceMapLayer from './WaterSourceMapLayer'
import type { WaterSource } from '@/app/types/water'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LandPlotOverview {
  land_id:          string
  land_name:        string
  land_name_bn:     string | null
  area_bigha:       number
  area_sqm:         number
  crop_id:          string | null
  zone_id:          string | null
  spray_active:     boolean
  chemical_name:    string | null
  risk_level:       'red' | 'yellow' | 'green'
  spray_expires:    string | null
  boundary_geojson: string   // GeoJSON Feature or Geometry
  // from farmer_land_profile (weekly survey result):
  soil_ph?:         number | null
  soil_moisture?:   string | null
  pest_pressure?:   string | null
  last_survey_days?: number | null
}

export interface CommunitySprayPlot {
  spray_id:         string
  land_name:        string
  chemical_name:    string
  chemical_type:    string
  risk_level:       'red' | 'yellow'
  expires_at:       string
  hours_remaining:  number
  harm_radius_m:    number
  distance_m:       number
  boundary_geojson:  string
  buffer_geojson:    string
  nearest_own_land?: string
}

export interface HotspotOverview {
  hotspot_id:       string
  factory_name:     string
  factory_name_bn:  string
  industry_type:    string
  factory_lat:      number
  factory_lng:      number
  distance_km:      number
  max_plume_km:     number
  plume_cone_deg:   number
  wind_to_deg:      number   // (wind_from + 180) % 360
  is_in_plume:      boolean  // true = FARM CENTROID is in plume
  primary_pollutant: string
  risk_level:       string
}

// ─── Geo helpers (mirrors SQL is_in_pollution_plume logic) ─────────────────

const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** Haversine distance in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Initial bearing from point A to point B, degrees 0–360 */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Angular difference between two bearings (0–180) */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Client-side port of SQL is_in_pollution_plume.
 * Returns true if `targetLat/Lng` lies inside the downwind plume cone
 * of a factory at `factoryLat/Lng`, given wind blowing FROM `windFromDeg`.
 */
function isInPlumeClient(
  factoryLat: number, factoryLng: number,
  targetLat:  number, targetLng:  number,
  windFromDeg: number, windSpeedKmh: number,
  maxPlumeKm: number, plumeConeHalfDeg: number
): boolean {
  if (windSpeedKmh < 1) return false // calm wind — no directional plume
  const distKm = haversineKm(factoryLat, factoryLng, targetLat, targetLng)
  if (distKm > maxPlumeKm) return false
  const windToDeg = (windFromDeg + 180) % 360
  const bearing   = bearingDeg(factoryLat, factoryLng, targetLat, targetLng)
  return angleDiff(bearing, windToDeg) <= plumeConeHalfDeg
}

/** Compute centroid of a GeoJSON polygon (first ring only) as [lat, lng] */
function geojsonCentroid(geojson: unknown): [number, number] | null {
  try {
    let coords: [number, number][] = []

    const base = geojson && typeof geojson === 'object' ? (geojson as Record<string, unknown>) : null
    const geom = base?.geometry
    const g = geom && typeof geom === 'object' ? (geom as Record<string, unknown>) : base

    const type = g?.type
    const coordinates = g?.coordinates

    if (type === 'Polygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
      coords = coordinates[0] as [number, number][]
    } else if (type === 'MultiPolygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
      coords = coordinates[0][0] as [number, number][]
    } else if (type === 'GeometryCollection') {
      const geometries = g?.geometries
      const poly = Array.isArray(geometries)
        ? (geometries.find((x) => (x as { type?: unknown })?.type === 'Polygon') as Record<string, unknown> | undefined)
        : undefined

      const polyCoords = poly?.coordinates
      if (Array.isArray(polyCoords) && Array.isArray(polyCoords[0])) {
        coords = polyCoords[0] as [number, number][]
      }
    }

    if (coords.length === 0) return null
    // GeoJSON is [lng, lat]
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
    return [lat, lng]
  } catch {
    return null
  }
}

/** Compute pie-slice wedge polygon for Leaflet */
function computeWedge(
  factoryLat: number, factoryLng: number,
  windToDeg: number, radiusKm: number, halfAngleDeg: number,
  n = 32
): [number, number][] {
  const R = 6371
  const pts: [number, number][] = [[factoryLat, factoryLng]]
  for (let i = 0; i <= n; i++) {
    const bearing = toRad((windToDeg - halfAngleDeg) + (i / n) * halfAngleDeg * 2)
    const lat1 = toRad(factoryLat), lng1 = toRad(factoryLng), d = radiusKm / R
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing))
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    )
    pts.push([toDeg(lat2), toDeg(lng2)])
  }
  pts.push([factoryLat, factoryLng])
  return pts
}

const RISK_COLOR: Record<string, string> = {
  red:    '#ef4444',
  yellow: '#f59e0b',
  green:  '#22c55e',
}
const FACTORY_COLOR: Record<string, string> = {
  Critical: '#dc2626', High: '#ea580c', Moderate: '#f59e0b',
}
const CROP_LABEL: Record<string, string> = {
  rice_boro: 'বোরো', rice_aman: 'আমন', rice_brri51: 'BRRI-51',
  rice_brri47: 'BRRI-47', rice_brri56: 'BRRI-56',
  jute: 'পাট', maize: 'ভুট্টা', mustard_tori7: 'সরিষা', bitter_gourd: 'করলা',
}


// ─── Component ─────────────────────────────────────────────────────────────

// Handle exposed to parent via ref so land cards can trigger flyToPlot
export interface OverviewMapHandle {
  flyToPlot: (plot: LandPlotOverview) => void
}

interface Props {
  farmerId:     string
  farmerLat:    number | null  // from DB (saved location)
  farmerLng:    number | null
  windFromDeg:  number
  windSpeedKmh: number
  hotspots:     HotspotOverview[]
  plots:        LandPlotOverview[]
  communitySpray: CommunitySprayPlot[]
  waterSources: WaterSource[]
}

const OverviewMap = forwardRef<OverviewMapHandle, Props>(function OverviewMap({
  farmerId, farmerLat, farmerLng,
  windFromDeg, windSpeedKmh,
  hotspots = [], plots = [], communitySpray = [], waterSources = [],
}, ref) {
  void farmerId;
  // ── local GPS state (overrides server-saved location after live GPS / manual) ─
  const [localLat, setLocalLat] = useState<number | null>(farmerLat)
  const [localLng, setLocalLng] = useState<number | null>(farmerLng)
  const [manualLat, setManualLat] = useState(farmerLat?.toFixed(6) ?? '')
  const [manualLng, setManualLng] = useState(farmerLng?.toFixed(6) ?? '')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [mapReady, setMapReady] = useState(() => {
    if (typeof window === 'undefined') return false
    return !!(window as unknown as { L?: unknown }).L
  })
  const [mapInitialized, setMapInitialized] = useState(false)
  const [leafletMap, setLeafletMap] = useState<LeafletMapLike | null>(null)
  const [activeLandId, setActiveLandId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  type LeafletMapLike = {
    remove: () => void
    removeLayer: (layer: unknown) => void
    fitBounds: (...args: unknown[]) => void
    flyTo: (...args: unknown[]) => void
  }

  type LeafletLayerLike = {
    bindPopup: (html: string, opts?: Record<string, unknown>) => LeafletLayerLike
    bindTooltip: (html: string, opts?: Record<string, unknown>) => LeafletLayerLike
    addTo: (map: LeafletMapLike) => LeafletLayerLike
    on?: (event: string, handler: () => void) => LeafletLayerLike
    getBounds?: () => { isValid: () => boolean }
    openPopup?: () => void
  }

  type LeafletGlobal = {
    map: (el: HTMLElement, opts: Record<string, unknown>) => LeafletMapLike
    tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (map: LeafletMapLike) => void }
    geoJSON: (geo: unknown, opts?: Record<string, unknown>) => LeafletLayerLike
    divIcon: (opts: Record<string, unknown>) => unknown
    marker: (latlng: [number, number], opts: Record<string, unknown>) => LeafletLayerLike
    circle: (latlng: [number, number], opts: Record<string, unknown>) => LeafletLayerLike
    polygon: (latlngs: [number, number][], opts: Record<string, unknown>) => LeafletLayerLike
    Icon: { Default: { prototype: unknown; mergeOptions: (opts: Record<string, unknown>) => void } }
  }

  const mapDivRef    = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LeafletMapLike | null>(null)
  const farmMarkerRef = useRef<unknown>(null)
  const farmCircleRef = useRef<unknown>(null)
  const plotLayersRef    = useRef<unknown[]>([])
  const plumeLayers      = useRef<unknown[]>([])
  const plotLayerMapRef        = useRef<Map<string, unknown>>(new Map())
  const communitySprayLayersRef = useRef<unknown[]>([])

  // ── Load Leaflet once (DOM-based check, safe across HMR / StrictMode) ───────
  useEffect(() => {
    // Already fully loaded (handled by initial state)
    if ((window as unknown as { L?: unknown }).L) return

    // Script already injected by a previous mount — just wait for it
    if (document.getElementById('leaflet-js')) {
      const poll = setInterval(() => {
        if ((window as unknown as { L?: unknown }).L) {
          clearInterval(poll)
          setMapReady(true)
        }
      }, 50)
      return () => clearInterval(poll)
    }

    // First time — inject CSS + JS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id   = 'leaflet-css'
      link.rel  = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }

    const s = document.createElement('script')
    s.id    = 'leaflet-js'
    s.src   = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    s.onload = () => setMapReady(true)
    s.onerror = () => console.error('[OverviewMap] Leaflet failed to load')
    document.head.appendChild(s)
  }, [])

  // ── Inject global CSS animations once ────────────────────────────
  useEffect(() => {
    if (document.getElementById('om-anim')) return
    const s = document.createElement('style')
    s.id = 'om-anim'
    s.textContent = `
      @keyframes omPulse {
        0%  { box-shadow: 0 0 0 0   rgba(59,130,246,.8); }
        70% { box-shadow: 0 0 0 18px rgba(59,130,246,0);  }
        100%{ box-shadow: 0 0 0 0   rgba(59,130,246,0);  }
      }
      @keyframes omSpin { to { transform: rotate(360deg); } }
    `
    document.head.appendChild(s)
  }, [])

  // ── Init map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapDivRef.current) return
    const L = (window as unknown as { L?: LeafletGlobal }).L
    if (!L) return

    if (mapRef.current) { try { mapRef.current.remove() } catch {} }

    delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const center: [number, number] = (localLat && localLng)
      ? [localLat, localLng] : [23.8103, 90.2700]

    const map = L.map(mapDivRef.current as HTMLElement, { center, zoom: 13, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    setTimeout(() => {
      setMapInitialized(true)
      setLeafletMap(map)
    }, 0)

    return () => {
      // Avoid setState directly in effect cleanup
      setTimeout(() => {
        setMapInitialized(false)
        setLeafletMap(null)
      }, 0)
      // Null ref FIRST so any in-flight layer effects see null and bail out
      mapRef.current = null
      plotLayersRef.current = []
      plumeLayers.current   = []
      communitySprayLayersRef.current = []
      try { map.remove() } catch {}
    }
  }, [mapReady])

  // ── Farm marker + reach circle ────────────────────────────────────
  useEffect(() => {
    const L = (window as unknown as { L?: LeafletGlobal }).L
    const map = mapRef.current
    if (!L || !map) return

    // Remove old
    if (farmMarkerRef.current) { try { map.removeLayer(farmMarkerRef.current) } catch {} }
    if (farmCircleRef.current) { try { map.removeLayer(farmCircleRef.current) } catch {} }

    if (!localLat || !localLng) return

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:22px;height:22px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 0 rgba(59,130,246,.8);animation:omPulse 2s infinite;display:flex;align-items:center;justify-content:center;font-size:10px;">🌾</div>`,
      iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14],
    })
    farmMarkerRef.current = L.marker([localLat, localLng], { icon, zIndexOffset: 1000 })
      .bindPopup(`<b>আমার খামার</b><br/><span style="font-family:monospace;font-size:10px;color:#94a3b8">${localLat.toFixed(5)}, ${localLng.toFixed(5)}</span>`)
      .addTo(map)

    // 15km reach circle (light dashed)
    farmCircleRef.current = L.circle([localLat, localLng], {
      radius: 15000, color: '#3b82f6', fillColor: '#3b82f6',
      fillOpacity: 0.03, weight: 1, dashArray: '8 8',
    }).addTo(map)
  }, [localLat, localLng, mapInitialized])

  // ── Plot layers with per-land wind risk ───────────────────────────
  useEffect(() => {
    const L = (window as unknown as { L?: LeafletGlobal }).L
    const map = mapRef.current
    if (!L || !map) return

    plotLayersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    plotLayersRef.current = []
    plotLayerMapRef.current.clear()

    plots.forEach(plot => {
      if (!plot.boundary_geojson) return
      try {
        const geo = typeof plot.boundary_geojson === 'string'
          ? JSON.parse(plot.boundary_geojson) : plot.boundary_geojson

        // Compute per-land plume membership
        const centroid = geojsonCentroid(geo)
        let landInAnyPlume = false
        let worstFactory = ''
        if (centroid && windSpeedKmh >= 1) {
          for (const h of hotspots) {
            if (isInPlumeClient(
              h.factory_lat, h.factory_lng,
              centroid[0], centroid[1],
              windFromDeg, windSpeedKmh,
              h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
            )) {
              landInAnyPlume = true
              worstFactory = h.factory_name_bn
              break
            }
          }
        }

        const isSelected = plot.land_id === activeLandId
        const fillColor = (landInAnyPlume || isSelected)
          ? '#ef4444'
          : RISK_COLOR[plot.risk_level] ?? '#22c55e'

        // pH display
        const phStr = plot.soil_ph != null ? `pH ${plot.soil_ph}` : ''
        const surveyAge = plot.last_survey_days != null
          ? (plot.last_survey_days <= 7 ? '✓ এই সপ্তাহ' : `${plot.last_survey_days}দিন আগে`)
          : 'সার্ভে নেই'

        const popupHtml =
          `<div style="min-width:200px;font-family:sans-serif;font-size:13px;color:#374151;">` +
          `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:6px;">` +
          `<div style="display:flex;justify-content:space-between;align-items:flex-start;">` +
          `  <strong style="font-size:15px;color:#111827;">${plot.land_name_bn || plot.land_name}</strong>` +
          `  <span style="background:#dcfce7;color:#166534;font-size:10px;padding:2px 6px;border-radius:9999px;font-weight:600;">🌾 আপনার জমি</span>` +
          `</div>` +
          `<span style="color:#6b7280;font-size:12px;">${CROP_LABEL[plot.crop_id ?? ''] ?? (plot.crop_id ?? 'ফসল নির্দিষ্ট নয়')} ` +
          (plot.area_bigha ? ` · ${plot.area_bigha.toFixed(2)} বিঘা` : '') + `</span>` +
          `</div>` +
          // Details Grid
          `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">` +
          `<div><span style="color:#9ca3af;font-size:11px;">মাটির pH</span><br/><b>${phStr || 'অজানা'}</b></div>` +
          `<div><span style="color:#9ca3af;font-size:11px;">আর্দ্রতা</span><br/><b>${plot.soil_moisture || 'অজানা'}</b></div>` +
          `<div><span style="color:#9ca3af;font-size:11px;">পোকা মাকড়</span><br/><b>${plot.pest_pressure || 'স্বাভাবিক'}</b></div>` +
          `<div><span style="color:#9ca3af;font-size:11px;">শেষ সার্ভে</span><br/><b>${surveyAge}</b></div>` +
          `</div>` +
          // Warnings / AI Context
          (plot.spray_active && plot.chemical_name
            ? `<div style="background:#fefce8;border:1px solid #fef08a;color:#854d0e;padding:6px;border-radius:6px;font-size:11px;margin-bottom:6px;">⚠️ <b>সক্রিয় স্প্রে:</b> ${plot.chemical_name}</div>` 
            : '') +
          (landInAnyPlume
            ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:6px;border-radius:6px;font-size:11px;margin-bottom:6px;">🏭 <b>দূষণ সতর্কতা:</b> এই জমিটি ${worstFactory} এর ধোঁয়ার নিচে রয়েছে।</div>` 
            : '') +
          // Recommendation CTA
          `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">` +
          `💡 বিস্তারিত জানতে ড্যাশবোর্ডের স্ক্যানার ব্যবহার করুন।` +
          `</div>` +
          `</div>`

        const layer = L.geoJSON(geo, {
          style: {
            color:       (landInAnyPlume || isSelected) ? '#dc2626' : (fillColor),
            fillColor,
            fillOpacity: (plot.spray_active || isSelected) ? 0.40 : 0.20,
            weight:      (landInAnyPlume || isSelected) ? 4 : 3,
            dashArray:   plot.spray_active ? undefined : '4 4',
          },
        })
          .bindPopup(popupHtml, { minWidth: 220 })
          .addTo(map)

        plotLayersRef.current.push(layer)
        plotLayerMapRef.current.set(plot.land_id, layer)

        // Land name label at centroid
        if (centroid) {
          const labelIcon = L.divIcon({
            className: '',
            html: `<div style="
              background:rgba(255,255,255,.92);border:1px solid #d1d5db;
              border-radius:4px;padding:2px 5px;font-size:10px;font-weight:600;
              color:#374151;white-space:nowrap;pointer-events:none;
              box-shadow:0 1px 3px rgba(0,0,0,.1)
            ">${plot.land_name_bn || plot.land_name}</div>`,
            iconSize:   [1, 1],    // FIX: Leaflet reads iconSize.x internally — must not be undefined
            iconAnchor: [0, 0],
          })
          const label = L.marker(centroid, { icon: labelIcon, interactive: false, zIndexOffset: -500 })
            .addTo(map)
          plotLayersRef.current.push(label)
        }

      } catch {}
    })
  }, [plots, hotspots, windFromDeg, windSpeedKmh, activeLandId, mapInitialized])

  // ── Community spray layers (other farmers' active sprays) ─────────
  useEffect(() => {
    const L = (window as unknown as { L?: LeafletGlobal }).L
    const map = mapRef.current
    if (!L || !map) return

    communitySprayLayersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    communitySprayLayersRef.current = []

    const leaflet = L as LeafletGlobal // Capture for callback
    communitySpray.forEach(sp => {
      const color = sp.risk_level === 'red' ? '#f97316' : '#eab308'
      try {
        // Land boundary polygon
        if (sp.boundary_geojson) {
          const geo = typeof sp.boundary_geojson === 'string' ? JSON.parse(sp.boundary_geojson) : sp.boundary_geojson
          const layer = leaflet.geoJSON(geo, {
            style: { color, fillColor: color, fillOpacity: 0.30, weight: 2, dashArray: '6 3' },
          }).bindTooltip(
            `<div style="font-family:sans-serif;font-size:12px;min-width:160px">` +
            `<strong>🏘️ ${sp.land_name}</strong><br/>` +
            `🧪 ${sp.chemical_name} (${sp.chemical_type})<br/>` +
            `📏 ${Math.round(sp.distance_m)} মি দূরে<br/>` +
            `⏱ ${sp.hours_remaining.toFixed(1)} ঘণ্টা বাকি<br/>` +
            (sp.nearest_own_land ? `🌾 আপনার জমি: ${sp.nearest_own_land}<br/>` : '') +
            `<span style="color:${color};font-weight:600">${sp.risk_level === 'red' ? '⚠️ সক্রিয় ঝুঁকি' : '🟡 মেয়াদ শেষ হচ্ছে'}</span>` +
            `</div>`,
            { sticky: true, direction: 'top' }
          ).addTo(map)
          communitySprayLayersRef.current.push(layer)
        }
        // Drift/harm buffer ring (dashed)
        if (sp.buffer_geojson) {
          const bufGeo = typeof sp.buffer_geojson === 'string' ? JSON.parse(sp.buffer_geojson) : sp.buffer_geojson
          const bufLayer = L.geoJSON(bufGeo, {
            style: { color, fillColor: color, fillOpacity: 0.07, weight: 1.5, dashArray: '3 6' },
          }).addTo(map)
          communitySprayLayersRef.current.push(bufLayer)
        }
      } catch {}
    })
  }, [communitySpray, mapInitialized])

  // ── Industrial plume layers ───────────────────────────────────────
  useEffect(() => {
    const L = (window as unknown as { L?: LeafletGlobal }).L
    const map = mapRef.current
    if (!L || !map) return

    plumeLayers.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    plumeLayers.current = []

    hotspots.forEach(h => {
      const color = FACTORY_COLOR[h.risk_level] ?? '#94a3b8'

      // Dashed reach circle
      const reach = L.circle([h.factory_lat, h.factory_lng], {
        radius: h.max_plume_km * 1000,
        color: '#94a3b8', fillColor: '#94a3b8',
        fillOpacity: 0.03, weight: 1, dashArray: '5 8',
      }).addTo(map)
      plumeLayers.current.push(reach)

      // Directional plume wedge
      const halfAngle = (h.plume_cone_deg ?? 90) / 2
      // Use windFromDeg prop (reliable) instead of h.wind_to_deg (may be inverted from server)
      const correctWindToDeg = (windFromDeg + 180) % 360
      const wedge = L.polygon(
        computeWedge(h.factory_lat, h.factory_lng, correctWindToDeg, h.max_plume_km, halfAngle),
        {
          color,
          fillColor: color,
          // Use local GPS for client-side plume check (more reliable than server value)
          fillOpacity: (localLat && localLng && isInPlumeClient(
            h.factory_lat, h.factory_lng, localLat, localLng,
            windFromDeg, windSpeedKmh, h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
          )) ? 0.22 : 0.07,
          weight: (localLat && localLng && isInPlumeClient(
            h.factory_lat, h.factory_lng, localLat, localLng,
            windFromDeg, windSpeedKmh, h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
          )) ? 1.5 : 1,
          dashArray: (localLat && localLng && isInPlumeClient(
            h.factory_lat, h.factory_lng, localLat, localLng,
            windFromDeg, windSpeedKmh, h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
          )) ? undefined : '4 8',
        }
      ).addTo(map)
      plumeLayers.current.push(wedge)

      // Factory icon
      const clientInPlume = localLat && localLng && isInPlumeClient(
        h.factory_lat, h.factory_lng, localLat, localLng,
        windFromDeg, windSpeedKmh, h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
      )
      const bg = clientInPlume ? color : '#6b7280'
      const fIcon = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:8px;background:${bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:13px;">🏭</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -18],
      })
      const marker = L.marker([h.factory_lat, h.factory_lng], { icon: fIcon })
        .bindPopup(
          `<div style="width:200px;font-family:sans-serif;font-size:12px">` +
          `<strong style="color:${clientInPlume ? '#dc2626' : '#374151'}">${h.factory_name_bn}</strong><br/>` +
          `দূরত্ব: ${h.distance_km} কিমি<br/>` +
          `দূষণকারী: ${h.primary_pollutant}<br/>` +
          `ঝুঁকি: <b style="color:${FACTORY_COLOR[h.risk_level]}">${h.risk_level}</b><br/>` +
          `ধোঁয়া খামারে আসছে: <b>${(localLat && localLng && isInPlumeClient(
            h.factory_lat, h.factory_lng, localLat, localLng,
            windFromDeg, windSpeedKmh, h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
          )) ? 'হ্যাঁ ⚠️' : 'না ✓'}</b>` +
          `</div>`
        )
        .addTo(map)
      plumeLayers.current.push(marker)
    })

    // Wind arrow — positioned above & left of farm
    if (localLat && localLng && map) {
      const arrowLat = localLat + 0.012
      const arrowLng = localLng - 0.018
      const label = windSpeedKmh < 2 ? 'শান্ত বায়ু' : `${windSpeedKmh} km/h`
      const windToDeg = (windFromDeg + 180) % 360
      const arrowIcon = L.divIcon({
        className: '',
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%)">
          <div style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.95);border:1.5px solid #94a3b8;box-shadow:0 1px 6px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;transform:rotate(${windToDeg}deg);font-size:14px;">↑</div>
          <span style="font-size:9px;font-weight:600;color:#475569;background:white;padding:1px 5px;border-radius:4px;border:1px solid #e2e8f0;white-space:nowrap;">${label}</span>
        </div>`,
        iconSize: [70, 48], iconAnchor: [35, 24],
      })
      const arrow = L.marker([arrowLat, arrowLng], { icon: arrowIcon, interactive: false, zIndexOffset: -100 })
        .addTo(map)
      plumeLayers.current.push(arrow)
    }
  }, [hotspots, windFromDeg, windSpeedKmh, localLat, localLng, mapInitialized])

  // ── Expose flyToPlot to parent via ref ──────────────────────────
  useImperativeHandle(ref, () => ({
    flyToPlot(plot: LandPlotOverview) {
      setActiveLandId(plot.land_id)
      const L = (window as unknown as { L?: LeafletGlobal }).L
      if (!L || !mapRef.current) return
      const map = mapRef.current

      // Try stored layer first (instant, no re-parse)
      const layer = plotLayerMapRef.current.get(plot.land_id)
      const layerWithBounds = layer as unknown as {
        getBounds?: () => { isValid: () => boolean }
        openPopup?: () => void
      }
      if (layerWithBounds?.getBounds) {
        try {
          const bounds = layerWithBounds.getBounds()
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18, animate: true, duration: 0.7 })
            layerWithBounds.openPopup?.()
            return
          }
        } catch {}
      }
      // Fallback: parse GeoJSON fresh
      if (!plot.boundary_geojson) return
      try {
        const geo = typeof plot.boundary_geojson === 'string' ? JSON.parse(plot.boundary_geojson) : plot.boundary_geojson
        const tmp = L.geoJSON(geo)
        const bounds = (tmp as unknown as { getBounds: () => { isValid: () => boolean } }).getBounds()
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18, animate: true, duration: 0.7 })
      } catch {}
    }
  }))

  // ── Live GPS ──────────────────────────────────────────────────────
  const handleLiveGPS = useCallback(() => {
    if (!navigator.geolocation) { setError('GPS সমর্থিত নয়'); return }
    setGpsLoading(true); setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude
        setLocalLat(lat); setLocalLng(lng)
        setManualLat(lat.toFixed(6)); setManualLng(lng.toFixed(6))
        if (mapRef.current) mapRef.current.flyTo([lat, lng], 15, { animate: true, duration: 1.2 })
        setGpsLoading(false)
      },
      err => { setError('GPS ব্যর্থ: ' + err.message); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  // ── Manual confirm ────────────────────────────────────────────────
  const handleManualConfirm = useCallback(() => {
    const lat = parseFloat(manualLat), lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng) || lat < 20 || lat > 27 || lng < 88 || lng > 93) {
      setError('বাংলাদেশের বৈধ Lat (20–27) ও Lng (88–93) দিন।'); return
    }
    setError(null)
    setLocalLat(lat); setLocalLng(lng)
    if (mapRef.current) mapRef.current.flyTo([lat, lng], 15, { animate: true, duration: 1.2 })
  }, [manualLat, manualLng])

  // ── Derived: per-land plume count (memoised — safe from GeoJSON parse errors) ─
  const landsInPlume = useMemo(() => {
    if (windSpeedKmh < 1) return []
    return (plots ?? []).filter(plot => {
      if (!plot.boundary_geojson) return false
      try {
        const geo = typeof plot.boundary_geojson === 'string'
          ? JSON.parse(plot.boundary_geojson) : plot.boundary_geojson
        const c = geojsonCentroid(geo)
        if (!c) return false
        return (hotspots ?? []).some(h => isInPlumeClient(
          h.factory_lat, h.factory_lng, c[0], c[1],
          windFromDeg, windSpeedKmh, h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
        ))
      } catch { return false }
    })
  }, [plots, hotspots, windFromDeg, windSpeedKmh])

  // Re-compute is_in_plume client-side using correct windFromDeg
  // (server-side value may use inverted wind_to_deg)
  const hasPlumeFarm = hotspots.some(h => {
    if (!localLat || !localLng) return false
    return isInPlumeClient(
      h.factory_lat, h.factory_lng,
      localLat, localLng,
      windFromDeg, windSpeedKmh,
      h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
    )
  })
  const windDirs    = ['উত্তর','উ-পূ','পূর্ব','দ-পূ','দক্ষিণ','দ-প','পশ্চিম','উ-প']
  // FROM direction: where wind is coming from
  const windFromCardinal = windDirs[Math.round(windFromDeg / 45) % 8]
  // TO direction: where wind is blowing towards (plume direction)
  const windToDeg_display = (windFromDeg + 180) % 360
  const windToCardinal   = windDirs[Math.round(windToDeg_display / 45) % 8]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${(hasPlumeFarm || landsInPlume.length > 0) ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
              খামার ও জমির মানচিত্র
              <span className="text-xs font-normal text-gray-400">· ১৫ কিমি ব্যাসার্ধ</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {localLat && localLng
                ? `আমার খামার: ${localLat.toFixed(4)}, ${localLng.toFixed(4)} · `
                : 'অবস্থান সেট করুন · '}
              বায়ু {windFromCardinal} থেকে → {windToCardinal}মুখী ({windFromDeg}°)
              {windSpeedKmh < 2 ? ' · শান্ত' : ` · ${windSpeedKmh} km/h`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {landsInPlume.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                ⚠️ {landsInPlume.length}টি জমিতে দূষণ
              </span>
            )}
            {communitySpray.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                🏘️ {communitySpray.length}টি প্রতিবেশী স্প্রে
              </span>
            )}
            {plots.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                {plots.length}টি জমি
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {hotspots.length}টি কারখানা
            </span>
          </div>
        </div>

        {/* GPS + manual controls */}
        <div className="mt-3 flex items-end gap-2 flex-wrap">
          <button
            onClick={handleLiveGPS}
            disabled={gpsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {gpsLoading
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> GPS...</>
              : '📡 লাইভ GPS'}
          </button>
          <div className="flex items-center gap-1.5">
            <input
              type="number" step="0.000001" placeholder="Lat"
              value={manualLat}
              onChange={e => setManualLat(e.target.value)}
              className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400"
            />
            <input
              type="number" step="0.000001" placeholder="Lng"
              value={manualLng}
              onChange={e => setManualLng(e.target.value)}
              className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400"
            />
            <button
              onClick={handleManualConfirm}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              ✓ যান
            </button>
          </div>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      {/* ── Map ── */}
      <WaterSourceMapLayer
        map={leafletMap}
        waterSources={waterSources}
        mapInitialized={mapInitialized}
      />
      <div ref={mapDivRef} style={{ height: 460, width: '100%', zIndex: 1 }} />

      {/* ── Legend ── */}
      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-4 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">লেজেন্ড:</span>
        {[
          { color: '#22c55e', label: 'নিরাপদ জমি' },
          { color: '#f59e0b', label: 'স্প্রে শেষ হচ্ছে' },
          { color: '#ef4444', label: 'সক্রিয় স্প্রে / দূষণ' },
          { color: '#94a3b8', label: 'নিরাপদ কারখানা' },
          { color: '#f97316', label: 'প্রতিবেশী স্প্রে' },
          { color: '#dc2626', label: 'সক্রিয় প্লাম' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm" style={{ background: color, opacity: 0.75 }} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>🌾</span> আমার খামার
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>🏭</span> কারখানা
        </div>
      </div>

      {/* ── Per-land pollution warning ── */}
      {landsInPlume.length > 0 && (
        <div className="px-4 py-3 border-t border-red-100 bg-red-50">
          <p className="text-xs font-semibold text-red-700 mb-2">⚠️ নিচের জমিগুলো বর্তমানে দূষণ প্লামের ভেতরে:</p>
          <div className="space-y-1.5">
            {landsInPlume.map(p => (
              <div key={p.land_id} className="flex items-center justify-between text-xs px-3 py-1.5 bg-red-100 rounded-lg text-red-700">
                <span className="font-semibold">{p.land_name_bn || p.land_name}</span>
                <span className="opacity-70">{p.crop_id ? (CROP_LABEL[p.crop_id] ?? p.crop_id) : ''} · {p.area_bigha?.toFixed(2)} বিঘা</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active plume factories list ── */}
      {hasPlumeFarm && (
        <div className="px-4 py-3 border-t border-orange-100 bg-orange-50 space-y-1.5">
          <p className="text-xs font-semibold text-orange-700 mb-2">🏭 খামার কেন্দ্রে সক্রিয় প্লাম:</p>
          {hotspots.filter(h => localLat && localLng && isInPlumeClient(
            h.factory_lat, h.factory_lng, localLat, localLng,
            windFromDeg, windSpeedKmh, h.max_plume_km, (h.plume_cone_deg ?? 90) / 2
          )).map(h => (
            <div key={h.hotspot_id} className="flex items-center justify-between text-xs px-3 py-1.5 bg-white rounded-lg border border-orange-200 text-orange-800">
              <span className="font-semibold">{h.factory_name_bn}</span>
              <span className="opacity-70">{h.distance_km} কিমি · {h.primary_pollutant}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Neighbour spray list ── */}
      {communitySpray.length > 0 && (
        <div className="px-4 py-3 border-t border-orange-100 bg-orange-50">
          <p className="text-xs font-semibold text-orange-700 mb-2">🏘️ ৩ কিমির মধ্যে প্রতিবেশীর সক্রিয় স্প্রে:</p>
          <div className="space-y-1.5">
            {communitySpray.map(sp => (
              <div key={sp.spray_id} className="flex items-center justify-between text-xs px-3 py-1.5 bg-white rounded-lg border border-orange-200">
                <div>
                  <span className="font-semibold text-gray-800">{sp.land_name}</span>
                  <span className="text-gray-400 ml-2">{sp.chemical_name}</span>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${sp.risk_level === 'red' ? 'text-orange-600' : 'text-yellow-600'}`}>
                    {Math.round(sp.distance_m)} মি
                  </div>
                  <div className="text-gray-400">{sp.hours_remaining.toFixed(0)}ঘণ্টা বাকি</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All clear ── */}
      {!hasPlumeFarm && landsInPlume.length === 0 && hotspots.length > 0 && (
        <div className="px-4 py-3 border-t border-green-100 bg-green-50 flex items-center gap-2">
          <span className="text-green-500 text-sm">✓</span>
          <p className="text-xs text-green-700 font-medium">
            সকল {plots.length > 0 ? `জমি (${plots.length}টি) ও ` : ''}খামার নিরাপদ — কোনো প্লাম আসছে না।
          </p>
        </div>
      )}
    </div>
  )
})

export default OverviewMap

// pg_dump "postgresql://postgres:GaMiNgNIR58483@db.mktxhuzpnurkxluoiggu.supabase.co:5432/postgres" --schema-only > supabase_schema.sql
