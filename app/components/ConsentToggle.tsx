'use client'

import { useState } from 'react'
import { createClient } from '../utils/supabase/client'

export default function ConsentToggle({ farmerId, initialConsent }: { farmerId: string, initialConsent?: boolean }) {
  const [consent, setConsent] = useState(!!initialConsent)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleToggle = async () => {
    setLoading(true)
    const newConsent = !consent
    const { error } = await supabase
      .from('farmers')
      .update({ data_sharing_consent: newConsent })
      .eq('id', farmerId)

    if (!error) {
      setConsent(newConsent)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`w-10 h-5 rounded-full relative transition-colors duration-200 focus:outline-none ${consent ? 'bg-green-500' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${consent ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
      <span className="text-xs text-gray-500 font-medium">
        {consent ? 'ডেটা শেয়ারিং চালু আছে 🌍' : 'ডেটা শেয়ারিং বন্ধ 🔒'}
      </span>
      {loading && <span className="w-3 h-3 ml-2 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></span>}
    </div>
  )
}
