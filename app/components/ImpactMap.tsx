'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { SatelliteWaterData } from '../actions/industrial'

const LeafletMap = dynamic(() => import('./LeafletMapInner'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center"
      style={{ height: 'clamp(350px, 45vh, 480px)', minHeight: '350px' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-medium">ম্যাপ লোড হচ্ছে...</p>
        <p className="text-xs text-gray-400">অনুগ্রহ করে অপেক্ষা করুন</p>
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
  const windToDeg = (windFromDeg + 180) % 360
  const windCardinal = (() => {
    const dirs = ['উত্তর','উ-পূ','পূর্ব','দ-পূ','দক্ষিণ','দ-প','পশ্চিম','উ-প']
    return dirs[Math.round(windToDeg / 45) % 8]
  })()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
        <div>
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${inPlume.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
            ইন্ডাস্ট্রিয়াল রিস্ক ম্যাপ
            <span className="text-xs font-normal text-gray-400 ml-1 hidden sm:inline">· ১৫ কিমি ব্যাসার্ধ</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="hidden sm:inline">অবস্থান: {farmerLat.toFixed(4)}, {farmerLng.toFixed(4)} · </span>
            বাতাস {windCardinal}মুখী ({windToDeg}°)
            {windSpeedKmh < 2 ? ' · শান্ত' : ` · ${windSpeedKmh} km/h`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {inPlume.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 shadow-sm">
              ⚠️ {inPlume.length} সক্রিয় প্লাম
            </span>
          )}
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            🏭 {validHotspots.length}
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
      <div className="px-4 py-3 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">🗺️ লেজেন্ড</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 shadow-sm">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="font-medium">ধোঁয়া আসছে</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 shadow-sm">
            <div className="w-3 h-3 rounded-full bg-gray-400 border border-dashed border-gray-500" />
            <span className="font-medium">নিরাপদ বায়ু</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 shadow-sm">
            <div className="w-3 h-3 rounded-full bg-blue-500/40 border border-blue-500" />
            <span className="font-medium">পানি (স্যাটেলাইট)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 shadow-sm">
            <div className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500" />
            <span className="font-medium">সন্দেহজনক দূষণ</span>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="text-sm">🌾</span> <span className="font-medium">আমার খামার</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="text-sm">🏭</span> <span className="font-medium">কারখানা</span>
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
