'use client'
/**
 * LandDigest — client wrapper for OverviewMap + land cards.
 *
 * BUG FIX: `forwardRef: true` is NOT a valid option for next/dynamic in
 * Next.js 13+ App Router. Dynamic imports forward refs automatically when
 * the underlying component uses React.forwardRef. Removed the invalid option.
 */

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import type { OverviewMapHandle, LandPlotOverview, HotspotOverview, CommunitySprayPlot } from './OverviewMap'
import type { WaterSource } from '@/app/types/water'

// forwardRef: true removed — invalid in Next.js 13+, refs work automatically
const OverviewMapDynamic = dynamic(() => import('./OverviewMap'), {
  ssr: false,
  loading: () => (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center gap-3"
      style={{ height: 480 }}
    >
      <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-gray-400">জমির ম্যাপ লোড হচ্ছে...</p>
    </div>
  ),
})

const CROP_LABEL: Record<string, string> = {
  rice_boro:      'বোরো',
  rice_aman:      'আমন',
  rice_brri51:    'BRRI-51',
  rice_brri47:    'BRRI-47',
  rice_brri56:    'BRRI-56',
  jute:           'পাট',
  maize:          'ভুট্টা',
  mustard_tori7:  'সরিষা',
  bitter_gourd:   'করলা',
}

const PH_LABEL: Record<string, string>  = { Acidic: 'অম্লীয়', Normal: 'স্বাভাবিক', Alkaline: 'ক্ষারীয়' }
const PH_VALUE: Record<string, string>  = { Acidic: '5.5',    Normal: '6.5',       Alkaline: '7.8' }
const PH_COLOR: Record<string, string>  = { Acidic: 'text-orange-600', Normal: 'text-green-600', Alkaline: 'text-blue-600' }
const PEST_LABEL: Record<string, string> = { medium: 'মাঝারি', high: 'বেশি' }
const PEST_COLOR: Record<string, string> = { medium: 'text-amber-600', high: 'text-red-600' }

interface ProfileData {
  land_id:        string
  soil_ph?:       string | null
  pest_level?:    string | null
  water_color?:   string | null
  smoke_exposure?: string | null
}

interface RiskPlot {
  land_id:       string
  land_name:     string
  land_name_bn:  string | null
  chemical_name: string | null
  spray_expires: string | null
  risk_level:    string
}

interface Props {
  farmerId:         string
  farmerLat:        number | null
  farmerLng:        number | null
  windFromDeg:      number
  windSpeedKmh:     number
  hotspots:         HotspotOverview[]
  plots:            LandPlotOverview[]
  profileMap:       Record<string, ProfileData>
  completedLandIds: string[]
  totalBigha:       number
  activeSprays:     number
  communitySpray:   CommunitySprayPlot[]
  riskPlots:        RiskPlot[]
  waterSources:     WaterSource[]
}

export default function LandDigest({
  farmerId, farmerLat, farmerLng,
  windFromDeg, windSpeedKmh,
  hotspots, plots,
  profileMap, completedLandIds,
  totalBigha, activeSprays, riskPlots, communitySpray, waterSources,
}: Props) {
  const mapRef = useRef<OverviewMapHandle>(null)

  function flyTo(plot: LandPlotOverview) {
    mapRef.current?.flyToPlot(plot)
    document.getElementById('overview-map-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const stats = [
    { label: 'মোট জমি',       value: plots.length,          unit: 'টি',    color: '#3b82f6' },
    { label: 'মোট আয়তন',     value: totalBigha.toFixed(2), unit: 'বিঘা',  color: '#8b5cf6' },
    { label: 'সক্রিয় স্প্রে', value: activeSprays,          unit: 'জমিতে', color: '#ef4444' },
  ]

  return (
    <div className="space-y-4">

      {/* ── Overview Map ── */}
      <div id="overview-map-anchor">
        <OverviewMapDynamic
          ref={mapRef}
          farmerId={farmerId}
          farmerLat={farmerLat}
          farmerLng={farmerLng}
          windFromDeg={windFromDeg}
          windSpeedKmh={windSpeedKmh}
          hotspots={hotspots}
          plots={plots}
          communitySpray={communitySpray}
          waterSources={waterSources}
        />
      </div>

      {/* ── Land digest cards ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">জমির সারসংক্ষেপ</h2>
          <a href="?tab=land" className="text-xs text-green-600 font-medium hover:underline">সব জমি →</a>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: s.color }} />
              <div className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              <div className="text-xs text-gray-400">{s.unit}</div>
            </div>
          ))}
        </div>

        {/* Active spray warning list */}
        {riskPlots.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-800 mb-2">⚠️ সক্রিয় স্প্রে সতর্কতা</p>
            <div className="space-y-2">
              {riskPlots.map(p => (
                <div
                  key={p.land_id}
                  className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-amber-100"
                >
                  <div>
                    <span className="font-semibold text-gray-800">{p.land_name_bn || p.land_name}</span>
                    {p.chemical_name && <span className="text-gray-400 ml-2">{p.chemical_name}</span>}
                  </div>
                  <span className="text-amber-600 font-medium">
                    {p.spray_expires
                      ? new Date(p.spray_expires).toLocaleDateString('bn-BD')
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Land cards */}
        {plots.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plots.map(plot => {
              const prof      = profileMap[plot.land_id]
              const surveyed  = completedLandIds.includes(plot.land_id)
              const riskColor = ({ red: '#ef4444', yellow: '#f59e0b', green: '#22c55e' } as Record<string, string>)[plot.risk_level] ?? '#22c55e'
              const phStatus  = prof?.soil_ph

              return (
                <div key={plot.land_id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="h-1" style={{ background: riskColor }} />
                  <div className="p-4">

                    {/* Title row */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{plot.land_name_bn || plot.land_name}</p>
                        {plot.land_name_bn && <p className="text-xs text-gray-400">{plot.land_name}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => flyTo(plot)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 active:scale-95 transition-all"
                          title={`${plot.land_name_bn || plot.land_name} ম্যাপে দেখুন`}
                        >
                          🗺️ <span className="hidden sm:inline">দেখুন</span>
                        </button>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-medium text-gray-500">{plot.area_bigha?.toFixed(2)} বিঘা</span>
                          {surveyed
                            ? <span className="text-xs text-green-600 font-semibold">✓ সার্ভে</span>
                            : <span className="text-xs text-amber-600">⚠ সার্ভে নেই</span>}
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                      {plot.zone_id && (
                        <><span className="text-gray-400">zone</span><span className="font-mono text-gray-700">{plot.zone_id}</span></>
                      )}
                      {plot.crop_id && (
                        <><span className="text-gray-400">ফসল</span><span className="text-gray-700">{CROP_LABEL[plot.crop_id] ?? plot.crop_id}</span></>
                      )}
                      {phStatus && (
                        <><span className="text-gray-400">মাটির pH</span>
                        <span className={`font-semibold ${PH_COLOR[phStatus] ?? 'text-gray-700'}`}>
                          {PH_LABEL[phStatus] ?? phStatus} (~{PH_VALUE[phStatus]})
                        </span></>
                      )}
                      {prof?.pest_level && prof.pest_level !== 'Low' && (
                        <><span className="text-gray-400">পোকার চাপ</span>
                        <span className={`font-semibold ${PEST_COLOR[prof.pest_level.toLowerCase()] ?? 'text-gray-600'}`}>
                          {PEST_LABEL[prof.pest_level.toLowerCase()] ?? prof.pest_level}
                        </span></>
                      )}
                      {prof?.water_color && prof.water_color !== 'clear' && (
                        <><span className="text-gray-400">পানির রঙ</span>
                        <span className="text-amber-600 font-semibold">{prof.water_color}</span></>
                      )}
                      {prof?.smoke_exposure && (
                        <><span className="text-gray-400">ধোঁয়া</span><span className="text-red-600 font-semibold">সাম্প্রতিক</span></>
                      )}
                    </div>

                    {/* Spray badge */}
                    {plot.spray_active && plot.chemical_name && (
                      <div
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                        style={{ background: riskColor + '18', color: riskColor }}
                      >
                        🧪 {plot.chemical_name}
                        {plot.spray_expires && ` · মেয়াদ: ${new Date(plot.spray_expires).toLocaleDateString('bn-BD')}`}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-2xl mb-2">🗺️</p>
            <p className="text-sm font-medium text-gray-700 mb-1">কোনো জমি নথিভুক্ত নেই</p>
            <p className="text-xs text-gray-400 mb-3">জমি নিবন্ধন ট্যাবে গিয়ে আপনার জমির সীমানা আঁকুন।</p>
            <a
              href="?tab=land"
              className="inline-block px-4 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              ＋ জমি যোগ করুন
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
