'use client'

import { useState } from 'react'
import { saveFarmerLocation } from '../actions/onboarding'

const ZONES = [
  { id: 'dhaka-savar',           name: 'সাভার উপজেলা',       lat: 23.8575, lng: 90.2700 },
  { id: 'cumilla-burichang',     name: 'বুড়িচং উপজেলা',      lat: 23.5200, lng: 91.1150 },
  { id: 'dhaka-keraniganj',      name: 'কেরানীগঞ্জ উপজেলা',   lat: 23.7100, lng: 90.2400 },
  { id: 'narayanganj-sonargaon', name: 'সোনারগাঁও উপজেলা',    lat: 23.6560, lng: 90.6100 },
]

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestZone(lat: number, lng: number) {
  return ZONES.reduce((best, z) =>
    haversineKm(lat, lng, z.lat, z.lng) < haversineKm(lat, lng, best.lat, best.lng) ? z : best
  , ZONES[0])
}

function isValidBDCoord(lat: number, lng: number) {
  return lat >= 20.5 && lat <= 26.7 && lng >= 87.9 && lng <= 92.7
}

type Status = 'idle' | 'locating' | 'matching' | 'saving' | 'error'

export default function OnboardingPage() {
  const [status, setStatus]     = useState<Status>('idle')
  const [zoneName, setZoneName] = useState('')
  const [error, setError]       = useState('')
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [manualLoading, setManualLoading] = useState(false)

  const statusMessages: Record<Status, string> = {
    idle:     'স্বয়ংক্রিয়ভাবে অবস্থান নির্ণয় করুন',
    locating: 'আপনার অবস্থান খোঁজা হচ্ছে...',
    matching: 'নিকটবর্তী এগ্রো-জোন মেলানো হচ্ছে...',
    saving:   `${zoneName} জোনে যুক্ত করা হচ্ছে...`,
    error:    error,
  }

  const handleDetect = () => {
    setError('')
    setStatus('locating')

    if (!navigator.geolocation) {
      setError('আপনার ব্রাউজার GPS সাপোর্ট করে না।')
      setStatus('error')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords
        setStatus('matching')

        const zone = nearestZone(lat, lng)

        setZoneName(zone.name)
        setStatus('saving')

        try {
          localStorage.setItem('farmer_location', JSON.stringify({ lat, lng }))
          await saveFarmerLocation(lat, lng, zone.id)
          // redirect happens inside saveFarmerLocation
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : ''
          setError(msg || 'সার্ভারে সেভ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।')
          setStatus('error')
        }
      },
      () => {
        setError('দয়া করে GPS (Location) পারমিশন দিন এবং আবার চেষ্টা করুন।')
        setStatus('error')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleManualSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (manualLoading || isLoading) return

    setError('')

    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)

    if (!isFinite(lat) || !isFinite(lng)) {
      setError('সঠিক Latitude এবং Longitude দিন।')
      setStatus('error')
      return
    }

    if (!isValidBDCoord(lat, lng)) {
      setError('বাংলাদেশের ভেতরের স্থানাঙ্ক দিন (Lat: 20.5-26.7, Lng: 87.9-92.7)।')
      setStatus('error')
      return
    }

    const zone = nearestZone(lat, lng)
    setZoneName(zone.name)
    setStatus('saving')
    setManualLoading(true)

    try {
      localStorage.setItem('farmer_location', JSON.stringify({ lat, lng }))
      await saveFarmerLocation(lat, lng, zone.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg || 'সার্ভারে সেভ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।')
      setStatus('error')
    } finally {
      setManualLoading(false)
    }
  }

  const isLoading = ['locating', 'matching', 'saving'].includes(status)

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-4 bg-[#f7f9f5]">
      <div className="w-full max-w-sm">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">

          {/* Icon */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-all duration-300 ${
            isLoading ? 'bg-green-100' : status === 'error' ? 'bg-red-50' : 'bg-green-600 shadow-md'
          }`}>
            {isLoading ? (
              <svg className="w-7 h-7 text-green-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : status === 'error' ? (
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">এলাকা নির্ধারণ</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            আপনার ফসলের সঠিক সমাধান দিতে আমাদের আপনার জমির অবস্থানটি প্রয়োজন।
          </p>

          {/* Progress steps */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {(['locating', 'matching', 'saving'] as Status[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                  status === s ? 'bg-green-600 scale-125' :
                  (['matching', 'saving'].includes(status) && i === 0) ||
                  (status === 'saving' && i <= 1)
                    ? 'bg-green-400' : 'bg-gray-200'
                }`} />
                {i < 2 && <div className={`w-6 h-px ${
                  (status === 'matching' && i === 0) || status === 'saving'
                    ? 'bg-green-400' : 'bg-gray-200'
                }`} />}
              </div>
            ))}
          </div>

          {status === 'error' && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleDetect}
            disabled={isLoading || manualLoading}
            className={`w-full font-semibold rounded-xl py-3 text-sm transition-all ${
              isLoading || manualLoading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow-md active:scale-[0.98]'
            }`}
          >
            {isLoading ? statusMessages[status] : status === 'error' ? 'আবার চেষ্টা করুন' : statusMessages.idle}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-xs text-gray-400">অথবা ম্যানুয়ালি দিন</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-3 text-left">
            <div>
              <label htmlFor="manual-lat" className="block text-xs font-semibold text-gray-600 mb-1.5">
                Latitude
              </label>
              <input
                id="manual-lat"
                type="text"
                inputMode="decimal"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="23.5200"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 transition-all placeholder:text-gray-300 font-mono"
              />
            </div>

            <div>
              <label htmlFor="manual-lng" className="block text-xs font-semibold text-gray-600 mb-1.5">
                Longitude
              </label>
              <input
                id="manual-lng"
                type="text"
                inputMode="decimal"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="91.1150"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 transition-all placeholder:text-gray-300 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={manualLoading || isLoading}
              className={`w-full font-semibold rounded-xl py-2.5 text-sm transition-all ${
                manualLoading || isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-800 text-white hover:bg-gray-900 shadow-sm hover:shadow-md active:scale-[0.98]'
              }`}
            >
              {manualLoading ? 'সেভ হচ্ছে...' : 'ম্যানুয়ালি সেভ করুন'}
            </button>
          </form>

          <p className="text-xs text-gray-400 mt-4">
            আপনার লোকেশন শুধুমাত্র ফসল বিশ্লেষণের জন্য ব্যবহার করা হবে।
          </p>
        </div>
      </div>
    </div>
  )
}
