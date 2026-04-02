'use client'

import { useEffect, useRef } from 'react'
import { RISK_CONFIG, WATER_TYPE_CONFIG, COLOR_OPTIONS } from '@/app/types/water'
import type { WaterSource, WaterColor } from '@/app/types/water'

type LeafletLatLngTuple = [number, number]

type LayerGroupLike = {
  clearLayers: () => void
  addTo: (m: unknown) => LayerGroupLike
}

type CircleLike = {
  addTo: (g: unknown) => CircleLike
  bindPopup: (html: string, opts?: Record<string, unknown>) => void
}

type MarkerLike = {
  addTo: (g: unknown) => MarkerLike
}

type LeafletGlobal = {
  layerGroup: () => LayerGroupLike
  circle: (latlng: LeafletLatLngTuple, opts: Record<string, unknown>) => CircleLike
  divIcon: (opts: Record<string, unknown>) => unknown
  marker: (latlng: LeafletLatLngTuple, opts: Record<string, unknown>) => MarkerLike
}

// Helper to get color label
const getColorLabel = (color: WaterColor | null): string => {
  if (!color) return 'অজানা'
  const option = COLOR_OPTIONS.find(c => c.value === color)
  return option?.label_bn ?? color
}

interface Props {
  map:            unknown       // Leaflet map instance
  waterSources:   WaterSource[]
  mapInitialized: boolean
}

export default function WaterSourceMapLayer({
  map,
  waterSources,
  mapInitialized,
}: Props) {
  const layerGroupRef = useRef<LayerGroupLike | null>(null)

  useEffect(() => {
    if (!mapInitialized || !map) return
    const L = (window as unknown as { L?: LeafletGlobal }).L
    if (!L) return

    // Clear previous layer
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers()
    } else {
      layerGroupRef.current = L.layerGroup().addTo(map)
    }

    waterSources.forEach(src => {
      const cfg      = RISK_CONFIG[src.risk_zone]
      const typeInfo = WATER_TYPE_CONFIG[src.source_type]

      // Circle size based on how many farmers use it
      const radius = Math.max(40, Math.min(100, src.verified_count * 18))

      // Pulsing circle for danger/warning zones
      const isPulsing = src.risk_zone === 'danger' || src.risk_zone === 'warning'

      // Format distance
      const distanceStr = src.distance_m < 1000
        ? `${Math.round(src.distance_m)} মিটার`
        : `${(src.distance_m / 1000).toFixed(1)} কিমি`

      // Outer pulse ring (danger only)
      if (isPulsing) {
        L.circle([src.lat, src.lng], {
          radius:      radius * 2.5,
          color:       cfg.mapColor,
          fillColor:   cfg.mapColor,
          fillOpacity: 0.06,
          weight:      1,
          dashArray:   '4 4',
        }).addTo(layerGroupRef.current)
      }

      // Main circle marker
      const circle = L.circle([src.lat, src.lng], {
        radius,
        color:       cfg.mapColor,
        fillColor:   cfg.mapColor,
        fillOpacity: src.risk_zone === 'safe' ? 0.25 : 0.4,
        weight:      src.risk_zone === 'danger' ? 4 : 2.5,
      }).addTo(layerGroupRef.current)

      // Enhanced label marker with distance & status
      const hasSatelliteData = src.risk_reason?.includes('স্যাটেলাইট') || src.risk_reason?.includes('satellite')
      const hasSurveyData = src.verified_count > 0 || src.last_color_report

      const labelIcon = L.divIcon({
        html: `
          <div style="
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:2px;
            pointer-events:none;
          ">
            <div style="
              font-size:24px;
              filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            ">${typeInfo.emoji}</div>
            <div style="
              display:flex;
              flex-direction:column;
              align-items:center;
              gap:1px;
            ">
              <span style="
                background:${cfg.mapColor};
                color:white;
                font-size:10px;
                font-weight:bold;
                padding:2px 8px;
                border-radius:10px;
                white-space:nowrap;
                box-shadow:0 2px 6px rgba(0,0,0,0.3);
              ">${cfg.label}</span>
              <span style="
                background:rgba(59,130,246,0.9);
                color:white;
                font-size:9px;
                font-weight:600;
                padding:1px 6px;
                border-radius:8px;
                white-space:nowrap;
                box-shadow:0 1px 4px rgba(0,0,0,0.2);
              ">📍${distanceStr}</span>
              ${hasSatelliteData ? `
                <span style="
                  background:rgba(139,92,246,0.9);
                  color:white;
                  font-size:8px;
                  font-weight:600;
                  padding:1px 5px;
                  border-radius:6px;
                  white-space:nowrap;
                ">🛰️ স্যাটেলাইট</span>
              ` : ''}
              ${hasSurveyData ? `
                <span style="
                  background:rgba(16,185,129,0.9);
                  color:white;
                  font-size:8px;
                  font-weight:600;
                  padding:1px 5px;
                  border-radius:6px;
                  white-space:nowrap;
                ">📋 সার্ভে</span>
              ` : ''}
            </div>
          </div>`,
        iconSize:   [60, 70],
        iconAnchor: [30, 35],
        className:  '',
      })

      L.marker([src.lat, src.lng], { icon: labelIcon, interactive: false })
        .addTo(layerGroupRef.current)

      // Enhanced popup with satellite + survey data
      circle.bindPopup(`
        <div style="
          font-family:sans-serif;
          min-width:240px;
          color:#111;
        ">
          <div style="
            font-weight:bold;
            font-size:14px;
            margin-bottom:10px;
            display:flex;
            align-items:center;
            gap:8px;
            padding-bottom:8px;
            border-bottom:1px solid #e5e7eb;
          ">
            <span style="font-size:24px;">${typeInfo.emoji}</span>
            <div>
              <div>${src.source_name_bn ?? typeInfo.label_bn}</div>
              <div style="font-size:11px;font-weight:normal;color:#6b7280;">
                ${distanceStr} দূরে
              </div>
            </div>
          </div>

          <div style="
            display:inline-flex;
            align-items:center;
            gap:4px;
            background:${cfg.mapColor};
            color:white;
            font-size:11px;
            font-weight:bold;
            padding:4px 10px;
            border-radius:99px;
            margin-bottom:10px;
          ">${cfg.emoji} ${cfg.label}</div>

          ${src.risk_reason ? `
            <p style="font-size:11px;color:#555;margin-bottom:10px;padding:8px;background:#f3f4f6;border-radius:8px;">
              ℹ️ ${src.risk_reason}
            </p>
          ` : ''}

          <div style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:6px;
            margin-bottom:10px;
          ">
            <div style="background:#f5f5f5;padding:6px 8px;border-radius:8px;">
              <div style="font-size:10px;color:#9ca3af;">ব্যবহারকারী</div>
              <div style="font-weight:700;">👥 ${src.verified_count} জন</div>
            </div>
            <div style="background:#f5f5f5;padding:6px 8px;border-radius:8px;">
              <div style="font-size:10px;color:#9ca3af;">মরা মাছ রিপোর্ট</div>
              <div style="font-weight:700;${src.fish_kill_reports > 0 ? 'color:#dc2626;' : ''}">
                🐟 ${src.fish_kill_reports > 0 ? src.fish_kill_reports + ' টি' : 'নেই'}
              </div>
            </div>
            ${src.last_color_report ? `
              <div style="background:#f5f5f5;padding:6px 8px;border-radius:8px;grid-column:span 2;">
                <div style="font-size:10px;color:#9ca3af;">পানির রঙ (সার্ভে)</div>
                <div style="font-weight:700;">${getColorLabel(src.last_color_report)}</div>
              </div>
            ` : ''}
            ${src.factory_name_bn ? `
              <div style="
                grid-column:span 2;
                background:#fff3f3;
                padding:6px 8px;
                border-radius:8px;
                color:#c00;
              ">
                <div style="font-size:10px;color:#9ca3af;">কাছের কারখানা</div>
                <div style="font-weight:700;">🏭 ${src.factory_name_bn}</div>
                ${src.distance_to_hotspot_m ? `<div style="font-size:10px;">📏 ${Math.round(src.distance_to_hotspot_m)}মি দূরে</div>` : ''}
              </div>
            ` : ''}
          </div>

          <!-- Data source badges -->
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">
            ${hasSatelliteData ? `
              <span style="
                background:#8b5cf6;
                color:white;
                font-size:10px;
                font-weight:600;
                padding:3px 8px;
                border-radius:10px;
              ">🛰️ স্যাটেলাইট ডাটা</span>
            ` : ''}
            ${hasSurveyData ? `
              <span style="
                background:#10b981;
                color:white;
                font-size:10px;
                font-weight:600;
                padding:3px 8px;
                border-radius:10px;
              ">📋 কৃষক সার্ভে</span>
            ` : ''}
            ${src.fish_kill_reports > 0 ? `
              <span style="
                background:#ef4444;
                color:white;
                font-size:10px;
                font-weight:600;
                padding:3px 8px;
                border-radius:10px;
              ">🐟 মাছ মৃত্যু</span>
            ` : ''}
          </div>

          ${src.risk_zone !== 'safe' ? `
            <div style="
              background:#fef2f2;
              border:1px solid #fecaca;
              border-radius:10px;
              padding:10px;
              font-size:11px;
            ">
              <div style="font-weight:bold;color:#dc2626;margin-bottom:4px;">⚠️ সতর্কতা</div>
              <div style="color:#991b1b;">
                এই পানি ব্যবহার করা থেকে বিরত থাকুন।
                <br/>📞 DoE হটলাইন: <b>16100</b>
              </div>
            </div>
          ` : `
            <div style="
              background:#f0fdf4;
              border:1px solid #bbf7d0;
              border-radius:10px;
              padding:10px;
              font-size:11px;
            ">
              <div style="font-weight:bold;color:#16a34a;margin-bottom:4px;">✓ নিরাপদ</div>
              <div style="color:#166534;">
                এই পানি সেচের জন্য ব্যবহার করা যাবে।
              </div>
            </div>
          `}
        </div>
      `, { maxWidth: 280 })
    })

    return () => {
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers()
      }
    }
  }, [map, waterSources, mapInitialized])

  return null  // No DOM output — works directly on Leaflet map
}
