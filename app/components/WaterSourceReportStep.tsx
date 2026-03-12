'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { reportWaterSource } from '@/app/actions/waterActions'
import {
  COLOR_OPTIONS,
  WATER_TYPE_CONFIG,
} from '@/app/types/water'
import type { WaterSourceType, WaterColor } from '@/app/types/water'

// Dynamically import map to avoid SSR issues
const WaterSourcePicker = dynamic(
  () => import('./WaterSourcePicker'),
  { ssr: false }
)

interface Props {
  landId:     string
  farmerLat:  number
  farmerLng:  number
  onComplete: (sourceId: string) => void
  onSkip:     () => void
}

export default function WaterSourceReportStep({
  landId,
  farmerLat,
  farmerLng,
  onComplete,
  onSkip,
}: Props) {
  const [waterType,  setWaterType]  = useState<WaterSourceType | null>(null)
  const [waterColor, setWaterColor] = useState<WaterColor | null>(null)
  const [hasOdor,    setHasOdor]    = useState(false)
  const [fishKill,   setFishKill]   = useState(false)
  const [pickedLat,  setPickedLat]  = useState<number | null>(null)
  const [pickedLng,  setPickedLng]  = useState<number | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const isTubewell  = waterType === 'tubewell'
  const needsMap    = waterType && !isTubewell
  const hasLocation = isTubewell || (pickedLat && pickedLng)
  const canSubmit   = waterType && waterColor && hasLocation

  const handlePick = (lat: number, lng: number) => {
    setPickedLat(lat)
    setPickedLng(lng)
  }

  const handleSubmit = async () => {
    if (!canSubmit || !waterType || !waterColor) return
    setLoading(true)
    setError(null)

    try {
      const result = await reportWaterSource({
        land_id:   landId,
        lat:       pickedLat ?? farmerLat,
        lng:       pickedLng ?? farmerLng,
        type:      waterType,
        color:     waterColor,
        odor:      hasOdor,
        fish_kill: fishKill,
      })

      if (result.success && result.source_id) {
        onComplete(result.source_id)
      } else {
        setError(result.error ?? 'অজানা সমস্যা')
      }
    } catch {
      setError('সংযোগ সমস্যা। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h3 className="text-sm font-bold text-white">
          💧 পানির উৎস চিহ্নিত করুন
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          এই জমিতে সেচের পানি কোথা থেকে আসে?
        </p>
      </div>

      {/* Water type selection */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
          পানির ধরন বেছে নিন
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(WATER_TYPE_CONFIG) as WaterSourceType[]).map(type => {
            const cfg = WATER_TYPE_CONFIG[type]
            return (
              <button
                key={type}
                onClick={() => { setWaterType(type); setPickedLat(null); setPickedLng(null) }}
                className={`p-3 rounded-xl border-2 text-center transition-all
                  ${waterType === type
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'}`}
              >
                <div className="text-xl">{cfg.emoji}</div>
                <div className="text-[10px] font-semibold text-gray-300 mt-1">
                  {cfg.label_bn}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Map picker — not for tubewell */}
      {needsMap && (
        <WaterSourcePicker
          defaultLat={farmerLat}
          defaultLng={farmerLng}
          onPick={handlePick}
          pickedLat={pickedLat}
          pickedLng={pickedLng}
        />
      )}

      {/* Tubewell note */}
      {isTubewell && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl
                        p-3 text-xs text-blue-300">
          💧 নলকূপের জন্য আপনার বর্তমান অবস্থান ব্যবহার করা হবে।
        </div>
      )}

      {/* Water color */}
      {waterType && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
            এই পানির বর্তমান রঙ কেমন?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {COLOR_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setWaterColor(opt.value)}
                className={`p-2.5 rounded-xl border text-xs text-left transition-all
                  ${waterColor === opt.value
                    ? opt.is_danger
                      ? 'border-red-500 bg-red-500/10 font-bold text-red-300'
                      : 'border-blue-500 bg-blue-500/10 font-bold text-blue-300'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'}`}
              >
                {opt.label_bn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Odor + fish kill */}
      {waterType && (
        <div className="space-y-2">
          {/* Odor */}
          <div className="flex items-center justify-between
                          bg-white/5 rounded-xl p-3 border border-white/10">
            <p className="text-xs text-gray-300">পানিতে দুর্গন্ধ আছে?</p>
            <div className="flex gap-2">
              {['হ্যাঁ', 'না'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setHasOdor(opt === 'হ্যাঁ')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${hasOdor === (opt === 'হ্যাঁ')
                      ? 'bg-amber-600 text-white'
                      : 'bg-white/10 text-gray-400 hover:bg-white/15'}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Fish kill */}
          <div className={`flex items-center justify-between rounded-xl p-3 border
            transition-all
            ${fishKill
              ? 'bg-red-500/10 border-red-500/40'
              : 'bg-white/5 border-white/10'}`}
          >
            <p className={`text-xs font-medium
              ${fishKill ? 'text-red-300' : 'text-gray-300'}`}
            >
              🐟 কাছে মরা মাছ দেখেছেন?
            </p>
            <div className="flex gap-2">
              {['হ্যাঁ', 'না'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setFishKill(opt === 'হ্যাঁ')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${fishKill === (opt === 'হ্যাঁ')
                      ? 'bg-red-600 text-white'
                      : 'bg-white/10 text-gray-400 hover:bg-white/15'}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fish kill warning */}
      {fishKill && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl
                        p-3 text-xs text-red-300 animate-in fade-in duration-200">
          ⚠️ মরা মাছের রিপোর্ট মারাত্মক দূষণের ইঙ্গিত।
          এই পানি ব্যবহার করবেন না। কাছের কৃষকদেরও সতর্ক করুন।
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20
                      rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 rounded-xl border border-white/10
                     text-xs font-bold text-gray-500
                     hover:text-gray-300 hover:border-white/20 transition-all"
        >
          এখন না
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="flex-1 py-3 rounded-xl text-xs font-bold transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed
                     bg-gradient-to-r from-blue-600 to-cyan-600
                     text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.4)]
                     active:scale-95"
        >
          {loading ? 'সংরক্ষণ হচ্ছে...' : '💧 রিপোর্ট করুন'}
        </button>
      </div>
    </div>
  )
}
