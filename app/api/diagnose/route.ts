import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { triggerHeavyMetalDetection } from "@/app/actions/heavyMetalActions";

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
  [k: string]: unknown;
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
  [k: string]: unknown;
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
async function callGemini(parts: object[], temperature = 0.1): Promise<string> {
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

  return text;
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

  const text = await callGemini([
    { text: prompt },
    { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
  ]);
  return extractJSON(text) as VisionResult;
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

  if (cachedHourly?.wind_direction_10m?.length >= 100 && cacheAgeHours < 2) {
    // Cache is fresh — use it directly, zero HTTP calls
    hourlyWindDirs = cachedHourly.wind_direction_10m ?? [];
    hourlyWindSpeeds = cachedHourly.wind_speed_10m ?? [];
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

  // ── Convert total dose → 0.0-0.50 scale ──
  // A "heavy" sustained week of pollution: 
  // e.g., 50 hours of direct exposure at 2km distance with 10km/h wind = ~15.0 total dose.
  // We normalize this to a max 0.50 score to feed into the Abiotic override formula.
  const plumeScore = Math.min(0.50, (maxExposureScore / 30.0) * 0.50);

  log(scanId, "🏭", `Cumulative plume: ${maxExposureHours}h over 7 days → dose=${maxExposureScore.toFixed(2)}, score=${plumeScore.toFixed(3)}`, {
    dominantFactory,
    perFactoryHours,
  });

  return { exposureHours: maxExposureHours, plumeScore, dominantFactory, dominantPollutantId, perFactoryHours };
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE C — MASTER JUDGE
// ══════════════════════════════════════════════════════════════════════════════
async function runMasterJudge(
  visionData: VisionResult,
  dbContext: {
    exposureHours: number;
    plumeScore: string;
    dominantFactory: string;
    abioticScore: string;
    canalSignal: string;
    smokeSignal: string;
    waterSignal: string;
    neighborSignal: string;
    spraySignal: string;
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
): Promise<FinalVerdict> {
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

  const prompt = `You are AgroSentinel's Master Diagnosis AI for Bangladesh rice farmers.
PRIMARY MISSION: Prevent unnecessary pesticide use when the true cause is pollution or abiotic stress.

━━ VISUAL EVIDENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Detected crop : ${visionData.detected_crop}
Symptoms      : ${visionData.visual_symptoms}

━━ POLLUTION EXPOSURE (7-DAY CUMULATIVE) ━━━━━━━━━━━━
Exposure hours (past 7 days) : ${dbContext.exposureHours}h / 168h
Cumulative plume score       : ${dbContext.plumeScore} / 0.50  ← PRIMARY SIGNAL
Dominant factory             : ${dbContext.dominantFactory}
NOTE: This score reflects actual accumulated plant exposure over 7 days,
      NOT just the current wind direction. It is the most scientifically
      accurate pollution signal in this system.

━━ HEAVY METAL TOXICITY (SOIL) ━━━━━━━━━━━━━━━━━━━━━
Metal Type       : ${dbContext.heavyMetal?.metal_type ?? "None Detected"}
Severity         : ${dbContext.heavyMetal?.severity ?? "Normal"}
Confidence       : ${dbContext.heavyMetal?.confidence_score ?? 0}
Notes            : ${dbContext.heavyMetal?.notes ?? "N/A"}
NOTE: If severity is 'high' or 'critical', this is a massive abiotic stress marker.

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

━━ TOTAL ABIOTIC SCORE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dbContext.abioticScore} / 1.00
(Breakdown: cumulative_plume=${dbContext.plumeScore} + canal=${dbContext.canalSignal} + survey_smoke=${dbContext.smokeSignal} + water_risk=${dbContext.waterSignal} + neighbor_problem=${dbContext.neighborSignal} + neighbor_sprays=${dbContext.spraySignal})

━━ RAG: VERIFIED LOCAL CASES (5km radius) ━━━━━━━━━━
${ragSection}

━━ DECISION RULES (apply in order) ━━━━━━━━━━━━━━━━━
1. abioticScore >= 0.60 OR Heavy Metal Severity is 'high'/'critical'  →  OVERRIDE to Abiotic — do NOT diagnose biotic
2. exposureHours >= 20 AND symptoms match bleaching/tip-burn/edge-scorch  →  Abiotic_Pollution
3. Heavy Metal Detected AND symptoms match stunting/yellowing/necrosis → Abiotic_Pollution
4. canal_contamination AND water colour abnormal  →  Abiotic_Pollution
5. neighbor_same_problem  →  strongly favors pollution (epidemic less likely)
6. consecutive_wet_days >= 5 AND humidity > 85%  →  strong blast/blight pressure
7. RAG match  →  raise confidence +0.10 per matching case
8. spray_suppressed MUST be true for ANY Abiotic diagnosis
9. CROP SUITABILITY: Check if detected_crop is agriculturally suitable for the 'Zone Climate Profile' (long-term suitability, NOT just today's weather). If clearly unsuitable for this region's climate/season, prominently warn the farmer at the beginning of reasoning_bn.

Return ONLY valid JSON (no markdown):
{
  "final_diagnosis": "disease or stress name in English",
  "disease_type": "Biotic" or "Abiotic",
  "stress_subtype": "one of: Biotic_Fungal | Biotic_Pest | Biotic_Viral | Biotic_Bacterial | Abiotic_Pollution | Abiotic_Nutrient | Abiotic_Water | Abiotic_Weather",
  "confidence": 0.0 to 1.0,
  "reasoning_bn": "step-by-step reasoning in Bengali (3-5 sentences)",
  "remedy_bn": "specific actionable remedy in Bengali — what to do AND what NOT to do",
  "spray_suppressed": true if Abiotic else false,
  "suggested_disease_id": "kb_diseases.disease_id if Biotic, else null",
  "suggested_pollutant_id": "kb_industrial_pollutants.pollutant_id if Abiotic, else null"
}`;

  const text = await callGemini([{ text: prompt }], 0.1);
  return extractJSON(text) as FinalVerdict;
}

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
  symptomVector: number[] | null;
  finalVerdict: FinalVerdict;
}): Promise<{ error: unknown; scanLogId: string | null }> {
  const {
    farmerId, cropId, lat, lng, imageUrl,
    visionOutput, questionnaireAnswers, environmentalContext,
    stressType, diseaseId, pollutantId, aiConfidence, aiModel,
    symptomVector,
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
      crop_id: cropId,
      growth_stage_days: null,
      scan_location: `SRID=4326;POINT(${lng} ${lat})`,
      grid_cell_id: `${lat.toFixed(2)}_${lng.toFixed(2)}`,
      image_url: imageUrl,
      vision_output: visionOutput,
      questionnaire_answers: questionnaireAnswers,
      environmental_context: environmentalContext,
      stress_type: stressType,
      confirmed_disease_id: diseaseId,
      confirmed_pollutant_id: pollutantId,
      remedy_id: null,
      ai_confidence: aiConfidence,
      ai_model_used: aiModel,
      tokens_used: 0,
      verification_status: verificationStatus,
      verified_by_farmer_id: null,
      verified_at: null,
      embedding: symptomVector ?? null,
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

    const imagePath = `scans/${farmerId}/${scanId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("scan-images")
      .upload(imagePath, Buffer.from(imageBase64, "base64"), {
        contentType: "image/jpeg", cacheControl: "3600", upsert: false,
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

    const [weatherRes, profileRes, landRes, farmerRes, communitySprayRes, hotspotsRes, heavyMetalRes] =
      await Promise.all([
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
          .select("metal_type, confidence_score, severity, notes")
          .eq("land_id", landId)
          .order("reported_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    log(scanId, "✅", `DB fetch done (${Date.now() - T.db}ms)`, {
      weather: !!weatherRes.data,
      profile: !!profileRes.data,
      land: !!landRes.data,
      sprays: communitySprayRes.data?.length ?? 0,
      hotspots: hotspotsRes.data?.length ?? 0,
      metals: !!heavyMetalRes?.data,
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

    const abioticScore = Math.min(1.0,
      plumeExposure.plumeScore + // 0–0.50 dynamic, science-based
      metalSignal +           // 0.40
      canalSignal +           // 0.15
      spraySignal +           // 0.10
      smokeSignal +           // 0.08
      waterSignal +           // 0.07
      neighborSignal             // 0.05
    );

    log(scanId, "📊", `Abiotic score: ${abioticScore.toFixed(2)}`, {
      plumeScore: plumeExposure.plumeScore,
      metalSignal, canalSignal, spraySignal, smokeSignal, waterSignal, neighborSignal,
    });

    // ── STEP 6: Weekly survey gate ─────────────────────────────────────────
    const skipSurveyGate = process.env.SKIP_SURVEY_GATE === "true" && process.env.NODE_ENV !== "production";
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

    // ── STEP 7: Vision ─────────────────────────────────────────────────────
    log(scanId, "👁️ ", `Vision: ${GEMINI_MODEL}...`);
    T.vision = Date.now();

    const visionResult = await withRetry(
      () => runVision(imageBase64, profile?.scan_context ?? ""),
      `${scanId}-vision`, 3, 1500
    );

    log(scanId, "✅", `Vision done (${Date.now() - T.vision}ms)`, {
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
      log(scanId, "⚠️ ", "visual_symptoms empty — using fallback");
    }

    let symptomVector: number[] | null = null;
    // ── STEP 8: Embedding (optional) ───────────────────────────────────────
    if (ENABLE_RAG) {
      log(scanId, "🔢", "Embedding (text-embedding-004)...");
      T.embed = Date.now();
      try {
        symptomVector = await withRetry(
          () => getEmbedding(visionResult.visual_symptoms),
          `${scanId}-embed`, 3, 1000
        );
        log(scanId, "✅", `Embedding done (${Date.now() - T.embed}ms) — ${symptomVector.length} dims`);
      } catch (err) {
        logError(scanId, "Embedding (non-fatal — RAG skipped)", err);
      }
    } else {
      log(scanId, "🔢", "Embedding skipped (ENABLE_RAG=false)");
    }

    // ── STEP 9: Cache + RAG ────────────────────────────────────────────────
    log(scanId, "🔍", `Cache + RAG${symptomVector ? "" : " (RAG skipped)"}...`);
    T.cache = Date.now();

    const weatherHash = md5(weatherStr);
    const symptomHash = md5(visionResult.visual_symptoms);

    const [cacheRes, ragRes] = await Promise.all([
      supabase.rpc("lookup_diagnosis_cache", {
        p_lat: lat, p_lng: lng,
        p_weather_hash: weatherHash, p_symptom_hash: symptomHash,
      }),
      symptomVector
        ? supabase.rpc("search_verified_rag_cases", {
          p_query_embedding: symptomVector,
          p_farmer_lat: lat, p_farmer_lng: lng,
          p_radius_km: 5.0, p_match_threshold: 0.72,
          p_match_count: 3, p_min_trust_weight: 0.60,
        })
        : Promise.resolve({ data: [] }),
    ]);

    const cacheHit = cacheRes.data;
    const ragCases = (ragRes.data ?? []) as RagCase[];
    log(scanId, "✅", `Cache+RAG done (${Date.now() - T.cache}ms)`, {
      cacheHit: !!(cacheHit?.length > 0), ragCases: ragCases.length,
    });

    // ── STEP 10: Diagnosis ─────────────────────────────────────────────────
    let finalVerdict: FinalVerdict;
    let isCached = false;

    if (cacheHit && cacheHit.length > 0) {
      log(scanId, "⚡", "CACHE HIT — skipping Judge LLM");
      const hit = cacheHit[0];

      // Determine if the cached hit was Abiotic or Biotic based on the DB record
      // The DB cache returns disease_id (if biotic) and pollutant_id (if abiotic)
      const isAbiotic = hit.pollutant_id != null;

      finalVerdict = {
        final_diagnosis: hit.cached_diagnosis_bn,
        disease_type: isAbiotic ? "Abiotic" : "Biotic",
        stress_subtype: isAbiotic ? "Abiotic_Pollution" : "Biotic_Fungal", // Will be properly resolved in Step 11
        confidence: 0.92,
        reasoning_bn: hit.cached_diagnosis_bn,
        remedy_bn: hit.remedy_id ?? "রেমেডি তথ্য ক্যাশে নেই।",
        spray_suppressed: isAbiotic,
        suggested_disease_id: hit.disease_id ?? null,
        suggested_pollutant_id: hit.pollutant_id ?? null,
      };
      isCached = true;
    } else {
      log(scanId, "🧠", `CACHE MISS — Gemini Judge with ${ragCases.length} RAG cases...`);
      T.judge = Date.now();

      finalVerdict = await withRetry(
        () => runMasterJudge(
          visionResult,
          {
            // Cumulative plume data (new)
            exposureHours: plumeExposure.exposureHours,
            plumeScore: plumeExposure.plumeScore.toFixed(2),
            dominantFactory: plumeExposure.dominantFactory,
            // Abiotic score breakdown (for transparency in prompt)
            abioticScore: abioticScore.toFixed(2),
            canalSignal: canalSignal.toFixed(2),
            smokeSignal: smokeSignal.toFixed(2),
            waterSignal: waterSignal.toFixed(2),
            neighborSignal: neighborSignal.toFixed(2),
            spraySignal: spraySignal.toFixed(2),
            // Current weather (still useful for biotic diagnosis)
            weather: weatherStr,
            humidity,
            consecutiveWetDays,
            expectedCrop: cropId ?? visionResult.detected_crop,
            zoneId,
            zoneClimate,
            heavyMetal: heavyMetalRes?.data ?? null,
            survey: profile ? {
              ph: profile.soil_ph,
              water: profile.water_color,
              smoke: profile.smoke_exposure,
              canal: profile.canal_contamination,
              neighbor: profile.neighbor_problem,
              pest: profile.pest_level,
            } : null,
            neighborSprays,
          },
          ragCases
        ),
        `${scanId}-judge`, 3, 1500
      );

      log(scanId, "✅", `Judge done (${Date.now() - T.judge!}ms)`, {
        diagnosis: finalVerdict.final_diagnosis,
        type: finalVerdict.disease_type,
        subtype: finalVerdict.stress_subtype,
        confidence: finalVerdict.confidence,
        suppressed: finalVerdict.spray_suppressed,
      });
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
      },
      stressType,
      diseaseId: finalVerdict.suggested_disease_id ?? null,
      pollutantId: finalVerdict.suggested_pollutant_id ?? fingerprintedPollutantId ?? null,
      aiConfidence: finalVerdict.confidence ?? 0.80,
      aiModel: isCached ? "cache" : GEMINI_MODEL,
      ragCasesUsed: ragCases.length,
      symptomVector,
      finalVerdict,
    });

    if (saveError) {
      logError(scanId, "scan_logs insert", saveError);
      log(scanId, "⚠️ ", "DB save failed — diagnosis still returned to farmer");

      // Always return a response even if persistence fails (prevents Next.js 500 "No response returned").
      return NextResponse.json({
        success: true,
        diagnosis: finalVerdict,
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
          rag_cases_used: ragCases.length,
          weather: weatherStr,
        },
      });
    } else {
      log(scanId, "✅", `scan_logs saved (${Date.now() - T.save}ms) → id: ${scanLogId}`);
      // TRIGGER HEAVY METAL SYSTEM (Wait for it so we can return its status)
      let heavyMetalStatus = "skipped";
      if (stressType === 'Abiotic_Pollution' && scanLogId) {
        log(scanId, "🧪", `Triggering Heavy Metal Detection Pipeline...`);
        try {
          const hmResult = await triggerHeavyMetalDetection(landId, lat, lng);
          if (hmResult?.success) {
            heavyMetalStatus = "success";
            log(scanId, "✅", "Heavy Metal Check completed via trigger.");
          } else {
            heavyMetalStatus = "failed";
            logError(scanId, "Heavy Metal Detection Trigger", new Error(hmResult?.error ?? "Unknown error"));
          }
        } catch (err: unknown) {
          heavyMetalStatus = "failed";
          logError(scanId, "Heavy Metal Detection Trigger", err);
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
        diagnosis: finalVerdict,
        image_url: imageUrl,
        source: isCached ? "Cache ⚡" : `Gemini Flash Lite 🧠 (+${ragCases.length} RAG)`,
        heavy_metal_status: heavyMetalStatus, // Expose to frontend so UI can show a warning if it failed
        context: {
          abiotic_score: abioticScore.toFixed(2),
          plume_exposure_hours: plumeExposure.exposureHours,
          plume_score: plumeExposure.plumeScore.toFixed(2),
          dominant_factory: plumeExposure.dominantFactory,
          neighbor_sprays: neighborSprays.length,
          rag_cases_used: ragCases.length,
          weather: weatherStr,
        },
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
