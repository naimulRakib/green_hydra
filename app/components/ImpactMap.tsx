'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { SatelliteWaterData } from '../actions/industrial'

const LeafletMap = dynamic(() => import('./LeafletMapInner'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420 }} className="w-full bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-400">ম্যাপ লোড হচ্ছে...</p>
      </div>
    </div>
  ),
})

export interface Hotspot {
  hotspot_id:        string
  factory_name:      string
  factory_name_bn:   string
  industry_type:     string
  factory_lat:       number   // ST_Y(location) from RPC
  factory_lng:       number   // ST_X(location) from RPC
  distance_km:       number
  max_plume_km:      number
  plume_cone_deg:    number
  wind_to_deg:       number   // precomputed in RPC: (wind_from + 180) % 360
  is_in_plume:       boolean
  primary_pollutant: string
  risk_level:        string
  remedy_id:         string | null
}

interface Props {
  hotspots:     Hotspot[]
  satelliteData?: SatelliteWaterData[]
  farmerLat:    number
  farmerLng:    number
  windFromDeg:  number
  windSpeedKmh: number
}

const RISK_COLOR: Record<string, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  High:     'bg-orange-50 text-orange-700 border-orange-200',
  Moderate: 'bg-amber-50 text-amber-700 border-amber-200',
}
const RISK_BN: Record<string, string> = {
  Critical: 'সর্বোচ্চ ঝুঁকি', High: 'উচ্চ ঝুঁকি', Moderate: 'মাঝারি',
}
const INDUSTRY_EMOJI: Record<string, string> = {
  Brick_Kiln: '🧱', Garment_Factory: '👔', Tannery: '🏗️',
}

export default function ImpactMap({ hotspots, satelliteData = [], farmerLat, farmerLng, windFromDeg, windSpeedKmh }: Props) {

  // Guard: filter out any rows with missing coords before passing to Leaflet
  const validHotspots = useMemo(
    () => hotspots.filter(h =>
      typeof h.factory_lat === 'number' && !isNaN(h.factory_lat) &&
      typeof h.factory_lng === 'number' && !isNaN(h.factory_lng)
    ),
    [hotspots]
  )

  const inPlume = useMemo(() => validHotspots.filter(h => h.is_in_plume), [validHotspots])
  const windCardinal = (() => {
    const dirs = ['উত্তর','উ-পূ','পূর্ব','দ-পূ','দক্ষিণ','দ-প','পশ্চিম','উ-প']
    return dirs[Math.round(windFromDeg / 45) % 8]
  })()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inPlume.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
            ইন্ডাস্ট্রিয়াল রিস্ক ম্যাপ
            <span className="text-xs font-normal text-gray-400 ml-1">· ১৫ কিমি ব্যাসার্ধ</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            আপনার অবস্থান: {farmerLat.toFixed(4)}, {farmerLng.toFixed(4)} · বাতাস {windCardinal}মুখী ({windFromDeg}°)
            {windSpeedKmh < 2 ? ' · শান্ত — সব দিকে দূষণ ছড়াচ্ছে' : ` · ${windSpeedKmh} km/h`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {inPlume.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
              {inPlume.length} সক্রিয় প্লাম
            </span>
          )}
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {validHotspots.length} কারখানা
          </span>
        </div>
      </div>

      {/* Map */}
      <LeafletMap
        hotspots={validHotspots}
        satelliteData={satelliteData}
        farmerLat={farmerLat}
        farmerLng={farmerLng}
        windFromDeg={windFromDeg}
        windSpeedKmh={windSpeedKmh}
      />

      {/* Legend */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4 bg-gray-50 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">লেজেন্ড:</span>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-sm bg-red-500 opacity-70" />
          ধোঁয়া আসছে
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-sm bg-gray-400 opacity-40 border border-dashed border-gray-400" />
          নিরাপদ বায়ু
        </div>
        <div className="flex items-center gap-1.5 text-xs text-blue-600">
          <div className="w-3 h-3 rounded-[3px] bg-blue-500/30 border border-blue-500" />
          পানির গুণমান (স্যাটেলাইট)
        </div>
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <div className="w-3 h-3 rounded-[3px] bg-red-500/30 border border-red-500" />
          সন্দেহজনক দূষণ
        </div>
        <div className="flex w-full items-center gap-4 mt-1 border-t border-gray-200/50 pt-2 pb-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>🌾</span> আপনার খামার
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>🏭</span> কারখানা
          </div>
        </div>
      </div>

      {/* Active plume list */}
      {inPlume.length > 0 && (
        <div className="px-4 py-3 border-t border-red-100 bg-red-50 space-y-2">
          <p className="text-xs font-semibold text-red-700 mb-2">⚠️ সক্রিয় দূষণ প্লাম:</p>
          {inPlume.map(spot => (
            <div
              key={spot.hotspot_id}
              className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${RISK_COLOR[spot.risk_level] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}
            >
              <div className="flex items-center gap-2">
                <span>{INDUSTRY_EMOJI[spot.industry_type] ?? '🏭'}</span>
                <div>
                  <p className="font-semibold">{spot.factory_name_bn}</p>
                  <p className="opacity-70">{spot.distance_km} কিমি দূরে · {spot.primary_pollutant}</p>
                </div>
              </div>
              <span className="font-bold">{RISK_BN[spot.risk_level]}</span>
            </div>
          ))}
        </div>
      )}

      {/* All safe */}
      {validHotspots.length > 0 && inPlume.length === 0 && (
        <div className="px-4 py-3 border-t border-green-100 bg-green-50 flex items-center gap-2">
          <span className="text-green-500">✓</span>
          <p className="text-xs text-green-700 font-medium">
            আশেপাশের {validHotspots.length}টি কারখানার ধোঁয়া বর্তমান বায়ুর দিকে আপনার খামারে আসছে না।
          </p>
        </div>
      )}

      {validHotspots.length === 0 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
          <span className="text-gray-400">ℹ️</span>
          <p className="text-xs text-gray-500">১৫ কিমি ব্যাসার্ধে কোনো সক্রিয় কারখানা নেই।</p>
        </div>
      )}
    </div>
  )
}