'use client'

import { useState, useTransition } from 'react'
import { markWaterAlertRead } from '@/app/actions/waterActions'
import { WATER_TYPE_CONFIG } from '@/app/types/water'
import type { WaterAlert } from '@/app/types/water'

interface Props {
  alerts:   WaterAlert[]
  farmerId: string
}

export default function WaterAlertBanner({ alerts, farmerId }: Props) {
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set())
  const [expanded,  setExpanded]    = useState<string | null>(null)
  const [, startTransition]         = useTransition()

  const visible = alerts.filter(a => !dismissed.has(a.event_id))

  if (visible.length === 0) return null

  const handleDismiss = (eventId: string) => {
    setDismissed(prev => new Set([...prev, eventId]))
    startTransition(() => {
      markWaterAlertRead(farmerId, eventId)
    })
  }

  const severityOrder: Record<string, number> = {
    critical: 0, high: 1, moderate: 2, low: 3
  }
  const sorted = [...visible].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  )

  return (
    <div className="space-y-3 mb-6">
      {/* Section label */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-red-400 uppercase tracking-widest">
          🌊 পানির দূষণ সতর্কতা
        </span>
        <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
          {visible.length}
        </span>
      </div>

      {sorted.map(alert => {
        const isCritical  = alert.severity === 'critical'
        const isHigh      = alert.severity === 'high'
        const isExpanded  = expanded === alert.event_id
        const typeInfo    = WATER_TYPE_CONFIG[alert.source_type]
        const distanceKm  = (alert.distance_m / 1000).toFixed(1)
        const complaintData = encodeURIComponent(JSON.stringify({
          farmerId,
          alert: {
            event_id: alert.event_id,
            source_name_bn: alert.source_name_bn,
            source_type: alert.source_type,
            severity: alert.severity,
            distance_m: alert.distance_m,
            alert_message_bn: alert.alert_message_bn,
            factory_name_bn: alert.factory_name_bn,
            water_color: alert.water_color,
            fish_kill: alert.fish_kill,
            farmer_count: alert.farmer_count,
            reported_at: alert.reported_at,
          },
        }))

        return (
          <div
            key={alert.event_id}
            className={`relative rounded-2xl border overflow-hidden transition-all duration-300
              ${isCritical
                ? 'border-red-500/50 bg-red-950/40'
                : isHigh
                ? 'border-orange-500/40 bg-orange-950/30'
                : 'border-yellow-500/30 bg-yellow-950/20'
              }`}
          >
            {/* Animated left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1
              ${isCritical ? 'bg-red-500 animate-pulse'
              : isHigh     ? 'bg-orange-500'
              :              'bg-yellow-500'}`}
            />

            <div className="pl-4 pr-4 pt-4 pb-3">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Icon */}
                  <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center
                    justify-center text-xl border
                    ${isCritical
                      ? 'bg-red-500/20 border-red-500/30'
                      : 'bg-orange-500/20 border-orange-500/30'}`}
                  >
                    {isCritical ? '🚨' : '⚠️'}
                  </div>

                  <div className="min-w-0">
                    {/* Source name + type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-white">
                        {typeInfo.emoji} {alert.source_name_bn ?? typeInfo.label_bn}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold
                        ${isCritical
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'}`}
                      >
                        {isCritical ? 'বিপজ্জনক' : 'সতর্কতা'}
                      </span>
                    </div>

                    {/* Alert message */}
                    <p className={`text-xs mt-1 leading-relaxed
                      ${isCritical ? 'text-red-200' : 'text-orange-200'}`}
                    >
                      {alert.alert_message_bn}
                    </p>
                  </div>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => handleDismiss(alert.event_id)}
                  className="shrink-0 text-gray-600 hover:text-gray-400
                             transition-colors text-lg leading-none mt-0.5"
                  title="বন্ধ করুন"
                >
                  ×
                </button>
              </div>

              {/* Stats row */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  {
                    label: 'রিপোর্টকারী',
                    value: `${alert.farmer_count} জন`,
                    icon:  '👥',
                  },
                  {
                    label: 'দূরত্ব',
                    value: `${distanceKm} কিমি`,
                    icon:  '📍',
                  },
                  {
                    label: 'মরা মাছ',
                    value: alert.fish_kill ? '✅ হ্যাঁ' : '❌ না',
                    icon:  '🐟',
                  },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className="bg-black/30 rounded-xl p-2 text-center border border-white/5"
                  >
                    <div className="text-sm font-bold text-white">{stat.value}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Expand toggle */}
              <button
                onClick={() => setExpanded(isExpanded ? null : alert.event_id)}
                className="mt-2 text-[10px] text-gray-500 hover:text-gray-300
                           transition-colors flex items-center gap-1"
              >
                {isExpanded ? '▲ কম দেখুন' : '▼ বিস্তারিত দেখুন'}
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-3 space-y-2 border-t border-white/5 pt-3
                                animate-in fade-in slide-in-from-top-2 duration-200">
                  {alert.factory_name_bn && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>🏭</span>
                      <span>সম্ভাব্য উৎস: <span className="text-orange-300 font-medium">
                        {alert.factory_name_bn}
                      </span></span>
                    </div>
                  )}
                  {alert.water_color && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>🎨</span>
                      <span>পানির রঙ: <span className="text-white font-medium">
                        {alert.water_color}
                      </span></span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>📅</span>
                    <span>রিপোর্ট করা হয়েছে:{' '}
                      <span className="text-white font-medium">
                        {new Date(alert.reported_at).toLocaleDateString('bn-BD')}
                      </span>
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <a
                      href="tel:16100"
                      className="flex-1 min-w-[120px] text-center py-2 text-xs font-bold
                                 bg-red-600 text-white rounded-xl
                                 hover:bg-red-500 transition active:scale-95"
                    >
                      📞 DoE: 16100
                    </a>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        alert.alert_message_bn + ' — AgroSentinel'
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[120px] text-center py-2 text-xs font-bold
                                 bg-green-700 text-white rounded-xl
                                 hover:bg-green-600 transition active:scale-95"
                    >
                      📲 শেয়ার করুন
                    </a>
                    <a
                      href={`/doe-complaint?data=${complaintData}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[120px] text-center py-2 text-xs font-bold
                                 bg-slate-800 text-white rounded-xl
                                 hover:bg-slate-700 transition active:scale-95"
                    >
                      🧾 অভিযোগ পিডিএফ
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
