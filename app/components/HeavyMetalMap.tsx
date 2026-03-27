"use client";

import { useEffect, useRef, useState } from "react";

interface HeavyMetalPlot {
  land_id: string;
  land_name_bn: string;
  lat: number;
  lng: number;
  heavy_metal_score: number | null;
  severity: string | null;
  metal_type: string | null;
}

interface Props {
  plots: HeavyMetalPlot[];
  centerLat: number;
  centerLng: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type LeafletMap = any;
type LeafletLib = any;

const metalBnMap: Record<string, string> = {
  chromium: "ক্রোমিয়াম",
  lead: "সীসা",
  arsenic: "আর্সেনিক",
  cadmium: "ক্যাডমিয়াম",
  mixed: "মিশ্র ধাতু",
  iron: "আয়রন",
  manganese: "ম্যাঙ্গানিজ",
};

function getColor(score: number | null): string {
  if (score == null || score < 0.20) return "#22c55e"; // green
  if (score < 0.50) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

function getSeverityBn(s: string | null): string {
  if (s === "critical") return "গুরুতর";
  if (s === "high") return "উচ্চ";
  if (s === "moderate") return "মাঝারি";
  return "নিম্ন";
}

export default function HeavyMetalMap({ plots, centerLat, centerLng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Dynamically load Leaflet CSS + JS
    const loadLeaflet = async () => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!(window as unknown as Record<string, unknown>).L) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = () => resolve();
          document.head.appendChild(script);
        });
      }

      const L = (window as unknown as Record<string, unknown>).L as LeafletLib;
      if (!L || !mapRef.current) return;

      const map = L.map(mapRef.current).setView([centerLat, centerLng], 13);
      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);

      // Add plot markers
      for (const plot of plots) {
        const color = getColor(plot.heavy_metal_score);
        const score = plot.heavy_metal_score != null ? Math.round(plot.heavy_metal_score * 100) : 0;
        const metalName = plot.metal_type ? (metalBnMap[plot.metal_type] ?? plot.metal_type) : "—";

        L.circleMarker([plot.lat, plot.lng], {
          radius: Math.max(8, Math.min(20, score / 5 + 8)),
          fillColor: color,
          color: "#374151",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.7,
        })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:sans-serif;min-width:180px">
              <b style="font-size:14px">${plot.land_name_bn}</b><br>
              <div style="margin:6px 0;font-size:24px;font-weight:900;color:${color}">${score}%</div>
              <div style="font-size:12px;color:#666">
                তীব্রতা: <b>${getSeverityBn(plot.severity)}</b><br>
                ধাতু: <b>${metalName}</b>
              </div>
            </div>`
          );
      }

      setLoaded(true);
    };

    loadLeaflet();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [plots, centerLat, centerLng]);

  // Legend
  const legendItems = [
    { color: "#22c55e", label: "নিম্ন (<20%)" },
    { color: "#f59e0b", label: "মাঝারি (20-50%)" },
    { color: "#ef4444", label: "উচ্চ (>50%)" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
          <span>🗺️</span>
          <span>ভারি ধাতু ঝুঁকি ম্যাপ (Heavy Metal Risk Map)</span>
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          প্রতিটি জমির ভারি ধাতু স্কোর অনুযায়ী রঙিন চিহ্ন।
        </p>
      </div>

      <div ref={mapRef} className="w-full h-[350px] bg-gray-100" />

      {/* Legend */}
      <div className="px-5 py-3 bg-gray-50 flex items-center gap-4 flex-wrap">
        {legendItems.map((item) => (
          <div key={item.color} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full border border-gray-300"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-600">{item.label}</span>
          </div>
        ))}
        {!loaded && <span className="text-xs text-gray-400 ml-auto">ম্যাপ লোড হচ্ছে...</span>}
      </div>
    </div>
  );
}
