'use client'

import { useEffect, useRef } from 'react'
import { RISK_CONFIG, WATER_TYPE_CONFIG } from '@/app/types/water'
import type { WaterSource } from '@/app/types/water'

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
      const radius = Math.max(30, Math.min(80, src.verified_count * 15))

      // Pulsing circle for danger/warning zones
      const isPulsing = src.risk_zone === 'danger' || src.risk_zone === 'warning'

      // Outer pulse ring (danger only)
      if (isPulsing) {
        L.circle([src.lat, src.lng], {
          radius:      radius * 2,
          color:       cfg.mapColor,
          fillColor:   cfg.mapColor,
          fillOpacity: 0.08,
          weight:      1,
          dashArray:   '4 4',
        }).addTo(layerGroupRef.current)
      }

      // Main circle marker
      const circle = L.circle([src.lat, src.lng], {
        radius,
        color:       cfg.mapColor,
        fillColor:   cfg.mapColor,
        fillOpacity: src.risk_zone === 'safe' ? 0.2 : 0.35,
        weight:      src.risk_zone === 'danger' ? 3 : 2,
      }).addTo(layerGroupRef.current)

      // Label marker (emoji + name)
      const labelIcon = L.divIcon({
        html: `
          <div style="
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:2px;
            pointer-events:none;
          ">
            <span style="font-size:16px;">${typeInfo.emoji}</span>
            ${src.risk_zone !== 'safe' ? `
              <span style="
                background:${cfg.mapColor};
                color:white;
                font-size:9px;
                font-weight:bold;
                padding:1px 5px;
                border-radius:6px;
                white-space:nowrap;
                box-shadow:0 1px 4px rgba(0,0,0,0.4);
              ">${cfg.label}</span>
            ` : ''}
          </div>`,
        iconSize:   [40, 40],
        iconAnchor: [20, 20],
        className:  '',
      })

      L.marker([src.lat, src.lng], { icon: labelIcon, interactive: false })
        .addTo(layerGroupRef.current)

      // Popup on click
      circle.bindPopup(`
        <div style="
          font-family:sans-serif;
          min-width:200px;
          color:#111;
        ">
          <div style="
            font-weight:bold;
            font-size:13px;
            margin-bottom:8px;
            display:flex;
            align-items:center;
            gap:6px;
          ">
            ${typeInfo.emoji}
            ${src.source_name_bn ?? typeInfo.label_bn}
          </div>

          <div style="
            display:inline-block;
            background:${cfg.mapColor};
            color:white;
            font-size:10px;
            font-weight:bold;
            padding:2px 8px;
            border-radius:99px;
            margin-bottom:8px;
          ">${cfg.emoji} ${cfg.label}</div>

          ${src.risk_reason ? `
            <p style="font-size:11px;color:#555;margin-bottom:6px;">
              ${src.risk_reason}
            </p>
          ` : ''}

          <div style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:4px;
            margin-top:6px;
            font-size:11px;
          ">
            <div style="background:#f5f5f5;padding:4px 6px;border-radius:6px;">
              👥 ${src.verified_count} জন ব্যবহারকারী
            </div>
            <div style="background:#f5f5f5;padding:4px 6px;border-radius:6px;">
              🐟 মরা মাছ: ${src.fish_kill_reports > 0 ? src.fish_kill_reports + ' রিপোর্ট' : 'না'}
            </div>
            ${src.factory_name_bn ? `
              <div style="
                grid-column:span 2;
                background:#fff3f3;
                padding:4px 6px;
                border-radius:6px;
                color:#c00;
              ">
                🏭 কাছে: ${src.factory_name_bn}
              </div>
            ` : ''}
          </div>

          ${src.risk_zone !== 'safe' ? `
            <div style="
              margin-top:10px;
              background:#fff3f3;
              border:1px solid #fca5a5;
              border-radius:8px;
              padding:6px 10px;
              font-size:11px;
              font-weight:bold;
              color:#dc2626;
            ">
              ⚠️ এই পানি ব্যবহার করা থেকে বিরত থাকুন।
              DoE হটলাইন: 16100
            </div>
          ` : ''}
        </div>
      `, { maxWidth: 260 })
    })

    return () => {
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers()
      }
    }
  }, [map, waterSources, mapInitialized])

  return null  // No DOM output — works directly on Leaflet map
}
