"use client";

import { useState } from "react";
import { generateFarmerExport, type ExportBuyerType } from "@/app/actions/exportData";

interface Props {
  hasConsent: boolean;
}

const buyerOptions: { type: ExportBuyerType; icon: string; label: string; labelBn: string; desc: string; fields: string[] }[] = [
  {
    type: "govt",
    icon: "🏛️",
    label: "Government (DOE/DAE)",
    labelBn: "সরকার",
    desc: "দূষণ + স্ক্যান + ভারি ধাতু + ঝুঁকি — সব ডেটা",
    fields: ["stress_type", "biotic_score", "abiotic_score", "heavy_metal_score", "risk_score", "metal_type", "metal_severity"],
  },
  {
    type: "insurance",
    icon: "🏦",
    label: "Insurance Company",
    labelBn: "বীমা কোম্পানি",
    desc: "ঝুঁকি স্কোর + ক্ষতির পরিমাণ + ফসল তথ্য",
    fields: ["risk_score", "risk_level", "expected_loss_bdt", "crop_id", "area_bigha", "dominant_threat"],
  },
  {
    type: "ngo",
    icon: "🌍",
    label: "NGO / Research",
    labelBn: "NGO / গবেষণা",
    desc: "স্ক্যান ফলাফল + পরিবেশ ডেটা — ক্ষতির হিসাব ছাড়া",
    fields: ["stress_type", "biotic_score", "abiotic_score", "heavy_metal_score", "verification_status", "compound_stress"],
  },
  {
    type: "exporter",
    icon: "📦",
    label: "Export Company",
    labelBn: "এক্সপোর্টার",
    desc: "শুধু ফসলের ভারি ধাতু তথ্য — খাদ্য নিরাপত্তা সনদ",
    fields: ["crop_id", "heavy_metal_score", "metal_type", "metal_severity", "metal_confidence"],
  },
];

export default function DataExport({ hasConsent }: Props) {
  const [selectedType, setSelectedType] = useState<ExportBuyerType | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message?: string;
    csv?: string;
    meta?: Record<string, unknown>;
    count?: number;
  } | null>(null);

  const handleExport = async (buyerType: ExportBuyerType) => {
    if (!hasConsent) return;
    setSelectedType(buyerType);
    setLoading(true);
    setResult(null);

    try {
      const res = await generateFarmerExport(buyerType);
      if (res.success) {
        setResult({
          success: true,
          csv: res.csv,
          meta: res.meta as Record<string, unknown>,
          count: res.data?.length ?? 0,
        });
      } else {
        setResult({ success: false, message: res.message });
      }
    } catch {
      setResult({ success: false, message: "এক্সপোর্ট ব্যর্থ হয়েছে।" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.csv || !selectedType) return;
    const blob = new Blob(["\ufeff" + result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `agro-sentinel-${selectedType}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
          <span>📊</span>
          <span>ডেটা এক্সপোর্ট (Data Export)</span>
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          আপনার পরিচয় গোপন রেখে (anonymized) ডেটা ডাউনলোড করুন।
        </p>
      </div>

      {/* Consent gate */}
      {!hasConsent && (
        <div className="px-5 py-4 bg-amber-50">
          <p className="text-sm text-amber-800 font-medium">
            ⚠️ ডেটা এক্সপোর্ট করতে &quot;ডেটা শেয়ারিং&quot; টগল চালু করুন (ড্যাশবোর্ডের উপরে)।
          </p>
        </div>
      )}

      {/* Buyer cards */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {buyerOptions.map((buyer) => (
          <button
            key={buyer.type}
            onClick={() => handleExport(buyer.type)}
            disabled={!hasConsent || loading}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              selectedType === buyer.type
                ? "border-green-500 bg-green-50"
                : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{buyer.icon}</span>
              <span className="font-bold text-sm text-gray-800">{buyer.labelBn}</span>
            </div>
            <p className="text-xs text-gray-500 mb-2">{buyer.desc}</p>
            <div className="flex flex-wrap gap-1">
              {buyer.fields.slice(0, 4).map((f) => (
                <span key={f} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                  {f}
                </span>
              ))}
              {buyer.fields.length > 4 && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">
                  +{buyer.fields.length - 4}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-5 py-4 text-center">
          <p className="text-sm text-gray-500">📊 ডেটা প্রস্তুত হচ্ছে...</p>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="px-5 py-4 border-t border-gray-100">
          {result.success ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-green-700">✅ ডেটা প্রস্তুত!</p>
                  <p className="text-xs text-gray-500">
                    {result.count}টি রেকর্ড · {String(result.meta?.district ?? '')} ·{" "}
                    {String(result.meta?.buyer_label ?? '')}
                  </p>
                </div>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-colors"
                >
                  📥 CSV ডাউনলোড
                </button>
              </div>

              {/* Anonymization notice */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <p className="text-xs text-blue-700">
                  🔒 <strong>গোপনীয়তা:</strong> আপনার নাম, মোবাইল ও সঠিক অবস্থান সরিয়ে ডেটা anonymize করা হয়েছে।
                  শুধুমাত্র জেলা-পর্যায়ের তথ্য রাখা হয়েছে।
                </p>
              </div>

              {/* Fields included */}
              {Array.isArray(result.meta?.fields_included) ? (
                <div>
                  <p className="text-xs text-gray-500 mb-1">অন্তর্ভুক্ত ফিল্ড:</p>
                  <div className="flex flex-wrap gap-1">
                    {(result.meta!.fields_included as string[]).map((f: string) => (
                      <span key={f} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-red-600 font-medium">❌ {result.message}</p>
          )}
        </div>
      )}
      {/* ── Institutional B2B REST APIs ───────────────────────────────── */}
      <div className="border-t border-gray-100 bg-neutral-900 text-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest block">
              ENTERPRISE B2B INTEGRATION
            </span>
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
              <span>🏛️ সরকারি, এনজিও, বীমা ও রপ্তানিকারক লাইভ REST API</span>
            </h4>
          </div>
          <span className="text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
            v1.0 Live
          </span>
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed">
          পরিবেশ অধিদপ্তর (DoE), কৃষি সম্প্রসারণ অধিদপ্তর (DAE), গ্রিন ডেল্টা ইন্স্যুরেন্স এবং ইউরোপীয় ইউনিয়নের GAP রপ্তানি মান যাচাইয়ের জন্য নিরাপদ ডেটা ফিড।
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Government API */}
          <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <span>🏛️</span> পরিবেশ ও কৃষি মন্ত্রণালয় (DoE / DAE)
              </span>
              <span className="text-[10px] font-mono text-neutral-400">ROLE: government</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-300 bg-black/50 p-2 rounded break-all select-all">
              Key: GOVT-DOE-BD-2026-KEY-991
            </div>
            <div className="flex gap-2 pt-0.5">
              <a
                href="/api/export-partners?role=government&apiKey=GOVT-DOE-BD-2026-KEY-991"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-semibold transition-colors"
              >
                JSON ভিউ ↗
              </a>
              <a
                href="/api/export-partners?role=government&apiKey=GOVT-DOE-BD-2026-KEY-991&format=csv"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-white font-semibold transition-colors"
              >
                CSV এক্সপোর্ট ↗
              </a>
            </div>
          </div>

          {/* Insurance API */}
          <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span>🏦</span> শস্য বীমা কোম্পানি (Green Delta)
              </span>
              <span className="text-[10px] font-mono text-neutral-400">ROLE: insurance</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-300 bg-black/50 p-2 rounded break-all select-all">
              Key: INSUR-GREEN-DELTA-2026-KEY-442
            </div>
            <div className="flex gap-2 pt-0.5">
              <a
                href="/api/export-partners?role=insurance&apiKey=INSUR-GREEN-DELTA-2026-KEY-442"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-amber-600 hover:bg-amber-500 rounded text-white font-semibold transition-colors"
              >
                JSON ভিউ ↗
              </a>
              <a
                href="/api/export-partners?role=insurance&apiKey=INSUR-GREEN-DELTA-2026-KEY-442&format=csv"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-white font-semibold transition-colors"
              >
                CSV এক্সপোর্ট ↗
              </a>
            </div>
          </div>

          {/* Export Certification */}
          <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                <span>📦</span> খাদ্য নিরাপত্তা ও রপ্তানি সনদ (GAP/MRL)
              </span>
              <span className="text-[10px] font-mono text-neutral-400">ROLE: export_cert</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-300 bg-black/50 p-2 rounded break-all select-all">
              Key: EXPORT-BENGAL-AGRI-2026-KEY-773
            </div>
            <div className="flex gap-2 pt-0.5">
              <a
                href="/api/export-partners?role=export_cert&apiKey=EXPORT-BENGAL-AGRI-2026-KEY-773"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white font-semibold transition-colors"
              >
                JSON ভিউ ↗
              </a>
              <a
                href="/api/export-partners?role=export_cert&apiKey=EXPORT-BENGAL-AGRI-2026-KEY-773&format=csv"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-white font-semibold transition-colors"
              >
                CSV এক্সপোর্ট ↗
              </a>
            </div>
          </div>

          {/* NGO & Research */}
          <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <span>🌍</span> কৃষি গবেষণা প্রতিষ্ঠান ও NGO (BRRI/FAO)
              </span>
              <span className="text-[10px] font-mono text-neutral-400">ROLE: ngo</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-300 bg-black/50 p-2 rounded break-all select-all">
              Key: NGO-AGRO-RESEARCH-2026-KEY-114
            </div>
            <div className="flex gap-2 pt-0.5">
              <a
                href="/api/export-partners?role=ngo&apiKey=NGO-AGRO-RESEARCH-2026-KEY-114"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-purple-600 hover:bg-purple-500 rounded text-white font-semibold transition-colors"
              >
                JSON ভিউ ↗
              </a>
              <a
                href="/api/export-partners?role=ngo&apiKey=NGO-AGRO-RESEARCH-2026-KEY-114&format=csv"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-white font-semibold transition-colors"
              >
                CSV এক্সপোর্ট ↗
              </a>
            </div>
          </div>
        </div>

        {/* cURL Example */}
        <div className="p-3 bg-black/70 rounded-xl border border-neutral-800 space-y-1">
          <span className="text-[10px] font-mono text-neutral-400 uppercase">Automated Sync cURL:</span>
          <pre className="text-[10px] font-mono text-emerald-400 overflow-x-auto select-all">
            curl -H &quot;x-api-key: GOVT-DOE-BD-2026-KEY-991&quot; &quot;http://localhost:3000/api/export-partners?role=government&quot;
          </pre>
        </div>
      </div>
    </div>
  );
}
