'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Hotspot } from './ImpactMap'
import type { SatelliteWaterData } from '../actions/industrial'

// Fix Leaflet broken default icons in Next.js
// Moved to useEffect inside the component to prevent SSR errors

const farmerIcon = L.divIcon({
  className: '',
  html: `<div style="width:40px;height:40px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;">🌾</div>`,
  iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -22],
})

function makeFactoryIcon(inPlume: boolean, riskLevel: string) {
  const bg = inPlume
    ? (riskLevel === 'Critical' ? '#dc2626' : riskLevel === 'High' ? '#ea580c' : '#f59e0b')
    : '#6b7280'
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:10px;background:${bg};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:15px;">🏭</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -20],
  })
}

// Compute pie-slice wedge polygon points
// windToDeg: direction wind blows TOWARD (0=N, 90=E, 180=S, 270=W)
function computePlumeWedge(
  factoryLat: number, factoryLng: number,
  windToDeg: number, radiusKm: number, halfAngleDeg: number,
  numPoints = 32
): [number, number][] {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const points: [number, number][] = [[factoryLat, factoryLng]]
  for (let i = 0; i <= numPoints; i++) {
    const bearing = toRad((windToDeg - halfAngleDeg) + (i / numPoints) * (halfAngleDeg * 2))
    const lat1 = toRad(factoryLat), lng1 = toRad(factoryLng), d = radiusKm / R
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
    )
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    )
    points.push([toDeg(lat2), toDeg(lng2)])
  }
  points.push([factoryLat, factoryLng])
  return points
}

// Draws all plume wedges + reach circles using Leaflet imperatively
function PlumeLayer({ hotspots }: { hotspots: Hotspot[] }) {
  const map = useMap()
  const layersRef = useRef<(L.Polygon | L.Circle)[]>([])

  useEffect(() => {
    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    hotspots.forEach(spot => {
      // Skip any rows that somehow slipped through with bad coords
      if (!spot.factory_lat || !spot.factory_lng) return

      // Grey dashed circle = full potential reach radius
      const reach = L.circle([spot.factory_lat, spot.factory_lng], {
        radius:      spot.max_plume_km * 1000,
        color:       '#94a3b8',
        fillColor:   '#94a3b8',
        fillOpacity: 0.04,
        weight:      1,
        dashArray:   '5 8',
      }).addTo(map)
      layersRef.current.push(reach)

      // Directional wedge = actual wind plume direction
      const halfAngle  = (spot.plume_cone_deg ?? 60) / 2
      const windToDeg  = spot.wind_to_deg ?? 0
      const wedgePoints = computePlumeWedge(
        spot.factory_lat, spot.factory_lng,
        windToDeg, spot.max_plume_km, halfAngle
      )
      const color = spot.is_in_plume
        ? (spot.risk_level === 'Critical' ? '#dc2626' : spot.risk_level === 'High' ? '#ea580c' : '#f59e0b')
        : '#94a3b8'
      const wedge = L.polygon(wedgePoints, {
        color,
        fillColor:   color,
        fillOpacity: spot.is_in_plume ? 0.20 : 0.06,
        weight:      spot.is_in_plume ? 1.5  : 1,
        dashArray:   spot.is_in_plume ? undefined : '4 8',
      }).addTo(map)
      layersRef.current.push(wedge)
    })

    return () => {
      layersRef.current.forEach(l => l.remove())
      layersRef.current = []
    }
  }, [hotspots, map])

  return null
}

// Draws the satellite water quality grid blocks
function SatelliteWaterLayer({ satelliteData }: { satelliteData: SatelliteWaterData[] }) {
  const map = useMap()
  const layersRef = useRef<L.Rectangle[]>([])

  useEffect(() => {
    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    satelliteData.forEach(cell => {
      // Create a small grid cell (approx 1km x 1km box) around the center point
      const offsetLat = 0.0045; // roughly 500m
      const offsetLng = 0.0050; // roughly 500m
      
      const bounds: L.LatLngBoundsExpression = [
        [cell.lat - offsetLat, cell.lng - offsetLng],
        [cell.lat + offsetLat, cell.lng + offsetLng]
      ]

      // Determine color based on suspected pollution
      const color = cell.suspected_pollution ? '#ef4444' : '#3b82f6'

      const rect = L.rectangle(bounds, {
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: 1,
        dashArray: '3 6'
      })

      // Add a popup with the satellite info
      rect.bindPopup(`
        <div style="min-width: 140px; padding: 2px;">
          <div style="font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>🛰️</span> স্যাটেলাইট ডেটা
          </div>
          <div style="font-size: 11px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span style="color: #666;">turbidity:</span>
            <b>${cell.turbidity.toFixed(1)}</b>
          </div>
          <div style="font-size: 11px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span style="color: #666;">রঙ অনুমান:</span>
            <b>${cell.color_estimate}</b>
          </div>
          <div style="font-size: 11px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 4px;">
            <span style="color: #666;">দূষণ সম্ভাবনা:</span>
            <b style="color: ${cell.suspected_pollution ? '#dc2626' : '#16a34a'};">
              ${cell.suspected_pollution ? 'উচ্চ ⚠️' : 'স্বাভাবিক ✓'}
            </b>
          </div>
        </div>
      `)
      
      rect.addTo(map)
      layersRef.current.push(rect)
    })

    return () => {
      layersRef.current.forEach(l => l.remove())
      layersRef.current = []
    }
  }, [satelliteData, map])

  return null
}

// Wind arrow marker (non-interactive)
function WindArrow({
  lat, lng, windToDeg, speedKmh,
}: {
  lat: number; lng: number; windToDeg: number; speedKmh: number
}) {
  const map = useMap()
  const ref = useRef<L.Marker | null>(null)

  useEffect(() => {
    ref.current?.remove()
    const label = speedKmh < 2 ? 'শান্ত বায়ু' : `${speedKmh} km/h`
    const icon = L.divIcon({
      className: '',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%)">
          <div style="
            width:32px;height:32px;border-radius:50%;
            background:rgba(255,255,255,0.95);border:1.5px solid #94a3b8;
            box-shadow:0 1px 6px rgba(0,0,0,0.15);
            display:flex;align-items:center;justify-content:center;
            transform:rotate(${windToDeg}deg);font-size:16px;
          ">↑</div>
          <span style="
            font-size:9px;font-weight:600;color:#475569;
            background:white;padding:1px 5px;border-radius:4px;
            border:1px solid #e2e8f0;white-space:nowrap;
          ">${label}</span>
        </div>`,
      iconSize: [70, 50], iconAnchor: [35, 25],
    })
    ref.current = L.marker([lat, lng], {
      icon, interactive: false, zIndexOffset: -100,
    }).addTo(map)
    return () => { ref.current?.remove() }
  }, [map, lat, lng, windToDeg, speedKmh])

  return null
}

const INDUSTRY_EMOJI: Record<string, string> = {
  Brick_Kiln: '🧱', Garment_Factory: '👔', Tannery: '🏗️',
}
const RISK_BN: Record<string, string> = {
  Critical: 'সর্বোচ্চ', High: 'উচ্চ', Moderate: 'মাঝারি',
}
const RISK_COLOR: Record<string, string> = {
  Critical: '#dc2626', High: '#ea580c', Moderate: '#d97706',
}

interface Props {
  hotspots:     Hotspot[]
  satelliteData?: SatelliteWaterData[]
  farmerLat:    number
  farmerLng:    number
  windFromDeg:  number
  windSpeedKmh: number
}

export default function LeafletMapInner({
  hotspots, satelliteData = [], farmerLat, farmerLng, windFromDeg, windSpeedKmh,
}: Props) {
  useEffect(() => {
    // Fix Leaflet broken default icons in Next.js (client-side only)
    if (typeof window !== 'undefined' && L.Icon?.Default?.prototype) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
    }
  }, [])

  const windToDeg = (windFromDeg + 180) % 360

  return (
    <MapContainer
      center={[farmerLat, farmerLng]}
      zoom={13}
      style={{ height: '420px', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <SatelliteWaterLayer satelliteData={satelliteData} />
      <PlumeLayer hotspots={hotspots} />

      <WindArrow
        lat={farmerLat + 0.013}
        lng={farmerLng - 0.020}
        windToDeg={windToDeg}
        speedKmh={windSpeedKmh}
      />

      {/* Farmer marker */}
      <Marker position={[farmerLat, farmerLng]} icon={farmerIcon}>
        <Popup>
          <div style={{ textAlign: 'center', padding: '4px 2px' }}>
            <p style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>আপনার খামার</p>
            <p style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>
              {farmerLat.toFixed(4)}, {farmerLng.toFixed(4)}
            </p>
          </div>
        </Popup>
      </Marker>

      {/* Factory markers — coords guaranteed valid by ImpactMap filter */}
      {hotspots.map(spot => (
        <Marker
          key={spot.hotspot_id}
          position={[spot.factory_lat, spot.factory_lng]}
          icon={makeFactoryIcon(spot.is_in_plume, spot.risk_level)}
        >
          <Popup maxWidth={230}>
            <div style={{ width: 215, padding: '4px 0' }}>
              <div style={{
                fontWeight: 700, fontSize: 13,
                paddingBottom: 8, marginBottom: 8,
                borderBottom: `2px solid ${spot.is_in_plume ? '#fee2e2' : '#f1f5f9'}`,
                color: spot.is_in_plume ? '#dc2626' : '#374151',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>{INDUSTRY_EMOJI[spot.industry_type] ?? '🏭'}</span>
                <span>{spot.factory_name_bn}</span>
              </div>

              {([
                ['দূরত্ব',      `${spot.distance_km} কিমি`],
                ['প্লাম পরিধি', `${spot.max_plume_km} কিমি`],
                ['কোণ',         `${spot.plume_cone_deg}°`],
                ['দূষণকারী',   spot.primary_pollutant],
              ] as [string, string][]).map(([label, val]) => (
                <div
                  key={label}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}
                >
                  <span style={{ color: '#9ca3af' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{val}</span>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: '#9ca3af' }}>ঝুঁকি স্তর</span>
                <span style={{ fontWeight: 700, color: RISK_COLOR[spot.risk_level] ?? '#374151' }}>
                  {RISK_BN[spot.risk_level] ?? spot.risk_level}
                </span>
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 11,
                paddingTop: 8, marginTop: 4,
                borderTop: `1px solid ${spot.is_in_plume ? '#fee2e2' : '#f1f5f9'}`,
              }}>
                <span style={{ color: '#9ca3af' }}>ধোঁয়া আপনার দিকে</span>
                <span style={{ fontWeight: 700, color: spot.is_in_plume ? '#dc2626' : '#16a34a' }}>
                  {spot.is_in_plume ? 'হ্যাঁ ⚠️' : 'না ✓'}
                </span>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}