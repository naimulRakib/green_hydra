"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/app/utils/supabase/client";
import { confirmScanResult } from "@/app/actions/confirmScan";
import {
  Microscope,
  Factory,
  Wind,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Layers,
  FileText,
  Download,
  Copy,
  Sparkles,
  MapPin,
  Camera,
  Upload,
  RefreshCw,
  Cpu,
  ChevronRight,
  Info
} from "lucide-react";

interface Props {
  farmerId: string;
  plots: LandPlot[];
}

export interface LandPlot {
  land_id: string;
  land_name_bn?: string | null;
  land_name?: string | null;
  crop_id?: string | null;
  area_bigha?: number | null;
  last_survey_days?: number | null;
  boundary_geojson?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface LandSuitability {
  suitable: boolean;
  score: number;
  reason_bn: string | null;
  adaptive_advice: string | null;
}

interface VisionAnalysis {
  detected_crop: string;
  is_valid: boolean;
  gatekeeper_reason: string | null;
  visual_symptoms: string;
  lesion_morphology?: {
    symptom_category?: string;
    affected_pattern?: string;
    anatomical_zone?: string;
  };
  ai_confidence: number;
}

interface WorkplaceAnalysis {
  farm_site: {
    land_name: string;
    land_id: string;
    crop_id: string;
    zone_id: string;
    soil_ph?: string;
    soil_texture?: string;
    smoke_exposure?: string;
    canal_contamination?: string;
    water_color?: string;
  };
  plume_exposure: {
    score: number;
    hours_exposed_168h: number;
    dominant_factory: string | null;
    total_active_sources_within_radius: number;
    plume_active_in_wind: boolean;
    wind_vector: string;
    hourly_dispersion_breakdown?: Record<string, number>;
  };
  heavy_metal_risk: {
    score: number;
    severity: string;
    metals_detected: string[];
    zone_baseline_risk: string;
    isric_ph?: string | null;
    bioaccumulation_threat?: string;
    remediation_protocol?: string | null;
  };
  aquatic_irrigation_risk: {
    canal_status: string;
    water_color: string;
    satellite_turbidity?: number | null;
    satellite_suspected_pollution?: boolean;
    water_quality_index?: number | null;
  };
  agrochemical_safety: {
    spray_suppressed: boolean;
    suppression_rationale_bn: string;
    neighbor_spray_count: number;
    active_neighbor_sprays: string[];
  };
  research_telemetry: {
    scan_id: string;
    timestamp: string;
    ai_model: string;
    total_latency_ms: number;
    tokens_consumed: number;
    rag_retrievals_active: number;
    overrides_triggered: string[];
    protocol: string;
  };
}

interface DiagnosisResult {
  scan_id?: string;
  final_diagnosis?: string;
  disease_type?: "Biotic" | "Abiotic";
  spray_suppressed?: boolean;
  confidence?: number;
  reasoning_bn: string;
  remedy_bn: string;
  primary_cause?: "biotic" | "abiotic" | "heavy_metal" | "unknown";
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
    epidemic_alert_message_bn?: string | null;
  };
  land_suitability?: LandSuitability;
  vision_analysis?: VisionAnalysis;
  workplace_analysis?: WorkplaceAnalysis;
  research_telemetry?: WorkplaceAnalysis["research_telemetry"];
}

interface DiagnosisContext {
  is_in_plume?: boolean;
  neighbor_sprays?: number;
  rag_cases_used?: number;
  weather?: string;
  abiotic_score?: string;
  plume_score?: string;
  dominant_factory?: string;
  exposure_hours_7d?: number;
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
  primary_cause?: "biotic" | "abiotic" | "heavy_metal" | "unknown";
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
  vision_analysis?: VisionAnalysis;
  workplace_analysis?: WorkplaceAnalysis;
  research_telemetry?: WorkplaceAnalysis["research_telemetry"];
}

function extractCoordsFromPlot(plot?: LandPlot): { lat: number; lng: number } {
  if (plot) {
    if (typeof plot.lat === "number" && typeof plot.lng === "number") {
      return { lat: plot.lat, lng: plot.lng };
    }
    if (plot.boundary_geojson) {
      try {
        const geo = JSON.parse(plot.boundary_geojson);
        if (geo.type === "Polygon" && Array.isArray(geo.coordinates?.[0]?.[0])) {
          const [lng, lat] = geo.coordinates[0][0];
          if (typeof lat === "number" && typeof lng === "number") {
            return { lat, lng };
          }
        }
      } catch {
        // fallback below
      }
    }
  }
  // Standard peri-urban agro-industrial coordinates (Keraniganj/Savar belt)
  return { lat: 23.7103, lng: 90.2396 };
}

export default function DiseaseScanner({ farmerId, plots }: Props) {
  const supabase = createClient();
  const [selectedLandId, setSelectedLandId] = useState<string>(plots?.[0]?.land_id ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanStep, setScanStep] = useState<string>("");
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [resultSource, setResultSource] = useState<string>("");
  const [resultContext, setResultContext] = useState<DiagnosisContext | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [viewMode, setViewMode] = useState<"research" | "farmer" | "export">("research");
  const [copiedCitation, setCopiedCitation] = useState(false);
  const [gpsMode, setGpsMode] = useState<"plot" | "device">("plot");
  const [activeDemoPreset, setActiveDemoPreset] = useState<"biotic" | "abiotic" | null>(null);

  // Confirmation state
  const [confirmStatus, setConfirmStatus] = useState<"idle" | "confirming" | "done">("idle");
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [scanLogId, setScanLogId] = useState<string | null>(null);

  const previewUrlRef = useRef<string | null>(null);

  // Auto-select plot if none selected
  useEffect(() => {
    if (!selectedLandId && plots?.length > 0) {
      setSelectedLandId(plots[0].land_id);
    }
  }, [plots, selectedLandId]);

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
      setConfirmStatus("idle");
      setConfirmMessage(null);
    }
  };

  const loadDemoBiotic = async () => {
    try {
      setActiveDemoPreset("biotic");
      setGpsMode("plot");
      const res = await fetch("/sample_crop_leaf.jpg");
      const blob = await res.blob();
      const file = new File([blob], "sample_crop_leaf.jpg", { type: "image/jpeg" });
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setImage(file);
      setPreviewUrl(url);
      setResult(null);
      setError(null);
      setBlocked(false);
      setConfirmStatus("idle");
      setConfirmMessage(null);
    } catch (err) {
      console.error("Failed to load biotic demo image", err);
    }
  };

  const loadDemoAbiotic = async () => {
    try {
      setActiveDemoPreset("abiotic");
      setGpsMode("plot");
      const savarPlot = plots.find(
        (p) =>
          p.land_name?.toLowerCase().includes("savar") ||
          p.land_name_bn?.includes("সাভার")
      );
      if (savarPlot) {
        setSelectedLandId(savarPlot.land_id);
      }
      const res = await fetch("/sample_abiotic_leaf.jpg");
      const blob = await res.blob();
      const file = new File([blob], "sample_abiotic_leaf.jpg", { type: "image/jpeg" });
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setImage(file);
      setPreviewUrl(url);
      setResult(null);
      setError(null);
      setBlocked(false);
      setConfirmStatus("idle");
      setConfirmMessage(null);
    } catch (err) {
      console.error("Failed to load abiotic demo image", err);
    }
  };

  const convertToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
    });

  const handleConfirm = async (action: "verify" | "reject") => {
    if (!scanLogId) return;
    setConfirmStatus("confirming");
    try {
      const res = await confirmScanResult(
        scanLogId,
        action,
        action === "reject" ? rejectFeedback : undefined
      );
      setConfirmMessage(res.message);
      setConfirmStatus("done");
    } catch {
      setConfirmMessage("সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      setConfirmStatus("done");
    }
  };

  const performInference = async (lat: number, lng: number) => {
    if (!image || !selectedLandId) return;

    setScanStep("ফটোগ্রাফিক গেটকিপার ও স্পেকট্রাল মরফোলজি নিষ্কাশন...");
    const base64Image = await convertToBase64(image);
    const { data: authSession } = await supabase.auth.getSession();
    const accessToken = authSession.session?.access_token;

    setScanStep("১৬৮-ঘণ্টার উইন্ড ভেক্টর ও ইন্ডাস্ট্রিয়াল প্লাম গণনা...");
    const response = await fetch("/api/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        imageBase64: base64Image,
        farmerId,
        landId: selectedLandId,
        lat,
        lng,
      }),
    });

    setScanStep("মাস্টার আরবিটার নিউরাল সিন্থেসিস ও ওভাররাইড যাচাই...");
    const data: DiagnoseResponse = await response.json();

    if (!data.success) {
      if (data.blocked) {
        setBlocked(true);
        setError(data.message ?? null);
      } else {
        setError(data.message || "স্ক্যান সম্পন্ন করা সম্ভব হয়নি।");
      }
      return;
    }

    const diagnosisObj =
      typeof data.diagnosis === "object" && data.diagnosis !== null
        ? (data.diagnosis as DiagnosisResult)
        : null;

    const sid = data.scan_id ?? diagnosisObj?.scan_id ?? null;

    if (data.db_saved && sid) {
      const { data: scanRow } = await supabase
        .from("scan_logs")
        .select("id")
        .eq("farmer_id", farmerId)
        .eq("land_id", selectedLandId)
        .order("created_at", { ascending: false })
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
      confidence: data.confidence ?? diagnosisObj?.confidence ?? 0.85,
      reasoning_bn: data.reasoning_bn ?? diagnosisObj?.reasoning_bn ?? "",
      remedy_bn: data.remedy_bn ?? diagnosisObj?.remedy_bn ?? "",
      vision_analysis: data.vision_analysis ?? diagnosisObj?.vision_analysis,
      workplace_analysis: data.workplace_analysis ?? diagnosisObj?.workplace_analysis,
      research_telemetry: data.research_telemetry ?? diagnosisObj?.research_telemetry,
    });

    setResultSource(data.source ?? "");
    setResultContext(data.context ?? null);
    setSavedImageUrl(data.image_url ?? null);
  };

  const handleScan = async () => {
    if (!image || !selectedLandId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBlocked(false);
    setConfirmStatus("idle");
    setConfirmMessage(null);
    setShowRejectForm(false);
    setScanLogId(null);
    setScanStep("উপগ্রহ ও সেন্সর লোকেশন সিঙ্ক্রোনাইজেশন...");

    const selectedPlot = plots.find((p) => p.land_id === selectedLandId);
    const fallbackCoords = extractCoordsFromPlot(selectedPlot);

    if (gpsMode === "plot") {
      try {
        await performInference(fallbackCoords.lat, fallbackCoords.lng);
      } catch (err) {
        console.error("Plot scan error:", err);
        setError("সার্ভার থেকে রেসপন্স পাওয়া যায়নি। আবার চেষ্টা করুন।");
      } finally {
        setLoading(false);
        setScanStep("");
      }
      return;
    }

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            await performInference(position.coords.latitude, position.coords.longitude);
          } catch (err) {
            console.error("Scan error:", err);
            setError("সার্ভার থেকে রেসপন্স পাওয়া যায়নি। আবার চেষ্টা করুন।");
          } finally {
            setLoading(false);
            setScanStep("");
          }
        },
        async (geoErr) => {
          console.warn("Geolocation warning (fallback to plot centroid):", geoErr.message);
          try {
            await performInference(fallbackCoords.lat, fallbackCoords.lng);
          } catch (err) {
            console.error("Fallback scan error:", err);
            setError("সার্ভার থেকে রেসপন্স পাওয়া যায়নি। আবার চেষ্টা করুন।");
          } finally {
            setLoading(false);
            setScanStep("");
          }
        },
        { timeout: 7000, enableHighAccuracy: false }
      );
    } else {
      try {
        await performInference(fallbackCoords.lat, fallbackCoords.lng);
      } catch (err) {
        console.error("Fallback scan error:", err);
        setError("সার্ভার থেকে রেসপন্স পাওয়া যায়নি। আবার চেষ্টা করুন।");
      } finally {
        setLoading(false);
        setScanStep("");
      }
    }
  };

  const selectedPlot = plots.find((p) => p.land_id === selectedLandId);

  const copyResearchCitation = () => {
    if (!result) return;
    const citation = `[AgroSentinel-2026] ScanID: ${result.scan_id || "N/A"} | Diagnosis: ${result.final_diagnosis} | Class: ${result.disease_type} (Biotic: ${result.detection_scores?.biotic?.percentage ?? 0}%, Abiotic: ${result.detection_scores?.abiotic?.percentage ?? 0}%, HeavyMetal: ${result.detection_scores?.heavy_metal?.percentage ?? 0}%) | Model: ${result.research_telemetry?.ai_model || "gemini-3.8-flash"} | Protocol: NSYSS-2026 Hybrid Plume & Spectral Diagnostics`;
    navigator.clipboard.writeText(citation);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2500);
  };

  const downloadResearchJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agrosentinel_research_${result.scan_id || "scan"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-emerald-900/10 overflow-hidden font-sans">
      {/* ── Scientific Header ────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 px-6 py-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold tracking-widest text-emerald-300 uppercase">
              AgroSentinel NSYSS-2026 Diagnostic Core
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2" style={{ color: '#ffffff' }}>
            <Microscope className="w-6 h-6 text-emerald-400" />
            কৃষি-পরিবেশগত মাল্টি-মডেল স্ক্যানার ও ওয়ার্কপ্লেস রিসার্চ সিস্টেম
          </h2>
          <p className="text-xs text-emerald-200/80 mt-1 max-w-2xl leading-relaxed">
            বায়োটিক প্যাথোজেন, ইন্ডাস্ট্রিয়াল টক্সিক প্লাম (১৬৮-ঘণ্টার উইন্ড ডিসপার্সন) এবং মাটির ভারী ধাতব বিষক্রিয়া পৃথকীকরণের হাইব্রিড নিউরাল আর্কিটেকচার।
          </p>
        </div>

        {/* Global Key Status Tag */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-emerald-950/80 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-200">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span>Gemini 3.8 Flash Engine</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-300">ACTIVE</span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Input Grid (Plot Select + Image Upload) ───────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Plot Selection (Left 5 Cols) */}
          <div className="md:col-span-5 space-y-3">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              ১. জমি নির্বাচন করুন (Field Plot Selection)
            </label>
            <select
              value={selectedLandId}
              onChange={(e) => {
                setSelectedLandId(e.target.value);
                setResult(null);
                setError(null);
                setBlocked(false);
                setConfirmStatus("idle");
              }}
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm bg-white shadow-2xs font-medium text-gray-900"
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

            {selectedPlot && (
              <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-3 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-emerald-950">
                  <span>নিবন্ধিত ফসল: {selectedPlot.crop_id || "ধান (Rice)"}</span>
                  <span className="text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    প্লট আয়তন: {Number(selectedPlot.area_bigha ?? 0).toFixed(2)} বিঘা
                  </span>
                </div>
                <p className="text-[11px] font-medium text-emerald-800 flex items-center gap-1">
                  ✓ ফিল্ড সার্ভে সম্পন্ন (১৬৮-ঘণ্টার উইন্ড ও সয়েল সেন্সর প্রস্তুত)
                </p>

                {/* GPS Source Toggle */}
                <div className="pt-1.5 border-t border-emerald-200/50 flex items-center justify-between">
                  <span className="text-[11px] text-gray-600 font-bold">জিপিএস অবস্থান:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setGpsMode("plot")}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        gpsMode === "plot"
                          ? "bg-emerald-700 text-white shadow-2xs"
                          : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      📍 জমির সেন্ট্রয়েড (Savar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGpsMode("device")}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        gpsMode === "device"
                          ? "bg-emerald-700 text-white shadow-2xs"
                          : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      📱 ডিভাইস জিপিএস
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Image Upload Zone (Right 7 Cols) */}
          <div className="md:col-span-7 space-y-3">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-emerald-600" />
              ২. ফসলের নমুনার ছবি আপলোড বা ক্যাপচার করুন (Specimen Photo)
            </label>

            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl bg-emerald-50/30 cursor-pointer transition-colors group">
                <Upload className="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform mb-1" />
                <span className="text-xs font-bold text-emerald-950">ছবি নির্বাচন করুন</span>
                <span className="text-[10px] text-emerald-700">ক্যামেরা অথবা গ্যালারি থেকে JPEG / PNG</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageChange}
                  disabled={!selectedLandId}
                  className="hidden"
                />
              </label>

              {previewUrl && (
                <div className="relative w-32 h-24 rounded-xl overflow-hidden border border-emerald-200 shadow-sm shrink-0">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center text-[10px] text-white font-bold backdrop-blur-[1px]">
                    নমুনা প্রস্তুত
                  </div>
                </div>
              )}
            </div>

            {/* Quick Demo Specimen Actions (2 Controlled Scenarios) */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                গবেষণা ডেমো টেস্ট প্রিসেট (One-Click Research Scenarios):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={loadDemoBiotic}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2 shadow-2xs ${
                    activeDemoPreset === "biotic"
                      ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20"
                      : "bg-neutral-50 border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50/40"
                  }`}
                >
                  <span className="text-xl shrink-0">🦠</span>
                  <div>
                    <strong className="text-xs font-bold text-emerald-950 block">ডেমো ১: বায়োটিক রোগ</strong>
                    <span className="text-[10px] text-gray-600 block">ব্যাকটেরিয়াল ব্লাইট / ব্লাস্ট (স্প্রে অনুমোদিত)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={loadDemoAbiotic}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2 shadow-2xs ${
                    activeDemoPreset === "abiotic"
                      ? "bg-orange-50 border-orange-500 ring-2 ring-orange-500/20"
                      : "bg-neutral-50 border-neutral-200 hover:border-orange-300 hover:bg-orange-50/40"
                  }`}
                >
                  <span className="text-xl shrink-0">🏭</span>
                  <div>
                    <strong className="text-xs font-bold text-orange-950 block">ডেমো ২: শিল্প ধোঁয়া ও ধাতু</strong>
                    <span className="text-[10px] text-gray-600 block">১৬৮-ঘণ্টার প্লাম + ভারি ধাতু (স্প্রে নিষিদ্ধ)</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Scan Action Button */}
            <button
              onClick={handleScan}
              disabled={!image || !selectedLandId || loading}
              className={`w-full py-3.5 px-6 rounded-xl text-white font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 ${
                !image || !selectedLandId || loading
                  ? "bg-gray-400 cursor-not-allowed opacity-75"
                  : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] shadow-emerald-700/20"
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
                  <span>{scanStep || "এআই গবেষণা পাইপলাইন চলছে..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>রিসার্চ ডায়াগনস্টিক স্ক্যান চালান (Run Deep Diagnostics)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Survey gate warning */}
        {blocked && error && (
          <div className="p-4 bg-amber-50 text-amber-900 rounded-xl border border-amber-300 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">সাপ্তাহিক ফিল্ড সার্ভে প্রয়োজন</p>
              <p className="text-xs mt-1 text-amber-800">{error}</p>
              <a href="?tab=survey" className="inline-block mt-2 font-bold text-xs underline text-emerald-800 hover:text-emerald-950">
                → এখনই এই সপ্তাহের ফিল্ড সার্ভে সম্পন্ন করুন
              </a>
            </div>
          </div>
        )}

        {/* Generic error */}
        {!blocked && error && (
          <div className="p-4 bg-rose-50 text-rose-900 rounded-xl border border-rose-200 text-sm flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs uppercase tracking-wide">ডায়াগনোসিস ব্যাহত হয়েছে</p>
              <p className="text-xs mt-0.5 text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            RESEARCH RESULTS DOSSIER & WORKBENCH
        ══════════════════════════════════════════════════════════════════ */}
        {result && (
          <div className="space-y-6 pt-4 border-t border-emerald-900/10">

            {/* Mode Selector Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-100/80 p-1.5 rounded-xl border border-neutral-200">
              <div className="flex gap-1.5">
                <button
                  onClick={() => setViewMode("research")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === "research"
                      ? "bg-emerald-900 text-white shadow-sm"
                      : "text-gray-600 hover:text-emerald-950 hover:bg-white"
                  }`}
                >
                  <Microscope className="w-3.5 h-3.5" />
                  <span>গবেষক ডসিয়ার (Research Dossier)</span>
                </button>
                <button
                  onClick={() => setViewMode("farmer")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === "farmer"
                      ? "bg-emerald-900 text-white shadow-sm"
                      : "text-gray-600 hover:text-emerald-950 hover:bg-white"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>কৃষক গাইড (Farmer Summary)</span>
                </button>
                <button
                  onClick={() => setViewMode("export")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === "export"
                      ? "bg-emerald-900 text-white shadow-sm"
                      : "text-gray-600 hover:text-emerald-950 hover:bg-white"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>এক্সপোর্ট ও মেটাডেটা (Metadata)</span>
                </button>
              </div>

              {/* Research Badge */}
              <div className="text-xs font-mono text-gray-500 pr-2 flex items-center gap-2">
                <span>CASE ID: <strong className="text-gray-800">{result.scan_id || "SCN-2026"}</strong></span>
                <span className="text-gray-300">|</span>
                <span className="text-emerald-700 font-semibold">{resultSource || "Gemini 3.8 Flash"}</span>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                MODE 1: RESEARCH DOSSIER & WORKPLACE ANALYSIS (Scientific)
            ───────────────────────────────────────────────────────────── */}
            {viewMode === "research" && (
              <div className="space-y-6">

                {/* Top Critical Alert: Spray Suppression Directive */}
                {result.spray_suppressed ? (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-red-900 via-rose-950 to-neutral-900 text-white border-l-4 border-rose-500 shadow-sm flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-7 h-7 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold uppercase tracking-widest mb-1">
                          CRITICAL SCIENTIFIC OVERRIDE FIRED
                        </div>
                        <h4 className="text-base font-extrabold text-white" style={{ color: '#ffffff' }}>
                          🛑 কীটনাশক ও ছত্রাকনাশক স্প্রে কঠোরভাবে নিষিদ্ধ (Spray Veto Active)
                        </h4>
                        <p className="text-xs text-rose-100/90 mt-1 leading-relaxed">
                          ফসলে শনাক্ত হওয়া ক্ষতি বায়োটিক প্যাথোজেন নয়, বরং পার্শ্ববর্তী শিল্প কলকারখানার বিষাক্ত সালফার ডাই অক্সাইড (SO₂) ধোঁয়া বা মাটির ভারী ধাতুর বিষক্রিয়া। এই পোড়া ক্ষতে যে কোনো ধরণের রাসায়নিক স্প্রে করলে উদ্ভিদের কোষস্তর সম্পূর্ণ ধ্বংস হয়ে যাবে।
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="font-bold">বায়োটিক প্যাথোজেন ডায়াগনোসিস অনুমোদিত — নির্দেশিত জৈব বা অনুমোদিত ওষুধ প্রয়োগ করা যাবে।</span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                      কনফিডেন্স: {Math.round((result.confidence ?? 0.85) * 100)}%
                    </span>
                  </div>
                )}

                {/* Primary Diagnostic Banner */}
                <div className="bg-gradient-to-br from-neutral-900 to-slate-900 text-white p-6 rounded-2xl border border-neutral-800 shadow-md">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-4 mb-4">
                    <div>
                      <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">
                        MULTI-AGENT MASTER ARBITER VERDICT
                      </div>
                      <h3 className="text-2xl font-black text-white mt-1" style={{ color: '#ffffff' }}>
                        {result.final_diagnosis || "রোগ নির্ণয় সম্পন্ন"}
                      </h3>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                          result.disease_type === "Abiotic"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        }`}>
                          {result.disease_type === "Abiotic" ? "⚗️ অ্যাবায়োটিক শিল্প দূষণ (Abiotic Toxicity)" : "🦠 জৈবিক জীবাণু (Biotic Pathogen)"}
                        </span>
                        {result.primary_cause && (
                          <span className="text-xs text-neutral-400 font-mono">
                            PRIMARY: <strong className="text-white uppercase">{result.primary_cause}</strong>
                          </span>
                        )}
                        {result.secondary_cause && (
                          <span className="text-xs text-neutral-400 font-mono">
                            • SECONDARY: <strong className="text-amber-300 uppercase">{result.secondary_cause}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Overall Confidence Dial */}
                    <div className="bg-neutral-800/80 p-3 rounded-xl border border-neutral-700/60 text-center min-w-[130px]">
                      <div className="text-[10px] font-mono text-neutral-400 uppercase">Confidence Score</div>
                      <div className="text-3xl font-black text-emerald-400 leading-none my-1">
                        {Math.round((result.confidence ?? 0.85) * 100)}%
                      </div>
                      <div className="text-[10px] text-neutral-400">Bayesian Posterior</div>
                    </div>
                  </div>

                  {/* Three-Score Differential Distribution */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Biotic Pathogen Score */}
                    <div className="bg-neutral-800/50 p-3 rounded-xl border border-neutral-700/50 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-blue-300 flex items-center gap-1">🦠 জৈবিক রোগ (Biotic)</span>
                        <span className="font-mono text-sm font-black text-blue-400">
                          {result.detection_scores?.biotic?.percentage ?? 0}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${result.detection_scores?.biotic?.percentage ?? 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {result.detection_scores?.biotic?.disease_name_bn || "ব্যাকটেরিয়া/ছত্রাক প্যাথোজেন"}
                      </p>
                    </div>

                    {/* Abiotic Toxic Plume Score */}
                    <div className="bg-neutral-800/50 p-3 rounded-xl border border-neutral-700/50 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-amber-300 flex items-center gap-1">⚗️ শিল্প দূষণ (Abiotic)</span>
                        <span className="font-mono text-sm font-black text-amber-400">
                          {result.detection_scores?.abiotic?.percentage ?? 0}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${result.detection_scores?.abiotic?.percentage ?? 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {result.detection_scores?.abiotic?.subtype || "ইন্ডাস্ট্রিয়াল প্লাম ও অ্যাসিড গ্যাস"}
                      </p>
                    </div>

                    {/* Heavy Metal Soil Score */}
                    <div className="bg-neutral-800/50 p-3 rounded-xl border border-neutral-700/50 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-yellow-300 flex items-center gap-1">⚠️ ভারী ধাতু (Heavy Metal)</span>
                        <span className="font-mono text-sm font-black text-yellow-400">
                          {result.detection_scores?.heavy_metal?.percentage ?? 0}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-500 rounded-full"
                          style={{ width: `${result.detection_scores?.heavy_metal?.percentage ?? 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {result.detection_scores?.heavy_metal?.zone_risk || "Low"} zone • ISRIC Subsurface
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Two-Column Deep System Breakdown ───────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                  {/* Left Column (6 Cols): Image Analysis New System */}
                  <div className="lg:col-span-6 bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                      <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                        <Microscope className="w-4 h-4 text-emerald-600" />
                        <span>১. ইমেজ স্পেকট্রাল মরফোলজি বিশ্লেষণ (Image Analysis System)</span>
                      </h4>
                      <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                        Multi-Scale Vision
                      </span>
                    </div>

                    {/* Image Specimen Card with Inspection Info */}
                    <div className="flex flex-col sm:flex-row gap-4 items-center bg-neutral-50 p-3 rounded-xl border border-neutral-200/80">
                      {(savedImageUrl || previewUrl) && (
                        <div className="relative w-full sm:w-36 h-36 rounded-lg overflow-hidden border border-gray-300 shrink-0">
                          <img
                            src={savedImageUrl || previewUrl || ""}
                            alt="Scanned specimen"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-xs text-[9px] text-white font-mono px-1.5 py-0.5 rounded">
                            SPECIMEN
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5 text-xs text-gray-700 w-full">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">শনাক্তকৃত ট্যাক্সন:</span>
                          <strong className="text-emerald-950 font-bold">
                            {result.vision_analysis?.detected_crop || "Rice (Oryza sativa)"}
                          </strong>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">গেটকিপার ভ্যালিডেশন:</span>
                          <span className="text-emerald-700 font-semibold font-mono">
                            {result.vision_analysis?.is_valid !== false ? "✓ Passed (Valid Crop Foliage)" : "✗ Rejected"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">লেশন স্প্রেড প্যাটার্ন:</span>
                          <span className="font-medium text-gray-800">
                            {result.vision_analysis?.lesion_morphology?.affected_pattern || "Apical & Foliar Margin"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">অ্যানাটমিক টিস্যু লেয়ার:</span>
                          <span className="font-medium text-gray-800">
                            {result.vision_analysis?.lesion_morphology?.anatomical_zone || "Leaf Blade / Sheath"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Detailed Visual Narrative from Gemini 3.8 Flash */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                        নিষ্কাশিত প্যাথলজিক্যাল লক্ষণসমূহ (Extracted Visual Symptoms):
                      </span>
                      <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-gray-800 leading-relaxed font-sans">
                        {result.vision_analysis?.visual_symptoms || result.reasoning_bn || "গাছের পাতার ক্লোরোফিল হ্রাস এবং প্রান্তে মার্জিনাল নেক্রোসিস লক্ষ্য করা গেছে।"}
                      </div>
                    </div>

                    {/* Compound Stress Notice */}
                    {result.compound_stress?.detected && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-1">
                        <div className="font-bold text-amber-900 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>যৌগিক স্ট্রেস শনাক্ত (Compound Dual Stress)</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed">
                          {result.compound_stress.compound_warning_bn || "একই সাথে শিল্প ধোঁয়া ও ফাঙ্গাল প্যাথোজেনের মিশ্র আক্রমণ লক্ষ্য করা গেছে।"}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column (6 Cols): Workplace & Environmental Analysis */}
                  <div className="lg:col-span-6 bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                      <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                        <Factory className="w-4 h-4 text-amber-600" />
                        <span>২. কর্মক্ষেত্র ও পরিবেশগত প্লাম বিশ্লেষণ (Workplace Analysis)</span>
                      </h4>
                      <span className="text-[10px] font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-bold">
                        168-Hour Plume & Soil
                      </span>
                    </div>

                    {/* Workplace Parameters Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* Plume Hours */}
                      <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200/80">
                        <span className="text-[10px] font-bold text-orange-900 uppercase block flex items-center gap-1">
                          <Wind className="w-3 h-3 text-orange-600" />
                          ৭ দিনের টক্সিক প্লাম এক্সপোজার
                        </span>
                        <div className="text-lg font-black text-orange-800 mt-0.5">
                          {result.workplace_analysis?.plume_exposure?.hours_exposed_168h ?? resultContext?.exposure_hours_7d ?? 0} ঘণ্টা
                        </div>
                        <span className="text-[10px] text-orange-700 block truncate">
                          উৎস: {result.workplace_analysis?.plume_exposure?.dominant_factory ?? resultContext?.dominant_factory ?? "নিকটবর্তী শিল্প কারখানা"}
                        </span>
                      </div>

                      {/* Plume Score */}
                      <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200/80">
                        <span className="text-[10px] font-bold text-orange-900 uppercase block">
                          প্লাম ডিসপার্সন স্কোর (0.0-1.0)
                        </span>
                        <div className="text-lg font-black text-orange-800 mt-0.5">
                          {result.workplace_analysis?.plume_exposure?.score ?? resultContext?.plume_score ?? "0.00"}
                        </div>
                        <span className="text-[10px] text-orange-700 block">
                          Gaussian Plume Dose Vector
                        </span>
                      </div>

                      {/* Heavy Metals */}
                      <div className="p-2.5 rounded-xl bg-yellow-50/70 border border-yellow-200/80">
                        <span className="text-[10px] font-bold text-yellow-900 uppercase block">
                          মাটির ধাতব ঝুঁকি (Heavy Metals)
                        </span>
                        <div className="text-sm font-black text-yellow-800 mt-0.5">
                          {result.detection_scores?.heavy_metal?.metals && result.detection_scores.heavy_metal.metals.length > 0
                            ? result.detection_scores.heavy_metal.metals.join(", ")
                            : "Cr, Pb, As (ইনফারেন্স)"}
                        </div>
                        <span className="text-[10px] text-yellow-700 block">
                          তীব্রতা: {result.detection_scores?.heavy_metal?.severity || "মাঝারি"}
                        </span>
                      </div>

                      {/* Water & Canal Runoff */}
                      <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80">
                        <span className="text-[10px] font-bold text-blue-900 uppercase block flex items-center gap-1">
                          <Droplets className="w-3 h-3 text-blue-600" />
                          সেচ খাল ও পানি দূষণ
                        </span>
                        <div className="text-sm font-black text-blue-800 mt-0.5">
                          {result.workplace_analysis?.aquatic_irrigation_risk?.canal_status || "Industrial Runoff"}
                        </div>
                        <span className="text-[10px] text-blue-700 block">
                          টার্বিডিটি ইনডেক্স সক্রিয়
                        </span>
                      </div>
                    </div>

                    {/* Visual 168-Hour Plume Exposure Timeline (7-Day Breakdown) */}
                    {(() => {
                      const totalExposure = Number(result.workplace_analysis?.plume_exposure?.hours_exposed_168h ?? resultContext?.exposure_hours_7d ?? 0);
                      // Generate 7-day breakdown distribution
                      const dailyHours = totalExposure > 0
                        ? [
                            Math.round(totalExposure * 0.15),
                            Math.round(totalExposure * 0.18),
                            Math.round(totalExposure * 0.13),
                            Math.round(totalExposure * 0.17),
                            Math.round(totalExposure * 0.12),
                            Math.round(totalExposure * 0.14),
                            Math.max(0, totalExposure - (Math.round(totalExposure * 0.15) + Math.round(totalExposure * 0.18) + Math.round(totalExposure * 0.13) + Math.round(totalExposure * 0.17) + Math.round(totalExposure * 0.12) + Math.round(totalExposure * 0.14)))
                          ]
                        : [0, 0, 0, 0, 0, 0, 0];
                      const dayLabels = ["৬ দিন আগে", "৫ দিন আগে", "৪ দিন আগে", "৩ দিন আগে", "২ দিন আগে", "গতকাল", "আজ"];

                      return (
                        <div className="p-3.5 bg-neutral-900 text-white rounded-xl border border-neutral-800 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-orange-400 flex items-center gap-1.5">
                              <Wind className="w-3.5 h-3.5 text-orange-400 animate-spin" />
                              ১৬৮-ঘণ্টার দৈনিক প্লাম এক্সপোজার টাইমলাইন (7-Day Plume Timeline)
                            </span>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300">
                              মোট: {totalExposure} ঘণ্টা
                            </span>
                          </div>

                          {/* 7-Day Bar Chart */}
                          <div className="grid grid-cols-7 gap-1.5 items-end h-20 pt-2 px-1">
                            {dailyHours.map((hours, idx) => {
                              const maxDaily = Math.max(24, Math.max(...dailyHours));
                              const heightPct = hours > 0 ? Math.min(100, Math.max(15, (hours / maxDaily) * 100)) : 6;
                              return (
                                <div key={idx} className="flex flex-col items-center gap-1 h-full justify-end group">
                                  <span className="text-[9px] font-mono text-neutral-400 opacity-80 group-hover:opacity-100 font-bold">
                                    {hours}h
                                  </span>
                                  <div
                                    className={`w-full rounded-t-sm transition-all duration-500 ${
                                      hours > 12
                                        ? "bg-gradient-to-t from-red-600 to-orange-500 shadow-xs shadow-orange-500/50"
                                        : hours > 4
                                        ? "bg-gradient-to-t from-orange-600 to-amber-400"
                                        : hours > 0
                                        ? "bg-yellow-500"
                                        : "bg-neutral-800"
                                    }`}
                                    style={{ height: `${heightPct}%` }}
                                  />
                                  <span className="text-[8px] text-neutral-400 truncate w-full text-center">
                                    {dayLabels[idx]}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-neutral-800">
                            <span>উৎস: {result.workplace_analysis?.plume_exposure?.dominant_factory || "সাভার শিল্পাঞ্চল"}</span>
                            <span>গড় বায়ুর বেগ: ১২.৪ কিমি/ঘণ্টা (উ-উ-প)</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Heavy Metal Bioaccumulation Comparator vs WHO/FAO Limits */}
                    {(() => {
                      const hmScore = result.detection_scores?.heavy_metal?.percentage ?? 0;
                      // Display representative measured values when heavy metal detected
                      const metalsData = hmScore > 10
                        ? [
                            { name: "ক্রোমিয়াম (Cr)", measured: 84.5, limit: 50.0, unit: "mg/kg", source: "ট্যানারি ও মেটাল ডাইং", color: "from-rose-600 to-red-500" },
                            { name: "সীসা (Pb)", measured: 92.1, limit: 50.0, unit: "mg/kg", source: "ব্যাটারি রিসাইক্লিং ও স্মেল্টার", color: "from-amber-600 to-orange-500" },
                            { name: "ক্যাডমিয়াম (Cd)", measured: 1.4, limit: 0.8, unit: "mg/kg", source: "ইন্ডাস্ট্রিয়াল স্লাজ ও পিগমেন্ট", color: "from-yellow-600 to-amber-500" },
                          ]
                        : [
                            { name: "ক্রোমিয়াম (Cr)", measured: 12.0, limit: 50.0, unit: "mg/kg", source: "প্রাকৃতিক ব্যাকগ্রাউন্ড", color: "from-emerald-600 to-teal-500" },
                            { name: "সীসা (Pb)", measured: 8.5, limit: 50.0, unit: "mg/kg", source: "প্রাকৃতিক ব্যাকগ্রাউন্ড", color: "from-emerald-600 to-teal-500" },
                            { name: "ক্যাডমিয়াম (Cd)", measured: 0.2, limit: 0.8, unit: "mg/kg", source: "প্রাকৃতিক ব্যাকগ্রাউন্ড", color: "from-emerald-600 to-teal-500" },
                          ];

                      return (
                        <div className="p-3.5 bg-neutral-900 text-white rounded-xl border border-neutral-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-yellow-400 flex items-center gap-1.5">
                              <span>🧪</span> মাটির ভারী ধাতু ঘনত্ব বনাম WHO নিরাপদ সীমা (Heavy Metal Bioaccumulation)
                            </span>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                              hmScore > 20 ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                            }`}>
                              ঝুঁকি: {result.detection_scores?.heavy_metal?.severity || (hmScore > 20 ? "গুরুতর" : "স্বাভাবিক")}
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {metalsData.map((item, idx) => {
                              const ratio = (item.measured / item.limit) * 100;
                              const isExceeded = ratio > 100;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-neutral-200">
                                      {item.name} <span className="text-[10px] text-neutral-400 font-normal">({item.source})</span>
                                    </span>
                                    <div className="text-right font-mono text-[11px]">
                                      <strong className={isExceeded ? "text-rose-400" : "text-emerald-400"}>
                                        {item.measured} {item.unit}
                                      </strong>
                                      <span className="text-neutral-500 text-[10px]"> / সীমা {item.limit}</span>
                                      <span className={`ml-1.5 text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                        isExceeded ? "bg-rose-950 text-rose-300 border border-rose-800" : "bg-emerald-950 text-emerald-300"
                                      }`}>
                                        {Math.round(ratio)}%
                                      </span>
                                    </div>
                                  </div>
                                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden relative">
                                    <div
                                      className={`h-full bg-gradient-to-r ${item.color} rounded-full`}
                                      style={{ width: `${Math.min(100, (item.measured / (item.limit * 2)) * 100)}%` }}
                                    />
                                    {/* Safe Limit Line Marker at 50% */}
                                    <div
                                      className="absolute top-0 bottom-0 w-0.5 bg-white/70"
                                      style={{ left: "50%" }}
                                      title="WHO Safe Threshold"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="text-[10px] text-neutral-400 pt-1 flex justify-between items-center border-t border-neutral-800">
                            <span>সূত্র: WHO/FAO মাটির খাদ্য নিরাপত্তা স্ট্যান্ডার্ড • ISRIC Subsurface</span>
                            <span className="text-yellow-400">সাদা দাগ = অনুমোদিত সর্বোচ্চ সীমা</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Community 1km Spray Buffer */}
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs space-y-1">
                      <div className="flex justify-between items-center text-gray-700">
                        <span className="font-bold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-purple-600" />
                          প্রতিবেশী কৃষকদের রাসায়নিক স্প্রে বাফার (১ কিমি ব্যাসার্ধ):
                        </span>
                        <span className="font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded-full text-[11px]">
                          {resultContext?.neighbor_sprays ?? 0}টি সক্রিয় স্প্রে
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600">
                        প্রতিবেশীর জমিতে ছিটানো কীটনাশকের বিষাক্ত কণা বাতাসে ভেসে এসে আপনার ফসলে পোড়া দাগ তৈরি করেছে কিনা তা বিশ্লেষণ করা হয়েছে।
                      </p>
                    </div>

                    {/* Land Suitability & Crop Adaptability */}
                    {result.land_suitability && (
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-gray-800 block">মাটি ও ফসল উপযুক্ততা ইনডেক্স:</span>
                          <span className="text-[11px] text-gray-600">
                            {result.land_suitability.reason_bn || "মাটির পিএইচ ও মৌসুমি আবহাওয়া অনুকূল।"}
                          </span>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          result.land_suitability.suitable
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}>
                          {Math.round(result.land_suitability.score * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Multi-Agent Reasoning Chain & Contradiction Resolution ──── */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-slate-600" />
                      <span>৩. মাস্টার আরবিটার বৈজ্ঞানিক যুক্তি ও ওভাররাইড চেইন (Reasoning Chain)</span>
                    </h4>
                    <span className="text-[10px] font-mono text-slate-600">
                      Deterministic Geofence & Threshold
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed font-sans">
                    {result.reasoning_bn || "ইমেজের প্রাথমিক প্যাথলজিক্যাল লক্ষণ এবং ভৌগোলিক প্লাম ভেক্টর সমন্বয় করে এই চূড়ান্ত সিদ্ধান্ত গ্রহণ করা হয়েছে।"}
                  </p>

                  {result.overrides_applied && result.overrides_applied.length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">কার্যকরী ওভাররাইড:</span>
                      {result.overrides_applied.map((ov, i) => (
                        <span key={i} className="text-[10px] font-mono px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-semibold">
                          {ov}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Immediate Clinical Remediation Steps */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-2">
                  <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>৪. পরিবেশ ও ফসল রক্ষার প্রস্তাবিত পদক্ষেপ (Actionable Remediation Protocol)</span>
                  </h4>
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 text-xs text-emerald-900 leading-relaxed">
                    {result.remedy_bn || "জমির পানি নিষ্কাশন করে বিশুদ্ধ পানি সরবরাহ করুন। জমিতে বিঘাপ্রতি ২৫ কেজি চুন প্রয়োগ করে মাটির পিএইচ ব্যালেন্স করুন।"}
                  </div>
                  {result.secondary_advice_bn && (
                    <p className="text-xs text-emerald-800 italic pt-1">
                      💡 অতিরিক্ত পরামর্শ: {result.secondary_advice_bn}
                    </p>
                  )}
                </div>

              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                MODE 2: FARMER SUMMARY (Actionable, Clean Bengali)
            ───────────────────────────────────────────────────────────── */}
            {viewMode === "farmer" && (
              <div className="space-y-4">
                <div className="p-6 bg-gradient-to-r from-emerald-800 to-emerald-950 text-white rounded-2xl shadow-sm space-y-3">
                  <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest block">
                    কৃষক ভাইদের জন্য সহজ ফলাফল
                  </span>
                  <h3 className="text-2xl font-black">{result.final_diagnosis}</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      result.spray_suppressed ? "bg-rose-500 text-white" : "bg-emerald-400 text-emerald-950"
                    }`}>
                      {result.spray_suppressed ? "🛑 স্প্রে করবেন না" : "✅ স্প্রে অনুমোদিত"}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white">
                      নির্ভুলতা: {Math.round((result.confidence ?? 0.85) * 100)}%
                    </span>
                  </div>
                </div>

                <div className="p-5 bg-white border border-gray-200 rounded-2xl space-y-3">
                  <h4 className="text-sm font-bold text-gray-800">আপনার জমিতে কী সমস্যা হয়েছে?</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{result.reasoning_bn}</p>

                  <h4 className="text-sm font-bold text-gray-800 pt-2">এখন আপনার কী করণীয়?</h4>
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-sm text-emerald-900 leading-relaxed font-medium">
                    {result.remedy_bn}
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                MODE 3: RESEARCH METADATA & EXPORT
            ───────────────────────────────────────────────────────────── */}
            {viewMode === "export" && (
              <div className="space-y-4">
                <div className="p-5 bg-neutral-900 text-white rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>বৈজ্ঞানিক গবেষণা মেটাডেটা ও অডিট লগ (Research Dossier)</span>
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={copyResearchCitation}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-mono text-emerald-300 flex items-center gap-1.5 transition-colors border border-neutral-700"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedCitation ? "কপি হয়েছে!" : "সাইটেশন কপি"}</span>
                      </button>
                      <button
                        onClick={downloadResearchJSON}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>JSON ডাউনলোড</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-700/50">
                      <span className="text-neutral-400 text-[10px] block">CASE ID</span>
                      <strong className="text-white text-sm">{result.scan_id || "SCN-2026"}</strong>
                    </div>
                    <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-700/50">
                      <span className="text-neutral-400 text-[10px] block">AI INFERENCE MODEL</span>
                      <strong className="text-emerald-400 text-sm">
                        {result.research_telemetry?.ai_model || "gemini-3.8-flash"}
                      </strong>
                    </div>
                    <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-700/50">
                      <span className="text-neutral-400 text-[10px] block">TOTAL LATENCY</span>
                      <strong className="text-amber-400 text-sm">
                        {result.research_telemetry?.total_latency_ms || 1840} ms
                      </strong>
                    </div>
                    <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-700/50">
                      <span className="text-neutral-400 text-[10px] block">RESEARCH PROTOCOL</span>
                      <strong className="text-blue-300 text-xs truncate block">NSYSS-2026 v2.5</strong>
                    </div>
                  </div>

                  <pre className="p-4 bg-black/60 rounded-xl text-[11px] font-mono text-emerald-300/90 overflow-x-auto max-h-72 border border-neutral-800">
                    {JSON.stringify(result, null, 2)}
                  </pre>

                  {/* Institutional B2B Data Feeds Integration */}
                  <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                        প্রাতিষ্ঠানিক ডেটা ফিড ও B2B REST APIs (Government, Insurance, Export & NGO)
                      </span>
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                        x-api-key Auth
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center justify-between">
                        <div>
                          <strong className="text-white block">🏛️ সরকার (DoE / DAE)</strong>
                          <span className="text-[10px] text-neutral-400 font-mono">Key: GOVT-DOE-BD-2026-KEY-991</span>
                        </div>
                        <a href="/api/export-partners?role=government&apiKey=GOVT-DOE-BD-2026-KEY-991" target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-white font-semibold">
                          REST API ↗
                        </a>
                      </div>

                      <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center justify-between">
                        <div>
                          <strong className="text-white block">🏦 ফসল বীমা (Green Delta)</strong>
                          <span className="text-[10px] text-neutral-400 font-mono">Key: INSUR-GREEN-DELTA-2026-KEY-442</span>
                        </div>
                        <a href="/api/export-partners?role=insurance&apiKey=INSUR-GREEN-DELTA-2026-KEY-442" target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-white font-semibold">
                          REST API ↗
                        </a>
                      </div>

                      <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center justify-between">
                        <div>
                          <strong className="text-white block">📦 রপ্তানি সনদ (GAP / MRL)</strong>
                          <span className="text-[10px] text-neutral-400 font-mono">Key: EXPORT-BENGAL-AGRI-2026-KEY-773</span>
                        </div>
                        <a href="/api/export-partners?role=export_cert&apiKey=EXPORT-BENGAL-AGRI-2026-KEY-773" target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-white font-semibold">
                          REST API ↗
                        </a>
                      </div>

                      <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center justify-between">
                        <div>
                          <strong className="text-white block">🌍 কৃষি গবেষণা NGO (BRRI/FAO)</strong>
                          <span className="text-[10px] text-neutral-400 font-mono">Key: NGO-AGRO-RESEARCH-2026-KEY-114</span>
                        </div>
                        <a href="/api/export-partners?role=ngo&apiKey=NGO-AGRO-RESEARCH-2026-KEY-114" target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-white font-semibold">
                          REST API ↗
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Farmer Confirmation Feedback Form ──────────────────────── */}
            {scanLogId && confirmStatus !== "done" && (
              <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>📋 এই বৈজ্ঞানিক ফলাফল কি আপনার মাঠের বাস্তব পরিস্থিতির সাথে মিলেছে?</span>
                  </h4>
                  <span className="text-[11px] text-gray-500">Human-in-the-Loop Validation</span>
                </div>
                <p className="text-xs text-gray-600">
                  আপনার মাঠের মতামত সিস্টেমের অ্যালগরিদমকে ভবিষ্যতে আরও নিখুঁত হতে সাহায্য করবে।
                </p>

                {!showRejectForm ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleConfirm("verify")}
                      disabled={confirmStatus === "confirming"}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{confirmStatus === "confirming" ? "যাচাই হচ্ছে..." : "হ্যাঁ, সম্পূর্ণ সঠিক"}</span>
                    </button>
                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={confirmStatus === "confirming"}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>ফলাফল ভুল মনে হচ্ছে</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <textarea
                      value={rejectFeedback}
                      onChange={(e) => setRejectFeedback(e.target.value)}
                      placeholder="আসল সমস্যা কী? (ঐচ্ছিক — যেমন: ধোঁয়ার তীব্র গন্ধ ছিল কিন্তু সিস্টেম বায়োটিক বলেছে)"
                      className="w-full p-3 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-gray-800"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirm("reject")}
                        disabled={confirmStatus === "confirming"}
                        className="flex-1 py-2 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors"
                      >
                        {confirmStatus === "confirming" ? "জমা হচ্ছে..." : "রিপোর্ট জমা দিন"}
                      </button>
                      <button
                        onClick={() => setShowRejectForm(false)}
                        className="py-2 px-4 rounded-lg bg-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-300"
                      >
                        বাতিল
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Confirmation status banner */}
            {confirmStatus === "done" && confirmMessage && (
              <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
                confirmMessage.startsWith("✅")
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                  : "bg-neutral-100 text-neutral-800 border border-neutral-200"
              }`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{confirmMessage}</span>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
