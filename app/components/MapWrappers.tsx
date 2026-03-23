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
      className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center gap-3"
      style={{ height: 480 }}
    >
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-gray-400">দূষণ ম্যাপ লোড হচ্ছে...</p>
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