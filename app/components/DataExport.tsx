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
    </div>
  );
}
