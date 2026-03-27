'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '../utils/supabase/client'

type ExposurePoint = {
  ts: string
  wind_from_deg: number
  wind_speed_kmh: number
  toward_land_factory_count: number
  in_exposure: boolean
  so2_proxy: number
  black_plume_proxy: number
}

type ExposureResponse = {
  land_id: string
  land_name_bn: string
  wind_toward_land_hours_24h: number
  wind_toward_land_hours_7d: number
  so2_proxy_24h: number
  so2_proxy_7d: number
  black_plume_proxy_24h: number
  black_plume_proxy_7d: number
  source_factory: string
  source_factory_hours_7d: number
  confidence: number
  timeline: ExposurePoint[]
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '0'
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

export default function AirExposureCard({ landId }: { landId: string }) {
  const [data, setData] = useState<ExposureResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: authSession } = await supabase.auth.getSession()
        const accessToken = authSession.session?.access_token
        const response = await fetch(`/api/air-exposure-timeline?land_id=${encodeURIComponent(landId)}`, {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        })
        const body = (await response.json()) as ExposureResponse | { error?: string }
        if (!response.ok) {
          throw new Error((body as { error?: string }).error ?? 'Failed to load exposure timeline')
        }
        if (mounted) setData(body as ExposureResponse)
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load exposure timeline')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    run()
    return () => {
      mounted = false
    }
  }, [landId])

  const trend = useMemo(() => {
    if (!data || data.timeline.length === 0) return 'low'
    const last24 = data.timeline.slice(-24).reduce((s, p) => s + p.so2_proxy + p.black_plume_proxy, 0)
    const prev24 = data.timeline.slice(-48, -24).reduce((s, p) => s + p.so2_proxy + p.black_plume_proxy, 0)
    if (last24 > prev24 * 1.15) return 'up'
    if (last24 < prev24 * 0.85) return 'down'
    return 'flat'
  }, [data])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-sm text-gray-500">SO2/Plume exposure loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
        <p className="text-sm text-red-700">Exposure data unavailable: {error}</p>
      </div>
    )
  }

  if (!data) return null

  const confidencePct = Math.round(data.confidence * 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-gray-900">🌬️ Air Exposure Timeline</h4>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          confidence {confidencePct}%
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
          <p className="text-xs text-gray-500">Wind toward land</p>
          <p className="text-xl font-bold text-gray-900">{data.wind_toward_land_hours_24h}h</p>
          <p className="text-xs text-gray-400">24h · 7d: {data.wind_toward_land_hours_7d}h</p>
        </div>

        <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
          <p className="text-xs text-gray-500">SO2 proxy</p>
          <p className="text-xl font-bold text-gray-900">{fmtNum(data.so2_proxy_24h)}</p>
          <p className="text-xs text-gray-400">24h · 7d: {fmtNum(data.so2_proxy_7d)}</p>
        </div>

        <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
          <p className="text-xs text-gray-500">Black plume proxy</p>
          <p className="text-xl font-bold text-gray-900">{fmtNum(data.black_plume_proxy_24h)}</p>
          <p className="text-xs text-gray-400">24h · 7d: {fmtNum(data.black_plume_proxy_7d)}</p>
        </div>

        <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
          <p className="text-xs text-gray-500">Source factory</p>
          <p className="text-sm font-bold text-gray-900 truncate">{data.source_factory}</p>
          <p className="text-xs text-gray-400">toward hours: {data.source_factory_hours_7d}</p>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Trend: {trend === 'up' ? '⬆ increasing' : trend === 'down' ? '⬇ decreasing' : trend === 'flat' ? '➡ stable' : 'low'}
      </p>
    </div>
  )
}

