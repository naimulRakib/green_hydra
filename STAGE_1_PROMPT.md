# AgroSentinel Accuracy Redesign — STAGE 1
## Database + Cache + Hard Overrides
## Agent: Complete ALL items in this file before moving to Stage 2

---

## CONTEXT

You are working on AgroSentinel — a Next.js + Supabase crop disease
diagnosis system for Bangladesh farmers. The system detects Biotic
disease vs Abiotic industrial pollution damage from plant photos.

Current state: The pipeline spec describes a 3-module architecture.
The code implements only ~40% of it. Stage 1 fixes the most critical
accuracy bugs that cause wrong diagnoses TODAY.

Files you will modify in Stage 1:
1. Supabase SQL (run in SQL Editor)
2. app/api/diagnose/route.ts
3. lib/heavyMetalEngine.ts (if computePhRiskModifier/getMetalMobilityExplanation missing)

---

## TASK 1 — DATABASE MIGRATIONS
## Run ALL of these in Supabase SQL Editor in order.

### SQL 1.1 — Add missing columns to scan_logs

```sql
-- Add land_id (already added, ensure exists)
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS land_id UUID
  REFERENCES farmer_lands(land_id) ON DELETE SET NULL;

-- Add three separate score columns for three-module architecture
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS biotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS abiotic_score DOUBLE PRECISION;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS heavy_metal_score DOUBLE PRECISION;

-- Add compound stress tracking
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS secondary_cause TEXT;
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS compound_stress BOOLEAN DEFAULT FALSE;

-- Add overrides audit log
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS overrides_applied TEXT[];

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_scan_logs_land_id
  ON scan_logs(land_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_land_stress
  ON scan_logs(land_id, stress_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_abiotic_score
  ON scan_logs(abiotic_score DESC)
  WHERE abiotic_score IS NOT NULL;
```

### SQL 1.2 — Fix diagnosis_cache to include abiotic_bucket

```sql
-- Add abiotic_bucket column
ALTER TABLE diagnosis_cache
  ADD COLUMN IF NOT EXISTS abiotic_bucket TEXT DEFAULT 'low';

-- Add pollutant_id for abiotic cache hits
ALTER TABLE diagnosis_cache
  ADD COLUMN IF NOT EXISTS pollutant_id TEXT;

-- Drop old unique constraint (grid+weather+symptom only)
-- and replace with one that includes abiotic_bucket
DO $$
BEGIN
  -- Drop old constraint if exists (name may vary)
  ALTER TABLE diagnosis_cache DROP CONSTRAINT IF EXISTS diagnosis_cache_grid_cell_id_weather_hash_symptom_hash_key;
  ALTER TABLE diagnosis_cache DROP CONSTRAINT IF EXISTS diagnosis_cache_unique;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP INDEX IF EXISTS diagnosis_cache_unique_idx;

CREATE UNIQUE INDEX diagnosis_cache_unique_idx
  ON diagnosis_cache (grid_cell_id, weather_hash, symptom_hash, abiotic_bucket);
```

### SQL 1.3 — Add missing columns to kb_zones

```sql
-- For heavy metal detection Layer 1
ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS arsenic_zone_risk TEXT DEFAULT 'Low';

ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS known_metal_types TEXT[] DEFAULT '{}';

-- For land suitability check (Stage 2)
ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS recommended_variety_ids TEXT[] DEFAULT '{}';

ALTER TABLE kb_zones
  ADD COLUMN IF NOT EXISTS adaptive_strategy_bn TEXT;

-- Seed known high-risk zones with metal data
UPDATE kb_zones SET
  arsenic_zone_risk = 'High',
  known_metal_types = ARRAY['arsenic']
WHERE district IN (
  'Chapainawabganj', 'Jessore', 'Comilla', 'Chandpur',
  'Munshiganj', 'Faridpur', 'Gopalganj', 'Madaripur',
  'Shariatpur', 'Noakhali', 'Lakshmipur', 'Brahmanbaria'
);

UPDATE kb_zones SET
  arsenic_zone_risk = 'High',
  known_metal_types = ARRAY['chromium', 'cadmium']
WHERE district IN ('Savar', 'Gazipur', 'Narayanganj')
   OR zone_id IN ('dhaka-savar', 'dhaka-keraniganj', 'dhaka-gazipur');
```

### SQL 1.4 — lookup_diagnosis_cache RPC — add abiotic_bucket to key

```sql
DROP FUNCTION IF EXISTS lookup_diagnosis_cache(
  DOUBLE PRECISION, DOUBLE PRECISION, VARCHAR, VARCHAR
);

CREATE OR REPLACE FUNCTION lookup_diagnosis_cache(
  p_lat            DOUBLE PRECISION,
  p_lng            DOUBLE PRECISION,
  p_weather_hash   VARCHAR,
  p_symptom_hash   VARCHAR,
  p_abiotic_bucket VARCHAR DEFAULT 'low'  -- NEW parameter
)
RETURNS TABLE (
  cache_id          UUID,
  disease_id        VARCHAR,
  pollutant_id      TEXT,
  remedy_id         VARCHAR,
  diagnosis_bn      TEXT,
  hit_count         INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_grid_cell_id VARCHAR;
BEGIN
  v_grid_cell_id := ROUND(p_lat::NUMERIC, 2)::TEXT || '_' || ROUND(p_lng::NUMERIC, 2)::TEXT;

  -- Update hit count and return
  UPDATE diagnosis_cache
  SET hit_count   = COALESCE(hit_count, 0) + 1,
      last_hit_at = NOW()
  WHERE grid_cell_id   = v_grid_cell_id
    AND weather_hash   = p_weather_hash
    AND symptom_hash   = p_symptom_hash
    AND abiotic_bucket = p_abiotic_bucket   -- NEW: must match abiotic bucket
    AND expires_at     > NOW();

  RETURN QUERY
  SELECT
    dc.id,
    dc.confirmed_disease_id,
    dc.pollutant_id,
    dc.remedy_id,
    dc.cached_diagnosis_bn,
    dc.hit_count
  FROM diagnosis_cache dc
  WHERE dc.grid_cell_id   = v_grid_cell_id
    AND dc.weather_hash   = p_weather_hash
    AND dc.symptom_hash   = p_symptom_hash
    AND dc.abiotic_bucket = p_abiotic_bucket  -- NEW
    AND dc.expires_at     > NOW()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_diagnosis_cache(
  DOUBLE PRECISION, DOUBLE PRECISION, VARCHAR, VARCHAR, VARCHAR
) TO authenticated;
```

### SQL 1.5 — Verify all migrations ran

```sql
-- Run this to confirm everything is in place
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'scan_logs'
   AND column_name IN ('land_id','biotic_score','abiotic_score',
                       'heavy_metal_score','secondary_cause',
                       'compound_stress','overrides_applied')
  ) AS scan_logs_new_columns,   -- should be 7

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'diagnosis_cache'
   AND column_name IN ('abiotic_bucket','pollutant_id')
  ) AS cache_new_columns,        -- should be 2

  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'kb_zones'
   AND column_name IN ('arsenic_zone_risk','known_metal_types',
                       'recommended_variety_ids','adaptive_strategy_bn')
  ) AS zones_new_columns;        -- should be 4
```

All three numbers must match before proceeding to code changes.

---

## TASK 2 — HARD OVERRIDES IN TYPESCRIPT (route.ts)

### Context
Currently hard override rules are written as text in the LLM prompt.
LLMs follow prompt rules ~85% of the time.
This means 10-15% of high-abiotic-score scans still get biotic diagnosis
with spray recommended → farmer wastes money and poisons soil.

Move overrides to TypeScript. They run AFTER LLM returns.
LLM cannot override TypeScript.

### Step 2.1 — Add enforceHardOverrides function

Add this function BEFORE the POST handler in route.ts:

```typescript
// ══════════════════════════════════════════════════════════════════════
// HARD OVERRIDES — enforced in TypeScript, NOT in LLM prompt
// These run after the LLM returns and cannot be overridden by it.
// Design principle: LLM provides reasoning and text.
// Code enforces thresholds and safety rules.
// ══════════════════════════════════════════════════════════════════════
function enforceHardOverrides(
  verdict: any,
  abioticScore: number,
  heavyMetalSeverity: string | null | undefined,
  plumeScore: number
): any {
  const overrides: string[] = [];

  // OVERRIDE 1: High abiotic score → force Abiotic, suppress spray
  // This is the most important override.
  // If physics-based plume model + survey data says score >= 0.60,
  // no LLM diagnosis should override that.
  if (abioticScore >= 0.60) {
    if (verdict.disease_type !== "Abiotic") {
      verdict.disease_type = "Abiotic";
      verdict.stress_subtype = "Abiotic_Pollution";
      overrides.push(`ABIOTIC_OVERRIDE_score:${abioticScore.toFixed(2)}`);
    }
    verdict.spray_suppressed = true;
    overrides.push("SPRAY_SUPPRESSED_abiotic>=0.60");
  }

  // OVERRIDE 2: Critical/High heavy metal → always suppress spray
  if (heavyMetalSeverity === "critical" || heavyMetalSeverity === "high") {
    verdict.spray_suppressed = true;
    overrides.push(`SPRAY_SUPPRESSED_metal:${heavyMetalSeverity}`);
  }

  // OVERRIDE 3: LLM internal contradiction fix
  // LLM sometimes says disease_type=Biotic but spray_suppressed=true
  // This is contradictory. If spray_suppressed, must be Abiotic.
  if (verdict.spray_suppressed === true && verdict.disease_type === "Biotic") {
    verdict.disease_type = "Abiotic";
    verdict.stress_subtype = "Abiotic_Pollution";
    overrides.push("LLM_CONTRADICTION_FIXED");
  }

  // OVERRIDE 4: Significant plume exposure always suppresses spray
  // Even if abioticScore < 0.60 overall, direct plume exposure >= 0.35
  // is strong enough evidence alone.
  if (plumeScore >= 0.35 && verdict.disease_type === "Biotic") {
    verdict.spray_suppressed = true;
    overrides.push(`PLUME_SUPPRESSED_score:${plumeScore.toFixed(2)}`);
    // Note: don't override disease_type here — it might genuinely be biotic
    // but spray is still suppressed because pollution co-exists
  }

  verdict.overrides_applied = overrides;
  return verdict;
}
```

### Step 2.2 — Call enforceHardOverrides after LLM returns

In the POST handler, find where finalVerdict is set from either
cache hit or runMasterJudge call.

AFTER both code paths set finalVerdict, add:

```typescript
// ── HARD OVERRIDES (TypeScript enforcement) ────────────────────────
// These run regardless of whether result came from cache or LLM.
finalVerdict = enforceHardOverrides(
  finalVerdict,
  abioticScore,
  heavyMetalRes?.data?.severity ?? null,
  plumeExposure.plumeScore
);

if (finalVerdict.overrides_applied?.length > 0) {
  log(scanId, "🔒", `Hard overrides applied: ${finalVerdict.overrides_applied.join(", ")}`);
}
```

### Step 2.3 — Remove override text from LLM prompt

In runMasterJudge function, find the DECISION RULES section.
REMOVE rules 1 and 8 (they are now enforced in code):

REMOVE this line:
  "1. abioticScore >= 0.60 OR Heavy Metal Severity is 'high'/'critical' → OVERRIDE to Abiotic — do NOT diagnose biotic"

REMOVE this line:
  "8. spray_suppressed MUST be true for ANY Abiotic diagnosis"

REPLACE BOTH with:
  "NOTE: Override rules for abiotic score thresholds are enforced by the calling code, not this prompt. Focus your reasoning on the visual symptoms and providing accurate reasoning_bn."

Keep all other decision rules (2-7, 9) exactly as they are.

---

## TASK 3 — ABIOTIC BUCKET IN CACHE KEY (route.ts)

### Step 3.1 — Add abioticBucket helper function

Add this function BEFORE the POST handler:

```typescript
// ══════════════════════════════════════════════════════════════════════
// ABIOTIC SCORE BUCKET
// Groups abiotic score into 4 bands for cache key.
// Prevents stale cache hits when pollution conditions change.
// e.g. If a factory starts operating, old 'low' cache is not used.
// ══════════════════════════════════════════════════════════════════════
function abioticBucket(score: number): string {
  if (score < 0.20) return "low";
  if (score < 0.40) return "moderate";
  if (score < 0.60) return "high";
  return "critical";
}
```

### Step 3.2 — Update cache lookup call

Find the lookup_diagnosis_cache RPC call.

FIND:
```typescript
supabase.rpc("lookup_diagnosis_cache", {
  p_lat: lat,
  p_lng: lng,
  p_weather_hash: weatherHash,
  p_symptom_hash: symptomHash,
})
```

REPLACE WITH:
```typescript
supabase.rpc("lookup_diagnosis_cache", {
  p_lat: lat,
  p_lng: lng,
  p_weather_hash: weatherHash,
  p_symptom_hash: symptomHash,
  p_abiotic_bucket: abioticBucket(abioticScore),  // NEW
})
```

NOTE: abioticScore must be computed BEFORE the cache lookup.
Verify the order in the POST handler — abiotic score is computed
in STEP 5. Cache lookup is in STEP 9. Order is already correct.

### Step 3.3 — Update cache save to include abiotic_bucket

Find where diagnosis_cache is inserted (after LLM call, on cache miss).

Find the diagnosis_cache INSERT and add abiotic_bucket:

```typescript
// In the cache save block, add to the insert object:
abiotic_bucket: abioticBucket(abioticScore),  // NEW
pollutant_id: finalVerdict.suggested_pollutant_id ?? null,  // NEW
```

---

## TASK 4 — can_mimic_pollution CONFIDENCE CAP (route.ts)

### Context
kb_diseases.can_mimic_pollution = true means this disease's visual
symptoms look similar to industrial pollution damage.
Example: Rice blast (diamond lesions) can look like SO2 burn damage.
When both signals are present, LLM confidence should be capped.

### Step 4.1 — Add confidence calibration after LLM returns

In the POST handler, AFTER runMasterJudge sets finalVerdict,
AFTER enforceHardOverrides runs, add:

```typescript
// ── CONFIDENCE CALIBRATION — can_mimic_pollution check ─────────────
if (finalVerdict.suggested_disease_id && finalVerdict.disease_type === "Biotic") {
  const { data: diseaseData } = await supabase
    .from("kb_diseases")
    .select("can_mimic_pollution, ai_confidence_hint, differentiator_bn")
    .eq("disease_id", finalVerdict.suggested_disease_id)
    .maybeSingle();

  if (diseaseData) {
    // Cap confidence when disease can mimic pollution AND abiotic is significant
    if (diseaseData.can_mimic_pollution && abioticScore > 0.30) {
      const oldConf = finalVerdict.confidence;
      finalVerdict.confidence = Math.min(finalVerdict.confidence ?? 1.0, 0.65);
      finalVerdict.reasoning_bn = (finalVerdict.reasoning_bn ?? "") +
        ` তবে এই রোগের লক্ষণ দূষণের মতো হতে পারে — ${diseaseData.differentiator_bn ?? "বিশেষজ্ঞের পরামর্শ নিন।"}`;
      log(scanId, "⚠️", `Mimicry cap: confidence ${oldConf?.toFixed(2)} → ${finalVerdict.confidence.toFixed(2)}`);
    }

    // Apply kb_diseases confidence ceiling
    if (diseaseData.ai_confidence_hint && finalVerdict.confidence) {
      finalVerdict.confidence = Math.min(finalVerdict.confidence, diseaseData.ai_confidence_hint);
    }
  }
}

// Cap: if no RAG cases AND weather does not support disease → max 0.60
const noRagSupport = (ragCasesUsed ?? 0) === 0;
const noWeatherSupport = !((weather?.humidity ?? 0) > 75 && (consecutiveWetDays ?? 0) >= 3);
if (finalVerdict.disease_type === "Biotic" && noRagSupport && noWeatherSupport) {
  finalVerdict.confidence = Math.min(finalVerdict.confidence ?? 1.0, 0.60);
  log(scanId, "📉", "Unsupported biotic cap: no RAG + no weather → confidence capped at 0.60");
}
```

---

## TASK 5 — ADD satellite_water AND water_pollution_events TO ABIOTIC SCORE (route.ts)

### Context
These two signals exist in the spec's abiotic signal table but
are missing from the current abioticScore calculation.
satellite_water_data.suspected_pollution → +0.06
water_pollution_events (active, within 2km) → +0.15

### Step 5.1 — Fetch water_pollution_events proximity-based

In STEP 2 parallel fetch, find the water pollution fetch.
Currently it fetches ALL active events globally.

Find the water_pollution_events query and replace with:
```typescript
// Proximity-based: only events within 2km
supabase
  .from("water_pollution_events")
  .select("event_id, pollution_type, severity, is_active")
  .eq("is_active", true)
  // Note: without PostGIS in JS, filter by is_active only here
  // Proximity filtering happens in the score calculation below
```

### Step 5.2 — Fetch satellite_water_data for grid cell

In STEP 2 parallel fetch, add satellite water fetch:
```typescript
supabase
  .from("satellite_water_data")
  .select("suspected_pollution, water_quality_index, turbidity")
  .eq("grid_cell_id", `${lat.toFixed(2)}_${lng.toFixed(2)}`)
  .order("recorded_at", { ascending: false })
  .limit(1)
  .maybeSingle(),
```

Add the result variable:
```typescript
const [
  // ... existing results ...
  satelliteWaterRes,   // ADD THIS
] = await Promise.all([...]);
```

### Step 5.3 — Add new signals to abioticScore calculation

Find the abioticScore calculation (STEP 5).

FIND the abioticScore formula and ADD two new lines:
```typescript
const satelliteSignal = satelliteWaterRes?.data?.suspected_pollution === true ? 0.06 : 0.00;
const waterEventSignal = waterPollutionRes?.data?.length > 0 ? 0.15 : 0.00;  // has active events

const abioticScore = Math.min(1.0,
  plumeExposure.plumeScore +
  metalSignal +
  canalSignal +
  spraySignal +
  smokeSignal +
  waterSignal +
  neighborSignal +
  patternBonus +
  satelliteSignal +    // NEW
  waterEventSignal     // NEW
);
```

Add both new signals to the abiotic score log:
```typescript
log(scanId, "📊", `Abiotic score: ${abioticScore.toFixed(2)}`, {
  // ... existing signals ...
  satelliteSignal,
  waterEventSignal,
});
```

---

## TASK 6 — SAVE NEW COLUMNS TO scan_logs (route.ts)

### Step 6.1 — Pass new params to saveScanLog

saveScanLog() function needs new parameters.

ADD to the params interface:
```typescript
async function saveScanLog(params: {
  farmerId: string;
  landId: string;           // already added
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
  finalVerdict: any;
  // NEW:
  bioticScore: number;
  abioticScore: number;
  heavyMetalScore: number;
  secondaryCause: string | null;
  compoundStress: boolean;
  overridesApplied: string[];
})
```

### Step 6.2 — Add new columns to INSERT

In saveScanLog, find the .insert({}) call.
ADD these fields:

```typescript
land_id:            landId,              // already done
biotic_score:       bioticScore,         // NEW
abiotic_score:      abioticScore,        // NEW
heavy_metal_score:  heavyMetalScore,     // NEW
secondary_cause:    secondaryCause,      // NEW
compound_stress:    compoundStress,      // NEW
overrides_applied:  overridesApplied,    // NEW
```

### Step 6.3 — Pass new values when calling saveScanLog

In the POST handler, find the saveScanLog call.
ADD the new parameters:

```typescript
saveScanLog({
  farmerId,
  landId,
  cropId: landRes?.data?.crop_id ?? null,
  lat, lng,
  imageUrl,
  visionOutput: visionResult,
  questionnaireAnswers: profile ?? {},
  environmentalContext: { /* existing */ },
  stressType,
  diseaseId: finalVerdict.suggested_disease_id ?? null,
  pollutantId: finalVerdict.suggested_pollutant_id ?? null,
  aiConfidence: finalVerdict.confidence ?? 0,
  aiModel: "deepseek-r1",
  ragCasesUsed,
  symptomVector,
  finalVerdict,
  // NEW:
  bioticScore: finalVerdict.disease_type === "Biotic"
    ? (finalVerdict.confidence ?? 0)
    : 0,
  abioticScore: abioticScore,
  heavyMetalScore: heavyMetalRes?.data?.confidence_score ?? 0,
  secondaryCause: null,        // Stage 2 will implement compound detection
  compoundStress: false,       // Stage 2 will implement compound detection
  overridesApplied: finalVerdict.overrides_applied ?? [],
})
```

---

## TASK 7 — MULTI-FACTORY COMBINED PLUME (route.ts)

### Context
Current code takes MAX plume score across factories.
In dense industrial areas (Narayanganj, Gazipur) where 3 factories
each score 0.15, combined exposure is 0.45 but MAX returns 0.15.
This under-estimates abiotic risk significantly.

### Step 7.1 — Add combined dose calculation

In computeCumulativePlumeExposure function, after the per-factory loop,
find where plumeScore is computed.

FIND:
```typescript
const plumeScore = Math.min(0.50, (maxExposureScore / 30.0) * 0.50);
```

REPLACE WITH:
```typescript
// Combined dose from all factories (not just dominant)
let totalCombinedDose = 0;
for (const factory of hotspots) {
  totalCombinedDose += perFactoryHours[factory.factory_name_bn] ?? 0;
}
const combinedPlumeScore = Math.min(0.50, (totalCombinedDose / 30.0) * 0.50);

// Use higher of: dominant factory score OR combined all-factory score
// This prevents under-estimation in dense industrial zones
const plumeScore = Math.max(
  Math.min(0.50, (maxExposureScore / 30.0) * 0.50),
  combinedPlumeScore
);
```

Add to plume log:
```typescript
log(scanId, "🏭", `Plume: dominant=${(maxExposureScore/30*0.50).toFixed(3)}, combined=${combinedPlumeScore.toFixed(3)}, final=${plumeScore.toFixed(3)}`);
```

---

## TASK 8 — VERIFY STAGE 1 IS COMPLETE

After completing all tasks, verify these things:

### Verify 1 — enforceHardOverrides runs after BOTH cache hit and LLM call
Check that enforceHardOverrides() is called on finalVerdict
regardless of whether result came from cache or LLM.

### Verify 2 — New scan_logs columns save correctly
Test with a real scan. Then run:
```sql
SELECT
  id, land_id, biotic_score, abiotic_score,
  heavy_metal_score, secondary_cause, compound_stress,
  overrides_applied
FROM scan_logs
ORDER BY created_at DESC
LIMIT 1;
```
land_id must be populated. overrides_applied should be [] or have entries.

### Verify 3 — Cache abiotic bucket works
Make two identical scans in same location.
First scan: no industrial hotspot active → abiotic = 'low'
Second scan: same symptoms → should hit cache with abiotic='low'
If hotspot becomes active between scans → should NOT hit cache
because bucket changes from 'low' to 'moderate' or higher.

### Verify 4 — Hard overrides fire correctly
Create a test scan with:
  - abioticScore >= 0.60 (set canal_contamination + smoke_exposure in survey
    and ensure a hotspot exists nearby)
Result must have:
  - disease_type = "Abiotic"
  - spray_suppressed = true
  - overrides_applied contains "ABIOTIC_OVERRIDE_..."

---

## STAGE 1 DONE CHECKLIST

[ ] SQL 1.1 — scan_logs new columns added
[ ] SQL 1.2 — diagnosis_cache abiotic_bucket added
[ ] SQL 1.3 — kb_zones arsenic_zone_risk + known_metal_types seeded
[ ] SQL 1.4 — lookup_diagnosis_cache RPC updated with abiotic_bucket param
[ ] SQL 1.5 — verification query returns 7, 2, 4
[ ] Task 2 — enforceHardOverrides() added and called after LLM
[ ] Task 3 — abioticBucket() added, cache lookup + save updated
[ ] Task 4 — can_mimic_pollution confidence cap added
[ ] Task 5 — satellite_water + water_pollution_events in abiotic score
[ ] Task 6 — new columns saved to scan_logs
[ ] Task 7 — combined plume score implemented
[ ] All 4 verify checks pass

ONLY proceed to STAGE_2_PROMPT.md after all boxes are checked.
