"use client";

import { useEffect, useRef, useState, useMemo } from "react";

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
  const [mounted, setMounted] = useState(false);

  // Check if there's any actual data to display - memoized to prevent hydration issues
  const hasData = useMemo(() =>
    plots.some(p => p.heavy_metal_score !== null && p.heavy_metal_score > 0),
    [plots]
  );

  // Prevent hydration mismatch (client-only UI hint)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

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
        const severityBn = getSeverityBn(plot.severity);

        // Radius based on score - bigger circles for higher risk
        const radius = plot.heavy_metal_score !== null && plot.heavy_metal_score > 0
          ? Math.max(10, Math.min(25, score / 3 + 10))
          : 8; // Small circle for no data

        const marker = L.circleMarker([plot.lat, plot.lng], {
          radius,
          fillColor: color,
          color: plot.heavy_metal_score !== null && plot.heavy_metal_score > 0 ? "#374151" : "#9ca3af",
          weight: plot.heavy_metal_score !== null && plot.heavy_metal_score > 0 ? 2 : 1,
          opacity: plot.heavy_metal_score !== null && plot.heavy_metal_score > 0 ? 0.9 : 0.5,
          fillOpacity: plot.heavy_metal_score !== null && plot.heavy_metal_score > 0 ? 0.7 : 0.3,
        }).addTo(map);

        // Enhanced popup with all details
        marker.bindPopup(
          `<div style="font-family:sans-serif;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:24px;">⚗️</span>
              <div>
                <b style="font-size:14px">${plot.land_name_bn}</b>
                ${plot.heavy_metal_score !== null && plot.heavy_metal_score > 0
                  ? `<div style="margin-top:2px;font-size:28px;font-weight:900;color:${color}">${score}%</div>`
                  : `<div style="margin-top:2px;font-size:12px;color:#9ca3af;">ডেটা নেই</div>`
                }
              </div>
            </div>
            ${plot.heavy_metal_score !== null && plot.heavy_metal_score > 0 ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <div style="background:#f3f4f6;padding:6px 8px;border-radius:6px;">
                  <div style="font-size:10px;color:#9ca3af;">তীব্রতা</div>
                  <div style="font-weight:700;color:#1f2937;">${severityBn}</div>
                </div>
                <div style="background:#f3f4f6;padding:6px 8px;border-radius:6px;">
                  <div style="font-size:10px;color:#9ca3af;">ধাতু</div>
                  <div style="font-weight:700;color:#1f2937;">${metalName}</div>
                </div>
              </div>
              ${score >= 50 ? `
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px;margin-top:8px;font-size:11px;">
                  <div style="font-weight:bold;color:#dc2626;margin-bottom:4px;">⚠️ উচ্চ ঝুঁকি</div>
                  <div style="color:#991b1b;">
                    এই জমিতে ভারি ধাতু দূষণ উচ্চ মাত্রায় সনাক্ত করা হয়েছে। স্ক্যানার ব্যবহার করে বিস্তারিত পরীক্ষা করুন।
                  </div>
                </div>
              ` : score >= 20 ? `
                <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:8px;margin-top:8px;font-size:11px;">
                  <div style="font-weight:bold;color:#f59e0b;margin-bottom:4px;">⚠️ মাঝারি ঝুঁকি</div>
                  <div style="color:#92400e;">
                    এই জমিতে কিছু ভারি ধাতু পাওয়া গেছে। নিয়মিত পর্যবেক্ষণ করুন।
                  </div>
                </div>
              ` : `
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px;margin-top:8px;font-size:11px;">
                  <div style="font-weight:bold;color:#16a34a;margin-bottom:4px;">✓ নিরাপদ</div>
                  <div style="color:#166534;">
                    এই জমিতে ভারি ধাতু দূষণ নিম্ন মাত্রায় রয়েছে।
                  </div>
                </div>
              `}
            ` : `
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:11px;color:#6b7280;">
                <div style="font-weight:bold;color:#374151;margin-bottom:4px;">📊 ডেটা নেই</div>
                <div>
                  এই জমির জন্য ভারি ধাতু পরীক্ষার ডেটা নেই। স্ক্যানার ব্যবহার করে মাটি পরীক্ষা করুন।
                </div>
              </div>
            `}
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
  }, [plots, centerLat, centerLng, hasData]);

  // Legend
  const legendItems = [
    { color: "#22c55e", label: "নিম্ন (<20%)" },
    { color: "#f59e0b", label: "মাঝারি (20-50%)" },
    { color: "#ef4444", label: "উচ্চ (>50%)" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
          <span className="text-xl">🗺️</span>
          <span>ভারি ধাতু ঝুঁকি ম্যাপ</span>
          <span className="text-xs font-normal text-gray-400 ml-auto hidden sm:inline">(Heavy Metal Risk Map)</span>
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          প্রতিটি জমির ভারি ধাতু স্কোর অনুযায়ী রঙিন চিহ্ন। বড় বৃত্ত = বেশি ঝুঁকি।
        </p>
      </div>

      <div
        ref={mapRef}
        className="w-full bg-gray-100"
        style={{
          height: 'clamp(280px, 40vh, 420px)',
          minHeight: '280px'
        }}
      />

      {/* Legend */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
        {mounted && !hasData && plots.length > 0 && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-lg shrink-0">📊</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">ভারি ধাতু ডেটা নেই</p>
              <p className="text-xs text-amber-700 mt-0.5">
                আপনার জমির জন্য ভারি ধাতু পরীক্ষার ডেটা পাওয়া যায়নি। স্ক্যানার ব্যবহার করে মাটি পরীক্ষা করুন।
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            {legendItems.map((item) => (
              <div key={item.color} className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 shadow-sm">
                <div
                  className="w-3.5 h-3.5 rounded-full border-2 border-gray-200"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs font-medium text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
          {!loaded && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin inline-block" />
              ম্যাপ লোড হচ্ছে...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
