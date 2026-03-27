"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/app/utils/supabase/client";
import { confirmScanResult } from "@/app/actions/confirmScan";

interface Props {
  farmerId: string;
  plots: LandPlot[];
}

interface LandPlot {
  land_id: string;
  land_name_bn?: string | null;
  land_name?: string | null;
  crop_id?: string | null;
  area_bigha?: number | null;
  last_survey_days?: number | null;
}

interface LandSuitability {
  suitable: boolean;
  score: number;
  reason_bn: string | null;
  adaptive_advice: string | null;
}

interface DiagnosisResult {
  scan_id?: string;
  final_diagnosis?: string;
  disease_type?: "Biotic" | "Abiotic";
  spray_suppressed?: boolean;
  confidence?: number;
  reasoning_bn: string;
  remedy_bn: string;
  primary_cause?: "biotic" | "abiotic" | "heavy_metal";
  secondary_cause?: string | null;
  detection_scores?: {
    biotic?: { percentage: number; disease_name_bn?: string; subtype?: string; disease_id?: string | null };
    abiotic?: { percentage: number; subtype?: string; spray_suppressed?: boolean; active_signals?: string[] };
    heavy_metal?: { percentage: number; metals?: string[]; severity?: string; zone_risk?: string };
  };
  compound_stress?: {
    detected: boolean;
    compound_warning_bn?: string;
    affects_primary_remedy?: boolean;
  } | null;
  secondary_advice_bn?: string | null;
  overrides_applied?: string[];
  community?: {
    nearby_verified_scans?: number;
    area_trend_bn?: string | null;
    epidemic_alert_active?: boolean;
  };
  land_suitability?: LandSuitability;
}

interface DiagnosisContext {
  is_in_plume?: boolean;
  neighbor_sprays?: number;
  rag_cases_used?: number;
  weather?: string;
  abiotic_score?: string;
  plume_score?: string;
}

interface DiagnoseResponse {
  success: boolean;
  blocked?: boolean;
  message?: string;
  scan_id?: string;
  diagnosis?: DiagnosisResult | string;
  source?: string;
  context?: DiagnosisContext | null;
  image_url?: string | null;
  primary_cause?: "biotic" | "abiotic" | "heavy_metal";
  secondary_cause?: string | null;
  detection_scores?: DiagnosisResult["detection_scores"];
  compound_stress?: DiagnosisResult["compound_stress"];
  secondary_advice_bn?: string | null;
  community?: DiagnosisResult["community"];
  land_suitability?: LandSuitability;
  overrides_applied?: string[];
  disease_type?: "Biotic" | "Abiotic";
  spray_suppressed?: boolean;
  confidence?: number;
  reasoning_bn?: string;
  remedy_bn?: string;
  db_saved?: boolean;
}

export default function DiseaseScanner({ farmerId, plots }: Props) {
  const supabase = createClient();
  const [selectedLandId, setSelectedLandId] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [resultSource, setResultSource] = useState<string>("");
  const [resultContext, setResultContext] = useState<DiagnosisContext | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  // Confirmation state
  const [confirmStatus, setConfirmStatus] = useState<'idle' | 'confirming' | 'done'>('idle');
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [scanLogId, setScanLogId] = useState<string | null>(null);

  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setImage(file);
      setPreviewUrl(url);
      setResult(null);
      setError(null);
      setBlocked(false);
      setConfirmStatus('idle');
      setConfirmMessage(null);
    }
  };

  const convertToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload  = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
    });

  const handleConfirm = async (action: 'verify' | 'reject') => {
    if (!scanLogId) return;
    setConfirmStatus('confirming');
    try {
      const res = await confirmScanResult(
        scanLogId,
        action,
        action === 'reject' ? rejectFeedback : undefined
      );
      setConfirmMessage(res.message);
      setConfirmStatus('done');
    } catch {
      setConfirmMessage('সমস্যা হয়েছে।');
      setConfirmStatus('done');
    }
  };

  const handleScan = async () => {
    if (!image || !selectedLandId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBlocked(false);
    setConfirmStatus('idle');
    setConfirmMessage(null);
    setShowRejectForm(false);
    setScanLogId(null);

    try {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const base64Image = await convertToBase64(image);
            const { data: authSession } = await supabase.auth.getSession();
            const accessToken = authSession.session?.access_token;

            const response = await fetch("/api/diagnose", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
              body: JSON.stringify({
                imageBase64: base64Image,
                farmerId,
                landId:  selectedLandId,
                lat:     latitude,
                lng:     longitude,
              }),
            });

             const data: DiagnoseResponse = await response.json();

             if (!data.success) {
               if (data.blocked) {
                 setBlocked(true);
                setError(data.message ?? null);
              } else {
                setError(data.message || "স্ক্যান করতে সমস্যা হয়েছে।");
              }
              } else {
              const diagnosisObj =
                typeof data.diagnosis === "object" && data.diagnosis !== null
                  ? (data.diagnosis as DiagnosisResult)
                  : null;

              // Get the scan_id for confirmation
              const sid = data.scan_id ?? diagnosisObj?.scan_id ?? null;

              // If DB saved, find the scan_log ID
              if (data.db_saved && sid) {
                // Look up scan_log by scan_id pattern
                const { data: scanRow } = await supabase
                  .from('scan_logs')
                  .select('id')
                  .eq('farmer_id', farmerId)
                  .eq('land_id', selectedLandId)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                setScanLogId(scanRow?.id ?? null);
              }

              setResult({
                scan_id: sid ?? undefined,
                primary_cause: data.primary_cause ?? diagnosisObj?.primary_cause,
                secondary_cause: data.secondary_cause ?? diagnosisObj?.secondary_cause ?? null,
                detection_scores: data.detection_scores ?? diagnosisObj?.detection_scores,
                compound_stress: data.compound_stress ?? diagnosisObj?.compound_stress ?? null,
                secondary_advice_bn: data.secondary_advice_bn ?? diagnosisObj?.secondary_advice_bn ?? null,
                community: data.community ?? diagnosisObj?.community,
                land_suitability: data.land_suitability ?? diagnosisObj?.land_suitability,
                overrides_applied: data.overrides_applied ?? diagnosisObj?.overrides_applied ?? [],
                final_diagnosis:
                  (typeof data.diagnosis === "string" ? data.diagnosis : diagnosisObj?.final_diagnosis) ??
                  data.detection_scores?.biotic?.disease_name_bn ??
                  "",
                disease_type:
                  data.disease_type ??
                  diagnosisObj?.disease_type ??
                  (data.primary_cause === "biotic" ? "Biotic" : "Abiotic"),
                spray_suppressed: data.spray_suppressed ?? diagnosisObj?.spray_suppressed ?? false,
                confidence: data.confidence ?? diagnosisObj?.confidence ?? 0,
                reasoning_bn: data.reasoning_bn ?? diagnosisObj?.reasoning_bn ?? "",
                remedy_bn: data.remedy_bn ?? diagnosisObj?.remedy_bn ?? "",
              });
              setResultSource(data.source ?? "");
              setResultContext(data.context ?? null);
              setSavedImageUrl(data.image_url ?? null);
            }
          } catch {
            setError("সার্ভারের সাথে কানেক্ট করা যাচ্ছে না।");
          } finally {
            setLoading(false);
          }
        },
        () => {
          setError("আপনার লোকেশন পাওয়া যাচ্ছে না। ম্যাপের পারমিশন দিন।");
          setLoading(false);
        }
      );
     } catch {
       setError("সার্ভারের সাথে কানেক্ট করা যাচ্ছে না।");
       setLoading(false);
     }
  };

  const selectedPlot = plots.find(p => p.land_id === selectedLandId);

  // Severity label helper
  const severityBn = (s?: string) => {
    if (s === 'critical') return 'গুরুতর';
    if (s === 'high') return 'উচ্চ';
    if (s === 'moderate') return 'মাঝারি';
    return 'নিম্ন';
  };

  return (
    <div className="p-4 border rounded-xl shadow-sm bg-white max-w-md mx-auto space-y-4">
      <h2 className="text-xl font-bold text-green-700">🌿 স্মার্ট স্ক্যানার</h2>

      {/* Land selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          কোন জমির ছবি দিচ্ছেন?
        </label>
        <select
          value={selectedLandId}
          onChange={(e) => { setSelectedLandId(e.target.value); setResult(null); setError(null); setBlocked(false); setConfirmStatus('idle'); }}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500 text-sm"
        >
          <option value="">-- জমি নির্বাচন করুন --</option>
          {plots.map((plot, i) => (
            <option key={plot.land_id ?? i} value={plot.land_id}>
              {plot.land_name_bn || plot.land_name || "অজানা জমি"}
              {plot.crop_id ? ` (${plot.crop_id})` : ""}
              {" — "}{Number(plot.area_bigha ?? 0).toFixed(2)} বিঘা
            </option>
          ))}
        </select>

        {/* Survey status badge */}
        {selectedPlot && (
          <p className={`mt-1 text-xs font-semibold ${selectedPlot.last_survey_days != null && selectedPlot.last_survey_days <= 7 ? "text-green-600" : "text-amber-600"}`}>
            {selectedPlot.last_survey_days != null && selectedPlot.last_survey_days <= 7
              ? "✓ এই সপ্তাহের সার্ভে সম্পন্ন"
              : "⚠ স্ক্যানের আগে এই সপ্তাহের সার্ভে করুন"}
          </p>
        )}
      </div>

      {/* Image picker */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageChange}
        disabled={!selectedLandId}
        className="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
          file:text-sm file:font-semibold file:bg-green-50 file:text-green-700
          hover:file:bg-green-100 disabled:opacity-50"
      />

      {previewUrl && (
        <img src={previewUrl} alt="Crop Preview" className="rounded-lg max-h-48 object-cover w-full" />
      )}

      {/* Scan button */}
      <button
        onClick={handleScan}
        disabled={!image || !selectedLandId || loading}
        className={`w-full py-2 px-4 rounded-md text-white font-bold transition-colors ${
          !image || !selectedLandId || loading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {loading ? "🔍 বিশ্লেষণ করা হচ্ছে..." : "স্ক্যান করুন"}
      </button>

      {/* Survey gate block */}
      {blocked && error && (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-md border border-amber-300 text-sm">
          📋 {error}
          <a href="?tab=survey" className="block mt-2 font-bold underline text-green-700">
            → এখনই সার্ভে করুন
          </a>
        </div>
      )}

      {/* Generic error */}
      {!blocked && error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-md border border-red-200 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          RESULT CARD
      ═══════════════════════════════════════════════════════════ */}
      {result && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200 space-y-3">

          {/* Saved image thumbnail */}
          {savedImageUrl && (
            <img src={savedImageUrl} alt="Scanned crop" className="rounded-lg w-full max-h-36 object-cover mb-1" />
          )}

          {/* Weather context badge */}
          {resultContext?.weather && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
              <span className="text-sm">🌤️</span>
              <span className="text-xs text-blue-700 font-medium">{resultContext.weather}</span>
              <span className="text-xs text-blue-400 ml-auto">✅ আবহাওয়া ডেটা সক্রিয়</span>
            </div>
          )}

          {/* ─── Crop Suitability Card ─────────────────── */}
          {result.land_suitability && (
            <div className={`p-3 rounded-lg border ${
              result.land_suitability.suitable
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {result.land_suitability.suitable ? '✅' : '❌'} ফসল উপযুক্ততা
                </span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                  result.land_suitability.suitable
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {Math.round(result.land_suitability.score * 100)}%
                </span>
              </div>
              {result.land_suitability.reason_bn && (
                <p className="text-xs text-red-700 mt-1 font-medium">
                  ⚠️ {result.land_suitability.reason_bn}
                </p>
              )}
              {result.land_suitability.adaptive_advice && (
                <p className="text-xs text-gray-500 mt-1 italic">
                  💡 {result.land_suitability.adaptive_advice}
                </p>
              )}
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-lg text-gray-800">{result.final_diagnosis || "নির্ণয় পাওয়া যায়নি"}</h3>
            <span className="text-xs text-gray-400 whitespace-nowrap">{resultSource}</span>
          </div>

          {/* ─── Three Detection Scores (Detailed) ────── */}
          {result.detection_scores && (
            <div className="space-y-2">
              {/* Score overview pills */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-2 rounded-lg text-center border ${
                  (result.detection_scores.biotic?.percentage ?? 0) >= 35
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-200"
                }`}>
                  <div className="text-xs text-gray-500 font-bold">🦠 জৈবিক</div>
                  <div className={`text-xl font-black ${
                    (result.detection_scores.biotic?.percentage ?? 0) >= 35
                      ? "text-blue-700" : "text-gray-400"
                  }`}>
                    {result.detection_scores.biotic?.percentage ?? 0}%
                  </div>
                </div>

                <div className={`p-2 rounded-lg text-center border ${
                  (result.detection_scores.abiotic?.percentage ?? 0) >= 35
                    ? "bg-orange-50 border-orange-200"
                    : "bg-gray-50 border-gray-200"
                }`}>
                  <div className="text-xs text-gray-500 font-bold">⚗️ দূষণ</div>
                  <div className={`text-xl font-black ${
                    (result.detection_scores.abiotic?.percentage ?? 0) >= 35
                      ? "text-orange-700" : "text-gray-400"
                  }`}>
                    {result.detection_scores.abiotic?.percentage ?? 0}%
                  </div>
                </div>

                <div className={`p-2 rounded-lg text-center border ${
                  (result.detection_scores.heavy_metal?.percentage ?? 0) > 0
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-gray-50 border-gray-200"
                }`}>
                  <div className="text-xs text-gray-500 font-bold">⚠️ ধাতু</div>
                  <div className={`text-xl font-black ${
                    (result.detection_scores.heavy_metal?.percentage ?? 0) > 0
                      ? "text-yellow-700" : "text-gray-400"
                  }`}>
                    {result.detection_scores.heavy_metal?.percentage ?? 0}%
                  </div>
                </div>
              </div>

              {/* ── Detailed: Biotic ──────────────────── */}
              {(result.detection_scores.biotic?.percentage ?? 0) > 0 && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 space-y-1">
                  <h4 className="text-xs font-bold text-blue-800 flex items-center gap-1">
                    🦠 জৈবিক বিশ্লেষণ (Biotic)
                  </h4>
                  {result.detection_scores.biotic?.disease_name_bn && (
                    <p className="text-sm font-semibold text-gray-800">
                      রোগ: {result.detection_scores.biotic.disease_name_bn}
                    </p>
                  )}
                  {result.detection_scores.biotic?.subtype && (
                    <p className="text-xs text-gray-600">
                      ধরন: <span className="font-medium">{result.detection_scores.biotic.subtype}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    স্কোর: {result.detection_scores.biotic?.percentage ?? 0}% · 
                    কনফিডেন্স: {Math.round((result.confidence ?? 0) * 100)}%
                  </p>
                </div>
              )}

              {/* ── Detailed: Abiotic ─────────────────── */}
              {(result.detection_scores.abiotic?.percentage ?? 0) > 0 && (
                <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-3 space-y-1">
                  <h4 className="text-xs font-bold text-orange-800 flex items-center gap-1">
                    ⚗️ দূষণ বিশ্লেষণ (Abiotic)
                  </h4>
                  {result.detection_scores.abiotic?.subtype && (
                    <p className="text-xs text-gray-600">
                      ধরন: <span className="font-medium">{result.detection_scores.abiotic.subtype.replace('Abiotic_', '')}</span>
                    </p>
                  )}
                  {result.detection_scores.abiotic?.active_signals && result.detection_scores.abiotic.active_signals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.detection_scores.abiotic.active_signals.map((sig, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                          {sig}
                        </span>
                      ))}
                    </div>
                  )}
                  {result.detection_scores.abiotic?.spray_suppressed && (
                    <p className="text-xs text-red-600 font-bold mt-1">🛑 স্প্রে নিষেধ — দূষণজনিত ক্ষতি</p>
                  )}
                  <p className="text-xs text-gray-500">স্কোর: {result.detection_scores.abiotic?.percentage ?? 0}%</p>
                </div>
              )}

              {/* ── Detailed: Heavy Metal ─────────────── */}
              {(result.detection_scores.heavy_metal?.percentage ?? 0) > 0 && (
                <div className="bg-yellow-50/50 border border-yellow-100 rounded-lg p-3 space-y-1">
                  <h4 className="text-xs font-bold text-yellow-800 flex items-center gap-1">
                    ⚠️ ভারি ধাতু বিশ্লেষণ (Heavy Metal)
                  </h4>
                  {result.detection_scores.heavy_metal?.severity && (
                    <p className="text-xs text-gray-600">
                      তীব্রতা: <span className={`font-bold ${
                        result.detection_scores.heavy_metal.severity === 'critical' ? 'text-red-700' :
                        result.detection_scores.heavy_metal.severity === 'high' ? 'text-red-600' :
                        result.detection_scores.heavy_metal.severity === 'moderate' ? 'text-orange-600' :
                        'text-green-600'
                      }`}>{severityBn(result.detection_scores.heavy_metal.severity)}</span>
                    </p>
                  )}
                  {result.detection_scores.heavy_metal?.metals && result.detection_scores.heavy_metal.metals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.detection_scores.heavy_metal.metals.map((m, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  {result.detection_scores.heavy_metal?.zone_risk && result.detection_scores.heavy_metal.zone_risk !== 'Low' && (
                    <p className="text-xs text-gray-500">
                      জোন ঝুঁকি: <span className="font-medium">{result.detection_scores.heavy_metal.zone_risk}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-500">স্কোর: {result.detection_scores.heavy_metal?.percentage ?? 0}%</p>
                </div>
              )}
            </div>
          )}

          {/* Compound Stress Warning */}
          {result.compound_stress?.detected && result.compound_stress.compound_warning_bn && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
              <p className="text-sm text-amber-800 font-medium leading-relaxed">
                {result.compound_stress.compound_warning_bn}
              </p>
            </div>
          )}

          {/* Community signal */}
          {result.community?.area_trend_bn && (
            <div className="mt-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg">
              <p className="text-xs text-purple-700">
                👥 {result.community.area_trend_bn}
              </p>
            </div>
          )}

          {/* Epidemic alert */}
          {result.community?.epidemic_alert_active && (
            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700 font-bold">
                🚨 মহামারি সতর্কতা সক্রিয়
              </p>
            </div>
          )}

          {/* Secondary advice */}
          {result.secondary_advice_bn && (
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs font-bold text-gray-700 mb-1">অতিরিক্ত পরামর্শ:</p>
              <p className="text-sm text-gray-600">{result.secondary_advice_bn}</p>
            </div>
          )}

          {/* Type + spray badge */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
              result.disease_type === "Abiotic"
                ? "bg-orange-200 text-orange-800"
                : "bg-blue-200 text-blue-800"
            }`}>
              {result.disease_type === "Abiotic" ? "⚗️ Abiotic" : "🦠 Biotic"}
            </span>
            {result.spray_suppressed && (
              <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-200 text-red-800">
                🛑 স্প্রে নিষেধ
              </span>
            )}
            <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700">
              আত্মবিশ্বাস: {Math.round((result.confidence ?? 0) * 100)}%
            </span>
          </div>

          {/* Context pills */}
          {resultContext && (
            <div className="flex flex-wrap gap-2 text-xs">
              {resultContext.is_in_plume && (
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">🏭 প্লাম সক্রিয়</span>
              )}
              {(resultContext.neighbor_sprays ?? 0) > 0 && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                  🏘️ {resultContext.neighbor_sprays}টি প্রতিবেশী স্প্রে
                </span>
              )}
              {(resultContext.rag_cases_used ?? 0) > 0 && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                  🔍 {resultContext.rag_cases_used}টি স্থানীয় কেস মিলেছে
                </span>
              )}
            </div>
          )}

          {/* Reasoning */}
          <div>
            <p className="text-sm font-semibold text-gray-700">যুক্তি:</p>
            <p className="text-sm text-gray-600">{result.reasoning_bn}</p>
          </div>

          {/* Remedy */}
          <div className="bg-white rounded-lg p-3 border border-green-100">
            <p className="text-sm font-semibold text-gray-700 mb-1">করণীয়:</p>
            <p className="text-sm text-gray-600">{result.remedy_bn}</p>
          </div>

          {/* ─── AI Result Confirmation Form ──────────────── */}
          {scanLogId && confirmStatus !== 'done' && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
              <h4 className="text-sm font-bold text-gray-800">📋 ফলাফল কি সঠিক?</h4>
              <p className="text-xs text-gray-500">
                আপনার মতামত AI-কে আরও নির্ভুল করবে এবং আপনার ব্যাজ বাড়াবে।
              </p>

              {!showRejectForm ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirm('verify')}
                    disabled={confirmStatus === 'confirming'}
                    className="flex-1 py-2 px-3 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {confirmStatus === 'confirming' ? '...' : '✅ হ্যাঁ, সঠিক'}
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={confirmStatus === 'confirming'}
                    className="flex-1 py-2 px-3 rounded-lg bg-red-100 text-red-700 text-sm font-bold hover:bg-red-200 disabled:opacity-50 transition-colors"
                  >
                    ❌ ভুল
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    placeholder="আসল সমস্যা কী? (ঐচ্ছিক)"
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-red-500 focus:border-red-500"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirm('reject')}
                      disabled={confirmStatus === 'confirming'}
                      className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {confirmStatus === 'confirming' ? '...' : 'ভুল রিপোর্ট জমা দিন'}
                    </button>
                    <button
                      onClick={() => setShowRejectForm(false)}
                      className="py-2 px-3 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200"
                    >
                      বাতিল
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Confirmation result message */}
          {confirmStatus === 'done' && confirmMessage && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              confirmMessage.startsWith('✅') ? 'bg-green-100 text-green-800 border border-green-200' :
              confirmMessage.startsWith('❌') ? 'bg-red-100 text-red-800 border border-red-200' :
              'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
              {confirmMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
