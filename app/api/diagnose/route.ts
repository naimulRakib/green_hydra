import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { fetchISRICSoilData } from "@/lib/heavyMetalEngine";

// ── Supabase service role client ──────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ENABLE_RAG = process.env.ENABLE_RAG === "true";

type StressType =
  | "Biotic_Fungal" | "Biotic_Pest" | "Biotic_Viral" | "Biotic_Bacterial"
  | "Abiotic_Pollution" | "Abiotic_Nutrient" | "Abiotic_Water" | "Abiotic_Weather";

type VerificationStatus = "pending" | "verified" | "rejected";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null;
}

function getErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (isRecord(err) && typeof err.message === "string") return err.message;
  return String(err);
}

function getErrStatus(err: unknown): number | undefined {
  if (isRecord(err) && typeof err.status === "number") return err.status;
  return undefined;
}

interface VisionResult {
  is_valid?: boolean;
  gatekeeper_reason?: string | null;
  detected_crop?: string;
  visual_symptoms?: string;
  _tokens_used?: number;
  [k: string]: unknown;
}

interface VisionBioticResult extends VisionResult {
  biotic_score?: number;
  disease_type?: "Biotic" | "None";
  stress_subtype?: StressType | "None";
  confidence?: number;
  disease_name_en?: string | null;
  disease_name_bn?: string | null;
  weather_supports_disease?: boolean;
  rag_match_count?: number;
  remedy_bn?: string | null;
  suggested_disease_id?: string | null;
  suggested_pollutant_id?: string | null;
  evidence_chain?: unknown[];
  counter_evidence?: string[];
}

interface ArbiterResult {
  primary_diagnosis: "biotic" | "abiotic" | "heavy_metal" | "unknown";
  secondary_diagnosis: "biotic" | "abiotic" | "heavy_metal" | null;
  compound_stress: boolean;
  spray_suppressed: boolean;
  final_confidence: number;
  reasoning_chain: string[];
  contradictions_resolved: Array<{ contradiction: string; resolution: string; action: string }>;
  evidence_summary: {
    supporting_biotic: string[];
    supporting_abiotic: string[];
    supporting_metal: string[];
  };
}

type DiagnosisCause = "biotic" | "abiotic" | "heavy_metal" | "unknown";

interface ExpertTrace {
  score: number;
  evidence: unknown[];
}

interface ReasoningPayload {
  expert_a: ExpertTrace;
  expert_b: ExpertTrace;
  expert_c: ExpertTrace;
  arbiter: ArbiterResult;
}

interface VerdictGates {
  crop_valid: boolean | undefined;
  crop_detected: string;
  growth_stage: string;
  land_suitable: boolean;
  land_suitability_score: number;
  land_warnings: string[];
}

interface VerdictDetectionScores {
  biotic: {
    percentage: number;
    disease_name_bn: string | null;
    subtype: string | null;
    disease_id: string | null;
  };
  abiotic: {
    percentage: number;
    subtype: unknown;
    spray_suppressed: boolean;
    active_signals: unknown;
  };
  heavy_metal: {
    percentage: number;
    metals: unknown;
    severity: unknown;
    zone_risk: unknown;
  };
}

interface VerdictCommunity {
  nearby_verified_scans: number;
  area_trend_bn: string | null;
  epidemic_alert_active: boolean;
  epidemic_alert_message_bn: string | null;
}

interface VerdictLandSuitability {
  suitable: boolean;
  score: number;
  reason_bn: string | null;
  adaptive_advice: unknown;
}

interface HeavyMetalRiskStrategy {
  risk_level: "low" | "moderate" | "high" | "critical";
  metals: string[];
  affected_crop: string | null;
  bioaccumulation_risk: "low" | "moderate" | "high";
  immediate_actions_bn: string;
  remediation_bn: string;
  timeline_bn: string;
  authority_contact: {
    report_to_dae: boolean;
    report_to_doe: boolean;
    nearest_lab: string;
    urgency_level: "routine" | "priority" | "emergency";
  };
  confidence: number;
}

interface NeighborSprayLine {
  chemical?: string;
  chemical_name?: string;
  distance_m?: number;
  hours_remaining?: number;
  nearest_own_land?: string;
  [k: string]: unknown;
}

interface RagCase {
  disease_id?: string | null;
  trust_weight?: number;
  diagnosis_summary?: string;
  [k: string]: unknown;
}

interface FinalVerdict {
  final_diagnosis?: string;
  disease_type?: "Biotic" | "Abiotic" | string;
  stress_subtype?: StressType | string;
  confidence?: number;
  reasoning_bn?: string;
  remedy_bn?: string;
  spray_suppressed?: boolean;
  suggested_disease_id?: string | null;
  suggested_pollutant_id?: string | null;
  overrides_applied?: string[];
  gates?: VerdictGates;
  detection_scores?: VerdictDetectionScores;
  primary_cause?: DiagnosisCause;
  secondary_cause?: DiagnosisCause | null;
  compound_stress?: AnyRecord | null;
  community?: VerdictCommunity;
  land_suitability?: VerdictLandSuitability;
  secondary_advice_bn?: string | null;
  source?: string;
  model_used?: string;
  reasoning?: ReasoningPayload;
}

interface WeatherCache {
  hourly?: {
    wind_direction_10m?: number[];
    wind_speed_10m?: number[];
  };
  computed?: {
    computed_at?: string;
    consecutive_wet_days?: number;
  };
  current?: AnyRecord;
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════════════════════
function log(scanId: string, emoji: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString().split("T")[1].slice(0, 12);
  console.log(`[${ts}] ${emoji}  [${scanId}] ${msg}`);
  if (data !== undefined) console.log(`           ↳`, data);
}

function logError(scanId: string, step: string, err: unknown) {
  const ts = new Date().toISOString().split("T")[1].slice(0, 12);
  console.error(`[${ts}] ❌ [${scanId}] FAILED at ${step}:`);
  console.error(`           ↳`, getErrMessage(err));
}

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

function classifyWeatherBucket(temp: number, humidity: number, wetDays: number): string {
  if (temp >= 28 && humidity >= 80) return "hot_humid";
  if (temp < 25 && humidity >= 75) return "cool_wet";
  if (humidity < 55) return "dry";
  void wetDays; // kept for signature parity with spec (used by callers if needed)
  return "moderate";
}

function detectMimeType(base64: string): string {
  const header = base64.slice(0, 12);
  if (header.startsWith("/9j/")) return "image/jpeg";
  if (header.startsWith("iVBOR")) return "image/png";
  if (header.startsWith("AAAA") || header.startsWith("AAAM")) return "image/heic";
  if (header.startsWith("R0lGO")) return "image/gif";
  return "image/jpeg";
}

// ══════════════════════════════════════════════════════════════════════════════
// ABIOTIC SCORE BUCKET
// ══════════════════════════════════════════════════════════════════════════════
function abioticBucket(score: number): string {
  if (score < 0.20) return "low";
  if (score < 0.40) return "moderate";
  if (score < 0.60) return "high";
  return "critical";
}

// ══════════════════════════════════════════════════════════════════════════════
// DYNAMIC CONFIDENCE CALIBRATION — detect overlapping scores
// When biotic and abiotic scores are dangerously close, reduce confidence
// and warn farmer to seek expert verification
// ══════════════════════════════════════════════════════════════════════════════
function applyOverlapCalibration(
  verdict: FinalVerdict,
  bioticScore: number,
  abioticScore: number,
  heavyMetalScore: number,
  scanId: string
): FinalVerdict {
  const OVERLAP_THRESHOLD = 0.15; // If scores are within 0.15 of each other

  // Case 1: Biotic vs Abiotic overlap
  if (Math.abs(bioticScore - abioticScore) < OVERLAP_THRESHOLD &&
      bioticScore >= 0.30 && abioticScore >= 0.30) {
    const oldConf = verdict.confidence ?? 0.70;
    verdict.confidence = Math.min(oldConf, 0.48);
    verdict.reasoning_bn = `${verdict.reasoning_bn ?? ""}\n\n⚠️ সতর্কতা: রোগ ও দূষণের লক্ষণ একরকম দেখাচ্ছে। নিশ্চিত হওয়ার আগে বিশেষজ্ঞের পরামর্শ নিন।`;

    log(scanId, "⚠️", `OVERLAP DETECTED: biotic=${bioticScore.toFixed(2)} vs abiotic=${abioticScore.toFixed(2)} → confidence capped at 0.48`);
  }

  // Case 2: Biotic disease with high heavy metal (compound stress ambiguity)
  if (verdict.disease_type === "Biotic" &&
      heavyMetalScore >= 0.40 &&
      bioticScore < 0.70) {
    const oldConf = verdict.confidence ?? 0.70;
    verdict.confidence = Math.min(oldConf, 0.55);
    verdict.reasoning_bn = `${verdict.reasoning_bn ?? ""}\n\n⚠️ নোট: মাটিতে ভারী ধাতু পাওয়া গেছে যা গাছের রোগ প্রতিরোধ ক্ষমতা কমাতে পারে। ছত্রাকনাশক সম্পূর্ণ কার্যকর নাও হতে পারে।`;

    log(scanId, "⚠️", `METAL INTERFERENCE: biotic=${bioticScore.toFixed(2)}, metal=${heavyMetalScore.toFixed(2)} → confidence capped at 0.55`);
  }

  return verdict;
}

// ══════════════════════════════════════════════════════════════════════════════
// HARD OVERRIDES — enforced in TypeScript, NOT in LLM prompt
// ══════════════════════════════════════════════════════════════════════════════
function enforceHardOverrides(
  verdict: FinalVerdict,
  abioticScore: number,
  liveHeavyMetalScore: number,        // ← LIVE score, not stale DB
  liveHeavyMetalSeverity: string,     // ← LIVE severity
  plumeScore: number
): FinalVerdict {
  const overrides: string[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 1: Critical abiotic pollution (>= 0.60) ALWAYS overrides biotic
  // ══════════════════════════════════════════════════════════════════════════
  if (abioticScore >= 0.60) {
    if (verdict.disease_type !== "Abiotic") {
      verdict.disease_type = "Abiotic";
      verdict.stress_subtype = "Abiotic_Pollution";
      overrides.push(`ABIOTIC_OVERRIDE_score:${abioticScore.toFixed(2)}`);
    }
    verdict.spray_suppressed = true;
    overrides.push("SPRAY_SUPPRESSED_abiotic>=0.60");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 2: LIVE Heavy Metal Threat (THE CRITICAL FIX)
  // Use LIVE computed score, not stale DB report from start of execution
  // ══════════════════════════════════════════════════════════════════════════
  if (liveHeavyMetalSeverity === "critical" || liveHeavyMetalSeverity === "high") {
    verdict.spray_suppressed = true;
    overrides.push(`SPRAY_SUPPRESSED_LIVE_METAL:${liveHeavyMetalSeverity}(${liveHeavyMetalScore.toFixed(2)})`);

    // If heavy metal is critical AND biotic was suggested, VETO it
    if (liveHeavyMetalSeverity === "critical" && verdict.disease_type === "Biotic") {
      verdict.disease_type = "Abiotic";
      verdict.stress_subtype = "Abiotic_Pollution";
      overrides.push("CRITICAL_METAL_VETO_biotic→abiotic");
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 3: Fix LLM contradictions (spray suppressed but still marked Biotic)
  // ══════════════════════════════════════════════════════════════════════════
  if (verdict.spray_suppressed === true && verdict.disease_type === "Biotic") {
    verdict.disease_type = "Abiotic";
    verdict.stress_subtype = "Abiotic_Pollution";
    overrides.push("LLM_CONTRADICTION_FIXED");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 4: Significant plume exposure always suppresses spray
  // ══════════════════════════════════════════════════════════════════════════
  if (plumeScore >= 0.35) {
    verdict.spray_suppressed = true;
    overrides.push(`SPRAY_SUPPRESSED_plume>=0.35:${plumeScore.toFixed(2)}`);
  }

  verdict.overrides_applied = overrides;
  return verdict;
}

function adjustBioticScore(
  llmResult: AnyRecord,
  humidity: number,
  consecutiveWetDays: number,
  ragCases: RagCase[]
): AnyRecord {
  const raw = typeof llmResult.biotic_score === "number"
    ? llmResult.biotic_score
    : (typeof llmResult.confidence === "number" ? llmResult.confidence : 0);
  let score = raw * 0.70;

  if (humidity > 85 && consecutiveWetDays >= 5) score += 0.15;
  else if (humidity > 75 && consecutiveWetDays >= 3) score += 0.08;

  score += Math.min(0.15, ragCases.length * 0.05);
  llmResult.biotic_score = Math.min(1.0, Math.max(0.0, score));
  return llmResult;
}

function buildAbioticResult(
  abioticScore: number,
  plumeExposure: PlumeExposureResult,
  profile: AnyRecord | null,
  waterPollutionEvent: AnyRecord | null,
  satelliteWater: AnyRecord | null
): AnyRecord {
  let subtype = "Abiotic_Pollution";
  const waterRisk = typeof profile?.water_risk === "string" ? profile.water_risk : null;
  const soilPh = typeof profile?.soil_ph === "string" ? profile.soil_ph : null;
  const eventActive = waterPollutionEvent?.is_active === true;
  if (plumeExposure.plumeScore >= 0.15 || eventActive) subtype = "Abiotic_Pollution";
  else if (waterRisk === "Flood") subtype = "Abiotic_Water";
  else if (soilPh === "Acidic" || soilPh === "Alkaline") subtype = "Abiotic_Nutrient";
  else if (abioticScore >= 0.15) subtype = "Abiotic_Weather";

  const signalList: string[] = [];
  if (plumeExposure.plumeScore > 0.10) signalList.push(`কারখানার প্লাম (${(plumeExposure.plumeScore * 100).toFixed(0)}%)`);
  if (profile?.canal_contamination === true) signalList.push("খাল দূষণ");
  if (profile?.smoke_exposure === true) signalList.push("ধোঁয়ার সংস্পর্শ");
  if (eventActive) signalList.push("সক্রিয় পানি দূষণ");
  if (satelliteWater?.suspected_pollution === true) signalList.push("স্যাটেলাইট পানি সংকেত");

  return {
    abiotic_score: abioticScore,
    stress_subtype: subtype,
    spray_suppressed: abioticScore >= 0.60,
    dominant_factory: plumeExposure.dominantFactory,
    plume_score: plumeExposure.plumeScore,
    exposure_hours: plumeExposure.exposureHours,
    active_signals: signalList,
    reasoning_bn: signalList.length > 0
      ? `পরিবেশগত দূষণ সংকেত পাওয়া গেছে: ${signalList.join(", ")}।`
      : "কোনো উল্লেখযোগ্য পরিবেশগত দূষণ সংকেত নেই।",
    suggested_pollutant_id: plumeExposure.plumeScore > 0.10
      ? plumeExposure.dominantPollutantId
      : null,
  };
}

function scoreHeavyMetal(
  zone: AnyRecord | null,
  profile: AnyRecord | null,
  heavyMetalReport: AnyRecord | null,
  plumeExposure: PlumeExposureResult
): AnyRecord {
  let score = 0;
  const metals: string[] = [];
  const severity = typeof heavyMetalReport?.severity === "string" ? heavyMetalReport.severity : null;
  const metalType = typeof heavyMetalReport?.metal_type === "string" ? heavyMetalReport.metal_type : null;

  if (severity === "critical") { score += 0.70; if (metalType) metals.push(metalType); }
  else if (severity === "high") { score += 0.55; if (metalType) metals.push(metalType); }
  else if (severity === "moderate") { score += 0.35; if (metalType) metals.push(metalType); }
  else if (severity === "low") { score += 0.18; metals.push(metalType ?? "mixed"); }

  if (zone?.arsenic_zone_risk === "High") { score += 0.20; metals.push("arsenic"); }
  else if (zone?.arsenic_zone_risk === "Medium") { score += 0.10; metals.push("arsenic"); }
  if (Array.isArray(zone?.known_metal_types) && zone.known_metal_types.length > 0) {
    metals.push(...zone.known_metal_types.map((m: unknown) => String(m)));
    score += 0.05;
  }

  if (profile?.arsenic_risk === true) score += 0.10;
  if (profile?.iron_risk === true) score += 0.08;
  if (profile?.fish_kill === true) score += 0.07;
  if (profile?.canal_contamination === true) score += 0.05;
  if (plumeExposure.plumeScore > 0.20) score += 0.10;

  const finalScore = Math.min(1.0, score);
  const uniqueMetals = [...new Set(metals)].filter(Boolean);
  return {
    heavy_metal_score: finalScore,
    percentage: Math.round(finalScore * 100),
    detected: finalScore >= 0.20,
    metal_types: uniqueMetals,
    severity: finalScore >= 0.70 ? "critical"
      : finalScore >= 0.50 ? "high"
      : finalScore >= 0.30 ? "moderate"
      : "low",
    zone_baseline_risk: zone?.arsenic_zone_risk ?? "Low",
    known_metals_in_zone: zone?.known_metal_types ?? [],
    source_factory_id: heavyMetalReport?.source_factory_id ?? null,
  };
}

function runReasoningArbiter(input: {
  bioticScore: number;
  abioticScore: number;
  heavyMetalScore: number;
  bioticConfidence: number;
  community: AnyRecord;
  overlapThreshold?: number;
  ragMatchCount?: number;
  evidenceCount?: number;
  heavyMetalSeverity: string;
}): ArbiterResult {
  const steps: string[] = [];
  const contradictions: Array<{ contradiction: string; resolution: string; action: string }> = [];
  const overlapThreshold = input.overlapThreshold ?? 0.15;
  let spraySuppressed = false;
  let primary: ArbiterResult["primary_diagnosis"] = "unknown";
  let secondary: ArbiterResult["secondary_diagnosis"] = null;

  if (input.abioticScore >= 0.60) {
    primary = "abiotic";
    steps.push("Rule: abiotic>=0.60 override");
  }
  if (input.heavyMetalSeverity === "critical") {
    spraySuppressed = true;
    if (primary === "unknown") primary = "heavy_metal";
    steps.push("Rule: critical metal => spray suppressed");
  }

  const ranked = [
    { k: "biotic" as const, v: input.bioticScore },
    { k: "abiotic" as const, v: input.abioticScore },
    { k: "heavy_metal" as const, v: input.heavyMetalScore },
  ].sort((a, b) => b.v - a.v);
  if (primary === "unknown") primary = ranked[0].v >= THRESHOLDS.PRIMARY ? ranked[0].k : "unknown";
  secondary = ranked[1].v >= THRESHOLDS.SECONDARY ? ranked[1].k : null;
  steps.push(`Ranked: ${ranked.map((r) => `${r.k}:${r.v.toFixed(2)}`).join(", ")}`);

  let compound = false;
  if (primary === "biotic" && input.heavyMetalScore >= 0.40) {
    compound = true;
    spraySuppressed = true;
    contradictions.push({
      contradiction: "Biotic primary with elevated heavy metal",
      resolution: "Mark as compound stress",
      action: "Suppress spray and include metal strategy",
    });
    steps.push("Compound stress detected (biotic + heavy metal)");
  }

  const closeBioticAbiotic =
    Math.abs(input.bioticScore - input.abioticScore) < overlapThreshold &&
    input.bioticScore >= 0.30 &&
    input.abioticScore >= 0.30;
  let conf = primary === "biotic" ? input.bioticConfidence : Math.max(input.abioticScore, input.heavyMetalScore);
  if (closeBioticAbiotic) {
    conf = Math.min(conf, 0.48);
    steps.push("Overlap cap applied (biotic vs abiotic close)");
  }
  if ((input.ragMatchCount ?? 0) >= 2) conf = Math.min(0.95, conf + 0.08);
  if ((input.evidenceCount ?? 0) >= 3) conf = Math.min(0.95, conf + 0.05);

  const bioticRatio =
    typeof input.community.biotic_ratio === "number" ? input.community.biotic_ratio :
    (typeof input.community.biotic_community_ratio === "number" ? input.community.biotic_community_ratio : 0);
  const abioticRatio =
    typeof input.community.abiotic_ratio === "number" ? input.community.abiotic_ratio :
    (typeof input.community.abiotic_community_ratio === "number" ? input.community.abiotic_community_ratio : 0);
  if (primary === "biotic" && abioticRatio > 0.60) {
    conf *= 0.85;
    steps.push("Community misalignment penalty");
  }
  if (primary === "biotic" && bioticRatio > 0.60) {
    conf = Math.min(0.95, conf + 0.10);
    steps.push("Community alignment bonus");
  }

  return {
    primary_diagnosis: primary,
    secondary_diagnosis: secondary,
    compound_stress: compound,
    spray_suppressed: spraySuppressed,
    final_confidence: Math.max(0, Math.min(0.95, conf)),
    reasoning_chain: steps,
    contradictions_resolved: contradictions,
    evidence_summary: {
      supporting_biotic: input.bioticScore > 0.2 ? ["Visual/biotic evidence present"] : [],
      supporting_abiotic: input.abioticScore > 0.2 ? ["Pollution/environmental signals present"] : [],
      supporting_metal: input.heavyMetalScore > 0.2 ? ["Heavy metal exposure signals present"] : [],
    },
  };
}

async function fetchISRICSnapshot(lat: number, lng: number): Promise<{ ph_h2o: number | null; source: string }> {
  try {
    const timeout = new Promise<{ ph_h2o: number | null; source: string }>((resolve) => {
      setTimeout(() => resolve({ ph_h2o: null, source: "fallback_timeout" }), 800);
    });
    const result = fetchISRICSoilData(lat, lng).then((d) => ({
      ph_h2o: d.ph_h2o,
      source: d.data_source,
    }));
    return await Promise.race([result, timeout]);
  } catch {
    return { ph_h2o: null, source: "fallback_error" };
  }
}

function buildHeavyMetalRiskStrategy(
  heavyMetalResult: AnyRecord,
  cropId: string | null,
  isricPh: number | null
): HeavyMetalRiskStrategy {
  const score = Number(heavyMetalResult.heavy_metal_score ?? 0);
  const risk_level: HeavyMetalRiskStrategy["risk_level"] =
    score >= 0.60 ? "critical" : score >= 0.40 ? "high" : score >= 0.20 ? "moderate" : "low";
  const metals = (Array.isArray(heavyMetalResult.metal_types) ? heavyMetalResult.metal_types : []).map((m) => String(m));
  const phAdvice = isricPh !== null && isricPh < 5.5 ? "মাটি অম্লীয় — চুন প্রয়োগ করুন।" : "মাটির pH যাচাই করে সমন্বয় করুন।";
  const immediate = risk_level === "critical"
    ? "দূষিত উৎস থেকে সেচ বন্ধ করুন এবং খাদ্য ফসল তোলা/বিক্রি সাময়িক বন্ধ রাখুন।"
    : "দূষণের উৎস থেকে সেচ কমান এবং ফসলে বিষাক্ততার লক্ষণ পর্যবেক্ষণ করুন।";
  return {
    risk_level,
    metals,
    affected_crop: cropId,
    bioaccumulation_risk: risk_level === "critical" || risk_level === "high" ? "high" : risk_level === "moderate" ? "moderate" : "low",
    immediate_actions_bn: immediate,
    remediation_bn: `${phAdvice} জৈব পদার্থ (কম্পোস্ট) দিন এবং নিম্ন-শোষণশীল ফসলে রোটেশন করুন।`,
    timeline_bn: "আজ: দূষণ উৎস বন্ধ। এই মৌসুম: মাটি পরীক্ষা। আগামী ২-৩ মৌসুম: ফাইটোরেমেডিয়েশন + নিরাপদ ফসল পরিকল্পনা।",
    authority_contact: {
      report_to_dae: risk_level === "critical" || risk_level === "high",
      report_to_doe: risk_level === "critical",
      nearest_lab: "BARI Soil Testing Lab",
      urgency_level: risk_level === "critical" ? "emergency" : risk_level === "high" ? "priority" : "routine",
    },
    confidence: Math.max(0, Math.min(1, score)),
  };
}

async function getCommunitySignal(
  lat: number,
  lng: number,
  zoneId: string,
  scanId: string
): Promise<AnyRecord> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const [recentScansRes, activeAlertsRes] = await Promise.all([
    supabase
      .from("scan_logs")
      .select("stress_type, ai_confidence, biotic_score, abiotic_score, heavy_metal_score")
      .filter("scan_location", "st_dwithin", `SRID=4326;POINT(${lng} ${lat}),5000`)
      .gte("created_at", thirtyDaysAgo)
      .eq("verification_status", "verified")
      .limit(50),
    supabase
      .from("community_alerts")
      .select("alert_type, alert_message_bn, case_count")
      .eq("zone_id", zoneId)
      .eq("is_active", true)
      .limit(3),
  ]);

  const scans = (recentScansRes.data ?? []) as AnyRecord[];
  const total = scans.length;
  if (total === 0) {
    return {
      biotic_community_ratio: 0,
      abiotic_community_ratio: 0,
      heavy_metal_community_ratio: 0,
      biotic_ratio: 0,
      abiotic_ratio: 0,
      metal_ratio: 0,
      total_nearby_scans: 0,
      epidemic_alert_active: !!(activeAlertsRes.data?.length),
      epidemic_alert_message_bn: activeAlertsRes.data?.[0]?.alert_message_bn ?? null,
      community_weight: 0,
      area_trend_bn: null,
    };
  }

  const bioticCount = scans.filter(s => String(s.stress_type ?? "").startsWith("Biotic")).length;
  const abioticCount = scans.filter(s => String(s.stress_type ?? "").startsWith("Abiotic")).length;
  const metalCount = scans.filter(s => (typeof s.heavy_metal_score === "number" ? s.heavy_metal_score : 0) >= 0.20).length;
  const communityWeight = Math.min(0.20, total * 0.004);
  const dominantType = bioticCount >= abioticCount && bioticCount >= metalCount
    ? "জৈবিক রোগ" : abioticCount >= metalCount ? "শিল্প দূষণ" : "ভারী ধাতু";
  const dominantPct = Math.round(Math.max(bioticCount, abioticCount, metalCount) / total * 100);
  const areaTrendBn = `এলাকায় গত ৩০ দিনে ${total}টি যাচাইকৃত স্ক্যানের ${dominantPct}%-এ ${dominantType} পাওয়া গেছে।`;
  log(scanId, "👥", `Community: ${total} verified scans, weight: ${communityWeight.toFixed(2)}`);

  return {
    biotic_community_ratio: bioticCount / total,
    abiotic_community_ratio: abioticCount / total,
    heavy_metal_community_ratio: metalCount / total,
    biotic_ratio: bioticCount / total,
    abiotic_ratio: abioticCount / total,
    metal_ratio: metalCount / total,
    total_nearby_scans: total,
    epidemic_alert_active: !!(activeAlertsRes.data?.length),
    epidemic_alert_message_bn: activeAlertsRes.data?.[0]?.alert_message_bn ?? null,
    community_weight: communityWeight,
    area_trend_bn: areaTrendBn,
  };
}

function applyCommuntiyWeighting(
  rawScores: { biotic: number; abiotic: number; heavy_metal: number },
  community: AnyRecord
): { biotic: number; abiotic: number; heavy_metal: number } {
  const w = typeof community.community_weight === "number" ? community.community_weight : 0;
  if (w === 0) return rawScores;
  const b = typeof community.biotic_community_ratio === "number"
    ? community.biotic_community_ratio
    : (typeof community.biotic_ratio === "number" ? community.biotic_ratio : 0);
  const a = typeof community.abiotic_community_ratio === "number"
    ? community.abiotic_community_ratio
    : (typeof community.abiotic_ratio === "number" ? community.abiotic_ratio : 0);
  const h = typeof community.heavy_metal_community_ratio === "number"
    ? community.heavy_metal_community_ratio
    : (typeof community.metal_ratio === "number" ? community.metal_ratio : 0);
  return {
    biotic: Math.min(1.0, rawScores.biotic * (1 - w) + b * w),
    abiotic: Math.min(1.0, rawScores.abiotic * (1 - w) + a * w),
    heavy_metal: Math.min(1.0, rawScores.heavy_metal * (1 - w) + h * w),
  };
}

const THRESHOLDS = { PRIMARY: 0.35, SECONDARY: 0.20 } as const;
function classifyResults(
  scores: { biotic: number; abiotic: number; heavy_metal: number }
): { primary: string; secondary: string | null; primary_pct: number; secondary_pct: number } {
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const [primaryKey, primaryScore] = entries[0];
  const [secondaryKey, secondaryScore] = entries[1];
  return {
    primary: primaryScore >= THRESHOLDS.PRIMARY ? primaryKey : "unknown",
    secondary: secondaryScore >= THRESHOLDS.SECONDARY ? secondaryKey : null,
    primary_pct: Math.round(primaryScore * 100),
    secondary_pct: Math.round(secondaryScore * 100),
  };
}

function detectCompoundStress(
  primary: string,
  secondary: string | null,
  weightedScores: { biotic: number; abiotic: number; heavy_metal: number },
  bioticResult: AnyRecord,
  heavyMetalResult: AnyRecord
): AnyRecord | null {
  const SECONDARY_THRESHOLD = 0.20;
  if (!secondary) return null;
  if (weightedScores[secondary as keyof typeof weightedScores] < SECONDARY_THRESHOLD) return null;
  if (primary === "biotic" && secondary === "biotic") return null;

  const pair = [primary, secondary].sort().join("+");
  const metalList = Array.isArray(heavyMetalResult.metal_types) ? heavyMetalResult.metal_types.join(", ") : "অজানা ধাতু";
  const diseaseName = typeof bioticResult.disease_name_bn === "string" ? bioticResult.disease_name_bn : "জৈবিক রোগ";
  const metalPct = typeof heavyMetalResult.percentage === "number" ? heavyMetalResult.percentage : 0;
  const abioticPct = Math.round(weightedScores.abiotic * 100);
  const compoundMessages: Record<string, string> = {
    "biotic+heavy_metal":
      `⚠️ যৌগিক চাপ শনাক্ত: ${diseaseName} রোগের পাশাপাশি মাটিতে ${metalList} পাওয়া গেছে (${metalPct}%)। ভারী ধাতু গাছের রোগ প্রতিরোধ ক্ষমতা কমিয়ে দেয় — ছত্রাকনাশক সম্পূর্ণ কার্যকর নাও হতে পারে। মাটি পরীক্ষার জন্য উপজেলা কৃষি অফিসে যোগাযোগ করুন।`,
    "abiotic+biotic":
      `⚠️ যৌগিক চাপ: দূষণজনিত ক্ষতি (${abioticPct}%) ও জৈবিক রোগ একসাথে দেখা যাচ্ছে। উভয় কারণ নিশ্চিত না হওয়া পর্যন্ত কীটনাশক ব্যবহার সীমিত রাখুন।`,
    "abiotic+heavy_metal":
      `⚠️ গুরুতর দূষণ সংকেত: বায়ু দূষণ (${abioticPct}%) ও মাটির ভারী ধাতু (${metalPct}%) একসাথে পাওয়া গেছে। এটি কাছের কারখানার দীর্ঘমেয়াদী প্রভাব হতে পারে। অবিলম্বে উপজেলা কৃষি অফিসে জানান।`,
  };
  const message = compoundMessages[pair];
  if (!message) return null;
  return {
    detected: true,
    pair,
    affects_primary_remedy: pair.includes("biotic+heavy_metal"),
    efficacy_reduction_expected: pair === "biotic+heavy_metal",
    compound_warning_bn: message,
  };
}

function checkLandSuitability(
  crop: AnyRecord | null,
  zone: AnyRecord | null,
  profile: AnyRecord | null,
  currentMonth: number
): AnyRecord {
  if (!crop) {
    return {
      is_suitable: true,
      suitability_score: 1.0,
      warnings: {},
      unsuitable_reason_bn: null,
      adaptive_strategy_bn: zone?.adaptive_strategy_bn ?? null,
    };
  }
  const soilTexture = typeof profile?.soil_texture === "string" ? profile.soil_texture.toLowerCase() : "";
  const warnings: Record<string, boolean> = {
    wrong_season: Array.isArray(crop.planting_months) && crop.planting_months.length > 0 && !crop.planting_months.includes(currentMonth),
    wrong_zone: Array.isArray(crop.suitable_zones) && crop.suitable_zones.length > 0 && !crop.suitable_zones.includes(zone?.zone_id),
    soil_mismatch: Array.isArray(crop.soil_pref) && crop.soil_pref.length > 0 && !crop.soil_pref.some((p: unknown) => soilTexture.includes(String(p).toLowerCase())),
    flood_risk_active: Array.isArray(zone?.flood_risk_months) && zone.flood_risk_months.includes(currentMonth) && !crop.flood_tolerant,
    arsenic_zone_high: zone?.arsenic_zone_risk === "High",
    listed_unsuitable: Array.isArray(zone?.unsuitable_crops) && zone.unsuitable_crops.includes(crop.crop_id),
  };
  const failCount = Object.values(warnings).filter(Boolean).length;
  const score = 1.0 - (failCount / Object.keys(warnings).length);
  const reasonParts: string[] = [];
  if (warnings.wrong_season) reasonParts.push("এই মৌসুমে এই ফসল উপযুক্ত নয়");
  if (warnings.wrong_zone) reasonParts.push("এই এলাকার আবহাওয়া এই ফসলের জন্য উপযুক্ত নয়");
  if (warnings.arsenic_zone_high) reasonParts.push("এই এলাকায় উচ্চ আর্সেনিক ঝুঁকি রয়েছে");
  if (warnings.flood_risk_active) reasonParts.push("এই মাসে বন্যার ঝুঁকি আছে");
  if (warnings.listed_unsuitable) reasonParts.push("এই ফসল এই এলাকায় অনুপযুক্ত");
  return {
    is_suitable: score >= 0.60 && !warnings.listed_unsuitable,
    suitability_score: score,
    warnings,
    unsuitable_reason_bn: reasonParts.length > 0 ? `${reasonParts.join("; ")}।` : null,
    adaptive_strategy_bn: zone?.adaptive_strategy_bn ?? null,
  };
}

async function checkAndTriggerCommunityAlerts(
  scanLogId: string,
  stressType: string,
  lat: number,
  lng: number,
  zoneId: string,
  farmerId: string
): Promise<void> {
  try {
    const { data: farmer } = await supabase
      .from("farmers")
      .select("data_sharing_consent")
      .eq("id", farmerId)
      .maybeSingle();
    if (!farmer?.data_sharing_consent) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: similarScans } = await supabase
      .from("scan_logs")
      .select("id")
      .eq("stress_type", stressType)
      .gte("created_at", sevenDaysAgo)
      .filter("scan_location", "st_dwithin", `SRID=4326;POINT(${lng} ${lat}),5000`)
      .limit(10);
    if ((similarScans?.length ?? 0) < 5) return;
    const alertType = stressType.startsWith("Biotic") ? "disease_outbreak" : "pollution_spike";
    const { data: existing } = await supabase
      .from("community_alerts")
      .select("id")
      .eq("zone_id", zoneId)
      .eq("alert_type", alertType)
      .eq("is_active", true)
      .limit(1);
    if (existing?.length) return;
    await supabase.from("community_alerts").insert({
      zone_id: zoneId,
      alert_type: alertType,
      epicenter: `SRID=4326;POINT(${lng} ${lat})`,
      radius_meter: 5000,
      trigger_reason: `${(similarScans?.length ?? 0) + 1}টি স্ক্যানে একই সমস্যা (৭ দিনে)`,
      trigger_scan_ids: [...(similarScans?.map(s => s.id) ?? []), scanLogId],
      case_count: (similarScans?.length ?? 0) + 1,
      alert_message_bn: stressType.startsWith("Biotic")
        ? `সতর্কতা: এলাকায় ${(similarScans?.length ?? 0) + 1}টি ক্ষেতে একই রোগ পাওয়া গেছে।`
        : "সতর্কতা: এলাকায় শিল্প দূষণের প্রমাণ পাওয়া যাচ্ছে।",
      is_active: true,
    });
  } catch (err) {
    console.error("[CommunityAlert] Non-fatal error:", err);
  }
}

async function tryAutoVerification(
  scanLogId: string,
  farmerId: string,
  landId: string,
  lat: number,
  lng: number,
  diseaseId: string | null,
  pollutantId: string | null,
  stressType: string
): Promise<void> {
  try {
    if (!landId) return;
    void stressType;
    if (!diseaseId && !pollutantId) return;
    const matchField = diseaseId ? "confirmed_disease_id" : "confirmed_pollutant_id";
    const matchValue = diseaseId ?? pollutantId;
    const { data: confirmingScans } = await supabase
      .from("scan_logs")
      .select("id, ai_confidence, farmer_id")
      .eq(matchField, matchValue)
      .eq("land_id", landId)
      .neq("id", scanLogId)
      .neq("farmer_id", farmerId)
      .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .gte("ai_confidence", 0.70)
      .filter("scan_location", "st_dwithin", `SRID=4326;POINT(${lng} ${lat}),5000`);

    if (!confirmingScans || confirmingScans.length < 2) return;
    const avgConfidence = confirmingScans.reduce((s, c) => s + (c.ai_confidence ?? 0), 0) / confirmingScans.length;
    if (avgConfidence >= 0.72) {
      await supabase
        .from("scan_logs")
        .update({
          verification_status: "verified",
          verified_at: new Date().toISOString(),
          verified_by_farmer_id: null,
          rag_trust_weight: Math.min(0.95, avgConfidence + 0.05),
        })
        .eq("id", scanLogId);
    }
  } catch (err) {
    console.error("[AutoVerify] Non-fatal:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RETRY WITH EXPONENTIAL BACKOFF
// ══════════════════════════════════════════════════════════════════════════════
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
  baseDelayMs = 1500
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = getErrMessage(err).toLowerCase();
      const status = getErrStatus(err);
      const isRetryable =
        status === 429 || status === 503 || status === 504 ||
        msg.includes("overloaded") || msg.includes("high demand") ||
        msg.includes("temporarily") || msg.includes("rate") ||
        msg.includes("quota") || msg.includes("unavailable") ||
        msg.includes("timeout");
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`           ↳ [${label}] retry ${attempt}/${maxAttempts - 1} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROBUST JSON EXTRACTOR
// ══════════════════════════════════════════════════════════════════════════════
function extractJSON(raw: string): unknown {
  let s = raw.replace(/```json\n?|```/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");

  if (start === -1) throw new Error("No JSON object found in model response");

  s = s.slice(start, end === -1 ? s.length : end + 1);

  try {
    return JSON.parse(s);
  } catch (err: unknown) {
    console.error("Failed to parse Gemini JSON output directly:", getErrMessage(err));
    console.log("Raw output was:", s.substring(0, 100) + "...");
    throw new Error("Invalid JSON from AI. The response might have been truncated.");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GEMINI SHARED CALLER
// ══════════════════════════════════════════════════════════════════════════════
async function callGemini(parts: object[], temperature = 0.1): Promise<{ text: string; tokensUsed: number }> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000), // Prevent hanging serverless functions
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature,
        maxOutputTokens: 1500,
        responseMimeType: "application/json",
      },
    }),
  });

  const data: unknown = await res.json().catch(() => ({}));
  const d = isRecord(data) ? data : {};
  const apiError = d.error;

  if (!res.ok || apiError) {
    console.error(`Gemini API error (HTTP ${res.status}):`, JSON.stringify(d, null, 2));
    const message =
      isRecord(apiError) && typeof apiError.message === "string"
        ? apiError.message
        : `Gemini HTTP ${res.status}`;
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  const candidates = d.candidates;
  const first = Array.isArray(candidates) ? candidates[0] : undefined;
  const content = isRecord(first) ? first.content : undefined;
  const partsArr = isRecord(content) ? content.parts : undefined;
  const firstPart = Array.isArray(partsArr) ? partsArr[0] : undefined;
  const text = isRecord(firstPart) && typeof firstPart.text === "string" ? firstPart.text : "";

  if (!text) {
    const finishReason = isRecord(first) && typeof first.finishReason === "string" ? first.finishReason : "unknown";
    throw new Error(`Gemini empty content (finishReason: ${finishReason})`);
  }

  const usage = d.usageMetadata;
  const promptTokens = isRecord(usage) && typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : 0;
  const candidateTokens = isRecord(usage) && typeof usage.candidatesTokenCount === "number" ? usage.candidatesTokenCount : 0;
  return { text, tokensUsed: promptTokens + candidateTokens };
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE A — VISION + GATEKEEPER
// ══════════════════════════════════════════════════════════════════════════════
async function runVision(imageBase64: string, scanContext: string): Promise<VisionResult> {
  const prompt = `You are AgroSentinel's agricultural vision AI for Bangladesh rice farmers.

FARM CONTEXT (from farmer's weekly survey — use as ground truth):
${scanContext || "No survey data available yet."}

TASK 1 — GATEKEEPER:
Is this a valid, close-up, in-focus photo of a crop plant (leaf, stem, or panicle)?
Reject (is_valid: false) if: blurry, too dark, not a plant, soil only, or non-agricultural.

TASK 2 — VISUAL OBSERVATION (only if valid):
Describe every visible symptom in precise agronomic detail. Cover:
- Lesion shape, size, color (center + margin separately)
- Distribution: which leaves affected (old/new/all), pattern (random/edge/tip/interveinal)
- Presence of: fungal bodies, water-soaking, chlorosis, necrosis, pest frass, tunneling, eggs
- Proportion of leaf area affected
- Environmental damage patterns (uniform bleaching, tip burn, edge scorch)
Do NOT diagnose — only describe what you see.

Return ONLY valid JSON (no markdown):
{
  "is_valid": true or false,
  "gatekeeper_reason": "MUST BE IN BENGALI (বাংলা ভাষায়) if rejected, null if valid",
  "detected_crop": "crop name in English",
  "visual_symptoms": "full symptom description in English"
}`;

  const { text, tokensUsed } = await callGemini([
    { text: prompt },
    { inlineData: { mimeType: detectMimeType(imageBase64), data: imageBase64 } },
  ]);
  return { ...(extractJSON(text) as VisionResult), _tokens_used: tokensUsed };
}
// Kept for backward compatibility in case other modules still import this symbol.
void runVision;

async function runVisionAndBiotic(
  imageBase64: string,
  context: {
    scanContext: string;
    weather: string;
    humidity: number;
    consecutiveWetDays: number;
    expectedCrop: string | null;
    zoneId: string;
    zoneClimate: string;
    abioticScore: number;
    neighborSprays: NeighborSprayLine[];
    ragCases: RagCase[];
  }
): Promise<VisionBioticResult> {
  const ragSection =
    context.ragCases.length > 0
      ? context.ragCases
          .map((r) => `- ${r.disease_id ?? "Unknown"} | trust:${r.trust_weight ?? 0} | ${r.diagnosis_summary ?? ""}`)
          .join("\n")
      : "- no verified nearby cases";
  const spraySection =
    context.neighborSprays.length > 0
      ? context.neighborSprays
          .map((s) => `- ${s.chemical ?? "Unknown"} (${s.chemical_name ?? ""}) @ ${s.distance_m ?? 0}m`)
          .join("\n")
      : "- none";
  const prompt = `You are AgroSentinel's agricultural vision + biotic AI for Bangladesh.
Return ONLY valid JSON.

FARM CONTEXT:
survey_context: ${context.scanContext || "No survey context"}
weather: ${context.weather}
humidity: ${context.humidity}
consecutive_wet_days: ${context.consecutiveWetDays}
expected_crop: ${context.expectedCrop ?? "unknown"}
zone_id: ${context.zoneId}
zone_climate: ${context.zoneClimate}
abiotic_score: ${context.abioticScore.toFixed(2)}
neighbor_sprays:
${spraySection}
rag_cases:
${ragSection}

TASK:
1) Gatekeeper: reject if blurry/dark/non-plant/non-agri.
2) If valid, extract visual symptoms.
3) In same pass, output biotic diagnosis estimate (or None if pollution-like / weak evidence).

Output schema:
{
  "is_valid": true|false,
  "gatekeeper_reason": "বাংলা rejection reason or null",
  "detected_crop": "English crop name",
  "visual_symptoms": "Detailed symptom description in English",
  "biotic_score": 0.0-1.0,
  "disease_type": "Biotic"|"None",
  "stress_subtype": "Biotic_Fungal"|"Biotic_Pest"|"Biotic_Viral"|"Biotic_Bacterial"|"None",
  "confidence": 0.0-1.0,
  "disease_name_en": "or null",
  "disease_name_bn": "or null",
  "weather_supports_disease": true|false,
  "rag_match_count": number,
  "reasoning_bn": "2-3 Bengali sentences",
  "remedy_bn": "Bengali remedy or null",
  "suggested_disease_id": "kb_diseases.disease_id or null",
  "suggested_pollutant_id": null,
  "evidence_chain": [{"type":"visual|weather|rag","observation":"...","supports":"...","weight":0.0}],
  "counter_evidence": ["..."]
}`;
  const { text, tokensUsed } = await callGemini([
    { text: prompt },
    { inlineData: { mimeType: detectMimeType(imageBase64), data: imageBase64 } },
  ]);
  return { ...(extractJSON(text) as VisionBioticResult), _tokens_used: tokensUsed };
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE B — EMBEDDING (optional; keep behind ENABLE_RAG)
// ══════════════════════════════════════════════════════════════════════════════
async function getEmbedding(text: string): Promise<number[]> {
  // NOTE: Some Gemini projects/API versions do not support this model/method.
  // Treat failures as non-fatal and skip RAG when it fails.
  const url = `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 2000) }] },
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: 1024,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    console.error("Embedding error:", JSON.stringify(data, null, 2));
    throw new Error(data.error?.message ?? JSON.stringify(data));
  }
  return data.embedding.values as number[];
}

// ══════════════════════════════════════════════════════════════════════════════
// 7-DAY CUMULATIVE PLUME EXPOSURE  ← THE NEW SCIENTIFIC CORE
//
// WHY THIS REPLACES INSTANT WIND CHECK:
//   Instant wind tells you what's happening RIGHT NOW.
//   But plant damage from SO₂/pollutants is cumulative — it builds up over
//   days of repeated exposure. A 5-minute wind shift at scan time is
//   meaningless. What matters is: how many hours in the past 7 days was
//   the wind blowing FROM the factory TOWARD this farm?
//
// HOW IT WORKS:
//   1. Fetch 168 hourly wind_direction readings from Open-Meteo (past 7 days)
//      for the farm's coordinates — completely free, no API key needed.
//   2. For each factory in industrial_hotspots (1–10 in your case):
//      a. Compute bearing: angle FROM factory TO farm (ST_Azimuth equivalent in JS)
//      b. For each hourly reading: is wind blowing from factory toward farm?
//         Wind blows FROM direction windDeg. Plume travels TO windDeg+180°.
//         Match if |bearing - (windDeg + 180°)| < (plume_cone_deg / 2)
//         AND factory is within max_plume_km
//         AND factory is active this month
//      c. Count matching hours → exposureHours
//   3. Convert exposureHours → plumeScore (continuous, no cliff-edge):
//      score = min(0.50, exposureHours / 100)
//      • 0h  → 0.00  (no exposure)
//      • 5h  → 0.05  (negligible)
//      • 20h → 0.20  (moderate)
//      • 50h → 0.50  (heavy — capped)
//   4. Take the MAX score across all factories (worst-case for farmer safety)
//
// DATA SOURCE: Open-Meteo Historical Weather API
//   - Free, no API key, 1-hour resolution, reliable
//   - URL: https://archive-api.open-meteo.com/v1/archive
//   - Returns wind_direction_10m array (degrees, hourly)
// ══════════════════════════════════════════════════════════════════════════════

interface HotspotRow {
  id: string;
  factory_name_bn: string;
  location: unknown;    // PostGIS geography — we get lat/lng from DB separately
  factory_lat: number; // fetched via ST_Y(location)
  factory_lng: number; // fetched via ST_X(location)
  max_plume_km: number;
  plume_cone_deg: number;
  primary_pollutant_id: string;
  active_months: number[];
  is_currently_active: boolean;
}

interface PlumeExposureResult {
  exposureHours: number;   // total hours farm was in plume over 7 days
  plumeScore: number;   // 0.0–0.50 continuous score
  dominantFactory: string;   // factory_name_bn with highest exposure
  dominantPollutantId: string | null;
  perFactoryHours: Record<string, number>; // for audit log
}

// Bearing in degrees from point A to point B (0=North, 90=East, etc.)
function bearingDeg(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(toLng - fromLng);
  const fLat = toRad(fromLat);
  const tLat = toRad(toLat);
  const y = Math.sin(dLng) * Math.cos(tLat);
  const x = Math.cos(fLat) * Math.sin(tLat) - Math.sin(fLat) * Math.cos(tLat) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Haversine distance in km
function distanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Smallest angular difference between two bearings (0–180°)
function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

async function computeCumulativePlumeExposure(
  farmLat: number,
  farmLng: number,
  hotspots: HotspotRow[],
  scanId: string,
  cachedWeatherData?: WeatherCache | null   // weather_details.weather_data — avoids redundant HTTP call
): Promise<PlumeExposureResult> {

  const safeResult: PlumeExposureResult = {
    exposureHours: 0, plumeScore: 0.0,
    dominantFactory: "none", dominantPollutantId: null, perFactoryHours: {},
  };

  if (!hotspots || hotspots.length === 0) return safeResult;

  // ── Get hourly wind data ─────────────────────────────────────────────────
  // Strategy: reuse weather_details cache if < 2h old (no redundant HTTP call).
  // weather.ts already fetches 168h hourly data and stores in weather_data.hourly.
  let hourlyWindDirs: number[] = [];
  let hourlyWindSpeeds: number[] = [];

  const cachedHourly = cachedWeatherData?.hourly;
  const cachedComputedAt = cachedWeatherData?.computed?.computed_at;
  const cacheAgeHours = cachedComputedAt
    ? (Date.now() - new Date(cachedComputedAt).getTime()) / 3_600_000
    : Infinity;

  if ((cachedHourly?.wind_direction_10m?.length ?? 0) >= 100 && cacheAgeHours < 2) {
    // Cache is fresh — use it directly, zero HTTP calls
    hourlyWindDirs = cachedHourly?.wind_direction_10m ?? [];
    hourlyWindSpeeds = cachedHourly?.wind_speed_10m ?? [];
    log(scanId, "🌬️ ", `Hourly wind: ${hourlyWindDirs.length}h from DB cache (age: ${cacheAgeHours.toFixed(1)}h)`);
  } else {
    // Cache stale or missing — fall back to direct Open-Meteo call
    log(scanId, "🌬️ ", `Cache stale (${cacheAgeHours.toFixed(1)}h) — fetching from Open-Meteo...`);
    const openMeteoUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${farmLat.toFixed(4)}&longitude=${farmLng.toFixed(4)}` +
      `&hourly=wind_direction_10m,wind_speed_10m` +
      `&past_days=7&timezone=Asia%2FDhaka`;
    try {
      const res = await fetch(openMeteoUrl, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      hourlyWindDirs = data?.hourly?.wind_direction_10m ?? [];
      hourlyWindSpeeds = data?.hourly?.wind_speed_10m ?? [];
      log(scanId, "🌬️ ", `Open-Meteo fallback: ${hourlyWindDirs.length}h fetched`);
    } catch (err: unknown) {
      logError(scanId, "Open-Meteo fetch (non-fatal — plume score = 0)", err);
      return safeResult;
    }
  }

  const currentMonth = new Date().getMonth() + 1; // 1–12
  const perFactoryHours: Record<string, number> = {};
  let maxExposureScore = 0;
  let maxExposureHours = 0;
  let dominantFactory = "none";
  let dominantPollutantId: string | null = null;

  // ── Per-factory exposure calculation ────────────────────────────────────
  for (const factory of hotspots) {
    // Skip inactive factories (seasonal — e.g. brick kilns only Nov–Apr)
    if (!factory.is_currently_active) continue;
    if (factory.active_months?.length > 0 &&
      !factory.active_months.includes(currentMonth)) continue;

    const distKm = distanceKm(farmLat, farmLng, factory.factory_lat, factory.factory_lng);

    // Farm is outside this factory's maximum plume reach — skip entirely
    if (distKm > factory.max_plume_km) continue;

    // Bearing FROM factory TO farm (this is the direction plume must travel to reach farm)
    const factoryToFarmBearing = bearingDeg(
      factory.factory_lat, factory.factory_lng,
      farmLat, farmLng
    );

    let factoryExposureScore = 0;

    // Atmospheric Physics approximation (Simplified Gaussian Plume model)
    // 1. Plume intensity decays with distance (1/x² roughly for 3D, 1/x for 2D spreading)
    // 2. High wind speed = lower concentration (faster dispersion, lower intensity per cm²)
    // 3. Very low wind speed (<1 km/h) = pooling, but doesn't travel far.

    // Base intensity of this factory at 1km distance under 10km/h wind
    const basePollutantLoad = 1.0;

    // Distance decay factor: intensity drops off as we get further away
    // Using an inverse-distance decay (1 / (dist + 1)) to prevent infinity at 0 distance
    const distanceDecay = 1.0 / (distKm + 1.0);

    let exposedHours = 0;

    for (let i = 0; i < hourlyWindDirs.length; i++) {
      const windFromDeg = hourlyWindDirs[i];
      const windSpeedKmh = hourlyWindSpeeds[i] ?? 0;

      // Skip calm hours — wind < 1 km/h has no meaningful plume direction
      // Also skip if wind is so slow it physically cannot reach the farm in 1 hour
      if (windSpeedKmh < 1.0 || windSpeedKmh < distKm) continue;

      // Wind blows FROM windFromDeg, so plume travels TOWARD windFromDeg + 180°
      const plumeTravelDir = (windFromDeg + 180) % 360;

      // Is the farm within the plume cone this hour?
      const angleDifference = angleDiff(factoryToFarmBearing, plumeTravelDir);
      const withinCone = angleDifference <= (factory.plume_cone_deg / 2);

      if (withinCone) {
        exposedHours++;

        // Intensity calculation for this specific hour
        // 1. Faster wind = lower concentration of pollutants (dilution)
        // 2. We use 10km/h as a "standard" baseline wind. 
        // 3. If wind is 20km/h, concentration is half. If 5km/h, concentration is double (up to a limit).
        const windDilutionFactor = Math.min(2.0, 10.0 / Math.max(1.0, windSpeedKmh));

        // 4. Center-of-cone intensity: if wind is blowing directly at farm (angleDiff = 0), intensity is 1.0. 
        // If it's at the edge of the cone, intensity is 0.5. Gaussian dropoff.
        const coneCenterAlignment = 1.0 - (angleDifference / (factory.plume_cone_deg / 2)) * 0.5;

        // Calculate this hour's pollution dose
        const hourlyDose = basePollutantLoad * distanceDecay * windDilutionFactor * coneCenterAlignment;

        factoryExposureScore += hourlyDose;
      }
    }

    perFactoryHours[factory.factory_name_bn] = exposedHours;

    if (factoryExposureScore > maxExposureScore) {
      maxExposureScore = factoryExposureScore;
      maxExposureHours = exposedHours; // hours corresponding to the highest score
      dominantFactory = factory.factory_name_bn;
      dominantPollutantId = factory.primary_pollutant_id ?? null;
    }
  }

  let totalCombinedDose = 0;
  for (const factory of hotspots) {
    totalCombinedDose += perFactoryHours[factory.factory_name_bn] ?? 0;
  }
  const combinedPlumeScore = Math.min(0.50, (totalCombinedDose / 30.0) * 0.50);
  const dominantPlumeScore = Math.min(0.50, (maxExposureScore / 30.0) * 0.50);
  const plumeScore = Math.max(dominantPlumeScore, combinedPlumeScore);

  log(scanId, "🏭", `Plume: dominant=${dominantPlumeScore.toFixed(3)}, combined=${combinedPlumeScore.toFixed(3)}, final=${plumeScore.toFixed(3)}`, {
    exposureHours: maxExposureHours,
    dominantFactory,
    perFactoryHours,
  });

  return { exposureHours: maxExposureHours, plumeScore, dominantFactory, dominantPollutantId, perFactoryHours };
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE C — BIOTIC MODULE
// ══════════════════════════════════════════════════════════════════════════════
async function runBioticModule(
  visionData: VisionResult,
  dbContext: {
    abioticScore: string;
    weather: string;
    humidity: number;
    consecutiveWetDays: number;
    expectedCrop: string | null;
    zoneId: string;
    zoneClimate: string;
    heavyMetal: AnyRecord | null;
    survey: AnyRecord | null;
    neighborSprays: NeighborSprayLine[];
  },
  ragCases: RagCase[]
): Promise<AnyRecord> {
  const ragSection =
    ragCases.length > 0
      ? ragCases.map((r) =>
        `  • ${r.disease_id ?? "Unknown"} | trust:${r.trust_weight} | ${r.diagnosis_summary}`
      ).join("\n")
      : "  (no verified local cases within 5km)";

  const neighborSprayLines =
    dbContext.neighborSprays.length > 0
      ? dbContext.neighborSprays.map((s) =>
        `  • ${s.chemical} (${s.chemical_name}) @ ${s.distance_m}m — expires in ${s.hours_remaining}h`
      ).join("\n")
      : "  None active";

  const prompt = `You are AgroSentinel's Biotic Disease AI for Bangladesh rice farmers.
PRIMARY MISSION: identify BIOTIC disease if present, otherwise return None.

━━ VISUAL EVIDENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Detected crop : ${visionData.detected_crop}
Symptoms      : ${visionData.visual_symptoms}

━━ REGION & CURRENT WEATHER ━━━━━━━━━━━━━━━━━━━━━━━━
Zone ID              : ${dbContext.zoneId}
Zone Climate Profile : ${dbContext.zoneClimate}
Weather now          : ${dbContext.weather}
Humidity             : ${dbContext.humidity}%
Consecutive wet days : ${dbContext.consecutiveWetDays}
Expected crop (DB)   : ${dbContext.expectedCrop}
━━ WEEKLY SURVEY (farmer ground truth) ━━━━━━━━━━━━━━
Soil pH status   : ${dbContext.survey?.ph ?? "unknown"}
Water colour     : ${dbContext.survey?.water ?? "clear"}
Smoke exposure   : ${dbContext.survey?.smoke ? "YES — farmer reported factory smoke this week" : "No"}
Canal pollution  : ${dbContext.survey?.canal ? "YES — contaminated canal water this week" : "No"}
Pest pressure    : ${dbContext.survey?.pest ?? "low"}
Neighbor problem : ${dbContext.survey?.neighbor ? "YES — neighbors report same issue (epidemic or pollution)" : "No"}

━━ NEIGHBOUR SPRAY EVENTS (within 1km) ━━━━━━━━━━━━━
${neighborSprayLines}

━━ POLLUTION CONTEXT (for reference only) ━━━━━━━━━━
Abiotic score     : ${dbContext.abioticScore} / 1.00
NOTE: The abiotic classification is handled separately by code.
      Your job is to identify the BIOTIC disease if present.
      Focus on visual symptoms, weather, and RAG cases.
      If symptoms look like pollution burn (uniform bleaching,
      tip scorch, edge necrosis) rather than biological disease,
      return score: 0.0 to indicate no biotic disease detected.

━━ RAG: VERIFIED LOCAL CASES (5km radius) ━━━━━━━━━━
${ragSection}

━━ DECISION RULES (apply in order) ━━━━━━━━━━━━━━━━━
1. Use visual symptoms first.
2. Humidity + wet days supports fungal disease probability.
3. Use RAG match evidence to improve certainty.
4. If evidence is weak or pollution-like, return disease_type "None" and low score.

Return ONLY valid JSON (no markdown):
{
  "biotic_score": 0.0 to 1.0,
  "disease_type": "Biotic" or "None",
  "stress_subtype": "Biotic_Fungal"|"Biotic_Pest"|"Biotic_Viral"|"Biotic_Bacterial"|"None",
  "confidence": 0.0 to 1.0,
  "disease_name_en": "disease name or null",
  "disease_name_bn": "রোগের নাম বাংলায় বা null",
  "weather_supports_disease": true or false,
  "rag_match_count": number,
  "reasoning_bn": "2-3 sentences in Bengali about the biotic finding",
  "remedy_bn": "specific remedy if biotic found, else null",
  "suggested_disease_id": "kb_diseases.disease_id or null",
  "suggested_pollutant_id": null
}`;

  const { text, tokensUsed } = await callGemini([{ text: prompt }], 0.1);
  const parsed = extractJSON(text) as AnyRecord;
  parsed._tokens_used = tokensUsed;
  return parsed;
}
// Kept for backward compatibility in case other modules still import this symbol.
void runBioticModule;

// ══════════════════════════════════════════════════════════════════════════════
// STRESS TYPE RESOLVER
// ══════════════════════════════════════════════════════════════════════════════
function resolveStressType(
  finalVerdict: FinalVerdict,
  plumeScore: number,
  waterColor: string | null | undefined
): StressType {
  const VALID: StressType[] = [
    "Biotic_Fungal", "Biotic_Pest", "Biotic_Viral", "Biotic_Bacterial",
    "Abiotic_Pollution", "Abiotic_Nutrient", "Abiotic_Water", "Abiotic_Weather",
  ];

  const modelSubtype = finalVerdict.stress_subtype as StressType;
  if (VALID.includes(modelSubtype)) return modelSubtype;

  if (finalVerdict.disease_type === "Abiotic") {
    if (plumeScore > 0 || finalVerdict.suggested_pollutant_id) return "Abiotic_Pollution";
    if (waterColor && waterColor !== "clear") return "Abiotic_Water";
    return "Abiotic_Nutrient";
  }

  const dx = (finalVerdict.final_diagnosis ?? "").toLowerCase();
  if (dx.includes("blast") || dx.includes("blight") || dx.includes("fungal") ||
    dx.includes("sheath") || dx.includes("rot") || dx.includes("mold") ||
    dx.includes("rust") || dx.includes("smut") || dx.includes("brown spot"))
    return "Biotic_Fungal";
  if (dx.includes("hopper") || dx.includes("borer") || dx.includes("pest") ||
    dx.includes("insect") || dx.includes("mite") || dx.includes("aphid") ||
    dx.includes("midge") || dx.includes("rat") || dx.includes("thrip"))
    return "Biotic_Pest";
  if (dx.includes("tungro") || dx.includes("virus") || dx.includes("viral") ||
    dx.includes("grassy") || dx.includes("dwarf") || dx.includes("ragged"))
    return "Biotic_Viral";
  if (dx.includes("bacterial") || dx.includes("bacteria") ||
    dx.includes("leaf scald") || dx.includes("foot rot") || dx.includes("sheath brown"))
    return "Biotic_Bacterial";

  return "Biotic_Fungal";
}

// ══════════════════════════════════════════════════════════════════════════════
// DIRECT scan_logs INSERT
// Maps every column from the schema — no RPC, no enum coercion bugs
// ══════════════════════════════════════════════════════════════════════════════
async function saveScanLog(params: {
  farmerId: string;
  landId: string;
  cropId: string | null;
  lat: number;
  lng: number;
  imageUrl: string;
  visionOutput: object;
  questionnaireAnswers: object;
  environmentalContext: object;
  stressType: StressType;
  diseaseId: string | null;
  pollutantId: string | null;
  aiConfidence: number;
  aiModel: string;
  ragCasesUsed: number;
  tokensUsed?: number;
  symptomVector: number[] | null;
  finalVerdict: FinalVerdict;
  bioticScore: number;
  abioticScore: number;
  heavyMetalScore: number;
  secondaryCause: string | null;
  compoundStress: boolean;
  overridesApplied: string[];
  reasoningChain: string[];
  evidenceSummary: ArbiterResult["evidence_summary"] | null;
  contradictionsResolved: ArbiterResult["contradictions_resolved"] | null;
}): Promise<{ error: unknown; scanLogId: string | null }> {
  const {
    farmerId, landId, cropId, lat, lng, imageUrl,
    visionOutput, questionnaireAnswers, environmentalContext,
    stressType, diseaseId, pollutantId, aiConfidence, aiModel,
    tokensUsed, symptomVector, bioticScore, abioticScore, heavyMetalScore,
    secondaryCause, compoundStress, overridesApplied,
    reasoningChain, evidenceSummary, contradictionsResolved,
  } = params;

  void params.ragCasesUsed;
  void params.finalVerdict;

  const verificationStatus: VerificationStatus = "pending";
  // NOTE: rag_trust_weight is OMITTED — the column has a DB DEFAULT constraint.
  // Inserting a value causes "cannot insert a non-DEFAULT value" error.
  // The DB computes it automatically. Do not add it back here.
  //
  // NOTE: use_for_epidemic_alert is also omitted. Some schemas make it GENERATED ALWAYS
  // (or enforced by triggers). Inserting a value can fail with:
  // "cannot insert a non-DEFAULT value into column use_for_epidemic_alert".
  const { data, error } = await supabase
    .from("scan_logs")
    .insert({
      farmer_id: farmerId,
      land_id: landId,
      crop_id: cropId,
      growth_stage_days: null,
      scan_location: `SRID=4326;POINT(${lng} ${lat})`,
      grid_cell_id: `${lat.toFixed(2)}_${lng.toFixed(2)}`,
      image_url: imageUrl,
      vision_output: visionOutput,
      questionnaire_answers: questionnaireAnswers,
      environmental_context: {
        ...environmentalContext,
        detection_scores: {
          biotic: { pct: Math.round(bioticScore * 100) },
          abiotic: { pct: Math.round(abioticScore * 100) },
          heavy_metal: { pct: Math.round(heavyMetalScore * 100) },
        },
      },
      stress_type: stressType,
      confirmed_disease_id: diseaseId,
      confirmed_pollutant_id: pollutantId,
      remedy_id: null,
      ai_confidence: aiConfidence,
      ai_model_used: aiModel,
      tokens_used: tokensUsed ?? 0,
      verification_status: verificationStatus,
      verified_by_farmer_id: null,
      verified_at: null,
      embedding: symptomVector ?? null,
      biotic_score: bioticScore,
      abiotic_score: abioticScore,
      heavy_metal_score: heavyMetalScore,
      secondary_cause: secondaryCause,
      compound_stress: compoundStress,
      overrides_applied: overridesApplied,
      reasoning_chain: reasoningChain,
      evidence_summary: evidenceSummary,
      contradictions_resolved: contradictionsResolved,
    })
    .select("id")
    .single();

  return { error, scanLogId: data?.id ?? null };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  const scanId = `SCN-${Date.now().toString(36).toUpperCase()}`;
  const T: Record<string, number> = {};

  try {
    const { imageBase64, farmerId, landId, lat, lng } = await req.json();
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearerToken) {
      return NextResponse.json(
        { success: false, message: "অনুমোদিত নন। আবার লগইন করুন।" },
        { status: 401 }
      );
    }
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${bearerToken}` } } }
    );
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json(
        { success: false, message: "অনুমোদিত নন। আবার লগইন করুন।" },
        { status: 401 }
      );
    }
    if (authData.user.id !== farmerId) {
      return NextResponse.json(
        { success: false, message: "এই কৃষকের পক্ষে স্ক্যান করার অনুমতি নেই।" },
        { status: 403 }
      );
    }

    console.log(`\n${"═".repeat(60)}`);
    log(scanId, "🌿", "NEW SCAN REQUEST");
    log(scanId, "👤", `farmer: ${farmerId}`);
    log(scanId, "📍", `land: ${landId}  |  GPS: ${lat}, ${lng}`);
    log(scanId, "🖼️ ", `image: ~${Math.round((imageBase64?.length ?? 0) * 0.75 / 1024)} KB`);
    log(scanId, "🤖", `model: ${GEMINI_MODEL}`);

    if (!imageBase64 || !farmerId || !landId || lat == null || lng == null) {
      return NextResponse.json(
        { success: false, message: "imageBase64, farmerId, landId, lat, lng সব দরকার।" },
        { status: 400 }
      );
    }

    // ── STEP 0: Payload Size Validation (Serverless safety) ───────────────
    // Vercel has a strict 4.5MB limit for serverless function payloads.
    // If the base64 string is too large, reject it before processing.
    const imageSizeKB = Math.round((imageBase64.length * 0.75) / 1024);
    if (imageSizeKB > 4500) {
      log(scanId, "🚫", `Image too large: ${imageSizeKB} KB`);
      return NextResponse.json(
        { success: false, message: `ছবির সাইজ অনেক বড় (${(imageSizeKB / 1024).toFixed(1)}MB)। দয়া করে ৪ মেগাবাইটের ছোট ছবি আপলোড করুন।` },
        { status: 413 } // Payload Too Large
      );
    }

    // ── STEP 1: Upload image ───────────────────────────────────────────────
    log(scanId, "📤", "Uploading image...");
    T.upload = Date.now();

    const mimeType = detectMimeType(imageBase64);
    const ext = mimeType === "image/png"
      ? "png"
      : mimeType === "image/heic"
        ? "heic"
        : mimeType === "image/gif"
          ? "gif"
          : "jpg";

    const imagePath = `scans/${farmerId}/${scanId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("scan-images")
      .upload(imagePath, Buffer.from(imageBase64, "base64"), {
        contentType: mimeType, cacheControl: "3600", upsert: false,
      });

    if (uploadError) {
      logError(scanId, "Storage Upload", uploadError);
      return NextResponse.json(
        { success: false, message: "ছবি আপলোড করতে সমস্যা হয়েছে।" },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from("scan-images").getPublicUrl(imagePath);
    const imageUrl = urlData.publicUrl;
    log(scanId, "✅", `Image uploaded (${Date.now() - T.upload}ms)`);

    // ── STEP 2: Parallel DB + Open-Meteo fetch ─────────────────────────────
    // DB fetch and 7-day wind data fetch run simultaneously
    log(scanId, "🗄️ ", "Fetching DB context + hotspots (parallel)...");
    T.db = Date.now();

    const [
      weatherRes,
      profileRes,
      landRes,
      farmerRes,
      communitySprayRes,
      sprayEventsRes,
      hotspotsRes,
      heavyMetalRes,
      waterPollutionRes,
      satelliteWaterRes,
      kbCropsRes,
      recentPollutionRes,
    ] = await Promise.all([
      supabase.from("weather_details")
        .select("weather_data")
        .eq("farmer_id", farmerId)
        .maybeSingle(),
      supabase.from("farm_profiles")
        .select(`
            soil_ph, water_color, water_risk,
            smoke_exposure, canal_contamination, neighbor_problem,
            pest_level, scan_context
          `)
        .eq("farmer_id", farmerId).eq("land_id", landId)
        .maybeSingle(),
      supabase.from("farmer_lands")
        .select("crop_id, zone_id, land_name")
        .eq("land_id", landId)
        .maybeSingle(),
      supabase.from("farmers")
        .select("zone_id, kb_zones(climate_profile)")
        .eq("id", farmerId)
        .maybeSingle(),
      supabase.rpc("get_community_spray_risk_for_lands", {
        p_farmer_id: farmerId, p_radius_km: 1.0,
      }),
      // Optional additional evidence; does not block scan if table/RLS is missing.
      supabase
        .from("spray_events")
        .select("chemical_type, chemical_name, expires_at, harm_radius_m, land_id")
        .eq("is_active", true)
        .limit(50),
      // Fetch all active hotspots with extracted lat/lng coordinates
      // ST_Y = latitude, ST_X = longitude from PostGIS geography point
      supabase.from("industrial_hotspots")
        .select(`
            id, factory_name_bn, max_plume_km, plume_cone_deg,
            primary_pollutant_id, active_months, is_currently_active
          `)
        .eq("is_currently_active", true),
      // Fetch latest heavy metal report for this land
      supabase.from("heavy_metal_reports")
        .select("metal_type, confidence_score, severity")
        .eq("land_id", landId)
        .order("reported_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("water_pollution_events")
        .select("event_id, pollution_type, severity, is_active")
        .eq("is_active", true),
      supabase
        .from("satellite_water_data")
        .select("suspected_pollution, water_quality_index, turbidity")
        .eq("grid_cell_id", `${lat.toFixed(2)}_${lng.toFixed(2)}`)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // For deterministic land suitability checks
      supabase
        .from("kb_crops")
        .select("crop_id, planting_months, suitable_zones, soil_pref, flood_tolerant, salinity_tolerant"),
      // For pattern bonus (recurring abiotic pollution scans)
      supabase
        .from("scan_logs")
        .select("id")
        .eq("farmer_id", farmerId)
        .eq("stress_type", "Abiotic_Pollution")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    ]);

    log(scanId, "✅", `DB fetch done (${Date.now() - T.db}ms)`, {
      weather: !!weatherRes.data,
      profile: !!profileRes.data,
      land: !!landRes.data,
      sprays: communitySprayRes.data?.length ?? 0,
      spray_events: sprayEventsRes.data?.length ?? 0,
      hotspots: hotspotsRes.data?.length ?? 0,
      metals: !!heavyMetalRes?.data,
      waterEvents: waterPollutionRes.data?.length ?? 0,
      satellite: !!satelliteWaterRes.data,
      kb_crops: kbCropsRes.data?.length ?? 0,
      recent_pollution_scans_30d: recentPollutionRes.data?.length ?? 0,
    });

    // ── STEP 3: Fetch hotspot coordinates ─────────────────────────────────
    // We MUST use the get_hotspot_coordinates RPC to get exact ST_X/ST_Y from PostGIS.
    // Mathematical reconstruction from distance/bearing causes floating point drift.
    T.plume = Date.now();
    let enrichedHotspots: HotspotRow[] = [];

    try {
      const hotspotCoordsResult = await supabase.rpc("get_hotspot_coordinates").throwOnError();
      if (hotspotCoordsResult.data) {
        enrichedHotspots = hotspotCoordsResult.data as HotspotRow[];
        log(scanId, "🏭", `Exact factory coordinates fetched via PostGIS: ${enrichedHotspots.length} hotspots`);
      }
    } catch (err: unknown) {
      logError(scanId, "get_hotspot_coordinates RPC missing or failed (Run SQL to create it)", err);
      // We do NOT fall back to mathematical reconstruction (Option C) as it introduces circular error propagation.
    }

    const weatherData = weatherRes.data?.weather_data ?? null;
    const weather = weatherData?.current ?? null;
    const windFromDeg = weather?.wind_direction_10m ?? 180;
    const windSpeedKmh = weather?.wind_speed_10m ?? 0;
    const humidity = weather?.relative_humidity_2m ?? 0;
    // consecutive_wet_days is computed server-side in weather.ts and stored under .computed
    const consecutiveWetDays = weatherData?.computed?.consecutive_wet_days ?? 0;
    const weatherStr = weather
      ? `T:${weather.temperature_2m}°C H:${humidity}% Wind:${windFromDeg}°@${windSpeedKmh}km/h Rain:${weather.precipitation}mm`
      : "আবহাওয়া ডেটা নেই";

    // ── STEP 4: Compute 7-day cumulative plume exposure ───────────────────
    log(scanId, "🌬️ ", `Computing 7-day cumulative plume (${enrichedHotspots.length} factories)...`);

    const plumeExposure = await computeCumulativePlumeExposure(
      lat, lng, enrichedHotspots, scanId,
      weatherRes.data?.weather_data  // reuse cache — avoids redundant Open-Meteo HTTP call
    );

    log(scanId, "✅", `Plume exposure done (${Date.now() - T.plume}ms)`, {
      exposureHours: plumeExposure.exposureHours,
      plumeScore: plumeExposure.plumeScore,
      dominant: plumeExposure.dominantFactory,
      pollutant: plumeExposure.dominantPollutantId ?? null,
    });

    // ── STEP 5: Build abiotic score with new weights ───────────────────────
    const profile = profileRes.data;
    const cropId = landRes.data?.crop_id ?? null;
    const zoneId = landRes.data?.zone_id ?? farmerRes.data?.zone_id ?? "unknown";

    const [zoneRes] = await Promise.all([
      supabase.from("kb_zones").select("*").eq("zone_id", zoneId).maybeSingle(),
    ]);
    const zoneData = (zoneRes.data ?? null) as AnyRecord | null;
    const currentMonth = new Date().getMonth() + 1;

    const kbCrops = (kbCropsRes.data ?? []) as AnyRecord[];
    const cropRow = cropId ? (kbCrops.find((c) => c.crop_id === cropId) ?? null) : null;

    const landSuitability = checkLandSuitability(
      cropRow,
      zoneData,
      profile as AnyRecord | null,
      currentMonth
    );

    // Extract climate profile from the joined kb_zones table (Supabase returns joined tables as objects/arrays)
    let zoneClimate = "Unknown climate";
    if (farmerRes.data?.kb_zones && !Array.isArray(farmerRes.data.kb_zones)) {
      const kbZones = farmerRes.data.kb_zones as unknown;
      if (isRecord(kbZones) && typeof kbZones.climate_profile === "string") {
        zoneClimate = kbZones.climate_profile;
      }
    }

    const neighborSprays = ((communitySprayRes.data ?? []) as AnyRecord[]).map((s) => ({
      chemical: typeof s.chemical_type === "string" ? s.chemical_type : "Unknown",
      chemical_name: typeof s.chemical_name === "string" ? s.chemical_name : "",
      distance_m: Math.round(typeof s.distance_m === "number" ? s.distance_m : 0),
      hours_remaining: Math.round(typeof s.hours_remaining === "number" ? s.hours_remaining : 0),
      nearest_own_land: typeof s.nearest_own_land === "string" ? s.nearest_own_land : "",
    }));

    // ── NEW WEIGHT TABLE ────────────────────────────────────────────────────
    // Heavy Metal Toxicity    | 0.40    | Strong empirical correlate for chlorosis/stunting
    // Cumulative plume (7d)   | 0-0.50  | Gaussian plume dose model (objective)
    // Canal contamination     | 0.15    | Direct waterborne toxicity vector
    // Neighbor sprays active  | 0.10    | Drift distance < 1km (high probability)
    // Survey: canal           | 0.08    | Farmer observation (moderate reliability)
    // Survey: smoke           | 0.08    | Farmer observation (moderate reliability)
    // Survey: water risk      | 0.07    | Farmer observation 
    // Survey: neighbor problem| 0.05    | Epidemic vs Abiotic cluster indicator
    // Total max               | ~1.0+   | Capped at 1.0

    const metalSignal = heavyMetalRes?.data?.severity === 'high' || heavyMetalRes?.data?.severity === 'critical' ? 0.40 : 0.00;
    const canalSignal = profile?.canal_contamination ? 0.15 : 0.00;
    const spraySignal = neighborSprays.length > 0 ? 0.10 : 0.00;
    const smokeSignal = profile?.smoke_exposure ? 0.08 : 0.00;
    const waterSignal = profile?.water_risk === "Chemical" || 
                      profile?.water_risk === "Contaminated" ? 0.07 : 0.00;
    const neighborSignal = profile?.neighbor_problem ? 0.05 : 0.00;
    const satelliteSignal = satelliteWaterRes?.data?.suspected_pollution === true ? 0.06 : 0.00;
    const waterEventSignal = (waterPollutionRes?.data?.length ?? 0) > 0 ? 0.15 : 0.00;

    const recentPollutionCount = recentPollutionRes.data?.length ?? 0;
    const patternBonus = recentPollutionCount >= 3 ? 0.10 : 0.00;

    const abioticScore = Math.min(1.0,
      plumeExposure.plumeScore + // 0–0.50 dynamic, science-based
      metalSignal +           // 0.40
      canalSignal +           // 0.15
      spraySignal +           // 0.10
      smokeSignal +           // 0.08
      waterSignal +           // 0.07
      neighborSignal +        // 0.05
      patternBonus +
      satelliteSignal +
      waterEventSignal
    );

    log(scanId, "📊", `Abiotic score: ${abioticScore.toFixed(2)}`, {
      plumeScore: plumeExposure.plumeScore,
      metalSignal, canalSignal, spraySignal, smokeSignal, waterSignal, neighborSignal,
      satelliteSignal, waterEventSignal,
    });

    // ── STEP 6: Weekly survey gate ─────────────────────────────────────────
    const skipSurveyGate = process.env.SKIP_SURVEY_GATE === "true";
    log(scanId, "📋", `Survey gate skip:${skipSurveyGate} contextReady:${!!profile?.scan_context}`);

    if (!skipSurveyGate && !profile?.scan_context) {
      const now = new Date();
      const dow = now.getUTCDay() || 7;
      const thu = new Date(now);
      thu.setUTCDate(now.getUTCDate() + 4 - dow);
      const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
      const thisWeek = Math.ceil((((thu.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      const thisYear = thu.getUTCFullYear();

      const { data: surveyDone } = await supabase
        .from("surveys").select("id")
        .eq("farmer_id", farmerId).eq("land_id", landId)
        .eq("week_number", thisWeek).eq("year", thisYear)
        .maybeSingle();

      if (!surveyDone) {
        log(scanId, "🚫", `Survey gate BLOCKED — week ${thisWeek}/${thisYear}`);
        return NextResponse.json({
          success: false, blocked: true,
          message: "এই সপ্তাহের জমির সার্ভে সম্পন্ন করুন। সার্ভে না করলে AI সঠিক প্রেক্ষাপট বুঝতে পারবে না।",
        }, { status: 403 });
      }
      log(scanId, "✅", "Survey gate passed");
    }

    // ── STEP 7: Deterministic experts first (for early-exit) ───────────────
    let finalVerdict: FinalVerdict;
    let isCached = false;
    let bioticScoreForLog = 0;
    let bioticTokensUsed = 0;
    const abioticResult = buildAbioticResult(
      abioticScore,
      plumeExposure,
      (profile ?? null) as AnyRecord | null,
      (waterPollutionRes?.data?.[0] ?? null) as AnyRecord | null,
      (satelliteWaterRes?.data ?? null) as AnyRecord | null
    );
    const heavyMetalResult = scoreHeavyMetal(
      zoneData,
      (profile ?? null) as AnyRecord | null,
      (heavyMetalRes?.data ?? null) as AnyRecord | null,
      plumeExposure
    );
    const heavyMetalScoreForLog = Number(heavyMetalResult.heavy_metal_score ?? 0);
    const shouldSkipBioticLLM = abioticScore >= 0.60 || heavyMetalResult.severity === "critical";
    const temp = typeof weather?.temperature_2m === "number" ? weather.temperature_2m : 0;
    const weatherBucket = classifyWeatherBucket(temp, humidity, consecutiveWetDays);
    const weatherHash = md5(weatherBucket);
    let symptomHash = md5(`${scanId}:${cropId ?? "unknown"}:${weatherBucket}`);
    let visionResult: VisionBioticResult = {
      is_valid: true,
      detected_crop: (cropId as string | null) ?? "unknown crop",
      visual_symptoms: "LLM skipped due to deterministic early-exit.",
    };
    let symptomVector: number[] | null = null;
    let ragCases: RagCase[] = [];
    let ragCasesUsed = 0;

    // fetch community in deterministic stage so arbiter can always use it
    const communitySignal: AnyRecord = await getCommunitySignal(lat, lng, zoneId, scanId);

    // ── STEP 8: LLM path (single merged call) unless early-exit ─────────────
    if (!shouldSkipBioticLLM) {
      log(scanId, "👁️🦠", `Vision+Biotic merged call: ${GEMINI_MODEL}...`);
      T.vision = Date.now();
      visionResult = await withRetry(
        () =>
          runVisionAndBiotic(imageBase64, {
            scanContext: profile?.scan_context ?? "",
            weather: weatherStr,
            humidity,
            consecutiveWetDays,
            expectedCrop: cropId ?? null,
            zoneId,
            zoneClimate,
            abioticScore,
            neighborSprays,
            ragCases: [],
          }),
        `${scanId}-vision-biotic`,
        3,
        1500
      );
      bioticTokensUsed = Number(visionResult._tokens_used ?? 0);
      log(scanId, "✅", `Vision+Biotic done (${Date.now() - T.vision}ms)`, {
        is_valid: visionResult.is_valid,
        detected_crop: visionResult.detected_crop,
        symptoms_len: visionResult.visual_symptoms?.length ?? 0,
      });
      if (!visionResult.is_valid) {
        log(scanId, "🚫", `Gatekeeper rejected: ${visionResult.gatekeeper_reason}`);
        return NextResponse.json({
          success: false,
          message: visionResult.gatekeeper_reason ?? "ছবিটি স্পষ্ট নয়। গাছের পাতার কাছ থেকে পরিষ্কার ছবি তুলুন।",
        });
      }
      if (!visionResult.visual_symptoms?.trim()) {
        visionResult.visual_symptoms = `Unspecified symptoms on ${visionResult.detected_crop ?? "unknown crop"}.`;
      }
      symptomHash = md5(visionResult.visual_symptoms ?? "");

      if (ENABLE_RAG) {
        log(scanId, "🔢", "Embedding (text-embedding-004)...");
        T.embed = Date.now();
        try {
          symptomVector = await withRetry(
            () => getEmbedding(visionResult.visual_symptoms ?? ""),
            `${scanId}-embed`,
            3,
            1000
          );
          log(scanId, "✅", `Embedding done (${Date.now() - T.embed}ms) — ${symptomVector.length} dims`);
        } catch (err) {
          logError(scanId, "Embedding (non-fatal — RAG skipped)", err);
        }
      } else {
        log(scanId, "🔢", "Embedding skipped (ENABLE_RAG=false)");
      }

      log(scanId, "🔍", `Cache + RAG${symptomVector ? "" : " (RAG skipped)"}...`);
      T.cache = Date.now();
      const [cacheRes, ragRes] = await Promise.all([
        supabase.rpc("lookup_diagnosis_cache", {
          p_lat: lat,
          p_lng: lng,
          p_weather_hash: weatherHash,
          p_symptom_hash: symptomHash,
          p_abiotic_bucket: abioticBucket(abioticScore),
        }),
        symptomVector
          ? supabase.rpc("search_verified_rag_cases", {
              p_query_embedding: symptomVector,
              p_farmer_lat: lat,
              p_farmer_lng: lng,
              p_radius_km: 5.0,
              p_match_threshold: 0.72,
              p_match_count: 3,
              p_min_trust_weight: 0.60,
            })
          : Promise.resolve({ data: [] }),
      ]);
      const cacheHit = cacheRes.data;
      ragCases = (ragRes.data ?? []) as RagCase[];
      ragCasesUsed = ragCases.length;
      log(scanId, "✅", `Cache+RAG done (${Date.now() - T.cache}ms)`, {
        cacheHit: !!(cacheHit?.length > 0),
        ragCases: ragCases.length,
      });

      if (cacheHit && cacheHit.length > 0) {
        log(scanId, "⚡", "CACHE HIT — skipping model diagnosis logic");
        const hit = cacheHit[0];
        const isAbiotic = hit.pollutant_id != null;
        const cachedBiotic = {
          biotic_score: isAbiotic ? 0 : 0.92,
          confidence: 0.92,
          disease_name_en: isAbiotic ? null : hit.cached_diagnosis_bn,
          disease_name_bn: isAbiotic ? null : hit.cached_diagnosis_bn,
          stress_subtype: isAbiotic ? "None" : "Biotic_Fungal",
          suggested_disease_id: hit.disease_id ?? null,
        } as AnyRecord;
        const rawScores = {
          biotic: Number(cachedBiotic.biotic_score ?? 0),
          abiotic: abioticScore,
          heavy_metal: heavyMetalScoreForLog,
        };
        bioticScoreForLog = rawScores.biotic;
        const weightedScores = applyCommuntiyWeighting(rawScores, communitySignal);
        const classification = classifyResults(weightedScores);
        const arbiter = runReasoningArbiter({
          bioticScore: weightedScores.biotic,
          abioticScore: weightedScores.abiotic,
          heavyMetalScore: weightedScores.heavy_metal,
          bioticConfidence: Number(cachedBiotic.confidence ?? 0.92),
          community: communitySignal,
          ragMatchCount: 0,
          evidenceCount: 2,
          heavyMetalSeverity: String(heavyMetalResult.severity),
        });
        const compoundStress = detectCompoundStress(
          classification.primary,
          classification.secondary,
          weightedScores,
          cachedBiotic,
          heavyMetalResult
        );
        finalVerdict = {
          final_diagnosis: hit.cached_diagnosis_bn,
          disease_type: arbiter.primary_diagnosis === "biotic" ? "Biotic" : "Abiotic",
          stress_subtype:
            arbiter.primary_diagnosis === "biotic" ? "Biotic_Fungal" : String(abioticResult.stress_subtype ?? "Abiotic_Pollution"),
          confidence: arbiter.final_confidence,
          reasoning_bn: hit.cached_diagnosis_bn,
          remedy_bn:
            arbiter.primary_diagnosis === "biotic"
              ? String(hit.remedy_id ?? "রেমেডি তথ্য ক্যাশে নেই।")
              : String(abioticResult.reasoning_bn ?? "পরিবেশগত সংকেত পর্যবেক্ষণ করুন।"),
          spray_suppressed: arbiter.spray_suppressed || abioticScore >= 0.60,
          suggested_disease_id: arbiter.primary_diagnosis === "biotic" ? (hit.disease_id ?? null) : null,
          suggested_pollutant_id: (abioticResult.suggested_pollutant_id as string | null | undefined) ?? hit.pollutant_id ?? null,
          primary_cause: arbiter.primary_diagnosis,
          secondary_cause: arbiter.secondary_diagnosis,
          compound_stress: compoundStress,
          source: "cache",
          model_used: "cache + code-abiotic + code-metal",
          reasoning: {
            expert_a: { score: weightedScores.biotic, evidence: [] },
            expert_b: {
              score: weightedScores.abiotic,
              evidence: Array.isArray(abioticResult.active_signals) ? abioticResult.active_signals : [],
            },
            expert_c: {
              score: weightedScores.heavy_metal,
              evidence: Array.isArray(heavyMetalResult.metal_types) ? heavyMetalResult.metal_types : [],
            },
            arbiter,
          },
        };
        isCached = true;
      } else {
        const bioticAdjusted = adjustBioticScore(
          {
            biotic_score: Number(visionResult.biotic_score ?? 0),
            confidence: Number(visionResult.confidence ?? 0),
            stress_subtype: visionResult.stress_subtype ?? "None",
            disease_name_en: visionResult.disease_name_en ?? null,
            disease_name_bn: visionResult.disease_name_bn ?? null,
            suggested_disease_id: visionResult.suggested_disease_id ?? null,
            remedy_bn: visionResult.remedy_bn ?? null,
            reasoning_bn: visionResult.reasoning_bn ?? "",
          } as AnyRecord,
          humidity,
          consecutiveWetDays,
          ragCases
        );
        const rawScores = {
          biotic: Number(bioticAdjusted.biotic_score ?? 0),
          abiotic: abioticScore,
          heavy_metal: heavyMetalScoreForLog,
        };
        bioticScoreForLog = rawScores.biotic;
        const weightedScores = applyCommuntiyWeighting(rawScores, communitySignal);
        const classification = classifyResults(weightedScores);
        const arbiter = runReasoningArbiter({
          bioticScore: weightedScores.biotic,
          abioticScore: weightedScores.abiotic,
          heavyMetalScore: weightedScores.heavy_metal,
          bioticConfidence: Number(bioticAdjusted.confidence ?? 0),
          community: communitySignal,
          ragMatchCount: ragCases.length,
          evidenceCount: Array.isArray(visionResult.evidence_chain) ? visionResult.evidence_chain.length : 0,
          heavyMetalSeverity: String(heavyMetalResult.severity),
        });
        const compoundStress = detectCompoundStress(
          classification.primary,
          classification.secondary,
          weightedScores,
          bioticAdjusted,
          heavyMetalResult
        );
        finalVerdict = {
          final_diagnosis: String(bioticAdjusted.disease_name_en ?? "Environmental Stress"),
          disease_type: arbiter.primary_diagnosis === "biotic" ? "Biotic" : "Abiotic",
          stress_subtype:
            arbiter.primary_diagnosis === "biotic"
              ? String(bioticAdjusted.stress_subtype ?? "Biotic_Fungal")
              : String(abioticResult.stress_subtype ?? "Abiotic_Pollution"),
          confidence: arbiter.final_confidence,
          reasoning_bn:
            arbiter.primary_diagnosis === "biotic"
              ? String(bioticAdjusted.reasoning_bn ?? "")
              : String(abioticResult.reasoning_bn),
          remedy_bn:
            arbiter.primary_diagnosis === "biotic"
              ? String(bioticAdjusted.remedy_bn ?? "")
              : String(abioticResult.reasoning_bn),
          spray_suppressed: arbiter.spray_suppressed || abioticScore >= 0.60,
          suggested_disease_id: (bioticAdjusted.suggested_disease_id as string | null | undefined) ?? null,
          suggested_pollutant_id: (abioticResult.suggested_pollutant_id as string | null | undefined) ?? null,
          primary_cause: arbiter.primary_diagnosis,
          secondary_cause: arbiter.secondary_diagnosis,
          compound_stress: compoundStress,
          source: "merged-vision-biotic",
          model_used: "gemini-vision+biotic + code-abiotic + code-metal",
          reasoning: {
            expert_a: { score: weightedScores.biotic, evidence: visionResult.evidence_chain ?? [] },
            expert_b: {
              score: weightedScores.abiotic,
              evidence: Array.isArray(abioticResult.active_signals) ? abioticResult.active_signals : [],
            },
            expert_c: {
              score: weightedScores.heavy_metal,
              evidence: Array.isArray(heavyMetalResult.metal_types) ? heavyMetalResult.metal_types : [],
            },
            arbiter,
          },
        };
      }
    } else {
      log(scanId, "⚡", `EARLY EXIT: abiotic=${abioticScore.toFixed(2)}, metal=${heavyMetalResult.severity} → Skip Biotic LLM`);
      const arbiter = runReasoningArbiter({
        bioticScore: 0,
        abioticScore,
        heavyMetalScore: heavyMetalScoreForLog,
        bioticConfidence: 0,
        community: communitySignal,
        ragMatchCount: 0,
        evidenceCount: 2,
        heavyMetalSeverity: String(heavyMetalResult.severity),
      });
      finalVerdict = {
        final_diagnosis: "পরিবেশগত দূষণ",
        disease_type: "Abiotic",
        stress_subtype: "Abiotic_Pollution",
        confidence: arbiter.final_confidence,
        reasoning_bn: abioticResult.reasoning_bn as string,
        remedy_bn: `⚠️ কীটনাশক প্রয়োগ করবেন না — এটি দূষণজনিত সমস্যা, রোগ নয়। ${
          heavyMetalResult.severity === "critical"
            ? "ভারী ধাতু দূষণ শনাক্ত হয়েছে। উপজেলা কৃষি অফিসে জানান।"
            : "কারখানার প্লুম এক্সপোজার উচ্চ মাত্রায় পাওয়া গেছে।"
        }`,
        spray_suppressed: arbiter.spray_suppressed || true,
        suggested_disease_id: null,
        suggested_pollutant_id: (abioticResult.suggested_pollutant_id as string | null | undefined) ?? null,
        gates: {
          crop_valid: visionResult.is_valid,
          crop_detected: `${visionResult.detected_crop ?? "Unknown"}`,
          growth_stage: "unknown",
          land_suitable: Boolean(landSuitability.is_suitable),
          land_suitability_score: Number(landSuitability.suitability_score ?? 0),
          land_warnings: Object.entries((landSuitability.warnings ?? {}) as Record<string, boolean>)
            .filter(([, v]) => v)
            .map(([k]) => k),
        },
        detection_scores: {
          biotic: { percentage: 0, disease_name_bn: null, subtype: null, disease_id: null },
          abiotic: {
            percentage: Math.round(abioticScore * 100),
            subtype: abioticResult.stress_subtype,
            spray_suppressed: true,
            active_signals: abioticResult.active_signals,
          },
          heavy_metal: {
            percentage: Number(heavyMetalResult.percentage ?? 0),
            metals: Array.isArray(heavyMetalResult.metal_types) ? heavyMetalResult.metal_types : [],
            severity: String(heavyMetalResult.severity ?? "low"),
            zone_risk: String(heavyMetalResult.zone_baseline_risk ?? "Low"),
          },
        },
        primary_cause: "abiotic",
        secondary_cause: Number(heavyMetalResult.heavy_metal_score ?? 0) >= 0.20 ? "heavy_metal" : null,
        compound_stress: null,
        community: {
          nearby_verified_scans: 0,
          area_trend_bn: null,
          epidemic_alert_active: false,
          epidemic_alert_message_bn: null,
        },
        land_suitability: {
          suitable: Boolean(landSuitability.is_suitable),
          score: Number(landSuitability.suitability_score ?? 0),
          reason_bn: typeof landSuitability.unsuitable_reason_bn === "string" ? landSuitability.unsuitable_reason_bn : null,
          adaptive_advice: landSuitability.adaptive_strategy_bn,
        },
        secondary_advice_bn: null,
        source: "early_exit_abiotic",
        model_used: "code-only (LLM skipped)",
        overrides_applied: ["EARLY_EXIT_ABIOTIC_DOMINANT"],
        reasoning: {
          expert_a: { score: 0, evidence: [] },
          expert_b: {
            score: abioticScore,
            evidence: Array.isArray(abioticResult.active_signals) ? abioticResult.active_signals : [],
          },
          expert_c: {
            score: heavyMetalScoreForLog,
            evidence: Array.isArray(heavyMetalResult.metal_types) ? heavyMetalResult.metal_types : [],
          },
          arbiter,
        },
      };
      bioticScoreForLog = 0;
      isCached = false;
    }

    // ── DYNAMIC CONFIDENCE CALIBRATION (before hard overrides) ─────────────
    finalVerdict = applyOverlapCalibration(
      finalVerdict,
      bioticScoreForLog,
      abioticScore,
      heavyMetalScoreForLog,
      scanId
    );

    // ── HARD OVERRIDES (TypeScript enforcement using LIVE scores) ──────────
    finalVerdict = enforceHardOverrides(
      finalVerdict,
      abioticScore,
      heavyMetalScoreForLog,              // ← LIVE calculated score
      String(heavyMetalResult.severity),  // ← LIVE severity
      plumeExposure.plumeScore
    );
    const finalVerdictWithOverrides = finalVerdict;
    const arbiterSnapshot =
      isRecord(finalVerdictWithOverrides.reasoning) &&
      isRecord(finalVerdictWithOverrides.reasoning.arbiter)
        ? (finalVerdictWithOverrides.reasoning.arbiter as ArbiterResult)
        : null;
    const reasoningChain = arbiterSnapshot?.reasoning_chain ?? [];
    const evidenceSummary = arbiterSnapshot?.evidence_summary ?? null;
    const contradictionsResolved = arbiterSnapshot?.contradictions_resolved ?? null;
    if (finalVerdict.overrides_applied?.length) {
      log(scanId, "🔒", `Hard overrides applied: ${finalVerdict.overrides_applied.join(", ")}`);
    }

    // ── CONFIDENCE CALIBRATION — can_mimic_pollution check ────────────────
    if (finalVerdict.suggested_disease_id && finalVerdict.disease_type === "Biotic") {
      const { data: diseaseData } = await supabase
        .from("kb_diseases")
        .select("can_mimic_pollution, ai_confidence_hint, differentiator_bn")
        .eq("disease_id", finalVerdict.suggested_disease_id)
        .maybeSingle();

      if (diseaseData) {
        if (diseaseData.can_mimic_pollution && abioticScore > 0.30) {
          const oldConf = finalVerdict.confidence ?? 1.0;
          finalVerdict.confidence = Math.min(oldConf, 0.65);
          finalVerdict.reasoning_bn = `${finalVerdict.reasoning_bn ?? ""} তবে এই রোগের লক্ষণ দূষণের মতো হতে পারে — ${diseaseData.differentiator_bn ?? "বিশেষজ্ঞের পরামর্শ নিন।"}`;
          log(scanId, "⚠️", `Mimicry cap: confidence ${oldConf.toFixed(2)} → ${finalVerdict.confidence.toFixed(2)}`);
        }

        if (diseaseData.ai_confidence_hint && finalVerdict.confidence) {
          finalVerdict.confidence = Math.min(finalVerdict.confidence, diseaseData.ai_confidence_hint);
        }
      }
    }

    const noRagSupport = ragCases.length === 0;
    const noWeatherSupport = !((humidity ?? 0) > 75 && (consecutiveWetDays ?? 0) >= 3);
    if (finalVerdict.disease_type === "Biotic" && noRagSupport && noWeatherSupport) {
      finalVerdict.confidence = Math.min(finalVerdict.confidence ?? 1.0, 0.60);
      log(scanId, "📉", "Unsupported biotic cap: no RAG + no weather → confidence capped at 0.60");
    }

    if (!isCached) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error: cacheSaveError } = await supabase
        .from("diagnosis_cache")
        .upsert({
          grid_cell_id: `${lat.toFixed(2)}_${lng.toFixed(2)}`,
          weather_hash: weatherHash,
          symptom_hash: symptomHash,
          confirmed_disease_id: finalVerdict.suggested_disease_id ?? null,
          pollutant_id: finalVerdict.suggested_pollutant_id ?? null,
          remedy_id: null,
          cached_diagnosis_bn: finalVerdict.reasoning_bn ?? finalVerdict.final_diagnosis ?? "N/A",
          abiotic_bucket: abioticBucket(abioticScore),
          expires_at: expiresAt,
        }, {
          onConflict: "grid_cell_id,weather_hash,symptom_hash,abiotic_bucket",
          ignoreDuplicates: false,
        });
      if (cacheSaveError) {
        log(scanId, "⚠️ ", `Cache save failed: ${getErrMessage(cacheSaveError)}`);
      } else {
        log(scanId, "🧠", `Cache saved (bucket=${abioticBucket(abioticScore)})`);
      }
    }

    // ── STEP 11: Resolve stress_type_enum ─────────────────────────────────
    const stressType = resolveStressType(
      finalVerdict, plumeExposure.plumeScore, profile?.water_color
    );
    log(scanId, "🏷️ ", `stress_type → ${stressType}`);

    const fingerprintedPollutantId =
      stressType === 'Abiotic_Pollution' && !finalVerdict.suggested_pollutant_id
        ? plumeExposure.dominantPollutantId ?? null
        : null;
    if (fingerprintedPollutantId) {
      log(scanId, "🧪", `Pollutant fingerprinted → ${fingerprintedPollutantId}`);
    }

    // ── STEP 12: Save to scan_logs ─────────────────────────────────────────
    log(scanId, "💾", "Saving to scan_logs...");
    T.save = Date.now();

    const { error: saveError, scanLogId } = await saveScanLog({
      farmerId,
      landId,
      cropId: cropId ?? (visionResult.detected_crop as string) ?? null,
      lat, lng,
      imageUrl,
      visionOutput: {
        detected_crop: visionResult.detected_crop,
        visual_symptoms: visionResult.visual_symptoms,
      },
      questionnaireAnswers: {
        neighbor_sprays: neighborSprays.length,
        abiotic_score: parseFloat(abioticScore.toFixed(2)),
      },
      environmentalContext: {
        // Cumulative plume (new — primary signal)
        plume_exposure_hours_7d: plumeExposure.exposureHours,
        plume_score: plumeExposure.plumeScore,
        dominant_factory: plumeExposure.dominantFactory,
        per_factory_hours: plumeExposure.perFactoryHours,
        // Abiotic score breakdown
        abiotic_score: parseFloat(abioticScore.toFixed(2)),
        abiotic_signals: {
          plume_score: plumeExposure.plumeScore,
          canal: canalSignal,
          spray: spraySignal,
          smoke: smokeSignal,
          water_risk: waterSignal,
          neighbor_problem: neighborSignal,
        },
        // Weather
        weather: weatherStr,
        consecutive_wet_days: consecutiveWetDays,
        humidity_pct: humidity,
        // Meta
        spray_suppressed: finalVerdict.spray_suppressed ?? false,
        is_cached: isCached,
        rag_cases_used: ragCases.length,
        reasoning_chain: isRecord(finalVerdict.reasoning) && Array.isArray((finalVerdict.reasoning as AnyRecord).arbiter)
          ? (finalVerdict.reasoning as AnyRecord).arbiter
          : (isRecord(finalVerdict.reasoning) && isRecord((finalVerdict.reasoning as AnyRecord).arbiter)
              ? ((finalVerdict.reasoning as AnyRecord).arbiter as AnyRecord).reasoning_chain
              : []),
      },
      stressType,
      diseaseId: finalVerdict.suggested_disease_id ?? null,
      pollutantId: finalVerdict.suggested_pollutant_id ?? fingerprintedPollutantId ?? null,
      aiConfidence: finalVerdict.confidence ?? 0.80,
      aiModel: isCached ? "cache" : GEMINI_MODEL,
      ragCasesUsed,
      tokensUsed: bioticTokensUsed + Number(visionResult._tokens_used ?? 0),
      symptomVector,
      finalVerdict: finalVerdictWithOverrides,
      bioticScore: bioticScoreForLog,
      abioticScore,
      heavyMetalScore: heavyMetalScoreForLog,
      secondaryCause: typeof finalVerdictWithOverrides.secondary_cause === "string" ? finalVerdictWithOverrides.secondary_cause : null,
      compoundStress: Boolean(
        isRecord(finalVerdictWithOverrides.compound_stress) && finalVerdictWithOverrides.compound_stress.detected === true
      ),
      overridesApplied: finalVerdictWithOverrides.overrides_applied ?? [],
      reasoningChain,
      evidenceSummary,
      contradictionsResolved,
    });

    if (saveError) {
      logError(scanId, "scan_logs insert", saveError);
      log(scanId, "⚠️ ", "DB save failed — diagnosis still returned to farmer");

      // Always return a response even if persistence fails (prevents Next.js 500 "No response returned").
      return NextResponse.json({
        success: true,
          diagnosis: finalVerdictWithOverrides,
        image_url: imageUrl,
        source: isCached ? "Cache ⚡" : `Gemini Flash Lite 🧠 (+${ragCases.length} RAG)`,
        heavy_metal_status: "skipped",
        db_saved: false,
        db_error: (isRecord(saveError) && typeof saveError.message === "string")
          ? saveError.message
          : "scan_logs insert failed",
        context: {
          abiotic_score: abioticScore.toFixed(2),
          plume_exposure_hours: plumeExposure.exposureHours,
          plume_score: plumeExposure.plumeScore.toFixed(2),
          dominant_factory: plumeExposure.dominantFactory,
          neighbor_sprays: neighborSprays.length,
            rag_cases_used: ragCasesUsed,
            weather: weatherStr,
          },
        });
    } else {
      log(scanId, "✅", `scan_logs saved (${Date.now() - T.save}ms) → id: ${scanLogId}`);
      if (scanLogId) {
        checkAndTriggerCommunityAlerts(
          scanLogId,
          stressType,
          lat,
          lng,
          zoneId,
          farmerId
        ).catch((err) => console.error("[CommunityAlert] Failed:", err));
        tryAutoVerification(
          scanLogId,
          farmerId,
          landId,
          lat,
          lng,
          finalVerdictWithOverrides.suggested_disease_id ?? null,
          finalVerdictWithOverrides.suggested_pollutant_id ?? null,
          stressType
        ).catch((err) => console.error("[AutoVerify] Failed:", err));
      }
      let heavyMetalStatus = "skipped";
      let heavyMetalStrategy: HeavyMetalRiskStrategy | null = null;
      if ((heavyMetalScoreForLog >= 0.30 || stressType === "Abiotic_Pollution" || String(zoneData?.arsenic_zone_risk) === "High") && scanLogId) {
        log(scanId, "🧪", `Running synchronous heavy metal strategy (score=${heavyMetalScoreForLog.toFixed(2)})...`);
        try {
          const isric = await fetchISRICSnapshot(lat, lng);
          heavyMetalStrategy = buildHeavyMetalRiskStrategy(heavyMetalResult, cropId, isric.ph_h2o);
          const evidenceChain = reasoningChain;
          const { error: hmInsertError } = await supabase.from("heavy_metal_reports").insert({
            land_id: landId,
            farmer_id: farmerId,
            scan_log_id: scanLogId,
            reported_via: "sync_strategy_engine",
            metal_type: Array.isArray(heavyMetalStrategy.metals) && heavyMetalStrategy.metals.length > 0 ? heavyMetalStrategy.metals.join(",") : "mixed",
            confidence_score: Math.min(1, Math.max(0, heavyMetalScoreForLog)),
            severity: heavyMetalStrategy.risk_level === "moderate" ? "moderate" : heavyMetalStrategy.risk_level === "low" ? "low" : heavyMetalStrategy.risk_level,
            heavy_metal_strategy: heavyMetalStrategy,
            evidence_chain: evidenceChain,
            notes: `sync_strategy_engine | isric_ph=${isric.ph_h2o ?? "null"} | source=${isric.source}`,
          });
          if (hmInsertError) {
            heavyMetalStatus = "failed";
            logError(scanId, "heavy_metal_reports insert", hmInsertError);
          } else {
            heavyMetalStatus = "saved";
          }

          const recommended = heavyMetalStrategy.risk_level === "critical" || heavyMetalStrategy.risk_level === "high"
            ? ["jute", "fiber_crop"]
            : ["rice", "jute"];
          const avoid = heavyMetalStrategy.risk_level === "critical" || heavyMetalStrategy.risk_level === "high"
            ? ["leafy_vegetables", "tuber"]
            : [];
          const { error: riskUpdateError } = await supabase
            .from("farm_risk_scores")
            .update({
              dominant_threat: "Heavy Metal",
              advice_bn: heavyMetalStrategy.remediation_bn,
              breakdown: {
                heavy_metal_risk_level: heavyMetalStrategy.risk_level,
                recommended_crops: recommended,
                avoid_crops: avoid,
                remediation_status: "pending",
                last_scan_id: scanLogId,
              },
              calculated_at: new Date().toISOString(),
            })
            .eq("land_id", landId)
            .eq("is_current", true);
          if (riskUpdateError) {
            log(scanId, "⚠️ ", `farm_risk_scores update failed: ${getErrMessage(riskUpdateError)}`);
          }

          if (heavyMetalStrategy.risk_level === "critical") {
            await supabase.from("community_alerts").insert({
              zone_id: zoneId,
              alert_type: "metal_contamination",
              alert_message_bn: "জরুরি: ভারী ধাতু দূষণ শনাক্ত হয়েছে।",
              case_count: 1,
              is_active: true,
              trigger_reason: "critical heavy metal strategy alert",
              trigger_scan_ids: [scanLogId],
            });
          }
        } catch (err: unknown) {
          heavyMetalStatus = "failed";
          logError(scanId, "Heavy Metal Strategy Sync", err);
        }
      }

      // ── DONE ───────────────────────────────────────────────────────────────
      const totalMs = Date.now() - parseInt(scanId.split("-")[1], 36);
      log(scanId, "🏁", `SCAN COMPLETE ${totalMs}ms — ${isCached ? "⚡ cached" : "🧠 inferred"}`, {
        diagnosis: finalVerdict.final_diagnosis,
        stress_type: stressType,
        confidence: finalVerdict.confidence,
        suppressed: finalVerdict.spray_suppressed,
        exposure_hours: plumeExposure.exposureHours,
        plume_score: plumeExposure.plumeScore,
        scan_log_id: scanLogId,
        hm_status: heavyMetalStatus
      });
      console.log(`${"═".repeat(60)}\n`);

      return NextResponse.json({
        success: true,
        scan_id: scanId,
        gates: finalVerdictWithOverrides.gates ?? {
          crop_valid: visionResult.is_valid ?? true,
          crop_detected: `${visionResult.detected_crop ?? "Unknown"}`,
          growth_stage: "unknown",
          land_suitable: Boolean(landSuitability.is_suitable),
          land_suitability_score: Number(landSuitability.suitability_score ?? 0),
          land_warnings: Object.entries((landSuitability.warnings ?? {}) as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k),
        },
        detection_scores: finalVerdictWithOverrides.detection_scores ?? {
          biotic: { percentage: Math.round(bioticScoreForLog * 100), disease_name_bn: null, subtype: null, disease_id: null },
          abiotic: { percentage: Math.round(abioticScore * 100), subtype: abioticResult.stress_subtype, spray_suppressed: !!finalVerdictWithOverrides.spray_suppressed, active_signals: abioticResult.active_signals },
          heavy_metal: {
            percentage: Number(heavyMetalResult.percentage ?? 0),
            metals: Array.isArray(heavyMetalResult.metal_types) ? heavyMetalResult.metal_types : [],
            severity: String(heavyMetalResult.severity ?? "low"),
            zone_risk: String(heavyMetalResult.zone_baseline_risk ?? "Low"),
          },
        },
        primary_cause: finalVerdictWithOverrides.primary_cause ?? (finalVerdictWithOverrides.disease_type === "Biotic" ? "biotic" : "abiotic"),
        secondary_cause: finalVerdictWithOverrides.secondary_cause ?? null,
        compound_stress: finalVerdictWithOverrides.compound_stress,
        community: finalVerdictWithOverrides.community ?? {
          nearby_verified_scans: communitySignal.total_nearby_scans ?? 0,
          area_trend_bn: communitySignal.area_trend_bn ?? null,
          epidemic_alert_active: communitySignal.epidemic_alert_active ?? false,
          epidemic_alert_message_bn: communitySignal.epidemic_alert_message_bn ?? null,
        },
        land_suitability: finalVerdictWithOverrides.land_suitability ?? {
          suitable: Boolean(landSuitability.is_suitable),
          score: Number(landSuitability.suitability_score ?? 0),
          reason_bn: typeof landSuitability.unsuitable_reason_bn === "string" ? landSuitability.unsuitable_reason_bn : null,
          adaptive_advice: landSuitability.adaptive_strategy_bn,
        },
        spray_suppressed: finalVerdictWithOverrides.spray_suppressed,
        remedy_bn: finalVerdictWithOverrides.remedy_bn,
        secondary_advice_bn: finalVerdictWithOverrides.secondary_advice_bn,
        reasoning_bn: finalVerdictWithOverrides.reasoning_bn,
        confidence: finalVerdictWithOverrides.confidence,
        overrides_applied: finalVerdictWithOverrides.overrides_applied,
        source: finalVerdictWithOverrides.source ?? "diagnostic_engine",
        model_used: finalVerdictWithOverrides.model_used,
        diagnosis: finalVerdictWithOverrides.final_diagnosis,
        disease_type: finalVerdictWithOverrides.disease_type,
        reasoning: isRecord(finalVerdictWithOverrides.reasoning) ? finalVerdictWithOverrides.reasoning : null,
        heavy_metal_strategy: heavyMetalStrategy,
        context: {
          plume_score: plumeExposure.plumeScore.toFixed(3),
          exposure_hours_7d: plumeExposure.exposureHours,
          dominant_factory: plumeExposure.dominantFactory,
          abiotic_score: abioticScore.toFixed(3),
          weather: weatherStr,
          rag_cases_used: ragCasesUsed,
        },
        db_saved: !!scanLogId,
        heavy_metal_status: heavyMetalStatus,
        image_url: imageUrl,
      });
    }

  } catch (err: unknown) {
    logError(scanId, "AI Pipeline", err);
    console.log(`${"═".repeat(60)}\n`);
    return NextResponse.json(
      { success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }
}
