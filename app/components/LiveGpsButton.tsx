'use client'

import { useState } from 'react'
// BUG FIX: was importing non-existent 'syncLiveGPSAndWeather' — now correct
import { syncLiveGPSAndWeather } from '../actions/weather'

type State = 'idle' | 'loading' | 'success' | 'error'

export default function LiveGpsButton() {
  const [state,   setState]   = useState<State>('idle')
  const [message, setMessage] = useState('')

  const handleSync = () => {
    if (state === 'loading') return
    setState('loading')
    setMessage('')

    if (!navigator.geolocation) {
      setMessage('আপনার ব্রাউজার GPS সাপোর্ট করে না।')
      setState('error')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await syncLiveGPSAndWeather(
            pos.coords.latitude,
            pos.coords.longitude
          )
          setMessage(`${result.zoneName}-এ আপডেট হয়েছে`)
          setState('success')
          setTimeout(() => setState('idle'), 3000)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : undefined
          setMessage(msg ?? 'সার্ভারে সমস্যা হয়েছে')
          setState('error')
          setTimeout(() => setState('idle'), 4000)
        }
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED    ? 'GPS পারমিশন দিন।' :
          err.code === err.POSITION_UNAVAILABLE ? 'GPS সিগনাল পাওয়া যাচ্ছে না।' :
          err.code === err.TIMEOUT              ? 'GPS সময়সীমা শেষ — আবার চেষ্টা করুন।' :
          'GPS সমস্যা হয়েছে।'
        setMessage(msg)
        setState('error')
        setTimeout(() => setState('idle'), 4000)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={state === 'loading'}
        aria-label="লাইভ GPS অবস্থান আপডেট করুন"
        className={[
          'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm',
          state === 'success' ? 'bg-green-100 text-green-700 border border-green-200' :
          state === 'error'   ? 'bg-red-50 text-red-600 border border-red-200' :
          state === 'loading' ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' :
                                'bg-white text-gray-700 hover:bg-green-50 hover:text-green-700 border border-gray-200 hover:border-green-300 hover:shadow-md',
        ].join(' ')}
      >
        {state === 'loading' ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : state === 'success' ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        )}
        {state === 'loading' ? 'লোকেশন নেওয়া হচ্ছে...' :
         state === 'success' ? 'আপডেট সফল' :
         'লাইভ GPS'}
      </button>
      {message && (
        <p className={`text-xs px-1 ${state === 'error' ? 'text-red-500' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </div>
  )
}