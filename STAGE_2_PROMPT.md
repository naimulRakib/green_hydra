# AgroSentinel Accuracy Redesign — STAGE 2
## Three Detection Modules + Land Suitability + Community Signal
## Prerequisite: STAGE_1_PROMPT.md must be 100% complete first.

---

## CONTEXT

Stage 1 fixed critical bugs in the existing pipeline.
Stage 2 implements the architectural changes from the v2 spec:
1. Three parallel detection modules (Biotic / Abiotic / Heavy Metal)
2. Land suitability check using kb_crops + kb_zones
3. Community signal weighted into final scores
4. Compound stress detection

This is the biggest change. The pipeline structure changes significantly.
Be careful and deliberate. Do NOT break existing functionality.

Files you will modify in Stage 2:
1. app/api/diagnose/route.ts — main pipeline refactor
2. Supabase SQL — kb_crops table seeding + community_alerts check

---

## TASK 1 — UNDERSTAND THE NEW ARCHITECTURE

Before writing any code, understand this flow:

```
CURRENT (Stage 1):
  Vision → Embedding → Cache → single Master Judge LLM → save

NEW (Stage 2):
  Vision → Embedding → Cache check
    → Cache HIT:  return cached result (with hard overrides)
    → Cache MISS:
        Promise.all([
          Module A: runBioticModule()   ← ONE LLM call, biotic focused
          Module B: computeAbiotic()    ← NO LLM, pure math
          Module C: computeHeavyMetal() ← NO LLM, pure code
          getCommunitySignal()          ← DB query
        ])
        → applyCommuntiyWeighting()
        → enforceHardOverrides()
        → classifyResults()
        → detectCompoundStress()
        → buildFinalVerdict()
        → save all three scores to scan_logs
```

Key insight: The current runMasterJudge() becomes Module A (Biotic only).
Module B replaces the abiotic signals section (already computed in Stage 1).
Module C is already in heavyMetalActions.ts (scoreHeavyMetal logic).

---

## TASK 2 — MODULE A: BIOTIC DETECTION (route.ts)

### Step 2.1 — Rename runMasterJudge to runBioticModule

FIND:
```typescript
async function runMasterJudge(
  visionData: any,
  dbContext: any,
  ragCases: any[]
): Promise<any>
```

RENAME to runBioticModule. Keep the same signature.

### Step 2.2 — Remove abiotic content from biotic prompt

In runBioticModule (was runMasterJudge), the prompt currently contains:
- POLLUTION EXPOSURE section
- HEAVY METAL TOXICITY section
- TOTAL ABIOTIC SCORE section
- Override rules for abiotic

REMOVE all of these sections from the biotic prompt.

KEEP:
- VISUAL EVIDENCE section
- REGION & CURRENT WEATHER section
- WEEKLY SURVEY section (for crop context)
- NEIGHBOUR SPRAY EVENTS section (relevant for biotic too)
- RAG cases section
- DECISION RULES (but only biotic-relevant rules)

ADD this section instead of the removed abiotic sections:
```
━━ POLLUTION CONTEXT (for reference only) ━━━━━━━━━━
Abiotic score     : ${dbContext.abioticScore} / 1.00
NOTE: The abiotic classification is handled separately by code.
      Your job is to identify the BIOTIC disease if present.
      Focus on visual symptoms, weather, and RAG cases.
      If symptoms look like pollution burn (uniform bleaching,
      tip scorch, edge necrosis) rather than biological disease,
      return score: 0.0 to indicate no biotic disease detected.
```

### Step 2.3 — Update biotic module output JSON schema

The biotic module should return a focused biotic result.
Update the return JSON schema in the prompt:

```
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
}
```

### Step 2.4 — Add post-LLM biotic score adjustments

After runBioticModule returns, add code-level score adjustments:

```typescript
function adjustBioticScore(
  llmResult: any,
  weather: any,
  humidity: number,
  consecutiveWetDays: number,
  ragCases: any[],
  abioticScore: number,
  supabase: any
): any {
  let score = (llmResult.biotic_score ?? 0) * 0.70;
  // LLM is max 70% of final biotic score

  // Weather bonus
  if (humidity > 85 && consecutiveWetDays >= 5) {
    score += 0.15;
  } else if (humidity > 75 && consecutiveWetDays >= 3) {
    score += 0.08;
  }

  // RAG community bonus (max +0.15 from 3 matches)
  score += Math.min(0.15, ragCases.length * 0.05);

  // Note: can_mimic_pollution penalty is applied separately in Task 4 of Stage 1
  // (already implemented)

  llmResult.biotic_score = Math.min(1.0, Math.max(0.0, score));
  return llmResult;
}
```

Call after runBioticModule returns:
```typescript
bioticResult = adjustBioticScore(
  bioticResult,
  weather,
  humidity,
  consecutiveWetDays,
  ragCases,
  abioticScore,
  supabase
);
```

---

## TASK 3 — MODULE B: ABIOTIC SCORE (route.ts)

### Context
This is already computed in Stage 1 as `abioticScore`.
Stage 2 wraps it in a structured result object.

### Step 3.1 — Add buildAbioticResult function

```typescript
function buildAbioticResult(
  abioticScore: number,
  plumeExposure: PlumeExposureResult,
  profile: any,
  waterPollutionEvent: any,
  satelliteWater: any
): any {
  // Determine abiotic subtype from signals
  let subtype = "Abiotic_Pollution";
  if (plumeExposure.plumeScore >= 0.15 || waterPollutionEvent?.is_active) {
    subtype = "Abiotic_Pollution";
  } else if (profile?.water_risk === "Flood") {
    subtype = "Abiotic_Water";
  } else if (profile?.soil_ph === "Acidic" || profile?.soil_ph === "Alkaline") {
    subtype = "Abiotic_Nutrient";
  } else if (abioticScore >= 0.15) {
    subtype = "Abiotic_Weather";
  }

  // Build Arabic description for farmer
  const signalList: string[] = [];
  if (plumeExposure.plumeScore > 0.10)  signalList.push(`কারখানার প্লাম (${(plumeExposure.plumeScore * 100).toFixed(0)}%)`);
  if (profile?.canal_contamination)      signalList.push("খাল দূষণ");
  if (profile?.smoke_exposure)           signalList.push("ধোঁয়ার সংস্পর্শ");
  if (waterPollutionEvent?.is_active)    signalList.push("সক্রিয় পানি দূষণ");
  if (satelliteWater?.suspected_pollution) signalList.push("স্যাটেলাইট পানি সংকেত");

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
      ? (heavyMetalRes?.data?.metal_type ?? null)
      : null,
  };
}
```

Call this AFTER abioticScore is computed in the POST handler:
```typescript
const abioticResult = buildAbioticResult(
  abioticScore,
  plumeExposure,
  profile,
  waterPollutionRes?.data?.[0] ?? null,
  satelliteWaterRes?.data ?? null
);
```

---

## TASK 4 — MODULE C: HEAVY METAL SCORE (route.ts)

### Step 4.1 — Add scoreHeavyMetal function

```typescript
function scoreHeavyMetal(
  zone: any,
  profile: any,
  heavyMetalReport: any,
  plumeExposure: PlumeExposureResult
): any {
  let score = 0;
  const metals: string[] = [];

  // Existing confirmed report (strongest signal)
  if (heavyMetalReport?.severity === "critical") { score += 0.70; metals.push(heavyMetalReport.metal_type); }
  else if (heavyMetalReport?.severity === "high")     { score += 0.55; metals.push(heavyMetalReport.metal_type); }
  else if (heavyMetalReport?.severity === "moderate") { score += 0.35; metals.push(heavyMetalReport.metal_type); }
  else if (heavyMetalReport?.severity === "low")      { score += 0.18; metals.push(heavyMetalReport.metal_type ?? "mixed"); }

  // Zone baseline risk
  if (zone?.arsenic_zone_risk === "High")   { score += 0.20; metals.push("arsenic"); }
  else if (zone?.arsenic_zone_risk === "Medium") { score += 0.10; metals.push("arsenic"); }

  if (zone?.known_metal_types?.length > 0) {
    metals.push(...zone.known_metal_types);
    score += 0.05;
  }

  // Farm survey flags
  if (profile?.arsenic_risk) score += 0.10;
  if (profile?.iron_risk)    score += 0.08;
  if (profile?.fish_kill)    score += 0.07;
  if (profile?.canal_contamination) score += 0.05;

  // Plume from known metal emitter
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
```

Call this in the POST handler:
```typescript
const heavyMetalResult = scoreHeavyMetal(
  zoneData,
  profile,
  heavyMetalRes?.data,
  plumeExposure
);
```

---

## TASK 5 — COMMUNITY SIGNAL (route.ts)

### Step 5.1 — Add getCommunitySignal function

```typescript
async function getCommunitySignal(
  lat: number,
  lng: number,
  zoneId: string,
  scanId: string
): Promise<any> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [recentScansRes, activeAlertsRes] = await Promise.all([
    // Recent verified scans nearby (5km)
    supabase
      .from("scan_logs")
      .select("stress_type, ai_confidence, biotic_score, abiotic_score, heavy_metal_score")
      .filter("scan_location", "st_dwithin", `SRID=4326;POINT(${lng} ${lat}),5000`)
      .gte("created_at", thirtyDaysAgo)
      .eq("verification_status", "verified")
      .limit(50),

    // Active community alerts for this zone
    supabase
      .from("community_alerts")
      .select("alert_type, alert_message_bn, case_count")
      .eq("zone_id", zoneId)
      .eq("is_active", true)
      .limit(3),
  ]);

  const scans = recentScansRes.data ?? [];
  const total = scans.length;

  if (total === 0) {
    return {
      biotic_community_ratio: 0,
      abiotic_community_ratio: 0,
      heavy_metal_community_ratio: 0,
      total_nearby_scans: 0,
      epidemic_alert_active: !!(activeAlertsRes.data?.length),
      epidemic_alert_message_bn: activeAlertsRes.data?.[0]?.alert_message_bn ?? null,
      community_weight: 0,
      area_trend_bn: null,
    };
  }

  const bioticCount  = scans.filter(s => s.stress_type?.startsWith("Biotic")).length;
  const abioticCount = scans.filter(s => s.stress_type?.startsWith("Abiotic")).length;
  const metalCount   = scans.filter(s => (s.heavy_metal_score ?? 0) >= 0.20).length;

  const communityWeight = Math.min(0.20, total * 0.004); // 50 scans = max 0.20

  // Build area trend sentence in Bengali
  const dominantType = bioticCount >= abioticCount && bioticCount >= metalCount
    ? "জৈবিক রোগ" : abioticCount >= metalCount ? "শিল্প দূষণ" : "ভারী ধাতু";
  const dominantPct = Math.round(Math.max(bioticCount, abioticCount, metalCount) / total * 100);
  const areaTrendBn = `এলাকায় গত ৩০ দিনে ${total}টি যাচাইকৃত স্ক্যানের ${dominantPct}%-এ ${dominantType} পাওয়া গেছে।`;

  log(scanId, "👥", `Community: ${total} verified scans, weight: ${communityWeight.toFixed(2)}`);

  return {
    biotic_community_ratio:      bioticCount / total,
    abiotic_community_ratio:     abioticCount / total,
    heavy_metal_community_ratio: metalCount / total,
    total_nearby_scans:          total,
    epidemic_alert_active:       !!(activeAlertsRes.data?.length),
    epidemic_alert_message_bn:   activeAlertsRes.data?.[0]?.alert_message_bn ?? null,
    community_weight:            communityWeight,
    area_trend_bn:               areaTrendBn,
  };
}
```

### Step 5.2 — Add applyCommuntiyWeighting function

```typescript
function applyCommuntiyWeighting(
  rawScores: { biotic: number; abiotic: number; heavy_metal: number },
  community: any
): { biotic: number; abiotic: number; heavy_metal: number } {
  const w = community.community_weight ?? 0;
  if (w === 0) return rawScores;

  return {
    biotic:      Math.min(1.0, rawScores.biotic      * (1 - w) + community.biotic_community_ratio      * w),
    abiotic:     Math.min(1.0, rawScores.abiotic     * (1 - w) + community.abiotic_community_ratio     * w),
    heavy_metal: Math.min(1.0, rawScores.heavy_metal * (1 - w) + community.heavy_metal_community_ratio * w),
  };
}
```

---

## TASK 6 — COMPOUND STRESS DETECTION (route.ts)

### Step 6.1 — Add detectCompoundStress function

```typescript
function detectCompoundStress(
  primary: string,
  secondary: string | null,
  weightedScores: { biotic: number; abiotic: number; heavy_metal: number },
  bioticResult: any,
  heavyMetalResult: any
): any | null {

  const SECONDARY_THRESHOLD = 0.20;

  if (!secondary) return null;
  if (weightedScores[secondary as keyof typeof weightedScores] < SECONDARY_THRESHOLD) return null;
  if (primary === "biotic" && secondary === "biotic") return null;

  const pair = [primary, secondary].sort().join("+");

  const metalList = heavyMetalResult.metal_types?.join(", ") ?? "অজানা ধাতু";
  const diseaseName = bioticResult.disease_name_bn ?? "জৈবিক রোগ";
  const metalPct = heavyMetalResult.percentage ?? 0;
  const abioticPct = Math.round(weightedScores.abiotic * 100);

  const compoundMessages: Record<string, string> = {
    "biotic+heavy_metal":
      `⚠️ যৌগিক চাপ শনাক্ত: ${diseaseName} রোগের পাশাপাশি মাটিতে ${metalList} পাওয়া গেছে (${metalPct}%)। ` +
      `ভারী ধাতু গাছের রোগ প্রতিরোধ ক্ষমতা কমিয়ে দেয় — ছত্রাকনাশক সম্পূর্ণ কার্যকর নাও হতে পারে। ` +
      `মাটি পরীক্ষার জন্য উপজেলা কৃষি অফিসে যোগাযোগ করুন।`,

    "abiotic+biotic":
      `⚠️ যৌগিক চাপ: দূষণজনিত ক্ষতি (${abioticPct}%) ও জৈবিক রোগ একসাথে দেখা যাচ্ছে। ` +
      `উভয় কারণ নিশ্চিত না হওয়া পর্যন্ত কীটনাশক ব্যবহার সীমিত রাখুন।`,

    "abiotic+heavy_metal":
      `⚠️ গুরুতর দূষণ সংকেত: বায়ু দূষণ (${abioticPct}%) ও মাটির ভারী ধাতু (${metalPct}%) একসাথে পাওয়া গেছে। ` +
      `এটি কাছের কারখানার দীর্ঘমেয়াদী প্রভাব হতে পারে। ` +
      `অবিলম্বে উপজেলা কৃষি অফিসে জানান।`,
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
```

### Step 6.2 — Add classifyResults function

```typescript
const THRESHOLDS = {
  PRIMARY:   0.35,
  SECONDARY: 0.20,
};

function classifyResults(
  scores: { biotic: number; abiotic: number; heavy_metal: number }
): { primary: string; secondary: string | null; primary_pct: number; secondary_pct: number } {
  const entries = Object.entries(scores)
    .sort(([, a], [, b]) => b - a);

  const [primaryKey, primaryScore] = entries[0];
  const [secondaryKey, secondaryScore] = entries[1];

  return {
    primary:       primaryScore >= THRESHOLDS.PRIMARY   ? primaryKey : "unknown",
    secondary:     secondaryScore >= THRESHOLDS.SECONDARY ? secondaryKey : null,
    primary_pct:   Math.round(primaryScore * 100),
    secondary_pct: Math.round(secondaryScore * 100),
  };
}
```

---

## TASK 7 — LAND SUITABILITY CHECK (route.ts)

### Step 7.1 — Fetch kb_crops in Stage 1 parallel fetch

In the Promise.all() fetch, ADD:
```typescript
// Fetch crop data for suitability check
supabase
  .from("kb_crops")
  .select("crop_id, planting_months, suitable_zones, soil_pref, flood_tolerant, salinity_tolerant")
  .eq("crop_id", landRes?.data?.crop_id ?? "")
  .maybeSingle(),
```

### Step 7.2 — Add checkLandSuitability function

```typescript
function checkLandSuitability(
  crop: any,
  zone: any,
  profile: any,
  currentMonth: number
): any {
  if (!crop) return {
    is_suitable: true,
    suitability_score: 1.0,
    warnings: {},
    unsuitable_reason_bn: null,
  };

  const warnings: Record<string, boolean> = {
    wrong_season:        !!(crop.planting_months?.length) && !crop.planting_months.includes(currentMonth),
    wrong_zone:          !!(crop.suitable_zones?.length) && !crop.suitable_zones.includes(zone?.zone_id),
    soil_mismatch:       !!(crop.soil_pref?.length) && !crop.soil_pref.some((p: string) =>
                           profile?.soil_texture?.toLowerCase().includes(p.toLowerCase())),
    flood_risk_active:   !!(zone?.flood_risk_months?.includes(currentMonth)) && !crop.flood_tolerant,
    arsenic_zone_high:   zone?.arsenic_zone_risk === "High",
    listed_unsuitable:   (zone?.unsuitable_crops as string[] ?? []).includes(crop.crop_id),
  };

  const failCount = Object.values(warnings).filter(Boolean).length;
  const score = 1.0 - (failCount / Object.keys(warnings).length);

  // Build Bengali reason
  const reasonParts: string[] = [];
  if (warnings.wrong_season)      reasonParts.push("এই মৌসুমে এই ফসল উপযুক্ত নয়");
  if (warnings.wrong_zone)        reasonParts.push("এই এলাকার আবহাওয়া এই ফসলের জন্য উপযুক্ত নয়");
  if (warnings.arsenic_zone_high) reasonParts.push("এই এলাকায় উচ্চ আর্সেনিক ঝুঁকি রয়েছে");
  if (warnings.flood_risk_active) reasonParts.push("এই মাসে বন্যার ঝুঁকি আছে");
  if (warnings.listed_unsuitable) reasonParts.push("এই ফসল এই এলাকায় অনুপযুক্ত");

  return {
    is_suitable:          score >= 0.60 && !warnings.listed_unsuitable,
    suitability_score:    score,
    warnings,
    unsuitable_reason_bn: reasonParts.length > 0 ? reasonParts.join("; ") + "।" : null,
    adaptive_strategy_bn: zone?.adaptive_strategy_bn ?? null,
  };
}
```

### Step 7.3 — Call checkLandSuitability in POST handler

After parallel fetch, add:
```typescript
const currentMonth = new Date().getMonth() + 1; // 1-12
const landSuitability = checkLandSuitability(
  cropRes?.data ?? null,
  zoneData,
  profile,
  currentMonth
);

if (!landSuitability.is_suitable) {
  log(scanId, "⚠️", `Land suitability warning: ${landSuitability.unsuitable_reason_bn}`);
}
```

Add to finalVerdict response:
```typescript
land_suitability: {
  suitable:         landSuitability.is_suitable,
  score:            landSuitability.suitability_score,
  reason_bn:        landSuitability.unsuitable_reason_bn,
  adaptive_advice:  landSuitability.adaptive_strategy_bn,
}
```

---

## TASK 8 — WIRE EVERYTHING TOGETHER (route.ts)

### Step 8.1 — New Stage 3 parallel execution

In the POST handler, AFTER vision returns and embedding is computed,
REPLACE the single runMasterJudge call with:

```typescript
// ── STAGE 3: THREE PARALLEL DETECTION MODULES ──────────────────────
log(scanId, "🔬", "Stage 3: Running three detection modules...");

const [bioticResultRaw, communitySignal] = await Promise.all([
  // Module A: Biotic — only LLM call in Stage 3
  runBioticModule(visionResult, dbContext, ragCases),
  // Community signal — DB query only
  getCommunitySignal(lat, lng, zoneId, scanId),
]);

// Module B: Pure code, already computed
// abioticResult was built in Stage 1 (buildAbioticResult)
// abioticScore already computed

// Module C: Pure code
const heavyMetalResult = scoreHeavyMetal(
  zoneData, profile, heavyMetalRes?.data, plumeExposure
);

// Post-LLM biotic score adjustment
const bioticResult = adjustBioticScore(
  bioticResultRaw, weather, humidity, consecutiveWetDays,
  ragCases, abioticScore, supabase
);

// ── STAGE 4: VERDICT ASSEMBLY ───────────────────────────────────────
log(scanId, "⚖️", "Stage 4: Assembling verdict...");

// Raw scores
const rawScores = {
  biotic:      bioticResult.biotic_score ?? 0,
  abiotic:     abioticScore,
  heavy_metal: heavyMetalResult.heavy_metal_score ?? 0,
};

// Apply community weighting
const weightedScores = applyCommuntiyWeighting(rawScores, communitySignal);

// Classify primary and secondary
const classification = classifyResults(weightedScores);

// Hard overrides (already defined in Stage 1)
// Apply to the classification result
if (abioticScore >= 0.60) {
  classification.primary = "abiotic";
}

// Compound stress detection
const compoundStress = detectCompoundStress(
  classification.primary,
  classification.secondary,
  weightedScores,
  bioticResult,
  heavyMetalResult
);

// Build stressType enum for DB
const stressType = resolveStressType(
  {
    disease_type:    classification.primary === "biotic" ? "Biotic" : "Abiotic",
    stress_subtype:  classification.primary === "biotic"
                       ? (bioticResult.stress_subtype ?? "Biotic_Fungal")
                       : abioticResult.stress_subtype,
    final_diagnosis: bioticResult.disease_name_en ?? "",
    suggested_pollutant_id: abioticResult.suggested_pollutant_id,
  },
  plumeExposure.plumeScore,
  profile?.water_color
);
```

### Step 8.2 — Build final verdict from three modules

```typescript
// ── FINAL VERDICT ────────────────────────────────────────────────────
const finalVerdict = {
  // Gate results
  gates: {
    crop_valid:           visionResult.is_valid,
    crop_detected:        `${visionResult.detected_crop_bn ?? visionResult.detected_crop_en ?? "Unknown"} (${visionResult.detected_crop_en ?? ""})`,
    growth_stage:         visionResult.growth_stage ?? "unknown",
    land_suitable:        landSuitability.is_suitable,
    land_suitability_score: landSuitability.suitability_score,
    land_warnings:        Object.entries(landSuitability.warnings)
                            .filter(([, v]) => v)
                            .map(([k]) => k),
  },

  // All three detection scores
  detection_scores: {
    biotic: {
      percentage:       Math.round(weightedScores.biotic * 100),
      disease_name_bn:  bioticResult.disease_name_bn ?? null,
      subtype:          bioticResult.stress_subtype ?? null,
      disease_id:       bioticResult.suggested_disease_id ?? null,
    },
    abiotic: {
      percentage:       Math.round(weightedScores.abiotic * 100),
      subtype:          abioticResult.stress_subtype,
      spray_suppressed: abioticScore >= 0.60,
      active_signals:   abioticResult.active_signals,
    },
    heavy_metal: {
      percentage:       heavyMetalResult.percentage,
      metals:           heavyMetalResult.metal_types,
      severity:         heavyMetalResult.severity,
      zone_risk:        heavyMetalResult.zone_baseline_risk,
    },
  },

  // Classification
  primary_cause:   classification.primary,
  secondary_cause: classification.secondary,
  compound_stress: compoundStress,

  // Community
  community: {
    nearby_verified_scans:    communitySignal.total_nearby_scans,
    area_trend_bn:            communitySignal.area_trend_bn,
    epidemic_alert_active:    communitySignal.epidemic_alert_active,
    epidemic_alert_message_bn: communitySignal.epidemic_alert_message_bn,
  },

  // Primary remedy
  spray_suppressed: abioticScore >= 0.60,
  remedy_bn: classification.primary === "biotic"
    ? bioticResult.remedy_bn
    : abioticResult.reasoning_bn,
  secondary_advice_bn: compoundStress?.compound_warning_bn ?? null,

  // Reasoning (from primary module)
  reasoning_bn: classification.primary === "biotic"
    ? bioticResult.reasoning_bn
    : abioticResult.reasoning_bn,
  confidence: classification.primary === "biotic"
    ? (bioticResult.confidence ?? 0)
    : Math.min(0.85, abioticScore + 0.10),

  // Overrides
  overrides_applied: [],  // will be populated by enforceHardOverrides

  // Meta
  source: "llm+rag",
  model_used: "gemini-biotic + code-abiotic + code-metal",

  // Legacy fields for backward compat
  final_diagnosis:        bioticResult.disease_name_en ?? "Environmental Stress",
  disease_type:           classification.primary === "biotic" ? "Biotic" : "Abiotic",
  stress_subtype:         stressType,
  suggested_disease_id:   bioticResult.suggested_disease_id ?? null,
  suggested_pollutant_id: abioticResult.suggested_pollutant_id ?? null,
};

// Apply hard overrides (from Stage 1)
const finalVerdictWithOverrides = enforceHardOverrides(
  finalVerdict,
  abioticScore,
  heavyMetalRes?.data?.severity ?? null,
  plumeExposure.plumeScore
);
```

---

## TASK 9 — COMMUNITY ALERT TRIGGER (route.ts)

### Step 9.1 — Add checkAndTriggerCommunityAlerts

Add this async fire-and-forget function:

```typescript
async function checkAndTriggerCommunityAlerts(
  scanLogId: string,
  stressType: string,
  lat: number,
  lng: number,
  zoneId: string,
  farmerId: string,
  landId: string
): Promise<void> {
  try {
    // Only farmers with data_sharing_consent contribute to community
    const { data: farmer } = await supabase
      .from("farmers")
      .select("data_sharing_consent")
      .eq("id", farmerId)
      .maybeSingle();

    if (!farmer?.data_sharing_consent) return;

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Find similar scans in 5km, last 7 days
    const { data: similarScans } = await supabase
      .from("scan_logs")
      .select("id")
      .eq("stress_type", stressType)
      .gte("created_at", sevenDaysAgo)
      .filter("scan_location", "st_dwithin", `SRID=4326;POINT(${lng} ${lat}),5000`)
      .limit(10);

    if ((similarScans?.length ?? 0) < 5) return;

    // Check if alert already exists
    const alertType = stressType.startsWith("Biotic") ? "disease_outbreak" : "pollution_spike";
    const { data: existing } = await supabase
      .from("community_alerts")
      .select("id")
      .eq("zone_id", zoneId)
      .eq("alert_type", alertType)
      .eq("is_active", true)
      .limit(1);

    if (existing?.length) return; // Already active

    // Create alert
    await supabase.from("community_alerts").insert({
      zone_id:          zoneId,
      alert_type:       alertType,
      epicenter:        `SRID=4326;POINT(${lng} ${lat})`,
      radius_meter:     5000,
      trigger_reason:   `${(similarScans?.length ?? 0) + 1}টি স্ক্যানে একই সমস্যা (৭ দিনে)`,
      trigger_scan_ids: [...(similarScans?.map(s => s.id) ?? []), scanLogId],
      case_count:       (similarScans?.length ?? 0) + 1,
      alert_message_bn: stressType.startsWith("Biotic")
        ? `সতর্কতা: এলাকায় ${(similarScans?.length ?? 0) + 1}টি ক্ষেতে একই রোগ পাওয়া গেছে।`
        : `সতর্কতা: এলাকায় শিল্প দূষণের প্রমাণ পাওয়া যাচ্ছে।`,
      is_active:        true,
    });

    console.log(`[CommunityAlert] Created ${alertType} alert for zone ${zoneId}`);
  } catch (err) {
    console.error("[CommunityAlert] Non-fatal error:", err);
  }
}
```

### Step 9.2 — Call after scan_logs saved

After successful scan_logs insert, add fire-and-forget call:

```typescript
// Community alert check (async, non-blocking)
checkAndTriggerCommunityAlerts(
  scanLogId,
  stressType,
  lat, lng,
  zoneId,
  farmerId,
  landId
).catch(err => console.error("[CommunityAlert] Failed:", err));
```

---

## TASK 10 — SEED kb_crops TABLE (Supabase SQL)

If kb_crops table is empty or doesn't exist, seed with core BRRI crops:

```sql
CREATE TABLE IF NOT EXISTS kb_crops (
  crop_id                VARCHAR PRIMARY KEY,
  crop_name_en           VARCHAR NOT NULL,
  crop_name_bn           TEXT NOT NULL,
  seasons                TEXT[] DEFAULT '{}',
  planting_months        INTEGER[] DEFAULT '{}',
  harvest_months         INTEGER[] DEFAULT '{}',
  suitable_zones         TEXT[] DEFAULT '{}',
  soil_pref              TEXT[] DEFAULT '{}',
  flood_tolerant         BOOLEAN DEFAULT FALSE,
  drought_tolerant       BOOLEAN DEFAULT FALSE,
  salinity_tolerant      BOOLEAN DEFAULT FALSE,
  special_notes_bn       TEXT
);

INSERT INTO kb_crops (crop_id, crop_name_en, crop_name_bn,
  planting_months, harvest_months, flood_tolerant, drought_tolerant,
  soil_pref, special_notes_bn)
VALUES
  ('rice_boro', 'Boro Rice', 'বোরো ধান',
   ARRAY[11,12,1,2], ARRAY[4,5,6], false, false,
   ARRAY['loam','clay_loam','clay'],
   'শীতকালীন সেচনির্ভর ধান। হাওর এলাকায় ফ্ল্যাশ ফ্লাড ঝুঁকি।'),

  ('rice_aman', 'Aman Rice', 'আমন ধান',
   ARRAY[6,7,8], ARRAY[11,12], true, false,
   ARRAY['loam','clay_loam','clay','silty'],
   'বর্ষাকালীন ধান। বন্যাসহিষ্ণু জাত পাওয়া যায়।'),

  ('rice_aus', 'Aus Rice', 'আউশ ধান',
   ARRAY[3,4,5], ARRAY[8,9], false, true,
   ARRAY['loam','sandy_loam'],
   'গ্রীষ্মকালীন খরাসহিষ্ণু ধান।'),

  ('wheat', 'Wheat', 'গম',
   ARRAY[11,12], ARRAY[3,4], false, true,
   ARRAY['loam','clay_loam'],
   'শীতকালীন ফসল। উচ্চ তাপমাত্রায় ক্ষতি হয়।'),

  ('maize', 'Maize', 'ভুট্টা',
   ARRAY[10,11,2,3], ARRAY[2,3,6,7], false, true,
   ARRAY['loam','sandy_loam'],
   'সারা বছর চাষযোগ্য। জলাবদ্ধতা সহ্য করে না।')

ON CONFLICT (crop_id) DO NOTHING;
```

---

## STAGE 2 DONE CHECKLIST

[ ] Task 2 — runBioticModule created (renamed from runMasterJudge, prompt cleaned)
[ ] Task 2 — adjustBioticScore function added
[ ] Task 3 — buildAbioticResult function added
[ ] Task 4 — scoreHeavyMetal function added
[ ] Task 5 — getCommunitySignal function added
[ ] Task 5 — applyCommuntiyWeighting function added
[ ] Task 6 — detectCompoundStress function added
[ ] Task 6 — classifyResults function added
[ ] Task 7 — checkLandSuitability function added, kb_crops fetched
[ ] Task 8 — Three modules wired in POST handler
[ ] Task 8 — finalVerdict built from three modules
[ ] Task 9 — checkAndTriggerCommunityAlerts added, fire-and-forget
[ ] Task 10 — kb_crops seeded with 5 BRRI crops

Test scan after Stage 2:
- Response must have detection_scores with three keys
- Response must have primary_cause and secondary_cause
- compound_stress must appear when two signals >= 0.20
- community.nearby_verified_scans must be populated

ONLY proceed to STAGE_3_PROMPT.md after all boxes are checked.
