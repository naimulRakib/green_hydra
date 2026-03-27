# AgroSentinel System Health Report
## Date: 2026-03-23
## Checked by: Agent

---

## Summary
PASS: 16
PARTIAL: 0  
FAIL: 0
FIXED: 3

---

## Check Results

| Check | Status | Notes |
|-------|--------|-------|
| A — Pre-flight Gates | PASS | Required fields (L1252-L1255), image size <4.5MB (L1259-L1268), JWT auth+ownership (L1226-L1239), survey gate uses `surveys` (L1541-L1545). |
| B — Parallel Fetch | PASS | Stage-1 Promise.all includes weather_details, farm_profiles, farmer_lands, farmers+kb_zones, spray_events, industrial_hotspots, heavy_metal_reports, water_pollution_events, satellite_water_data by grid_cell_id, kb_crops (L1308-L1388). |
| C — Plume Engine | PASS | computeCumulativePlumeExposure defined and called (L822-L975, L1435-L1437); combined+dominant plumeScore uses Math.max (L960-L967) and clamps 0–0.50. |
| D — Abiotic Score | PASS | All 9 signals + patternBonus in score (L1496-L1519), abioticScore capped with Math.min(1.0) (L1509-L1519). |
| E — Hard Overrides | PASS | enforceHardOverrides exists (L143-L178) and called after verdict (L1919-L1925), all 4 rules present. |
| F — Cache System | PASS | abioticBucket (L133-L138), lookup_diagnosis_cache includes p_abiotic_bucket (L1600-L1606), diagnosis_cache insert includes abiotic_bucket (L1964-L1973), weatherHash uses bucket (L1607-L1609). |
| G — Three Modules | PASS | runBioticModule prompt uses abiotic for reference only (L1035-L1042), buildAbioticResult (L200-L237), scoreHeavyMetal (L240-L283), adjustBioticScore (L181-L197), mimicry cap (L1932-L1949), unsupported biotic cap (L1953-L1957). |
| H — Community Signal | PASS | getCommunitySignal uses 5km ST_DWithin, verified scans, last 30 days, limit 50 (L292-L300); community_alerts query (L301-L306); ratios+weight returned (L334-L343); applyCommuntiyWeighting called with max 0.20 (L327-L358). |
| I — Compound Stress | PASS | detectCompoundStress handles all three pairs with Bengali warnings (L389-L423); classifyResults thresholds PRIMARY 0.35, SECONDARY 0.20 (L362-L374); compound_stress included in responses (L1750, L1862, L2154). |
| J — Land Suitability | PASS | checkLandSuitability exists (L425-L463); kb_crops fetched in Stage-1 (L1378-L1380); result included in verdict (L1757-L1762, L1869-L1874). |
| K — scan_logs INSERT | PASS | land_id + scores + secondary_cause + compound_stress + overrides_applied saved (L1168-L1201); tokens_used sourced from model metadata (L1191); MIME type detected (L1275-L1288). |
| L — Heavy Metal | PASS | triggerHeavyMetalDetection fire-and-forget when Abiotic_Pollution or abioticScore>0.40 (L2094-L2131); RPC uses farm_profiles/surveys/land_id in SQL (detect_and_save_metal_risk_fixed.sql L65-L67, L127-L129, L191-L195); getHeavyMetalReport uses service-role client (heavyMetalActions.ts L171-L177). |
| M — Water System | PASS | get_water_alerts_near_farmer + get_water_sources_near RPCs in waterActions.ts (L14-L45); SQL uses geography consistently and stores water_sources.location as geography (water_system_fixed.sql L49-L50, L92-L132, L187-L216). |
| N — API Response | PASS | NextResponse includes all v2 fields + legacy fields (L2147-L2178). |
| O — Frontend | PASS | DiagnosisResult includes v2 fields (DiseaseScanner.tsx L21-L47); Bearer token forwarded (L140-L148); setResult maps new fields (L172-L192); three-score card (L312-L369); compound stress (L372-L379); community (L381-L387); secondary advice (L399-L404). |
| P — Survey Gate | PASS | Uses `surveys` and ISO week (L1533-L1545); blocked response includes { success:false, blocked:true, message } (L1549-L1552); SKIP_SURVEY_GATE env bypass (L1529-L1532). |

---

## Fixes Applied
### 1) Community ratio aliases + weighting fallback (`app/api/diagnose/route.ts` L312-L343, L346-L358)
Before:
```ts
return {
  biotic_community_ratio: 0,
  abiotic_community_ratio: 0,
  heavy_metal_community_ratio: 0,
  total_nearby_scans: 0,
  ...
};
```
After:
```ts
return {
  biotic_community_ratio: 0,
  abiotic_community_ratio: 0,
  heavy_metal_community_ratio: 0,
  biotic_ratio: 0,
  abiotic_ratio: 0,
  metal_ratio: 0,
  total_nearby_scans: 0,
  ...
};
```

Before:
```ts
const b = typeof community.biotic_community_ratio === "number" ? community.biotic_community_ratio : 0;
const a = typeof community.abiotic_community_ratio === "number" ? community.abiotic_community_ratio : 0;
const h = typeof community.heavy_metal_community_ratio === "number" ? community.heavy_metal_community_ratio : 0;
```
After:
```ts
const b = typeof community.biotic_community_ratio === "number"
  ? community.biotic_community_ratio
  : (typeof community.biotic_ratio === "number" ? community.biotic_ratio : 0);
const a = typeof community.abiotic_community_ratio === "number"
  ? community.abiotic_community_ratio
  : (typeof community.abiotic_ratio === "number" ? community.abiotic_ratio : 0);
const h = typeof community.heavy_metal_community_ratio === "number"
  ? community.heavy_metal_community_ratio
  : (typeof community.metal_ratio === "number" ? community.metal_ratio : 0);
```

### 2) Correct scan_logs scores + token accounting (`app/api/diagnose/route.ts` L1799-L1818, L2032-L2039)
Before:
```ts
const rawScores = { biotic: Number(bioticResult.biotic_score ?? 0), ... };
tokensUsed: Number(finalVerdictWithOverrides._tokens_used ?? 0) + Number(visionResult._tokens_used ?? 0),
bioticScore: finalVerdictWithOverrides.disease_type === "Biotic" ? (finalVerdictWithOverrides.confidence ?? 0) : 0,
heavyMetalScore: Number(heavyMetalRes?.data?.confidence_score ?? 0),
```
After:
```ts
bioticTokensUsed = Number((bioticResultRaw as AnyRecord)?._tokens_used ?? 0);
bioticScoreForLog = rawScores.biotic;
tokensUsed: bioticTokensUsed + Number(visionResult._tokens_used ?? 0),
bioticScore: bioticScoreForLog,
heavyMetalScore: heavyMetalScoreForLog,
```

### 3) Heavy metal trigger fire-and-forget + abioticScore gate (`app/api/diagnose/route.ts` L2094-L2131)
Before:
```ts
if (stressType === 'Abiotic_Pollution' && scanLogId) {
  const hmResult = await triggerHeavyMetalDetection(landId, lat, lng);
  ...
}
```
After:
```ts
if ((stressType === 'Abiotic_Pollution' || abioticScore > 0.40) && scanLogId) {
  heavyMetalStatus = "queued";
  void triggerHeavyMetalDetection(landId, lat, lng).then(...).catch(...);
}
```

---

## DB Check Results
Check 1: NOT RUN — no database connection available in this environment.  
Check 2: NOT RUN — no database connection available in this environment.  
Check 3: NOT RUN — no database connection available in this environment.  
Check 4: NOT RUN — no database connection available in this environment.  
Check 5: NOT RUN — no database connection available in this environment.  

---

## Build Status
lint: PASS (warnings only)
build: PASS

---

## Remaining Issues
DB consistency checks could not be executed (no DB connection/credentials available in this environment).

---

## System Ready for Testing: NO
