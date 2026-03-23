'use client'

import { useState, useCallback } from 'react'

type State = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  // action is a server action passed from the parent — allows this component
  // to stay generic without knowing which server action to call directly.
  action: () => Promise<{ success: boolean; message: string }>
  satelliteAction?: () => Promise<{ success: boolean; error?: string }>
}

export default function RefreshWeatherButton({ action, satelliteAction }: Props) {
  const [state,  setState]  = useState<State>('idle')
  const [errMsg, setErrMsg] = useState('')

  const handleRefresh = useCallback(async () => {
    if (state === 'loading') return
    setState('loading')
    setErrMsg('')

    try {
      type ActionResult = { success: boolean; message?: string; error?: string }

      const promises: Array<Promise<ActionResult>> = [action()]
      if (satelliteAction) promises.push(satelliteAction() as Promise<ActionResult>)

      const results = await Promise.all(promises)

      // Check if the primary weather action failed
      const primary = results[0]
      if (!primary.success) {
        throw new Error(primary.message ?? 'আবহাওয়া আপডেট করতে সমস্যা হয়েছে')
      }

      setState('success')
      setTimeout(() => setState('idle'), 2500)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setErrMsg(message || 'আবহাওয়া আপডেট করতে সমস্যা হয়েছে')
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }, [action, satelliteAction, state])

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefresh}
        disabled={state === 'loading'}
        aria-label="আবহাওয়া রিফ্রেশ করুন"
        className={[
          'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm',
          state === 'success' ? 'bg-green-100 text-green-700 border border-green-200' :
          state === 'error'   ? 'bg-red-50 text-red-600 border border-red-200' :
          state === 'loading' ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' :
                                'bg-green-600 text-white hover:bg-green-700 border border-transparent hover:shadow-md',
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        )}
        {state === 'loading' ? 'আপডেট হচ্ছে...' :
         state === 'success' ? 'আপডেট হয়েছে' :
         'আবহাওয়া রিফ্রেশ'}
      </button>

      {state === 'error' && errMsg && (
        <p className="text-xs text-red-500 px-1">{errMsg}</p>
      )}
    </div>
  )
}