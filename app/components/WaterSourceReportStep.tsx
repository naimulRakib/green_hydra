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
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError,   setGpsError]   = useState<string | null>(null)
  const [manualLat,  setManualLat]  = useState('')
  const [manualLng,  setManualLng]  = useState('')
  const [locMode,    setLocMode]    = useState<'map' | 'manual'>('map')

  const isTubewell  = waterType === 'tubewell'
  const hasLocation = isTubewell || (pickedLat && pickedLng)
  const canSubmit   = waterType && waterColor && hasLocation

  const handlePick = (lat: number, lng: number) => {
    setPickedLat(lat)
    setPickedLng(lng)
    setManualLat(lat.toFixed(6))
    setManualLng(lng.toFixed(6))
  }

  const handleLiveGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('আপনার ব্রাউজার GPS সমর্থন করে না।')
      return
    }
    setGpsLoading(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setPickedLat(latitude)
        setPickedLng(longitude)
        setManualLat(latitude.toFixed(6))
        setManualLng(longitude.toFixed(6))
        setGpsLoading(false)
      },
      () => {
        setGpsError('লোকেশন পাওয়া যায়নি। পারমিশন দিন বা ম্যানুয়ালি দিন।')
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const handleManualCoord = () => {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) {
      setGpsError('সঠিক কোঅর্ডিনেট দিন (যেমন: 23.8566, 90.2677)')
      return
    }
    if (lat < 20.5 || lat > 26.7 || lng < 87.9 || lng > 92.7) {
      setGpsError('অবস্থান বাংলাদেশের মধ্যে হতে হবে')
      return
    }
    setGpsError(null)
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

      {/* Location picker — visible whenever a water type is selected */}
      {waterType && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            📍 পানির উৎসের অবস্থান
          </p>

          {/* GPS + Manual row */}
          <div className="flex gap-2">
            {/* Live GPS button */}
            <button
              type="button"
              onClick={handleLiveGPS}
              disabled={gpsLoading}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold
                border transition-all flex-1
                ${ gpsLoading
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 cursor-wait'
                  : 'bg-blue-600/20 border-blue-500/40 text-blue-300 hover:bg-blue-600/30 active:scale-95'}`}
            >
              {gpsLoading ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : '📡'}
              {gpsLoading ? 'খুঁজছে...' : 'লাইভ লোকেশন'}
            </button>

            {/* Toggle manual mode */}
            <button
              type="button"
              onClick={() => setLocMode(m => m === 'map' ? 'manual' : 'map')}
              className="px-3 py-2 rounded-xl text-xs font-bold border
                bg-white/5 border-white/10 text-gray-400
                hover:border-white/20 hover:text-gray-200 transition-all"
            >
              {locMode === 'map' ? '⌨️ ম্যানুয়াল' : '🗺️ ম্যাপ'}
            </button>
          </div>

          {/* GPS error */}
          {gpsError && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              ⚠️ {gpsError}
            </p>
          )}

          {/* Manual coordinate input */}
          {locMode === 'manual' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">অক্ষাংশ (Latitude)</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="23.8566"
                    value={manualLat}
                    onChange={e => setManualLat(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                      text-xs text-white placeholder-gray-600
                      focus:border-blue-500/60 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">দ্রাঘিমাংশ (Longitude)</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="90.2677"
                    value={manualLng}
                    onChange={e => setManualLng(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                      text-xs text-white placeholder-gray-600
                      focus:border-blue-500/60 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleManualCoord}
                className="w-full py-2 rounded-xl text-xs font-bold
                  bg-green-600/20 border border-green-500/40 text-green-300
                  hover:bg-green-600/30 transition-all active:scale-95"
              >
                ✅ এই কোঅর্ডিনেট সেট করুন
              </button>
            </div>
          )}

          {/* Confirmed location badge */}
          {pickedLat && pickedLng && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20
              rounded-xl px-3 py-2 text-xs text-green-300">
              <span>📌</span>
              <span className="font-mono">
                {pickedLat.toFixed(5)}°N, {pickedLng.toFixed(5)}°E
              </span>
              <span className="ml-auto text-green-400 font-bold">✓ সেট</span>
            </div>
          )}

          {/* Map picker — shown when in map mode and not tubewell */}
          {locMode === 'map' && !isTubewell && (
            <WaterSourcePicker
              defaultLat={pickedLat ?? farmerLat}
              defaultLng={pickedLng ?? farmerLng}
              onPick={handlePick}
              pickedLat={pickedLat}
              pickedLng={pickedLng}
            />
          )}
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
