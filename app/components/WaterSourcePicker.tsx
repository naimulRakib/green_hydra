'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  defaultLat:  number
  defaultLng:  number
  onPick:      (lat: number, lng: number) => void
  pickedLat?:  number | null
  pickedLng?:  number | null
}

export default function WaterSourcePicker({
  defaultLat,
  defaultLng,
  onPick,
  pickedLat,
  pickedLng,
}: Props) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const leafletMap  = useRef<any>(null)
  const markerRef   = useRef<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    // Dynamically load Leaflet (already loaded in project)
    const L = (window as any).L
    if (!L) {
      // Fallback: load from CDN
      const link = document.createElement('link')
      link.rel  = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)

      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = () => initMap()
      document.head.appendChild(script)
    } else {
      initMap()
    }

    function initMap() {
      const L = (window as any).L
      if (!mapRef.current) return

      const map = L.map(mapRef.current, {
        center:          [defaultLat, defaultLng],
        zoom:            15,
        zoomControl:     true,
        attributionControl: false,
      })

      L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19 }
      ).addTo(map)

      // Custom blue water-drop icon
      const waterIcon = L.divIcon({
        html: `<div style="
          width:32px; height:32px;
          background:#3b82f6;
          border:3px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 8px rgba(59,130,246,0.6);
        "></div>`,
        iconSize:   [32, 32],
        iconAnchor: [16, 32],
        className:  '',
      })

      // If already picked, show existing marker
      if (pickedLat && pickedLng) {
        markerRef.current = L.marker([pickedLat, pickedLng], { icon: waterIcon })
          .addTo(map)
        map.setView([pickedLat, pickedLng], 15)
      }

      // Click to place/move marker
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          markerRef.current = L.marker([lat, lng], { icon: waterIcon }).addTo(map)
        }

        onPick(lat, lng)
      })

      leafletMap.current = map
      setReady(true)
    }

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
        markerRef.current  = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        নিচের map-এ আপনার পানির উৎসের জায়গায়{' '}
        <span className="text-blue-400 font-bold">একবার tap করুন</span>
      </p>

      {/* Map container */}
      <div
        ref={mapRef}
        className="w-full rounded-xl overflow-hidden border border-white/10"
        style={{ height: '220px' }}
      />

      {!ready && (
        <div className="text-xs text-gray-500 text-center animate-pulse">
          ম্যাপ লোড হচ্ছে...
        </div>
      )}

      {pickedLat && pickedLng && (
        <div className="flex items-center gap-2 text-xs text-blue-400
                        bg-blue-500/10 border border-blue-500/20
                        rounded-lg px-3 py-2">
          <span>💧</span>
          <span>
            অবস্থান চিহ্নিত:{' '}
            <span className="font-mono text-blue-300">
              {pickedLat.toFixed(5)}, {pickedLng.toFixed(5)}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
