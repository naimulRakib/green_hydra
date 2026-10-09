'use client'

import { MapContainer, TileLayer, Polygon, Popup, CircleMarker, Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import type { WorkerOrder, ZoneRiskFeature } from '@/lib/ecogrid/riskEngine'

interface Props {
  zones: ZoneRiskFeature[]
  heatPoints: Array<{ lat: number; lng: number; intensity: number }>
  workerOrders: WorkerOrder[]
}

const cameraIcon = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;border-radius:8px;background:#0D7377;color:white;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.25)">📷</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

function riskColor(level: ZoneRiskFeature['risk_level']): string {
  if (level === 'danger') return '#ef4444'
  if (level === 'moderate') return '#eab308'
  return '#22c55e'
}

export default function EcoGridMapClient({ zones, heatPoints, workerOrders }: Props) {
  return (
    <MapContainer center={[23.7806, 90.4070]} zoom={12} style={{ height: '48vh', minHeight: '360px', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {zones.map((zone) => (
        <Polygon
          key={zone.zone_id}
          positions={zone.boundary.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])}
          pathOptions={{
            color: riskColor(zone.risk_level),
            fillColor: riskColor(zone.risk_level),
            fillOpacity: 0.22,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-xs space-y-1 min-w-[180px]">
              <p className="font-bold">{zone.zone_name_bn} ({zone.zone_name})</p>
              <p>Risk Score: <b>{zone.risk_score}</b></p>
              <p>AQI: <b>{zone.latest_aqi}</b> | Waste: <b>{zone.waste_reports_7d}</b></p>
              <p>Waterlog: <b>{zone.waterlog_events_30d}</b> | Industry: <b>{zone.nearest_industry_km} km</b></p>
            </div>
          </Popup>
        </Polygon>
      ))}

      {/* Population heat-style circles (lightweight for low-end devices) */}
      {heatPoints.map((point, index) => (
        <CircleMarker
          key={`heat-${index}`}
          center={[point.lat, point.lng]}
          radius={Math.max(6, Math.round(point.intensity / 10))}
          pathOptions={{
            color: '#14A085',
            fillColor: '#14A085',
            fillOpacity: Math.min(0.65, 0.15 + point.intensity / 180),
            weight: 1,
          }}
        />
      ))}

      {/* Demo camera registration markers */}
      <Marker position={[23.7643, 90.3899]} icon={cameraIcon}>
        <Popup>Tejgaon Waste Camera (ওয়েস্ট ডিটেকশন)</Popup>
      </Marker>
      <Marker position={[23.8163, 90.3532]} icon={cameraIcon}>
        <Popup>Mirpur Air Camera (এয়ার কোয়ালিটি)</Popup>
      </Marker>

      {/* Worker navigation lines */}
      {workerOrders.slice(0, 3).map((order) => (
        <Polyline
          key={`nav-${order.zone_id}`}
          positions={[
            [23.7806, 90.407],
            [order.nav_target.lat, order.nav_target.lng],
          ]}
          pathOptions={{ color: '#0D7377', dashArray: '6 8', weight: 2 }}
        />
      ))}
    </MapContainer>
  )
}
