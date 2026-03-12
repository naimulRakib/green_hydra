'use client'

import { useState, useCallback } from 'react'
import { updateLocationManual } from '../actions/location'

interface Zone { id: string; name: string; lat: number; lng: number }

const ZONES: Zone[] = [
  { id: 'dhaka-savar',           name: 'সাভার উপজেলা',      lat: 23.8575, lng: 90.2700 },
  { id: 'cumilla-burichang',     name: 'বুড়িচং উপজেলা',     lat: 23.5200, lng: 91.1150 },
  { id: 'dhaka-keraniganj',      name: 'কেরানীগঞ্জ উপজেলা',  lat: 23.7100, lng: 90.2400 },
  { id: 'narayanganj-sonargaon', name: 'সোনারগাঁও উপজেলা',   lat: 23.6560, lng: 90.6100 },
]

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestZone(lat: number, lng: number): Zone {
  return ZONES.reduce((best, z) =>
    haversineKm(lat, lng, z.lat, z.lng) < haversineKm(lat, lng, best.lat, best.lng) ? z : best
  , ZONES[0])
}

interface Props {
  currentLat:  string
  currentLng:  string
  currentZone: string
}

export default function LocationUpdater({ currentLat, currentLng, currentZone }: Props) {
  const [lat,     setLat]     = useState(currentLat)
  const [lng,     setLng]     = useState(currentLng)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    const numLat = parseFloat(lat)
    const numLng = parseFloat(lng)

    if (isNaN(numLat) || isNaN(numLng)) {
      setResult({ ok: false, msg: 'সঠিক Latitude এবং Longitude দিন।' })
      return
    }

    // Bangladesh bounding box check (client-side fast feedback)
    if (numLat < 20.5 || numLat > 26.7 || numLng < 87.9 || numLng > 92.7) {
      setResult({ ok: false, msg: 'বাংলাদেশের ভেতরের স্থানাঙ্ক দিন (Lat: 20-27, Lng: 88-93)।' })
      return
    }

    setLoading(true)
    setResult(null)

    const zone = nearestZone(numLat, numLng)

    try {
      await updateLocationManual(numLat, numLng, zone.id)
      setResult({ ok: true, msg: `${zone.name} জোনে আপডেট হয়েছে।` })
    } catch (err: any) {
      setResult({ ok: false, msg: err.message ?? 'আপডেট করতে সমস্যা হয়েছে।' })
    } finally {
      setLoading(false)
    }
  }, [lat, lng, loading])

  const zoneLabel = ZONES.find(z => z.id === currentZone)?.name ?? currentZone ?? 'নির্ধারিত নয়'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">ম্যানুয়াল লোকেশন</p>
          <p className="text-xs text-gray-400">
            বর্তমান জোন:{' '}
            <span className="text-green-600 font-medium">{zoneLabel}</span>
          </p>
        </div>
      </div>

      {/* BUG FIX: LocationUpdater used <form> with action prop, which conflicts
          with Next.js server actions. Using onSubmit with e.preventDefault() is
          the correct pattern for client-side form handling. */}
      <form onSubmit={handleUpdate} noValidate className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <label htmlFor="loc-lat" className="block text-xs font-medium text-gray-500 mb-1">Latitude</label>
          <input
            id="loc-lat"
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={e => setLat(e.target.value)}
            placeholder="23.5200"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="loc-lng" className="block text-xs font-medium text-gray-500 mb-1">Longitude</label>
          <input
            id="loc-lng"
            type="text"
            inputMode="decimal"
            value={lng}
            onChange={e => setLng(e.target.value)}
            placeholder="91.1150"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className={[
            'px-5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap',
            loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-800 text-white hover:bg-gray-900 shadow-sm hover:shadow-md active:scale-[0.98]',
          ].join(' ')}
        >
          {loading ? 'আপডেট...' : 'পরিবর্তন করুন'}
        </button>
      </form>

      {result && (
        <p className={`mt-3 text-xs font-medium px-1 ${result.ok ? 'text-green-600' : 'text-red-500'}`}>
          {result.ok ? '✓ ' : '✕ '}{result.msg}
        </p>
      )}
    </div>
  )
}