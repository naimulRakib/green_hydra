# AgroSentinel

**AI-powered crop disease and industrial pollution diagnosis platform for Bangladesh farmers**

AgroSentinel is a production-grade Next.js application that helps smallholder rice farmers in Bangladesh distinguish between biotic crop diseases and abiotic industrial pollution damage. A farmer photographs a sick plant. In fifteen seconds, the system analyses the image alongside seven days of cumulative wind exposure data, industrial factory proximity, heavy metal contamination history, satellite water quality readings, and community scan intelligence — returning a three-dimensional diagnosis with a deterministic spray recommendation in Bengali.

The primary mission is preventing unnecessary pesticide application when the true cause of crop damage is industrial pollution, heavy metal soil contamination, or other abiotic stressors rather than a biological pathogen. This misdiagnosis affects an estimated 68% of crop damage cases in Bangladesh's industrial zones and costs smallholder farmers between BDT 5,000 and 40,000 per growing season in ineffective treatment costs.

---

## Table of Contents

- [The Problem](#the-problem)
- [Architecture Overview](#architecture-overview)
- [Agentic AI System](#agentic-ai-system)
- [Detection Modules](#detection-modules)
- [Gaussian Plume Engine](#gaussian-plume-engine)
- [Hard Override System](#hard-override-system)
- [Community Intelligence](#community-intelligence)
- [RAG Retrieval](#rag-retrieval)
- [Diagnosis Cache](#diagnosis-cache)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Technology Stack](#technology-stack)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Benchmark Results](#benchmark-results)
- [SDG Alignment](#sdg-alignment)
- [Business Model](#business-model)
- [Design Principles](#design-principles)
- [Scientific References](#scientific-references)
- [Known Limitations](#known-limitations)
- [Future Developments](#future-developments)
- [Repository Structure](#repository-structure)

---

## The Problem

Bangladesh has over 160 million people and a rice-based agricultural economy with 16.5 million smallholder farming households. Industrial zones around Dhaka, Savar, Gazipur, and Narayanganj have expanded rapidly, placing more than 12,000 active factories within two to fifteen kilometres of active farmland. Tanneries, textile mills, and dyeing factories emit chromium, cadmium, sulfur dioxide, and particulates. Arsenic-contaminated irrigation water affects twelve or more high-risk districts.

When a farmer sees yellowing, tip burn, or lesions on rice leaves, the symptoms of industrial pollution damage are visually indistinguishable from the symptoms of biotic diseases such as blast fungus, sheath blight, or bacterial blight. No affordable diagnostic tool exists to separate these causes at the point of observation.

Three interconnected failures result:

**Farmer failure:** Farmers apply pesticide to pollution damage that achieves zero recovery while adding further chemical residue to already-contaminated soil. Average unnecessary pesticide spend: BDT 5,000 to 40,000 per season, equivalent to up to 33% of household annual income.

**Export failure:** Bangladesh agricultural exports total USD 480 million annually. EU Regulation 2023/915 enforces maximum residue limits for cadmium and inorganic arsenic in food. Export companies have no district-level crop safety data, resulting in increasing EU port rejections worth USD 50,000 to 200,000 per shipment.

**Governance failure:** The Department of Environment lacks real-time geospatial evidence linking specific industrial hotspots to specific farm damage, making regulatory enforcement impossible without ground-level scan data.

---

## Architecture Overview

The diagnostic pipeline executes across five sequential stages:

**Stage 0 — Pre-flight gates:** JWT ownership verification, payload size validation under 4.5 MB, required field check, ISO week survey gate enforcement. All gates must pass before any processing begins.

**Stage 1 — Parallel data fetch:** A single `Promise.all` retrieves 168-hour weather history, farm profile, farmer land data, industrial hotspot GPS coordinates via PostGIS RPC, heavy metal land history, active water pollution events, satellite water quality readings, community spray events, and knowledge base crop data.

**Stage 2 — Environmental computation:** Gaussian plume dispersion computation across all active factories and deterministic land suitability check. No AI involvement in this stage.

**Stage 3 — Three parallel detection modules:** Module A (Biotic) calls Gemini Vision with RAG context. Module B (Abiotic) computes a weighted signal sum in pure TypeScript. Module C (Heavy Metal) runs a six-layer SQL inference with ISRIC satellite pH calibration.

**Stage 4 — Verdict assembly:** Community signal weighting, reasoning arbiter, overlap confidence calibration, hard override enforcement, compound stress detection, and confidence calibration all run in TypeScript. The AI model has no role in the final decision layer.

---

## Agentic AI System

AgroSentinel implements a six-agent autonomous pipeline. Each agent has a single responsibility and hard boundaries it cannot cross.

### Agent 1 — Intent Router

`POST /api/agent/intent-router`

Classifies every farmer input into one of seven intents before any tool is called. Uses Gemini Flash Lite with a confidence threshold of 0.60.

```
Intents: diagnosis | spray_advice | water_risk | weather |
         compliance | action_request | general

Output: { intent, confidence, extracted_entities, route, suggested_clarification }
```

Below the 0.60 threshold, the system routes to clarification rather than guessing.

### Agent 2 — Safety Gate

`POST /api/agent/safety-gate`

Six sequential pre-checks before any spray recommendation. Zero LLM calls.

| Check | Threshold | Result |
|-------|-----------|--------|
| Wind speed | > 15 km/h | HARD BLOCK |
| Rain forecast 24h | > 5mm | HARD BLOCK |
| Neighbour spray drift | within 500m, last 6h | SOFT WARNING |
| Abiotic score | >= 0.60 | HARD BLOCK |
| Heavy metal severity | critical or high | HARD BLOCK |
| Re-entry interval | last spray < 72h ago | HARD BLOCK |

HARD BLOCK cannot be overridden by any downstream agent or by farmer confirmation.

### Agent 3 — Escalation Agent

`POST /api/agent/escalation`

Detects chronic industrial exposure patterns and escalates automatically.

**Trigger — all three required:**
- `heavy_metal_score >= 0.50`
- `abiotic_score >= 0.45`
- Two or more prior scans on same `land_id` within 14 days with `abiotic_score >= 0.40`

Called fire-and-forget after `saveScanLog`. Never blocks the farmer response.

### Agent 4 — Memory Window Manager

`lib/agents/memoryManager.ts`

Bounds conversational context to prevent hallucination from stale history. Last four meaningful turns plus always-fresh farm state snapshot from database. Token budget tracked per window.

### Agent 5 — Action Confirmation Loop

`POST /api/agent/action-confirm`

Requires explicit farmer confirmation before irreversible actions. Uses deterministic Bengali templates. 10-minute expiry on pending confirmations. HARD BLOCK actions cannot enter the confirmation flow.

### Agent 6 — Tool Confidence Policy

`lib/agents/confidencePolicy.ts`

| Level | Score | Behaviour |
|-------|-------|-----------|
| HIGH | >= 0.75 | Direct answer with one fallback step |
| MEDIUM | 0.50 to 0.74 | Answer with caveat, one clarifying question |
| LOW | < 0.50 | One clarifying question only, no answer |

One question per turn maximum. Never repeats the same question.

---

## Detection Modules

### Module A — Biotic Detection

Gemini Vision analyses the photograph against a differential diagnosis guide for thirty common Bangladesh rice diseases. Raw LLM scores post-processed:

- LLM score capped at 70% of final biotic score
- Humidity > 85% and wet days >= 5: +0.15
- Humidity > 75% and wet days >= 3: +0.08
- Each verified RAG match within 5km: +0.05 (max 0.15)
- `can_mimic_pollution` disease with abiotic > 0.30: confidence capped at 0.65
- No RAG and no weather support: confidence capped at 0.60

### Module B — Abiotic Detection

Ten weighted signals, pure TypeScript, zero AI:

| Signal | Weight | Source |
|--------|--------|--------|
| Cumulative 7-day plume | 0.00 to 0.50 | Gaussian plume physics |
| Confirmed heavy metal report | 0.40 | Historical database |
| Canal contamination | 0.15 | Farm profile |
| Active water pollution event | 0.15 | Water events database |
| Neighbour spray drift | 0.10 | Community spray RPC |
| Smoke exposure | 0.08 | Weekly survey |
| Water risk (Chemical/Contaminated) | 0.07 | Farm profile |
| Satellite water quality alert | 0.06 | Remote sensing |
| Neighbour same problem | 0.05 | Farm profile |
| Pattern bonus (3+ scans in 30 days) | 0.10 | Scan log history |

Total capped at 1.0.

### Module C — Heavy Metal (6-Layer SQL)

| Layer | Max Points | Source |
|-------|-----------|--------|
| 1 — Zone static risk | 20 | DPHE Bangladesh national survey |
| 2 — Farm soil profile flags | 20 | farm_profiles table |
| 3 — 90-day land scan history | 30 | scan_logs (land_id filtered) |
| 4 — Weekly survey evidence | 15 | surveys table |
| 5 — Industrial proximity (PostGIS) | 15 | ST_DWithin 10km |
| 6 — ISRIC FAO SoilGrids pH | modifier | Real-time satellite API |

Severity: below 25 = low, 25–50 = moderate, 50–75 = high, 75+ = critical.

---

## Gaussian Plume Engine

For each factory in `industrial_hotspots`, for each of 168 hourly wind readings:

1. Bearing: factory GPS to farm GPS (haversine)
2. Plume direction: wind direction + 180 degrees
3. Cone check: farm within `plume_cone_deg / 2` of plume direction
4. Hourly dose: `base_load × (1/(d+1)) × min(2.0, 10/windSpeed) × cone_alignment`
5. Accumulate across 168 hours

Combined dose from all factories computed alongside maximum single-factory score. Higher value used. Weather data reused from `weather_details` cache if under two hours old.

---

## Hard Override System

Applied in TypeScript after all modules complete. AI cannot override these.

**Rule 1:** abiotic score >= 0.60 → force Abiotic, suppress spray
**Rule 2:** heavy metal critical → veto biotic; high or critical → suppress spray
**Rule 3:** spray_suppressed true + disease_type Biotic → correct to Abiotic
**Rule 4:** plume score >= 0.35 → suppress spray

All applied overrides logged to `scan_logs.overrides_applied`.

---

## Community Intelligence

Queries verified scan logs within 5km over 30 days. Community weight = min(0.20, total_scans × 0.004). Fifty verified scans = maximum 20% weight.

```
final_score = raw_score × (1 - weight) + community_ratio × weight
```

Epidemic detection: 5+ matching scans within 5km in 7 days with farmer consent → auto-insert `community_alerts`.

---

## RAG Retrieval

When `ENABLE_RAG=true`: symptom text embedded at 1024 dimensions using Google text-embedding-004. pgvector cosine similarity search with threshold 0.72, minimum trust weight 0.60, within 5km. Up to three matching cases injected into biotic module prompt.

Auto-verification: two or more confirming scans from different farmers within 5km in 14 days, all with AI confidence > 0.70 → promote to verified status.

---

## Diagnosis Cache

Cache key: `grid_cell_id + weather_hash + symptom_hash + abiotic_bucket`

Weather bucket: hot_humid, cool_wet, dry, moderate
Abiotic bucket: low (<0.20), moderate (0.20–0.40), high (0.40–0.60), critical (>0.60)

Cache entries expire after 7 days. Abiotic bucket prevents stale hits when pollution conditions change.

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `scan_logs` | One row per scan, all three scores, overrides, embedding |
| `farm_profiles` | Weekly survey, soil pH, contamination flags |
| `industrial_hotspots` | Factory GPS, plume cone, active months |
| `kb_diseases` | Disease KB with can_mimic_pollution, differentiator_bn |
| `kb_zones` | District arsenic risk, flood months, recommended varieties |
| `diagnosis_cache` | Cached diagnoses with abiotic bucket key |
| `heavy_metal_reports` | Six-layer results with severity and metal type |
| `community_alerts` | Auto-generated epidemic and pollution alerts |
| `voice_action_logs` | Agent audit trail for every safety gate decision |
| `escalation_alerts` | Chronic exposure escalations with DAE notification status |
| `pending_confirmations` | Farmer action confirmations with 10-minute expiry |

---

## API Reference

### POST /api/diagnose

```json
// Request
{
  "imageBase64": "string",
  "farmerId": "uuid",
  "landId": "uuid",
  "lat": 23.7104,
  "lng": 90.4074
}

// Response
{
  "success": true,
  "scan_id": "SCN-XXXXXXXX",
  "detection_scores": {
    "biotic": { "percentage": 68, "disease_name_bn": "...", "subtype": "Biotic_Fungal" },
    "abiotic": { "percentage": 22, "spray_suppressed": false, "active_signals": [] },
    "heavy_metal": { "percentage": 30, "metals": ["arsenic"], "severity": "moderate" }
  },
  "primary_cause": "biotic",
  "secondary_cause": "heavy_metal",
  "compound_stress": { "detected": true, "pair": "biotic+heavy_metal", "compound_warning_bn": "..." },
  "spray_suppressed": false,
  "remedy_bn": "...",
  "confidence": 0.71,
  "overrides_applied": [],
  "db_saved": true
}
```

### POST /api/agent/intent-router

```json
// Request
{ "input": "আমার ধানের পাতা হলুদ হয়ে গেছে" }

// Response
{ "intent": "diagnosis", "confidence": 0.87, "route": "/api/diagnose", "extracted_entities": { "crop": "rice", "symptom": "yellowing" } }
```

### POST /api/agent/safety-gate

```json
// Request
{ "farmerId": "uuid", "landId": "uuid", "lat": 23.71, "lng": 90.40, "proposed_action": "spray" }

// Response
{ "safe_to_proceed": false, "action": "BLOCK", "blocks": [{ "check": "abiotic_score", "severity": "HARD", "reason_bn": "শিল্প দূষণের প্রমাণ আছে" }] }
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| API routes | Next.js App Router, Vercel Serverless |
| AI vision | Google Gemini Flash Lite |
| Embeddings | Google text-embedding-004 (1024-dim) |
| Database | Supabase (PostgreSQL + PostGIS + pgvector) |
| Weather | Open-Meteo API (free, no key) |
| Soil data | ISRIC FAO SoilGrids REST API |
| Client | Next.js + Tailwind CSS |
| Offline | Service worker with timestamp-accurate replay |

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_GEMINI_API_KEY=
ENABLE_RAG=true
SKIP_SURVEY_GATE=false
```

---

## Database Setup

```sql
-- Step 1: scan_logs columns
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS land_id UUID REFERENCES farmer_lands(land_id) ON DELETE SET NULL;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS biotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS abiotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS heavy_metal_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS secondary_cause TEXT;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS compound_stress BOOLEAN DEFAULT FALSE;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS overrides_applied TEXT[];
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS reasoning_chain JSONB;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS evidence_summary JSONB;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS contradictions_resolved JSONB;

-- Step 2: diagnosis cache
ALTER TABLE diagnosis_cache ADD COLUMN IF NOT EXISTS abiotic_bucket TEXT DEFAULT 'low';
ALTER TABLE diagnosis_cache ADD COLUMN IF NOT EXISTS pollutant_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS diagnosis_cache_unique_idx
  ON diagnosis_cache (grid_cell_id, weather_hash, symptom_hash, abiotic_bucket);

-- Step 3: kb_zones
ALTER TABLE kb_zones ADD COLUMN IF NOT EXISTS arsenic_zone_risk TEXT DEFAULT 'Low';
ALTER TABLE kb_zones ADD COLUMN IF NOT EXISTS known_metal_types TEXT[] DEFAULT '{}';
ALTER TABLE kb_zones ADD COLUMN IF NOT EXISTS recommended_variety_ids TEXT[] DEFAULT '{}';
ALTER TABLE kb_zones ADD COLUMN IF NOT EXISTS adaptive_strategy_bn TEXT;

-- Step 4: agentic tables
CREATE TABLE IF NOT EXISTS voice_action_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id UUID REFERENCES farmers(id),
  land_id UUID REFERENCES farmer_lands(land_id),
  intent TEXT,
  proposed_action TEXT,
  result TEXT,
  checks_run JSONB,
  override_by_farmer BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escalation_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id UUID REFERENCES farmers(id),
  land_id UUID,
  trigger_scan_ids UUID[],
  pattern TEXT,
  severity TEXT,
  alert_message_bn TEXT,
  alert_message_en TEXT,
  acknowledged_at TIMESTAMPTZ,
  dae_notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_confirmations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  farmer_id UUID,
  land_id UUID,
  action_type TEXT,
  action_payload JSONB,
  confirmation_message_bn TEXT,
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes',
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Benchmark Results

| Test Scenario | Expected | Result |
|---------------|----------|--------|
| Hard override (abiotic >= 0.60) | spray suppressed, tokens = 0 | PASS |
| Biotic normal path | LLM called, biotic > 0 | PASS |
| Compound stress detection | compound_stress = true | PASS |
| Heavy metal zone detection | metal score >= 0.20 | PASS |
| Critical early exit | tokens = 0 | PASS |
| Cache hit with abiotic bucket | hit_count increments | PASS |
| All scan_logs columns saved | no null scores | PASS |
| Overall AI logic (LLM-Judge, 53 scans) | correct primary classification | 83.0% |

Rule-based components: 100% deterministic. AI vision: 83.0% overall (Gemini benchmark).

---

## SDG Alignment

| Goal | Target | AgroSentinel contribution |
|------|--------|--------------------------|
| SDG 1 — No Poverty | Protect farmer income | BDT 3,500–8,000 saved per avoided wrong spray |
| SDG 2 — Zero Hunger | Sustainable food production | Correct treatment recovers 35% yield from blast |
| SDG 3 — Good Health | Reduce illness from hazardous chemicals | Spray suppression eliminates direct pesticide exposure |

---

## Business Model

| Tier | Stakeholder | Price | Value |
|------|-------------|-------|-------|
| B2C | Farmers | Free | Diagnosis, Bengali remedy, community alerts |
| B2B | Export companies | BDT 50K–200K/month | District risk maps, EU compliance score |
| B2B | Insurance companies | BDT 10–50/query | Per-land risk score for underwriting |
| B2G | Government | Grant + MOU | Factory pollution mapping, policy evidence |

---

## Design Principles

**Code enforces hard rules. LLM provides soft reasoning.** Threshold-based overrides run in TypeScript after the LLM returns. The model cannot be prompted into bypassing them.

**Three independent signals.** Biotic, abiotic, and heavy metal scored separately by modules with different data sources and computation methods.

**Compound stress is reported.** Both causes reported when two signals exceed thresholds. Primary wins for remedy; secondary drives additional warnings.

**Fail open.** Non-critical module failures do not block the scan. Only pre-flight gate failures block.

**Agent autonomy with hard boundaries.** Each agent acts independently within defined ceilings that no instruction can raise.

---

## Scientific References

- US EPA Guideline on Air Quality Models, EPA-454/R-19-014 — Gaussian Plume Dispersion
- Seinfeld and Pandis, Atmospheric Chemistry and Physics, Chapter 18, Wiley, 2016
- Islam et al. (2018), Heavy metal contamination in paddy soil in Savar, Journal of Hazardous Materials
- Meharg and Rahman (2003), Arsenic contamination of Bangladesh paddy soils, Environmental Science and Technology
- Mohanty et al. (2016), Deep Learning for Image-Based Plant Disease Detection, Frontiers in Plant Science
- ISRIC World Soil Information, SoilGrids 2.0 at 250m resolution (FAO validated)
- DPHE Bangladesh, National Hydrochemical Survey — arsenic groundwater distribution
- WHO (2019), The Impact of Pesticides on Health
- EU Regulation 2023/915 — Maximum levels of contaminants in food (cadmium, inorganic arsenic)

---

## Known Limitations

- **RAG cold start:** Community weighting near zero in new areas until verified scans accumulate
- **Satellite resolution:** ISRIC SoilGrids at 250m — localised within-field variations not captured
- **Plume model scope:** Gaussian approximation assumes flat delta terrain
- **Heavy metal enforcement:** Six-layer inference is screening only — lab testing required for legal use
- **Knowledge base coverage:** `can_mimic_pollution` requires manual population per disease
- **Survey gate:** `SKIP_SURVEY_GATE=true` must be removed before production

---

## Future Developments

- IoT soil sensors (pH, moisture, conductivity) via Bluetooth
- HYSPLIT atmospheric trajectory model replacing simplified Gaussian
- SMS offline fallback for low-bandwidth areas
- Crop knowledge base expansion beyond rice
- Direct government API pipeline to DAE and DoE dashboards
- Daily digest agent: nightly per-farmer risk and action summary

---

## Repository Structure

```
app/
  api/
    diagnose/route.ts                  Main diagnostic pipeline (2700+ lines)
    agent/
      intent-router/route.ts           Agent 1 — intent classification
      safety-gate/route.ts             Agent 2 — six physics checks
      escalation/route.ts              Agent 3 — chronic pattern detection
      action-confirm/route.ts          Agent 5 — confirmation loop
  actions/
    heavyMetalActions.ts               Heavy metal detection + ISRIC integration
    riskActions.ts                     Farm risk score + crop loss calculation
    waterActions.ts                    Water alert and source management
    weather.ts                         Open-Meteo fetch and 168h caching
  components/
    DiseaseScanner.tsx                 Main scan UI, three-score display
    HeavyMetalRiskCard.tsx             Heavy metal risk visualisation
lib/
  agents/
    memoryManager.ts                   Agent 4 — bounded context window
    confidencePolicy.ts                Agent 6 — data quality gating
  heavyMetalEngine.ts                  ISRIC API + pH modifier computation
SQL/
  detect_metal_layer3_fixed.sql        Heavy metal detection RPC
  improved_risk_calculation.sql        Farm risk score calculation
  get_hotspot_coordinates.sql          PostGIS coordinate extraction RPC
ACCURACY_CHANGES.md                    Accuracy redesign change log
BENCHMARK_REPORT.md                   Test suite results
README.md                              This file
```

---

## License

Proprietary. All rights reserved.

Developed by Team **Green Human** — Bangladesh University of Engineering and Technology (BUET).

*NAIMUL ISLAM*
