# AgroSentinel route.ts — Bug Fix Task for AI Agent

## YOUR ROLE
You are a senior TypeScript/Next.js engineer fixing critical bugs in a production
API route. You will edit ONE file: `app/api/diagnose/route.ts`. You will also run
ONE SQL statement in Supabase. Do not change any other files. Do not refactor
anything outside the scope of each fix. Make surgical edits only.

---

## CONTEXT YOU MUST UNDERSTAND FIRST

This is a Next.js App Router API route (`POST /api/diagnose`) for an agricultural
AI diagnosis system. It:
1. Accepts a farmer's crop image as base64
2. Runs vision analysis via Gemini API
3. Computes biotic / abiotic / heavy metal scores
4. Saves results to a Supabase PostgreSQL database
5. Triggers community alert logic

The Supabase `scan_logs` table has this exact enum column:
```
verification_status | USER-DEFINED | DEFAULT 'unverified'::verification_status_enum
```
Valid enum values: `unverified`, `verified`, `rejected`
The value `"pending"` does NOT exist in this enum.

The `farm_profiles` table has these boolean columns that currently are NOT being
fetched but ARE being used in scoring logic:
```
arsenic_risk  | boolean | default false
iron_risk     | boolean | default false
fish_kill     | boolean | default false
```

The `kb_zones` table does NOT have a `climate_profile` column. The columns that
exist and are useful are: `primary_stress`, `adaptive_strategy_bn`, `zone_name_bn`.

The `diagnosis_cache` table has a foreign key constraint:
`diagnosis_cache_confirmed_disease_id_fkey` → references `kb_diseases.disease_id`
This means any LLM-hallucinated disease ID that doesn't exist in `kb_diseases`
will crash the cache insert.

The `diagnosis_cache` table now has an `abiotic_bucket` column (text, nullable,
default 'low'). The upsert uses `onConflict` on 4 columns — this requires a
unique index that may not exist yet.

---

## THE 6 BUGS TO FIX — IN EXACT ORDER

---

### BUG 1 — CRITICAL: Wrong enum value crashes every scan_logs insert

**Symptom from logs:**
```
FAILED at scan_logs insert: invalid input value for enum verification_status_enum: "pending"
```

**Find this code (around line 24):**
```typescript
type VerificationStatus = "pending" | "verified" | "rejected";
```

**Replace with:**
```typescript
type VerificationStatus = "unverified" | "verified" | "rejected";
```

**Then find this code (inside `saveScanLog` function, around line 1157):**
```typescript
const verificationStatus: VerificationStatus = "pending";
```

**Replace with:**
```typescript
const verificationStatus: VerificationStatus = "unverified";
```

**Verification:** After this fix, `scan_logs` inserts will no longer fail with
the enum error. This is the most critical fix — without it, zero scans are
persisted to the database.

---

### BUG 2 — HIGH: Heavy metal score is always undercounted by up to 0.25

**Root cause:** `scoreHeavyMetal()` uses `profile?.arsenic_risk`,
`profile?.iron_risk`, and `profile?.fish_kill` — but these 3 columns are
never fetched from `farm_profiles`. They are always `undefined`, so those
scoring branches never fire.

**Find this code (inside the `Promise.all` DB fetch block, around line 1327):**
```typescript
supabase.from("farm_profiles")
  .select(`
      soil_ph, water_color, water_risk,
      smoke_exposure, canal_contamination, neighbor_problem,
      pest_level, scan_context
    `)
  .eq("farmer_id", farmerId).eq("land_id", landId)
  .maybeSingle(),
```

**Replace with:**
```typescript
supabase.from("farm_profiles")
  .select(`
      soil_ph, water_color, water_risk,
      smoke_exposure, canal_contamination, neighbor_problem,
      pest_level, scan_context,
      arsenic_risk, iron_risk, fish_kill
    `)
  .eq("farmer_id", farmerId).eq("land_id", landId)
  .maybeSingle(),
```

**Verification:** After this fix, `scoreHeavyMetal()` will correctly receive
`arsenic_risk`, `iron_risk`, and `fish_kill` boolean values from the profile
and apply their weights (0.10, 0.08, 0.07) to the heavy metal score.

---

### BUG 3 — HIGH: `climate_profile` column does not exist in kb_zones — LLM gets no zone context

**Root cause:** `kb_zones` table has no `climate_profile` column. The join query
silently returns null, so `zoneClimate` is always `"Unknown climate"` and the
LLM diagnosis prompt has no geographic context.

**PART A — Fix the farmers query (around line 1339):**

Find:
```typescript
supabase.from("farmers")
  .select("zone_id, kb_zones(climate_profile)")
  .eq("id", farmerId)
  .maybeSingle(),
```

Replace with:
```typescript
supabase.from("farmers")
  .select("zone_id")
  .eq("id", farmerId)
  .maybeSingle(),
```

**PART B — Fix the zoneClimate construction (around lines 1469–1475):**

Find this entire block:
```typescript
let zoneClimate = "Unknown climate";
if (farmerRes.data?.kb_zones && !Array.isArray(farmerRes.data.kb_zones)) {
  const kbZones = farmerRes.data.kb_zones as unknown;
  if (isRecord(kbZones) && typeof kbZones.climate_profile === "string") {
    zoneClimate = kbZones.climate_profile;
  }
}
```

Replace with:
```typescript
const zoneClimate = [
  typeof zoneData?.zone_name_bn === "string" ? zoneData.zone_name_bn : "",
  typeof zoneData?.primary_stress === "string" && zoneData.primary_stress !== "None"
    ? `মূল চাপ: ${zoneData.primary_stress}`
    : "",
  typeof zoneData?.adaptive_strategy_bn === "string"
    ? zoneData.adaptive_strategy_bn
    : "",
].filter(Boolean).join(" | ") || "Unknown climate";
```

**Verification:** `zoneClimate` will now be built from actual `kb_zones` columns
that exist in the schema. The LLM diagnosis prompt will receive real zone context
(e.g., "উত্তরাঞ্চল | মূল চাপ: Drought | খরা-সহিষ্ণু জাত ব্যবহার করুন").

---

### BUG 4 — MEDIUM: Cache insert crashes on LLM-hallucinated disease IDs

**Symptom from logs:**
```
Cache save failed: insert or update on table "diagnosis_cache" violates
foreign key constraint "diagnosis_cache_confirmed_disease_id_fkey"
```

**Root cause:** The LLM sometimes returns a `suggested_disease_id` (e.g.
`"rice_blast_001"`) that doesn't exist as a `disease_id` in `kb_diseases`.
Inserting it directly into `diagnosis_cache.confirmed_disease_id` violates
the FK constraint.

**Find this cache upsert block (around line 1960–1983). It starts with:**
```typescript
if (!isCached) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: cacheSaveError } = await supabase
    .from("diagnosis_cache")
    .upsert({
      grid_cell_id: `${lat.toFixed(2)}_${lng.toFixed(2)}`,
      weather_hash: weatherHash,
      symptom_hash: symptomHash,
      confirmed_disease_id: finalVerdict.suggested_disease_id ?? null,
```

**Replace the entire `if (!isCached)` cache-save block with:**
```typescript
if (!isCached) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Verify disease_id exists in kb_diseases before inserting (prevent FK violation)
  let verifiedDiseaseId: string | null = null;
  if (finalVerdict.suggested_disease_id) {
    const { data: diseaseCheck } = await supabase
      .from("kb_diseases")
      .select("disease_id")
      .eq("disease_id", finalVerdict.suggested_disease_id)
      .maybeSingle();
    verifiedDiseaseId = diseaseCheck?.disease_id ?? null;
    if (!verifiedDiseaseId) {
      log(scanId, "⚠️ ", `LLM disease_id "${finalVerdict.suggested_disease_id}" not in kb_diseases — cache will store null`);
    }
  }

  const { error: cacheSaveError } = await supabase
    .from("diagnosis_cache")
    .upsert({
      grid_cell_id: `${lat.toFixed(2)}_${lng.toFixed(2)}`,
      weather_hash: weatherHash,
      symptom_hash: symptomHash,
      confirmed_disease_id: verifiedDiseaseId,
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
```

**Also apply the same FK verification to scan_logs insert (around line 2043):**

Find:
```typescript
diseaseId: finalVerdict.suggested_disease_id ?? null,
```

Replace with:
```typescript
diseaseId: verifiedDiseaseId ?? null,
```

NOTE: `verifiedDiseaseId` is defined in the cache block above. Move the
verification logic BEFORE the cache block so it is available for both.
Extract it as:
```typescript
// After STEP 11, before STEP 12 cache save:
// ── STEP 11b: Verify disease_id exists in KB ──────────────────────────
let verifiedDiseaseId: string | null = null;
if (finalVerdict.suggested_disease_id) {
  const { data: diseaseCheck } = await supabase
    .from("kb_diseases")
    .select("disease_id")
    .eq("disease_id", finalVerdict.suggested_disease_id)
    .maybeSingle();
  verifiedDiseaseId = diseaseCheck?.disease_id ?? null;
  if (!verifiedDiseaseId) {
    log(scanId, "⚠️ ", `LLM disease_id "${finalVerdict.suggested_disease_id}" not in kb_diseases → null`);
  }
}
```

Then use `verifiedDiseaseId` in both the cache upsert AND the `saveScanLog` call.

---

### BUG 5 — MEDIUM: Missing unique index breaks cache upsert

**This is a DATABASE fix, not a code fix.**

Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New query):

```sql
-- Create the unique index required for the 4-column upsert onConflict
CREATE UNIQUE INDEX IF NOT EXISTS diagnosis_cache_upsert_idx
ON diagnosis_cache(grid_cell_id, weather_hash, symptom_hash, abiotic_bucket);
```

Run it once. It is idempotent (`IF NOT EXISTS`). Without this index, every
cache upsert throws: `"there is no unique or exclusion constraint matching
the ON CONFLICT specification"`.

**Verification:** After running, the cache upsert in Bug 4 will work correctly.

---

### BUG 6 — MEDIUM: Free-text crop name inserted as FK crop_id

**Root cause:** When `farmer_lands.crop_id` is null, the code falls back to
`visionResult.detected_crop` which is a free-text English string like `"rice"`.
But `scan_logs.crop_id` is a FK referencing `kb_crops.crop_id` which stores
slugs like `"brri_dhan28"`, `"wheat_aari"`. Inserting `"rice"` either violates
the FK or stores garbage data.

**Find this line in the `saveScanLog` call (around line 2006):**
```typescript
cropId: cropId ?? (visionResult.detected_crop as string) ?? null,
```

**Replace with:**
```typescript
cropId: cropId ?? (() => {
  // Resolve LLM-detected crop name to a valid kb_crops.crop_id
  const detected = (visionResult.detected_crop ?? "").toLowerCase().trim();
  if (!detected) return null;
  const match = kbCrops.find((c) =>
    String(c.crop_name_en ?? "").toLowerCase().includes(detected) ||
    detected.includes(String(c.crop_name_en ?? "").toLowerCase())
  );
  return typeof match?.crop_id === "string" ? match.crop_id : null;
  // Returns null if no match — safe, column is nullable
})(),
```

**Verification:** If `farmer_lands.crop_id` is null but Gemini detected `"rice"`,
the code will search `kbCrops` (already fetched in Step 2) for a matching
`crop_name_en` and return the proper `crop_id` slug. If no match, null is stored
safely (the column is nullable).

---

## EXECUTION ORDER

Apply fixes in this exact order:
1. Bug 1 (2 text changes — highest priority, unblocks all data saving)
2. Bug 2 (1 text change — add 3 column names to select)
3. Bug 3 Part A (1 text change — remove bad join)
4. Bug 3 Part B (replace zoneClimate block)
5. Bug 4 (restructure cache block + extract verifiedDiseaseId)
6. Bug 5 (run SQL in Supabase — do this while code changes compile)
7. Bug 6 (replace cropId fallback)

---

## WHAT NOT TO TOUCH

- Do NOT change the plume exposure algorithm
- Do NOT change the Gemini prompt text
- Do NOT change the scoring weight constants
- Do NOT change the `enforceHardOverrides` function
- Do NOT change any function signatures except where explicitly stated
- Do NOT add new imports
- Do NOT change any other files (heavyMetalActions, weather.ts, etc.)
- Do NOT add logging beyond what is specified in Bug 4

---

## HOW TO VERIFY YOUR CHANGES ARE CORRECT

After applying all fixes, check:

1. **TypeScript compiles with no errors:** `npx tsc --noEmit`

2. **`VerificationStatus` type has `"unverified"` not `"pending"`** — search file
   for `"pending"` — it should appear zero times as a value assignment

3. **`farm_profiles` select string contains `arsenic_risk, iron_risk, fish_kill`**
   — search file for `fish_kill` — should appear in the select AND in the
   `scoreHeavyMetal` function body

4. **`climate_profile` appears zero times in the file** — search for it — if
   found anywhere, you missed something

5. **`verifiedDiseaseId` is used in both** the cache upsert AND the `saveScanLog`
   call for `diseaseId` — search for both usages

6. **The `if (!isCached)` cache block** now contains the disease verification
   query before the upsert

7. **`cropId` fallback** no longer casts `visionResult.detected_crop` directly —
   it runs through the `kbCrops.find()` lookup first

---

## EXPECTED LOG OUTPUT AFTER FIXES

A successful scan should produce logs like:
```
✅  Vision done
🔍  Cache + RAG...
✅  Cache+RAG done
🔬  Stage 3: Running three detection modules...
✅  Judge done
🏷️   stress_type → Biotic_Fungal
🧠  Cache saved (bucket=low)
💾  Saving to scan_logs...
✅  scan_logs saved (XXXms) → id: <uuid>
🏁  SCAN COMPLETE
```

The following lines should NO LONGER appear:
```
❌  FAILED at scan_logs insert: invalid input value for enum verification_status_enum: "pending"
⚠️   Cache save failed: insert or update on table "diagnosis_cache" violates foreign key constraint
```
