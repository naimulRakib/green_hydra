'use client'
/**
 * MapWrappers — thin dynamic wrappers for Leaflet-based maps.
 * Leaflet is browser-only (uses `window`), so all map imports must be
 * lazy-loaded with ssr:false. Components here simply add the SSR guard.
 */

import dynamic from 'next/dynamic'
import type { Hotspot } from './ImpactMap'
import type { SatelliteWaterData } from '../actions/industrial'

const ImpactMapDynamic = dynamic(() => import('./ImpactMap'), {
  ssr: false,
  loading: () => (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-3"
      style={{ height: 'clamp(400px, 50vh, 560px)', minHeight: '400px' }}
    >
      <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500 font-medium">দূষণ ম্যাপ লোড হচ্ছে...</p>
      <p className="text-xs text-gray-400">কারখানা ও প্লাম তথ্য আনা হচ্ছে</p>
    </div>
  ),
})

interface ImpactProps {
  hotspots:     Hotspot[]
  satelliteData?: SatelliteWaterData[]
  farmerLat:    number
  farmerLng:    number
  windFromDeg:  number
  windSpeedKmh: number
}

export function ImpactMapWrapper(props: ImpactProps) {
  // Guard: don't render map with invalid coords
  if (!isFinite(props.farmerLat) || !isFinite(props.farmerLng)) return null
  return <ImpactMapDynamic {...props} />
}