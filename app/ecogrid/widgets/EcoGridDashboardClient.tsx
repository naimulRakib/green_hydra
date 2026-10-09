'use client'

import dynamic from 'next/dynamic'
import type { WorkerOrder, ZoneRiskFeature } from '@/lib/ecogrid/riskEngine'

const EcoGridMapClient = dynamic(() => import('./EcoGridMapClient'), {
  ssr: false,
  loading: () => (
    <div className="h-[48vh] min-h-[360px] rounded-2xl border border-[#0D7377]/20 bg-white flex items-center justify-center">
      <p className="text-sm text-gray-500">ম্যাপ লোড হচ্ছে... (Loading map...)</p>
    </div>
  ),
})

interface Props {
  zones: ZoneRiskFeature[]
  ranking: ZoneRiskFeature[]
  workerOrders: WorkerOrder[]
  populationHeatPoints: Array<{ lat: number; lng: number; intensity: number }>
}

function RiskBadge({ level }: { level: ZoneRiskFeature['risk_level'] }) {
  const config =
    level === 'danger'
      ? 'bg-red-100 text-red-700 border-red-200'
      : level === 'moderate'
        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
        : 'bg-green-100 text-green-700 border-green-200'
  const label = level === 'danger' ? 'Danger' : level === 'moderate' ? 'Moderate' : 'Safe'
  return <span className={`text-xs px-2 py-1 rounded-full border font-semibold ${config}`}>{label}</span>
}

export default function EcoGridDashboardClient({ zones, ranking, workerOrders, populationHeatPoints }: Props) {
  return (
    <main className="min-h-screen bg-[#F5F5F5] px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <section className="bg-white rounded-2xl border border-[#0D7377]/15 p-4 sm:p-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0D7377]">EcoGrid OS — Dhaka Smart Mapping Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            রিয়েল-টাইম জোন রিস্ক, জনঘনত্ব হিট, এবং কর্পোরেশন ওয়ার্ক অর্ডার একই স্ক্রিনে।
            {' '}
            (Real-time zone risk, population heat, and worker priorities in one view.)
          </p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white rounded-2xl border border-[#0D7377]/15 overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-[#1A1A2E]">Smart City Risk Map</h2>
              <span className="text-xs text-gray-500">Leaflet + OSM + GeoJSON</span>
            </div>
            <EcoGridMapClient zones={zones} heatPoints={populationHeatPoints} workerOrders={workerOrders} />
          </div>

          <div className="bg-white rounded-2xl border border-[#0D7377]/15 p-3 sm:p-4">
            <h3 className="font-bold text-[#1A1A2E] mb-3">Top 10 Risk Zones</h3>
            <div className="space-y-2 max-h-[48vh] overflow-auto pr-1">
              {ranking.slice(0, 10).map((zone, index) => (
                <div key={zone.zone_id} className="border border-gray-100 rounded-xl p-3 bg-[#F5F5F5]/60">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#1A1A2E]">
                      #{index + 1} {zone.zone_name_bn}
                    </p>
                    <RiskBadge level={zone.risk_level} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{zone.zone_name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <p>Risk: <span className="font-bold text-[#0D7377]">{zone.risk_score}</span></p>
                    <p>AQI: <span className="font-semibold">{zone.latest_aqi}</span></p>
                    <p>Waste/7d: <span className="font-semibold">{zone.waste_reports_7d}</span></p>
                    <p>Waterlog: <span className="font-semibold">{zone.waterlog_events_30d}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-[#0D7377]/15 p-4">
          <h3 className="font-bold text-[#1A1A2E] mb-3">Corporation Worker Priorities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workerOrders.map((order) => (
              <article key={order.zone_id} className="rounded-xl border border-gray-200 p-3 bg-white">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#1A1A2E]">{order.zone_name_bn}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${order.priority === 'P1' ? 'bg-red-100 text-red-700' : order.priority === 'P2' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{order.priority}</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{order.reason}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Nav: {order.nav_target.lat.toFixed(4)}, {order.nav_target.lng.toFixed(4)}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
