# AgroSentinel v2 — Complete Diagnostic Pipeline Specification

> **Purpose:** This document is the single source of truth for implementing the AgroSentinel v2 diagnosis pipeline. It covers architecture, data flow, scoring logic, database interactions, community feedback loops, and accuracy benchmarks. Any AI model or developer reading this document should be able to implement the full system from scratch.

---

## 1. SYSTEM OVERVIEW

### 1.1 What is AgroSentinel?

AgroSentinel is an AI-powered crop disease diagnosis system for Bangladeshi rice farmers. A farmer photographs a sick plant with their mobile phone. The system analyses the image alongside environmental, geospatial, soil, weather, and community data to produce a multi-dimensional diagnosis.

**Primary Mission:** Prevent unnecessary pesticide application when the true cause of crop damage is industrial pollution, heavy metal soil contamination, or other abiotic stressors — not a biological pathogen.

**Secondary Mission:** Build a living community knowledge base where every scan improves accuracy for all subsequent scans in the same geographic area.

### 1.2 Tech Stack

| Layer | Technology |
|---|---|
| API Route | Next.js App Router (`POST /api/diagnose`) |
| AI Vision + Diagnosis | Google Gemini (gemini-3.1-flash-lite-preview) |
| Embeddings | Google text-embedding-004 (1024 dims) |
| Database | Supabase (PostgreSQL + PostGIS) |
| Weather | Open-Meteo Archive API (free, no key) |
| Deployment | Vercel Serverless |

### 1.3 Core Design Principles

1. **Code enforces hard rules; LLM provides soft reasoning.** The LLM suggests scores and text. All threshold-based override logic (e.g., "if abiotic ≥ 60% → suppress spray") is enforced in TypeScript after the LLM returns — never trusted solely to the prompt.

2. **Three independent signals, not one combined prompt.** Biotic disease, environmental abiotic stress, and heavy metal contamination are scored separately, then merged. This prevents the LLM from conflating signals that have different causal chains.

3. **Compound stress is not ignored.** If two signals both exceed meaningful thresholds, both are reported to the farmer with a compound-effect explanation. A winner is declared for the primary remedy, but secondary signals drive additional warnings.

4. **Every scan is community data.** Detection scores, compound flags, and verified outcomes feed back into RAG retrieval and epidemic detection for future scans within the same geographic area.

5. **Fail open, not closed.** If any non-critical module fails (embeddings, heavy metal pipeline, community lookup), the scan continues and returns a result. Only Gate 0 failures (auth, survey, image validity) hard-block the scan.

---

## 2. DATABASE SCHEMA — KEY TABLES

Understanding these tables is required before reading the pipeline.

### 2.1 Core Knowledge Base (Read-Only Reference)

**`kb_crops`** — Crop biology and suitability data
- `crop_id` (PK), `crop_name_en`, `crop_name_bn`
- `seasons[]`, `planting_months[]`, `harvest_months[]`
- `suitable_zones[]` — array of zone_ids where this crop can grow
- `soil_pref[]` — preferred soil textures
- `growth_temp_min/max`, `optimal_humidity_min`
- `flood_tolerant`, `drought_tolerant`, `salinity_tolerant`
- `min_viable_temp_c`, `max_salinity_dsm`
- `special_notes_bn` — important agronomic notes in Bengali

**`kb_zones`** — Geographic zone profiles
- `zone_id` (PK), `zone_name_en`, `zone_name_bn`, `district`, `division`
- `soil_type_en`, `soil_ph_min/max`
- `heavy_metal_risk` (bool), `arsenic_zone_risk` (Low/Medium/High)
- `known_metal_types[]` — e.g. ["Arsenic", "Lead"]
- `unsuitable_crops` (JSONB) — crops that should NOT be grown here
- `flood_risk_level`, `flood_risk_months[]`
- `drought_risk_level`, `salinity_level`, `salinity_peak_months[]`
- `recommended_variety_ids[]` — BRRI-recommended varieties for this zone
- `adaptive_strategy_bn` — text advice for farmers in Bengali

**`kb_diseases`** — Disease knowledge base
- `disease_id` (PK), `disease_name_en`, `disease_name_bn`
- `disease_type` (enum: Fungal/Pest/Viral/Bacterial)
- `affected_crops[]`
- `humidity_min`, `temp_min`, `temp_max` — weather conditions that favor this disease
- `favored_conditions` — text description
- `can_mimic_pollution` (bool) — CRITICAL: if true, extra care needed in abiotic vs biotic decision
- `differentiator_bn` — how to tell this disease from pollution damage
- `remedy_id` → `kb_remedies`
- `ai_confidence_hint` — suggested confidence ceiling when diagnosing this disease

**`kb_industrial_pollutants`** — Pollutant knowledge base
- `pollutant_id` (PK), `pollutant_name`
- `damage_pattern_bn` — how this pollutant damages crops
- `color_signature`, `spread_pattern`
- `max_travel_km`, `plume_spread_deg`
- `worse_in_humidity`, `worse_in_rain`
- `remedy_id` → `kb_remedies`

**`kb_remedies`** — Remedy instructions
- `remedy_id` (PK), `title_en`, `title_bn`
- `headline_bn` — one-line summary
- `action_steps_bn` (JSONB array) — step-by-step instructions
- `reality_check_bn` — what NOT to do
- `prevention_bn`, `escalation_trigger_bn`
- `estimated_cost_bdt`, `recovery_time`
- `eco_friendly` (bool)

### 2.2 Farmer & Land Data (Read + Write)

**`farmers`**
- `id` (PK), `phone_number`, `name_bn`, `zone_id`
- `trust_score` (0.0–1.0) — affects how much their scans influence RAG
- `badge_level` (enum: New/Bronze/Silver/Gold)
- `data_sharing_consent` (bool) — MUST be true for scan to feed community data

**`farmer_lands`**
- `land_id` (PK), `farmer_id`, `zone_id`
- `crop_id` (FK → kb_crops) — what crop is currently planted
- `boundary` (PostGIS geometry), `area_bigha`

**`farm_profiles`** — Updated weekly via farmer survey
- `farmer_id`, `land_id` (composite key effectively)
- `soil_ph`, `soil_texture`, `soil_drainage`
- `water_color`, `water_risk` (Clear/Chemical/Contaminated/Flood)
- `smoke_exposure` (bool) — farmer reports visible factory smoke this week
- `canal_contamination` (bool) — farmer reports contaminated canal water
- `neighbor_problem` (bool) — neighbours have the same issue
- `arsenic_risk`, `iron_risk`, `fish_kill` (bool)
- `pest_level` (Low/Medium/High), `pests_seen[]`
- `scan_context` — pre-built text blob summarising this farm's conditions for LLM injection

**`surveys`** — Weekly survey records
- `farmer_id`, `land_id`, `week_number`, `year`
- `answers` (JSONB), `soil_ph_risk`, `water_risk`, `pest_level`, `env_stress`

### 2.3 Environmental Data (Read)

**`industrial_hotspots`** — Factory pollution sources
- `id`, `factory_name_bn`, `industry_type`
- `location` (PostGIS), `factory_lat`, `factory_lng`
- `max_plume_km` — how far this factory's plume travels
- `plume_cone_deg` — cone width of plume dispersion
- `primary_pollutant_id` → kb_industrial_pollutants
- `active_months[]` — months when factory is operational
- `is_currently_active` (bool)

**`weather_details`** — Per-farmer weather cache
- `farmer_id`, `weather_data` (JSONB)
- Stores 168h hourly wind data + computed metrics

**`weather_grid_cache`** — Grid-level weather summary
- `grid_cell_id`, `humidity_pct`, `wind_speed_kmh`
- `consecutive_wet_days`, `avg_humidity_7d`

**`water_pollution_events`** — Active water contamination events
- `water_source_id`, `hotspot_id`, `pollution_type`, `severity`
- `water_color`, `fish_kill_reported`, `is_active`

**`satellite_water_data`** — Remote sensing water quality
- `grid_cell_id`, `water_quality_index`, `turbidity`
- `suspected_pollution` (bool), `color_estimate`

**`heavy_metal_reports`** — Historical heavy metal findings
- `land_id`, `farmer_id`, `scan_log_id`
- `metal_type`, `severity`, `confidence_score`
- `source_factory_id`, `geom` (PostGIS)
- `verified` (bool)

### 2.4 Scan & Community Data (Read + Write)

**`scan_logs`** — Primary output table, one row per scan
- `id` (PK), `farmer_id`, `land_id`, `crop_id`
- `scan_location` (PostGIS), `grid_cell_id`
- `image_url`
- `vision_output` (JSONB) — raw vision stage output
- `questionnaire_answers` (JSONB)
- `environmental_context` (JSONB) — full signal breakdown
- `stress_type` (enum) — primary classification
- `confirmed_disease_id`, `confirmed_pollutant_id`
- `ai_confidence` (0.0–1.0)
- `embedding` (vector 1024) — for RAG similarity search
- `verification_status` (pending/verified/rejected)
- `rag_trust_weight` — DB computed, do not insert manually

**`diagnosis_cache`** — Keyed by (grid_cell, weather_hash, symptom_hash)
- Used to skip LLM call when identical conditions were recently seen
- `expires_at` — cache TTL
- **IMPORTANT:** Cache must also store `abiotic_score_at_cache_time`. If current abiotic score differs by > 0.15 from cached value, cache must be bypassed.

**`community_alerts`** — Auto-generated epidemic/pollution alerts
- `zone_id`, `alert_type` (disease_outbreak/pollution_spike/heavy_metal_cluster)
- `epicenter` (PostGIS), `radius_meter`
- `trigger_scan_ids[]` — which scans triggered this
- `case_count`, `alert_message_bn`
- `is_active`, `resolved_at`

**`farm_risk_scores`** — Per-land rolling risk score
- `land_id`, `farmer_id`
- `risk_score` (0–100), `risk_level`
- `breakdown` (JSONB) — biotic/abiotic/metal scores
- `dominant_threat`, `advice_bn`
- `is_current` (bool) — only one active per land

---

## 3. PIPELINE ARCHITECTURE

The pipeline is divided into 5 sequential stages. Stages 0–2 are gates that can terminate early. Stage 3 is the core parallel detection. Stage 4 merges and persists.

```
REQUEST
   │
   ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 0: PRE-FLIGHT GATES                           │
│  A. Image size validation (< 4.5 MB)               │
│  B. Required field validation                       │
│  C. Survey gate (must complete weekly survey)       │
│  → ALL DB fetches and LLM calls blocked until here  │
└──────────────────────────┬──────────────────────────┘
                           │ PASS
                           ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 1: PARALLEL CONTEXT FETCH                     │
│  Upload image → Supabase Storage                    │
│  Promise.all([                                      │
│    weather_details, farm_profiles, farmer_lands,    │
│    farmers + kb_zones, spray_events (community),    │
│    industrial_hotspots, heavy_metal_reports,        │
│    water_pollution_events, satellite_water_data     │
│  ])                                                 │
│  + computeCumulativePlumeExposure (7-day wind model)│
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 2: GATE CHECKS (DB-driven, no LLM)            │
│  A. Crop Validity Gate (via Vision LLM)             │
│     → Reject if: blurry, not a plant, no symptoms  │
│  B. Land Suitability Check (kb_crops + kb_zones)   │
│     → Warn if: wrong season, wrong zone, etc.       │
└──────────────────────────┬──────────────────────────┘
                           │ PASS (warnings attached)
                           ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 3: THREE PARALLEL DETECTION MODULES           │
│                                                     │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ MODULE A   │  │ MODULE B   │  │  MODULE C    │  │
│  │ BIOTIC     │  │ ABIOTIC    │  │  HEAVY METAL │  │
│  │ DETECTION  │  │ DETECTION  │  │  DETECTION   │  │
│  │            │  │            │  │              │  │
│  │ Score 0-1  │  │ Score 0-1  │  │  Score 0-1   │  │
│  └────────────┘  └────────────┘  └──────────────┘  │
│                                                     │
│  + Community Signal Fetch (scan_logs history)       │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 4: VERDICT ASSEMBLY + PERSISTENCE             │
│  A. Threshold classification                        │
│  B. Compound stress detection                       │
│  C. Community weighting                             │
│  D. Hard override enforcement (code-level)          │
│  E. Final verdict construction                      │
│  F. Save scan_logs + update community data          │
│  G. Trigger epidemic check                          │
│  H. Update farm_risk_scores                         │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
                      RESPONSE JSON
```

---

## 4. STAGE 0 — PRE-FLIGHT GATES

These checks run BEFORE any image upload, DB query, or LLM call. Order matters — cheapest checks first.

```typescript
// Gate A: Image size
const imageSizeKB = Math.round((imageBase64.length * 0.75) / 1024);
if (imageSizeKB > 4500) → 413 error (message in Bengali)

// Gate B: Required fields
if (!imageBase64 || !farmerId || !landId || lat == null || lng == null)
  → 400 error

// Gate C: Survey gate
// Check surveys table for this farmer/land/week/year
// If no survey exists AND SKIP_SURVEY_GATE != "true":
  → 403 error with blocked: true flag
// NOTE: Use ISO week number (Thursday-anchored per ISO-8601)
```

**Why survey gate is critical:** The `farm_profiles.scan_context` field is the LLM's ground truth about this specific farm. Without a recent survey, the system has no soil/water/smoke context and cannot distinguish pollution damage from disease. Blocking is correct behaviour.

---

## 5. STAGE 1 — PARALLEL CONTEXT FETCH

All of the following run in a single `Promise.all()` after Stage 0 passes. Image upload also runs here.

```typescript
const [
  uploadResult,        // Supabase Storage
  weatherRes,          // weather_details for farmer
  profileRes,          // farm_profiles for farmer+land
  landRes,             // farmer_lands (crop_id, zone_id)
  farmerRes,           // farmers + JOIN kb_zones(climate_profile)
  communitySprayRes,   // get_community_spray_risk_for_lands RPC
  hotspotsRes,         // industrial_hotspots with ST_Y/ST_X coords
  heavyMetalRes,       // heavy_metal_reports for this land (most recent)
  waterPollutionRes,   // water_pollution_events (active, within 2km)
  satelliteWaterRes,   // satellite_water_data for grid_cell_id
] = await Promise.all([...]);
```

After this fetch, compute:
1. `computeCumulativePlumeExposure()` — see Section 6
2. `buildAbioticSignals()` — see Section 8.2
3. `checkLandSuitability()` — see Section 7.2

---

## 6. CUMULATIVE PLUME EXPOSURE MODEL

This is the most scientifically important environmental signal in the system.

### 6.1 Why cumulative, not instantaneous

Plant damage from industrial pollutants (SO₂, NOₓ, particulates) is dose-dependent and builds up over days of repeated exposure. A single wind direction reading at scan time is nearly meaningless. What matters is: across the past 7 days (168 hours), how many hours was the wind carrying factory emissions toward this specific farm?

### 6.2 Algorithm

```
For each factory in industrial_hotspots:
  1. Compute bearing: angle FROM factory TO farm (0=North, clockwise)
  2. Fetch 168h hourly wind_direction from Open-Meteo (or reuse cache)
  3. For each hourly reading:
     a. plumeTravelDir = (windDeg + 180°) % 360
        (wind blows FROM direction windDeg, plume travels TO windDeg+180°)
     b. angleDifference = min angular distance between bearing and plumeTravelDir
     c. withinCone = angleDifference <= (plume_cone_deg / 2)
     d. withinRange = distanceKm(factory, farm) <= factory.max_plume_km
     e. activeNow = factory.active_months includes currentMonth
     f. If withinCone AND withinRange AND activeNow:
        - windDilutionFactor = min(2.0, 10.0 / max(1.0, windSpeed_kmh))
          (slower wind = higher concentration)
        - coneCenterAlignment = 1.0 - (angleDiff / (cone/2)) * 0.5
          (centre of plume cone = 1.0, edge = 0.5)
        - distanceDecay = 1.0 / (1.0 + distanceKm²)
          (inverse square falloff with distance)
        - hourlyDose = basePollutantLoad * distanceDecay * windDilutionFactor * coneCenterAlignment
        - factoryExposureScore += hourlyDose
        - exposedHours++

4. Take MAX score across all factories (dominant threat)
5. plumeScore = min(0.50, (maxExposureScore / 30.0) * 0.50)
   (normalised: 0.0 = no exposure, 0.50 = sustained heavy exposure)
```

### 6.3 Multi-factory compounding (v2 improvement)

The current implementation takes the MAX. The correct approach is to also compute a **combined dose** for cases where multiple factories overlap.

```typescript
// v2 addition: aggregate dose from ALL factories within range
let totalCombinedDose = 0;
for (const factory of hotspots) {
  totalCombinedDose += factoryDoseMap[factory.id];
}
const combinedPlumeScore = Math.min(0.50, (totalCombinedDose / 30.0) * 0.50);

// Use the higher of dominant-factory score or combined score
const finalPlumeScore = Math.max(dominantFactoryScore, combinedPlumeScore);
```

This prevents under-estimation in dense industrial areas like Narayanganj or Gazipur where 3 factories each contribute 0.15 but the combined exposure is 0.45.

---

## 7. STAGE 2 — GATE CHECKS

### 7.1 Crop Validity Gate (Vision LLM — Stage A)

This is the ONLY Vision LLM call. It does two things only: gatekeeper + symptom extraction. It does NOT diagnose.

**Prompt contract:**
```
Input: image (base64) + farm_profiles.scan_context
Output JSON:
{
  "is_valid": bool,
  "rejection_reason_bn": string | null,  // Bengali if rejected, null if valid
  "detected_crop_en": string,            // "rice", "wheat", etc.
  "detected_crop_bn": string,            // "ধান", "গম", etc.
  "growth_stage": "seedling"|"vegetative"|"flowering"|"mature",
  "image_quality_score": 0.0–1.0,
  "visual_symptoms_raw": string          // detailed agronomic symptom description in English
}
```

**Rejection criteria (return is_valid: false):**
- Blurry or out-of-focus
- Too dark to see symptoms
- Not a crop plant (soil only, non-agricultural object)
- No visible symptoms (healthy plant with no damage markers)

**Important:** The vision stage sees the `scan_context` from `farm_profiles` as farm background. This gives it context on what crop to expect and what environmental conditions the farmer has reported.

### 7.2 Land Suitability Check (Pure DB logic — Stage B)

This is NOT an LLM call. It is a deterministic check using `kb_crops` and `kb_zones`.

```typescript
interface LandSuitabilityResult {
  is_suitable: boolean;
  suitability_score: number;   // 0.0–1.0
  warnings: {
    wrong_season: boolean;      // current month not in kb_crops.planting_months
    wrong_zone: boolean;        // zone_id not in kb_crops.suitable_zones
    soil_mismatch: boolean;     // farm soil_texture not in kb_crops.soil_pref
    salinity_risk: boolean;     // zone salinity > crop tolerance
    flood_risk_active: boolean; // current month in zone's flood_risk_months
    drought_risk_active: boolean;
    arsenic_zone_high: boolean; // kb_zones.arsenic_zone_risk === 'High'
    listed_unsuitable: boolean; // crop appears in kb_zones.unsuitable_crops
  };
  unsuitable_reason_bn: string | null;
  recommended_varieties_bn: string | null;  // from kb_zones.recommended_variety_ids
}

function checkLandSuitability(crop, zone, profile, currentMonth): LandSuitabilityResult {
  const checks = {
    wrong_season:        !crop.planting_months?.includes(currentMonth),
    wrong_zone:          !!crop.suitable_zones?.length && !crop.suitable_zones.includes(zone.zone_id),
    soil_mismatch:       !!crop.soil_pref?.length && !crop.soil_pref.some(p =>
                           profile?.soil_texture?.toLowerCase().includes(p.toLowerCase())),
    salinity_risk:       zone.salinity_level !== 'None' && !crop.salinity_tolerant,
    flood_risk_active:   zone.flood_risk_months?.includes(currentMonth) && !crop.flood_tolerant,
    drought_risk_active: zone.drought_risk_months?.includes(currentMonth) && !crop.drought_tolerant,
    arsenic_zone_high:   zone.arsenic_zone_risk === 'High',
    listed_unsuitable:   (zone.unsuitable_crops as string[])?.includes(crop.crop_id),
  };

  const failCount = Object.values(checks).filter(Boolean).length;
  const score = 1.0 - (failCount / Object.keys(checks).length);

  return {
    is_suitable: score >= 0.60 && !checks.listed_unsuitable,
    suitability_score: score,
    warnings: checks,
    unsuitable_reason_bn: buildSuitabilityReasonBn(checks, crop, zone),
    recommended_varieties_bn: zone.adaptive_strategy_bn ?? null,
  };
}
```

**Suitability result behaviour:**
- `is_suitable: false` → scan continues but strong warning is prepended to final verdict
- It is NOT a hard block (farmer may have intentionally planted an unusual crop)
- The suitability data is saved in `scan_logs.environmental_context`

---

## 8. STAGE 3 — THREE PARALLEL DETECTION MODULES

These run concurrently via `Promise.all()`. Each module returns an independent score (0.0–1.0) and supporting data. They do NOT consult each other's scores — cross-signal interference happens only in Stage 4.

### 8.1 Module A — Biotic Disease Detection

**Inputs:** `visual_symptoms_raw`, weather, RAG cases, disease KB

**LLM call contract:**
```
Separate, focused prompt. Do NOT include abiotic signals here.
Input context:
  - detected crop + growth stage
  - visual symptoms (from Stage 2 vision)
  - current weather (humidity, consecutive wet days, temp)
  - kb_zones climate profile
  - RAG: verified disease cases within 5km radius (from scan_logs via pgvector)
  - kb_diseases entries that match crop + visual description

Output JSON:
{
  "score": 0.0–1.0,
  "disease_name_en": string,
  "disease_name_bn": string,
  "stress_subtype": "Biotic_Fungal"|"Biotic_Pest"|"Biotic_Viral"|"Biotic_Bacterial",
  "suggested_disease_id": string | null,
  "weather_supports_disease": boolean,
  "rag_match_count": number,
  "reasoning_bn": string  (2-3 sentences)
}
```

**Post-LLM score adjustment (code-level):**
```typescript
function scoreBiotic(llmResult, weather, ragCases, profile): BioticResult {
  let score = llmResult.score * 0.70;  // LLM is max 70% of biotic score

  // Weather bonus: blast/blight thrives in humid wet conditions
  if (weather.humidity > 85 && weather.consecutiveWetDays >= 5) score += 0.15;
  else if (weather.humidity > 75 && weather.consecutiveWetDays >= 3) score += 0.08;

  // RAG community bonus: verified cases nearby raise confidence
  score += Math.min(0.15, ragCases.length * 0.05);

  // Penalty: if disease can_mimic_pollution AND abiotic signals are present
  // NOTE: abioticRawScore passed in from Stage 1 computation
  const diseaseCanMimicPollution = lookupDiseaseFlag(llmResult.suggested_disease_id, 'can_mimic_pollution');
  if (diseaseCanMimicPollution && abioticRawScore > 0.30) score -= 0.10;

  return { ...llmResult, score: Math.min(1.0, Math.max(0.0, score)) };
}
```

**RAG retrieval:** Use `search_verified_rag_cases` RPC:
- `p_query_embedding`: vector from `text-embedding-004` on `visual_symptoms_raw`
- `p_radius_km`: 5.0
- `p_match_threshold`: 0.72 (cosine similarity)
- `p_min_trust_weight`: 0.60
- `p_match_count`: 5 (v2 increases from 3 to 5)

### 8.2 Module B — Environmental / Abiotic Detection

**Inputs:** Plume exposure, survey data, water events, satellite data, spray events

**This module is entirely score-based — no LLM call needed.** The score is computed from a weighted signal table.

```typescript
// SIGNAL WEIGHT TABLE v2
// ─────────────────────────────────────────────────────────────────
// Signal                          | Max Weight | Source
// ─────────────────────────────────────────────────────────────────
// Cumulative plume (7d model)     | 0–0.50     | computeCumulativePlumeExposure()
// Canal contamination (survey)    | 0.15       | farm_profiles.canal_contamination
// Active water pollution event    | 0.15       | water_pollution_events (active, 2km)
// Neighbor spray drift            | 0.10       | spray_events RPC (1km, active)
// Survey: smoke exposure          | 0.08       | farm_profiles.smoke_exposure
// Survey: water risk              | 0.07       | farm_profiles.water_risk (Chemical/Contaminated)
// Satellite water alert           | 0.06       | satellite_water_data.suspected_pollution
// Survey: neighbor same problem   | 0.05       | farm_profiles.neighbor_problem
// Survey: arsenic/iron risk flag  | 0.05       | farm_profiles.arsenic_risk || iron_risk
// ─────────────────────────────────────────────────────────────────
// Total max (excluding plume):    ~0.71
// With plume at max (0.50):       ~1.21 → capped at 1.0

function buildAbioticScore(
  plumeExposure, profile, neighborSprays,
  waterPollutionEvent, satelliteWater
): AbioticSignals {
  const signals = {
    plume:           plumeExposure.plumeScore,               // 0–0.50
    canal:           profile?.canal_contamination ? 0.15 : 0,
    waterEvent:      waterPollutionEvent?.is_active ? 0.15 : 0,
    sprayDrift:      neighborSprays.length > 0 ? 0.10 : 0,
    smoke:           profile?.smoke_exposure ? 0.08 : 0,
    waterRisk:       ['Chemical','Contaminated'].includes(profile?.water_risk) ? 0.07 : 0,
    satelliteAlert:  satelliteWater?.suspected_pollution ? 0.06 : 0,
    neighborProblem: profile?.neighbor_problem ? 0.05 : 0,
    metalRiskFlag:   (profile?.arsenic_risk || profile?.iron_risk) ? 0.05 : 0,
  };
  const total = Math.min(1.0, Object.values(signals).reduce((a, b) => a + b, 0));
  return { signals, total };
}
```

**Abiotic subtype resolution** (code-level, post-score):
```typescript
function resolveAbioticSubtype(signals, profile, plumeExposure, waterPollutionEvent): StressType {
  if (signals.plume >= 0.20 || signals.waterEvent > 0 || signals.canal > 0)
    return "Abiotic_Pollution";
  if (profile?.water_risk === "Flood") return "Abiotic_Water";
  if (profile?.soil_ph === "Acidic" || profile?.soil_ph === "Alkaline") return "Abiotic_Nutrient";
  if (signals.total >= 0.15) return "Abiotic_Weather";
  return "Abiotic_Pollution"; // default abiotic
}
```

### 8.3 Module C — Heavy Metal Detection

**Inputs:** Zone data, historical reports, farm profile flags, plume exposure, LLM reasoning

**Score components:**
```typescript
function scoreHeavyMetal(zone, profile, heavyMetalReport, plumeExposure): HeavyMetalResult {
  let score = 0;
  const metals: string[] = [];

  // Existing confirmed report for this land (highest signal)
  if (heavyMetalReport?.severity === 'critical') { score += 0.70; metals.push(heavyMetalReport.metal_type); }
  else if (heavyMetalReport?.severity === 'high')    { score += 0.55; metals.push(heavyMetalReport.metal_type); }
  else if (heavyMetalReport?.severity === 'moderate'){ score += 0.35; metals.push(heavyMetalReport.metal_type); }
  else if (heavyMetalReport?.severity === 'low')     { score += 0.18; metals.push(heavyMetalReport.metal_type); }

  // Zone baseline risk
  if (zone.arsenic_zone_risk === 'High')   score += 0.20;
  else if (zone.arsenic_zone_risk === 'Medium') score += 0.10;
  if (zone.known_metal_types?.length > 0) {
    metals.push(...zone.known_metal_types);
    score += 0.05;
  }

  // Farm survey flags
  if (profile?.arsenic_risk) score += 0.10;
  if (profile?.iron_risk)    score += 0.08;
  if (profile?.fish_kill)    score += 0.07;  // fish kills = water contamination

  // Plume exposure contributes if factory is known metal emitter
  if (plumeExposure.plumeScore > 0.20 && plumeExposure.dominantPollutantId) score += 0.10;

  return {
    score: Math.min(1.0, score),
    percentage: Math.round(Math.min(1.0, score) * 100),
    detected: score >= 0.20,
    metal_types: [...new Set(metals)],
    severity: deriveSeverityLabel(score),
    confidence: heavyMetalReport?.confidence_score ?? (score * 0.8),
    zone_baseline_risk: zone.arsenic_zone_risk ?? 'Low',
    known_metals_in_zone: zone.known_metal_types ?? [],
    source_factory_id: heavyMetalReport?.source_factory_id ?? null,
    historical_reports_nearby: 0,  // filled from separate count query
  };
}
```

### 8.4 Community Signal Fetch

Runs in parallel with Modules A/B/C.

```typescript
async function getCommunitySignal(lat, lng, zoneId, gridCellId): Promise<CommunitySignal> {
  const [recentScans, activeAlerts] = await Promise.all([
    supabase.from("scan_logs")
      .select("stress_type, ai_confidence, created_at, environmental_context")
      .filter("scan_location", "st_dwithin", `SRID=4326;POINT(${lng} ${lat}),5000`)
      .gte("created_at", thirtyDaysAgo)
      .eq("verification_status", "verified")  // only trust verified scans for community signal
      .order("created_at", { ascending: false })
      .limit(50),

    supabase.from("community_alerts")
      .select("alert_type, alert_message_bn, case_count")
      .eq("zone_id", zoneId)
      .eq("is_active", true)
  ]);

  const scans = recentScans.data ?? [];
  const total = scans.length;
  if (total === 0) return { ...defaults, community_weight: 0 };

  const bioticCount   = scans.filter(s => s.stress_type?.startsWith("Biotic")).length;
  const abioticCount  = scans.filter(s => s.stress_type?.startsWith("Abiotic")).length;
  const metalCount    = scans.filter(s => {
    const ctx = s.environmental_context as any;
    return ctx?.detection_scores?.heavy_metal?.pct >= 20;
  }).length;

  const communityWeight = Math.min(0.20, total * 0.004); // 50 scans = max weight 0.20

  return {
    biotic_community_ratio:      bioticCount / total,
    abiotic_community_ratio:     abioticCount / total,
    heavy_metal_community_ratio: metalCount / total,
    total_nearby_scans:          total,
    epidemic_alert_active:       !!(activeAlerts.data?.length),
    epidemic_alert_message_bn:   activeAlerts.data?.[0]?.alert_message_bn ?? null,
    community_weight:            communityWeight,
  };
}
```

---

## 9. STAGE 4 — VERDICT ASSEMBLY

### 9.1 Threshold Classification

```typescript
const THRESHOLDS = {
  PRIMARY:   0.35,  // ≥ 35% → primary diagnosis + full remedy
  SECONDARY: 0.20,  // ≥ 20% → secondary warning + brief advice
  TRACE:     0.10,  // ≥ 10% → logged in DB only, not shown to farmer
  IGNORE:    0.00,  // < 10% → discarded entirely
};
```

### 9.2 Community-Weighted Final Scores

```typescript
function applyCommuntiyWeighting(rawScores, community): WeightedScores {
  const w = community.community_weight; // 0.0–0.20
  return {
    biotic:      Math.min(1.0, rawScores.biotic      * (1 - w) + community.biotic_community_ratio      * w),
    abiotic:     Math.min(1.0, rawScores.abiotic     * (1 - w) + community.abiotic_community_ratio     * w),
    heavy_metal: Math.min(1.0, rawScores.heavy_metal * (1 - w) + community.heavy_metal_community_ratio * w),
  };
}
```

### 9.3 Hard Overrides (Code-Level — NOT Prompt-Level)

These rules are enforced in TypeScript after all scores are computed. They cannot be overridden by LLM output.

```typescript
function applyHardOverrides(scores, landSuitability): OverrideResult {
  const overrides = [];

  // OVERRIDE 1: High abiotic → suppress spray
  if (scores.abiotic >= 0.60) {
    overrides.push({ type: "ABIOTIC_OVERRIDE", spray_suppressed: true });
  }

  // OVERRIDE 2: Critical/High heavy metal → suppress spray + mandatory soil test
  if (scores.heavy_metal >= 0.55) {
    overrides.push({ type: "HEAVY_METAL_CRITICAL", spray_suppressed: true, soil_test_required: true });
  }

  // OVERRIDE 3: Active epidemic alert → boost biotic confidence
  if (community.epidemic_alert_active && scores.biotic >= 0.30) {
    scores.biotic = Math.min(1.0, scores.biotic + 0.10);
    overrides.push({ type: "EPIDEMIC_ALERT_BOOST" });
  }

  // OVERRIDE 4: Land suitability failure → prepend warning
  if (!landSuitability.is_suitable) {
    overrides.push({ type: "LAND_UNSUITABLE_WARNING" });
  }

  return { scores, overrides };
}
```

### 9.4 Primary/Secondary Classification

```typescript
function classifyResults(scores): Classification {
  const entries = Object.entries(scores).sort(([,a],[,b]) => (b as number) - (a as number));
  const [primaryKey, primaryScore] = entries[0];
  const [secondaryKey, secondaryScore] = entries[1];

  return {
    primary: primaryScore >= THRESHOLDS.PRIMARY ? primaryKey : null,
    secondary: secondaryScore >= THRESHOLDS.SECONDARY ? secondaryKey : null,
    trace: entries.filter(([,s]) => s >= THRESHOLDS.TRACE && s < THRESHOLDS.SECONDARY).map(([k]) => k),
    primary_percentage: Math.round((primaryScore as number) * 100),
    secondary_percentage: Math.round((secondaryScore as number) * 100),
  };
}
```

### 9.5 Compound Stress Detection

Compound stress occurs when two independent causal mechanisms are simultaneously acting on the crop. This matters because it modifies the primary remedy's expected efficacy.

**Compound pairs that are meaningful:**

| Combination | Effect | Warning |
|---|---|---|
| Biotic + Heavy Metal | Metal weakens immune response → fungicide/pesticide partially effective | Recommend soil test alongside treatment |
| Biotic + Abiotic Pollution | Pollution causes similar visual symptoms → diagnosis less certain | Increase follow-up monitoring |
| Abiotic Pollution + Heavy Metal | Factory is likely both air and soil pollution source | Report to upazila agriculture office |
| Biotic + Biotic (two diseases) | Not compound stress — one is primary, one is secondary only | |

```typescript
function detectCompoundStress(
  primary: string,
  secondary: string | null,
  scores: WeightedScores,
  bioticResult: BioticResult,
  metalResult: HeavyMetalResult
): CompoundStressResult | null {

  if (!secondary) return null;
  if (scores[secondary as keyof typeof scores] < THRESHOLDS.SECONDARY) return null;
  if (primary === "biotic" && secondary === "biotic") return null;

  const pair = [primary, secondary].sort().join("+");

  const compoundMap: Record<string, string> = {
    "biotic+heavy_metal":
      `⚠️ যৌগিক চাপ শনাক্ত: ${bioticResult.disease_name_bn} রোগের পাশাপাশি মাটিতে ` +
      `${metalResult.metal_types.join(", ")} পাওয়া গেছে (${Math.round(scores.heavy_metal * 100)}%)। ` +
      `ভারী ধাতু গাছের রোগ প্রতিরোধ ক্ষমতা কমিয়ে দেয়, তাই ছত্রাকনাশক সম্পূর্ণ কার্যকর নাও হতে পারে। ` +
      `মাটি পরীক্ষার জন্য উপজেলা কৃষি অফিসে যোগাযোগ করুন।`,

    "abiotic+biotic":
      `⚠️ যৌগিক চাপ: দূষণজনিত ক্ষতি ও জৈবিক রোগ একসাথে দেখা যাচ্ছে। ` +
      `উভয় কারণ নিশ্চিত না হওয়া পর্যন্ত কীটনাশক ব্যবহার সীমিত রাখুন।`,

    "abiotic+heavy_metal":
      `⚠️ গুরুতর দূষণ সংকেত: বায়ু দূষণ ও মাটির ভারী ধাতু একসাথে পাওয়া গেছে। ` +
      `এটি কাছের কারখানার দীর্ঘমেয়াদী প্রভাব হতে পারে। ` +
      `অবিলম্বে উপজেলা কৃষি অফিসে জানান।`,
  };

  const message = compoundMap[pair];
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

### 9.6 Final Verdict Construction

```typescript
interface FinalVerdict {
  // Gate results
  gates: {
    crop_valid: boolean;
    crop_detected_en: string;
    crop_detected_bn: string;
    growth_stage: string;
    land_suitable: boolean;
    land_suitability_score: number;
    land_warnings: string[];        // human-readable warning list in Bengali
  };

  // All three detection scores (always present)
  detection_scores: {
    biotic:      { percentage: number; disease_name_bn: string; subtype: string; disease_id: string | null };
    abiotic:     { percentage: number; stress_type_bn: string; subtype: string; pollutant_id: string | null; spray_suppressed: boolean };
    heavy_metal: { percentage: number; metals: string[]; severity: string; zone_risk: string };
  };

  // Classification
  primary_cause: "biotic" | "abiotic" | "heavy_metal";
  secondary_cause: "biotic" | "abiotic" | "heavy_metal" | null;

  // Compound stress
  compound_stress: CompoundStressResult | null;

  // Community context
  community: {
    nearby_verified_scans: number;
    area_trend_bn: string;          // e.g. "এলাকায় ৭০% স্ক্যানে ব্লাস্ট রোগ দেখা যাচ্ছে"
    epidemic_alert_active: boolean;
    epidemic_alert_message_bn: string | null;
  };

  // Primary remedy (for the winning cause)
  spray_suppressed: boolean;
  remedy_bn: string;
  remedy_id: string | null;

  // Secondary advice (for secondary cause, if present)
  secondary_advice_bn: string | null;

  // Reasoning
  reasoning_bn: string;             // 3–5 sentences from primary detection module LLM
  confidence: number;               // 0.0–1.0

  // Source info
  source: "cache" | "llm" | "llm+rag";
  model_used: string;
}
```

---

## 10. CACHE LOGIC (v2 — Fixed)

The current cache has a critical bug: it stores diagnosis but ignores whether abiotic conditions have changed since the cache was created.

**v2 Cache Key:** `(grid_cell_id, weather_hash, symptom_hash, abiotic_score_bucket)`

```typescript
// Bucket the abiotic score into 5 bands (prevents cache with wrong pollution context)
function abioticScoreBucket(score: number): string {
  if (score < 0.20) return "low";
  if (score < 0.40) return "moderate";
  if (score < 0.60) return "high";
  if (score < 0.80) return "critical";
  return "extreme";
}

// Only use cache if ALL four keys match
const cacheKey = {
  grid_cell_id: gridCellId,
  weather_hash: md5(weatherStr),
  symptom_hash: md5(visualSymptomsRaw),
  abiotic_bucket: abioticScoreBucket(abioticScore),  // NEW
};
```

**Cache invalidation rules:**
- Cache TTL: 24 hours (not just `expires_at` — also check if plumeScore has changed > 0.15)
- If an active `community_alerts` record exists for this zone, bypass cache entirely
- If the nearest factory's `is_currently_active` has changed, bypass cache

---

## 11. PERSISTENCE — SAVING SCAN DATA

### 11.1 scan_logs Insert

```typescript
// All three scores stored in environmental_context JSONB
environmental_context: {
  detection_scores: {
    biotic:      { pct: Math.round(scores.biotic * 100),      disease_id: bioticResult.suggested_disease_id },
    abiotic:     { pct: Math.round(scores.abiotic * 100),     pollutant_id: abioticResult.suggested_pollutant_id },
    heavy_metal: { pct: Math.round(scores.heavy_metal * 100), metal: heavyMetalResult.metal_types[0] ?? null },
  },
  primary_cause:    classification.primary,
  secondary_cause:  classification.secondary,     // NEW column needed
  compound_stress:  !!compoundStress,              // NEW column needed
  // ... plume, weather, signal breakdown as before
},

// stress_type = primary cause's subtype enum
stress_type: primarySubtype,  // e.g. "Biotic_Fungal"

// confirmed_disease_id = primary disease (biotic only)
confirmed_disease_id: classification.primary === "biotic" ? bioticResult.suggested_disease_id : null,

// confirmed_pollutant_id = from abiotic or heavy metal
confirmed_pollutant_id: classification.primary !== "biotic"
  ? (abioticResult.suggested_pollutant_id ?? heavyMetalResult.source_factory_id ?? null)
  : null,
```

### 11.2 Required New Columns in scan_logs

```sql
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS secondary_cause TEXT;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS compound_stress BOOLEAN DEFAULT FALSE;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS biotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS abiotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS heavy_metal_score DOUBLE PRECISION;
```

### 11.3 Community Alert Trigger

After scan_logs is saved, run this check asynchronously (fire-and-forget):

```typescript
async function checkAndTriggerCommunityAlerts(
  scanLogId, finalVerdict, lat, lng, zoneId, farmerId
) {
  // Only farmers with data_sharing_consent = true contribute to community alerts
  const farmer = await supabase.from("farmers").select("data_sharing_consent").eq("id", farmerId).single();
  if (!farmer.data?.data_sharing_consent) return;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Check if there are 5+ scans with same primary diagnosis in 5km radius, last 7 days
  const { data: similarScans } = await supabase.from("scan_logs")
    .select("id")
    .eq("stress_type", finalVerdict.primary_subtype)
    .eq("zone_id", zoneId)
    .gte("created_at", sevenDaysAgo)
    .filter("scan_location", "st_dwithin", `SRID=4326;POINT(${lng} ${lat}),5000`)
    .limit(10);

  if ((similarScans?.length ?? 0) >= 5) {
    // Check if an active alert already exists for this zone + type
    const { data: existing } = await supabase.from("community_alerts")
      .select("id")
      .eq("zone_id", zoneId)
      .eq("alert_type", finalVerdict.disease_type === "Biotic" ? "disease_outbreak" : "pollution_spike")
      .eq("is_active", true)
      .limit(1);

    if (!existing?.length) {
      await supabase.from("community_alerts").insert({
        zone_id: zoneId,
        alert_type: finalVerdict.disease_type === "Biotic" ? "disease_outbreak" : "pollution_spike",
        epicenter: `SRID=4326;POINT(${lng} ${lat})`,
        radius_meter: 5000,
        trigger_reason: `${similarScans.length} টি স্ক্যানে একই সমস্যা পাওয়া গেছে (৭ দিনে)`,
        trigger_scan_ids: [...(similarScans?.map(s => s.id) ?? []), scanLogId],
        case_count: (similarScans?.length ?? 0) + 1,
        alert_message_bn: buildAlertMessage(finalVerdict),
        is_active: true,
      });
    }
  }

  // Update farm_risk_scores
  await supabase.from("farm_risk_scores").upsert({
    land_id: landId,
    farmer_id: farmerId,
    risk_score: Math.round(Math.max(scores.biotic, scores.abiotic, scores.heavy_metal) * 100),
    risk_level: getRiskLevel(Math.max(scores.biotic, scores.abiotic, scores.heavy_metal)),
    breakdown: {
      biotic:      Math.round(scores.biotic * 100),
      abiotic:     Math.round(scores.abiotic * 100),
      heavy_metal: Math.round(scores.heavy_metal * 100),
    },
    dominant_threat: classification.primary,
    advice_bn: finalVerdict.remedy_bn,
    is_current: true,
    calculated_at: new Date().toISOString(),
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
  }, { onConflict: "land_id,farmer_id" });
}
```

---

## 12. API RESPONSE STRUCTURE

```json
{
  "success": true,
  "scan_id": "SCN-LX7K9A",

  "gates": {
    "crop_valid": true,
    "crop_detected": "ধান (Rice)",
    "growth_stage": "vegetative",
    "land_suitable": true,
    "land_suitability_score": 0.80,
    "land_warnings": []
  },

  "detection_scores": {
    "biotic": {
      "percentage": 40,
      "disease_name_bn": "ধানের ব্লাস্ট রোগ",
      "subtype": "Biotic_Fungal",
      "disease_id": "rice_blast_001"
    },
    "abiotic": {
      "percentage": 18,
      "stress_type_bn": "বায়ু দূষণ",
      "subtype": "Abiotic_Pollution",
      "pollutant_id": "so2_tannery",
      "spray_suppressed": false
    },
    "heavy_metal": {
      "percentage": 22,
      "metals": ["আর্সেনিক"],
      "severity": "low",
      "zone_risk": "Medium"
    }
  },

  "primary_cause": "biotic",
  "secondary_cause": "heavy_metal",

  "compound_stress": {
    "detected": true,
    "pair": "biotic+heavy_metal",
    "affects_primary_remedy": true,
    "compound_warning_bn": "⚠️ যৌগিক চাপ শনাক্ত: ব্লাস্ট রোগের পাশাপাশি আর্সেনিক পাওয়া গেছে (২২%)। ছত্রাকনাশক আংশিক কার্যকর হতে পারে। মাটি পরীক্ষার জন্য উপজেলা কৃষি অফিসে যোগাযোগ করুন।"
  },

  "community": {
    "nearby_verified_scans": 17,
    "area_trend_bn": "এলাকায় গত ৩০ দিনে ৬৫% স্ক্যানে ব্লাস্ট রোগ দেখা গেছে",
    "epidemic_alert_active": false,
    "epidemic_alert_message_bn": null
  },

  "spray_suppressed": false,
  "remedy_bn": "ট্রাইসাইক্লাজল ৭৫% WP প্রতি লিটার পানিতে ০.৬ গ্রাম মিশিয়ে স্প্রে করুন। ভোরে বা বিকেলে স্প্রে করুন।",
  "remedy_id": "remedy_triclazole_blast",
  "secondary_advice_bn": "মাটি পরীক্ষা করান। আর্সেনিকের মাত্রা বেশি হলে সেচের পানি পরিবর্তন করুন।",

  "reasoning_bn": "ছবিতে ধানের পাতায় ডায়মন্ড আকৃতির ধূসর-সাদা দাগ দেখা যাচ্ছে যা ব্লাস্ট রোগের বৈশিষ্ট্য। আর্দ্রতা ৮৮% এবং টানা ৬ দিন বৃষ্টিপাত রোগটির অনুকূল। এলাকার ১৭টি যাচাইকৃত স্ক্যানের মধ্যে ১১টিতে একই রোগ পাওয়া গেছে। তবে মাটিতে আর্সেনিকের হালকা উপস্থিতি রোগ প্রতিরোধ ক্ষমতা কমাতে পারে।",
  "confidence": 0.74,

  "source": "llm+rag",
  "heavy_metal_pipeline_status": "success",
  "db_saved": true,
  "context": {
    "plume_score": "0.12",
    "exposure_hours_7d": 8,
    "dominant_factory": "ABC Textile Mills",
    "abiotic_score": "0.27",
    "neighbor_sprays": 1,
    "rag_cases_used": 4,
    "weather": "Humid, 88%, 6 wet days"
  }
}
```

---

## 13. SCORING ACCURACY & BENCHMARK TARGETS

### 13.1 Signal Confidence Hierarchy (highest to lowest)

| Rank | Signal | Why Reliable |
|---|---|---|
| 1 | Confirmed heavy_metal_reports (verified=true) | Lab-verified historical data |
| 2 | Active community_alerts in zone | Multiple independent confirmed scans |
| 3 | Cumulative plume score ≥ 0.35 | Physics-based 7-day dose model |
| 4 | Active water_pollution_event within 2km | Reported + active environmental event |
| 5 | RAG: 3+ verified disease cases within 5km | Verified local precedents |
| 6 | Weather matches disease conditions exactly | Objective meteorological data |
| 7 | Survey: canal_contamination + water_color = black/brown | Farmer observation |
| 8 | Satellite water alert | Remote sensing (moderate confidence) |
| 9 | LLM visual diagnosis alone | Weakest — always needs corroboration |

### 13.2 Confidence Floor Rules

```typescript
// These rules prevent overconfident wrong diagnoses
const CONFIDENCE_FLOORS = {
  // If disease can_mimic_pollution AND abiotic score > 0.30 → cap biotic confidence
  mimicry_penalty: (bioticConf, abioticScore, canMimic) =>
    canMimic && abioticScore > 0.30 ? Math.min(bioticConf, 0.65) : bioticConf,

  // If no RAG cases AND no weather support → cap biotic confidence
  unsupported_biotic_cap: (bioticConf, ragCount, weatherSupport) =>
    ragCount === 0 && !weatherSupport ? Math.min(bioticConf, 0.60) : bioticConf,

  // If only one signal drives abiotic score → cap abiotic confidence
  single_signal_abiotic_cap: (abioticConf, signalCount) =>
    signalCount <= 1 ? Math.min(abioticConf, 0.55) : abioticConf,
};
```

### 13.3 Benchmark Accuracy Targets

| Scenario | Target Precision | Key Signals Required |
|---|---|---|
| Biotic (clear, high humidity) | ≥ 85% | Weather + RAG match + clean visual |
| Abiotic pollution (factory nearby) | ≥ 80% | plumeScore ≥ 0.25 + survey smoke/canal |
| Heavy metal (confirmed zone) | ≥ 78% | Zone arsenic_risk + existing reports |
| Compound stress detected correctly | ≥ 70% | Both individual scores ≥ 20% |
| False negative (pollution missed) | < 10% | Hard override at abioticScore ≥ 0.60 ensures this |
| Unnecessary spray suppressed | ≥ 95% | Hard override enforced in code, not LLM |

### 13.4 What Improves Accuracy Most

In order of impact:

1. **Weekly survey completion rate** — Without `scan_context`, the LLM has no ground truth. Enforce the survey gate strictly.
2. **Verified scan count in scan_logs** — Every verified scan improves RAG for future scans in that area. Encourage farmers to mark outcomes.
3. **heavy_metal_reports coverage** — Verified lab reports in the area dramatically improve Module C accuracy.
4. **industrial_hotspots data quality** — Accurate `plume_cone_deg` and `max_plume_km` values per factory directly improve the plume model.
5. **kb_diseases.can_mimic_pollution flag** — Marking which diseases look like pollution prevents the most common mis-classification.

---

## 14. EXECUTION ORDER SUMMARY

```
1.  [Gate]     Validate image size → reject if > 4.5MB
2.  [Gate]     Validate required fields (farmerId, landId, lat, lng, imageBase64)
3.  [Gate]     Check weekly survey gate (surveys table)
4.  [Parallel] Upload image to Supabase Storage
               Fetch: weather, farm_profile, land, farmer+zones,
                      spray_events, hotspots, heavy_metal_reports,
                      water_pollution_events, satellite_water_data
5.  [Compute]  computeCumulativePlumeExposure() → plumeScore
6.  [Compute]  buildAbioticSignals() → abioticScore breakdown
7.  [LLM]      runVisionGate() → is_valid + visual_symptoms_raw + detected_crop
8.  [Gate]     If not is_valid → return rejection in Bengali
9.  [DB]       checkLandSuitability() → suitability result (no LLM)
10. [LLM]      getEmbedding(visual_symptoms_raw) → symptomVector [if ENABLE_RAG]
11. [DB]       lookup_diagnosis_cache (with abiotic_score_bucket in key)
12. [DB]       search_verified_rag_cases (if symptomVector available)
    [DB]       getCommunitySignal() — runs in parallel with RAG
13. [Score]    Module A: scoreBiotic() — LLM + code adjustments
    [Score]    Module B: scoreAbiotic() — pure code scoring
    [Score]    Module C: scoreHeavyMetal() — code + existing report data
14. [Merge]    applyCommuntiyWeighting() → weighted scores
15. [Override] applyHardOverrides() → enforce code-level rules
16. [Classify] classifyResults() → primary, secondary, trace
17. [Compound] detectCompoundStress() → compound warning if applicable
18. [Build]    buildFinalVerdict() → complete response object
19. [DB]       saveScanLog() → scan_logs insert with all 3 scores
20. [Async]    triggerHeavyMetalDetection() if Abiotic_Pollution
21. [Async]    checkAndTriggerCommunityAlerts() — epidemic check + farm_risk_scores update
22. [Return]   NextResponse.json(finalVerdict)
```

---

## 15. KNOWN ISSUES IN CURRENT v1 CODE (To Fix)

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | Cache ignores abiotic score change | Critical | Add `abiotic_score_bucket` to cache key |
| 2 | Hard rules only in LLM prompt, not code | Critical | Implement `applyHardOverrides()` |
| 3 | Image uploaded before survey gate check | High | Move survey gate before image upload |
| 4 | `cropId` from vision free-text saved as FK | High | Resolve `detected_crop_en` → `kb_crops.crop_id` via DB lookup |
| 5 | Multi-factory plume takes MAX, not combined | Medium | Add combined dose calculation |
| 6 | `water_pollution_events` table never queried | Medium | Add to Stage 1 parallel fetch |
| 7 | `satellite_water_data` table never queried | Medium | Add to Stage 1 parallel fetch |
| 8 | Secondary signals (< primary) are discarded | Medium | Implement threshold classification + compound detection |
| 9 | `tokens_used` always saved as 0 | Low | Extract from Gemini response metadata |
| 10 | JPEG MIME hardcoded | Low | Detect from base64 header bytes |
| 11 | No auth/ownership check on farmerId | High | Verify JWT → farmerId ownership before processing |
| 12 | `stress_subtype` fallback always `Biotic_Fungal` | Medium | Implement `resolveStressType()` with keyword map |
| 13 | Heavy metal detection awaited in response path | Low | Fire-and-forget after returning response |
| 14 | Community data not weighted into final score | Medium | Implement `applyCommuntiyWeighting()` |

---

## 16. GLOSSARY

| Term | Definition |
|---|---|
| Biotic stress | Damage caused by living organisms — fungi, bacteria, viruses, insects, pests |
| Abiotic stress | Damage caused by non-living environmental factors — pollution, drought, flood, salinity, weather |
| Heavy metal stress | Specific abiotic stress from toxic metals (Arsenic, Lead, Cadmium, Chromium) in soil or water |
| Compound stress | Two or more independent stress types acting simultaneously on the same crop |
| Plume | The cone-shaped dispersal of airborne factory emissions carried by wind |
| RAG | Retrieval-Augmented Generation — using verified past cases from the database to improve LLM diagnosis |
| Spray suppressed | When the system determines that applying pesticide would be ineffective or harmful — set to true for all abiotic diagnoses |
| Trust weight | A 0.0–1.0 score assigned to each scan_log record indicating how much it should influence future RAG results — computed by DB trigger based on verification_status and farmer trust_score |
| Community signal | Aggregate statistics from recent verified scans within 5km of the current scan location |
| Grid cell | A 0.01° × 0.01° geographic tile (~1.1km²) used to group scans for caching and community statistics |
| abiotic_score_bucket | One of five bands (low/moderate/high/critical/extreme) used to invalidate cached diagnoses when pollution conditions have significantly changed |
