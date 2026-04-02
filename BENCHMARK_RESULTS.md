# AgroSentinel Benchmark Results
## Date: 2026-04-01
## Tested by: Claude Agent

---

## DB Statistics (Run these queries in Supabase SQL Editor)

### Query 1 — Baseline Statistics
```sql
SELECT
  COUNT(*) as total_scans,
  COUNT(*) FILTER (WHERE stress_type LIKE 'Biotic%') as biotic_scans,
  COUNT(*) FILTER (WHERE stress_type LIKE 'Abiotic%') as abiotic_scans,
  COUNT(*) FILTER (WHERE compound_stress = true) as compound_detected,
  COUNT(*) FILTER (WHERE overrides_applied != '{}'
    AND overrides_applied IS NOT NULL) as hard_override_fired,
  COUNT(*) FILTER (WHERE tokens_used = 0) as early_exit_llm_skipped,
  COUNT(*) FILTER (WHERE tokens_used > 0) as llm_called,
  ROUND(AVG(ai_confidence)::numeric, 3) as avg_confidence,
  ROUND(AVG(biotic_score)::numeric, 3) as avg_biotic_score,
  ROUND(AVG(abiotic_score)::numeric, 3) as avg_abiotic_score,
  ROUND(AVG(heavy_metal_score)::numeric, 3) as avg_metal_score,
  COUNT(*) FILTER (WHERE biotic_score IS NULL) as missing_biotic_score,
  COUNT(*) FILTER (WHERE land_id IS NULL) as missing_land_id
FROM scan_logs;
```

**Results:**
| Metric | Value |
|--------|-------|
| total_scans | ___ |
| biotic_scans | ___ |
| abiotic_scans | ___ |
| compound_detected | ___ |
| hard_override_fired | ___ |
| early_exit_llm_skipped | ___ |
| llm_called | ___ |
| avg_confidence | ___ |
| avg_biotic_score | ___ |
| avg_abiotic_score | ___ |
| avg_metal_score | ___ |
| missing_biotic_score | ___ |
| missing_land_id | ___ |

---

### Query 2 — Hard Override Performance
```sql
SELECT
  COUNT(*) as total_scans,
  COUNT(*) FILTER (
    WHERE abiotic_score >= 0.60
  ) as should_have_overridden,
  COUNT(*) FILTER (
    WHERE abiotic_score >= 0.60
    AND overrides_applied && ARRAY[
      'SPRAY_SUPPRESSED_abiotic>=0.60',
      'ABIOTIC_OVERRIDE_score:0.60',
      'EARLY_EXIT_ABIOTIC_DOMINANT'
    ]
  ) as actually_overridden,
  ROUND(
    COUNT(*) FILTER (
      WHERE abiotic_score >= 0.60
      AND overrides_applied && ARRAY[
        'SPRAY_SUPPRESSED_abiotic>=0.60',
        'EARLY_EXIT_ABIOTIC_DOMINANT'
      ]
    )::numeric /
    NULLIF(COUNT(*) FILTER (WHERE abiotic_score >= 0.60), 0) * 100
  , 1) as override_accuracy_pct
FROM scan_logs
WHERE abiotic_score IS NOT NULL;
```

**Results:**
| Metric | Value |
|--------|-------|
| total_scans | ___ |
| should_have_overridden | ___ |
| actually_overridden | ___ |
| override_accuracy_pct | ___% |

---

### Query 3 — Three Score Distribution
```sql
SELECT
  COUNT(*) FILTER (WHERE biotic_score > 0.35) as biotic_primary_count,
  COUNT(*) FILTER (WHERE abiotic_score > 0.35) as abiotic_primary_count,
  COUNT(*) FILTER (WHERE heavy_metal_score > 0.20) as metal_detected_count,
  COUNT(*) FILTER (
    WHERE biotic_score < 0.35
    AND abiotic_score < 0.35
    AND heavy_metal_score < 0.20
  ) as no_detection_count,
  COUNT(*) FILTER (
    WHERE biotic_score > 0.35 AND abiotic_score > 0.20
  ) as compound_biotic_abiotic,
  COUNT(*) FILTER (
    WHERE biotic_score > 0.35 AND heavy_metal_score > 0.20
  ) as compound_biotic_metal,
  MAX(biotic_score) as max_biotic,
  MAX(abiotic_score) as max_abiotic,
  MAX(heavy_metal_score) as max_metal,
  MIN(biotic_score) FILTER (WHERE biotic_score > 0) as min_biotic_nonzero,
  MIN(abiotic_score) FILTER (WHERE abiotic_score > 0) as min_abiotic_nonzero
FROM scan_logs
WHERE biotic_score IS NOT NULL;
```

**Results:**
| Metric | Value |
|--------|-------|
| biotic_primary_count | ___ |
| abiotic_primary_count | ___ |
| metal_detected_count | ___ |
| no_detection_count | ___ |
| compound_biotic_abiotic | ___ |
| compound_biotic_metal | ___ |
| max_biotic | ___ |
| max_abiotic | ___ |
| max_metal | ___ |
| min_biotic_nonzero | ___ |
| min_abiotic_nonzero | ___ |

---

### Query 4 — Plume Model Performance
```sql
SELECT
  COUNT(*) as scans_with_plume_data,
  COUNT(*) FILTER (WHERE
    (environmental_context->>'plume_score')::float > 0
  ) as scans_with_nonzero_plume,
  ROUND(AVG(
    (environmental_context->>'plume_score')::float
  )::numeric, 3) as avg_plume_score,
  MAX(
    (environmental_context->>'plume_score')::float
  ) as max_plume_score,
  COUNT(*) FILTER (WHERE
    (environmental_context->>'plume_score')::float >= 0.35
  ) as high_plume_triggered_spray_suppress,
  COUNT(*) FILTER (WHERE
    (environmental_context->>'plume_exposure_hours_7d')::float > 24
  ) as high_exposure_hours_count
FROM scan_logs
WHERE environmental_context IS NOT NULL
  AND environmental_context ? 'plume_score';
```

**Results:**
| Metric | Value |
|--------|-------|
| scans_with_plume_data | ___ |
| scans_with_nonzero_plume | ___ |
| avg_plume_score | ___ |
| max_plume_score | ___ |
| high_plume_triggered_spray_suppress | ___ |
| high_exposure_hours_count | ___ |

---

### Query 5 — Community Signal Check
```sql
SELECT
  COUNT(*) as total_scans,
  COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_scans,
  COUNT(*) FILTER (WHERE verification_status = 'pending') as pending_scans,
  COUNT(*) FILTER (WHERE rag_trust_weight > 0.5) as high_trust_scans,
  ROUND(AVG(rag_trust_weight)::numeric, 3) as avg_rag_trust_weight
FROM scan_logs;
```

**Results:**
| Metric | Value |
|--------|-------|
| total_scans | ___ |
| verified_scans | ___ |
| pending_scans | ___ |
| high_trust_scans | ___ |
| avg_rag_trust_weight | ___ |

---

### Query 6 — Unknown/Edge Case Detection
```sql
SELECT
  COUNT(*) FILTER (
    WHERE biotic_score < 0.35
    AND abiotic_score < 0.35
    AND heavy_metal_score < 0.20
    AND biotic_score IS NOT NULL
  ) as true_unknown_cases,
  COUNT(*) FILTER (
    WHERE primary_cause = 'unknown'
  ) as primary_cause_unknown,
  COUNT(*) FILTER (
    WHERE ai_confidence < 0.30
  ) as very_low_confidence,
  COUNT(*) FILTER (
    WHERE compound_stress = true
    AND secondary_cause IS NOT NULL
  ) as confirmed_compound_cases
FROM scan_logs;
```

**Results:**
| Metric | Value |
|--------|-------|
| true_unknown_cases | ___ |
| primary_cause_unknown | ___ |
| very_low_confidence | ___ |
| confirmed_compound_cases | ___ |

---

### Query 7 — Heavy Metal Layer Performance
```sql
SELECT
  COUNT(*) as total_metal_reports,
  COUNT(*) FILTER (WHERE severity = 'critical') as critical,
  COUNT(*) FILTER (WHERE severity = 'high') as high,
  COUNT(*) FILTER (WHERE severity = 'moderate') as moderate,
  COUNT(*) FILTER (WHERE severity = 'low') as low,
  COUNT(*) FILTER (WHERE verified = true) as verified_reports,
  ROUND(AVG(confidence_score)::numeric, 3) as avg_confidence,
  COUNT(DISTINCT metal_type) as distinct_metal_types,
  COUNT(DISTINCT land_id) as distinct_lands_with_metal
FROM heavy_metal_reports;
```

**Results:**
| Metric | Value |
|--------|-------|
| total_metal_reports | ___ |
| critical | ___ |
| high | ___ |
| moderate | ___ |
| low | ___ |
| verified_reports | ___ |
| avg_confidence | ___ |
| distinct_metal_types | ___ |
| distinct_lands_with_metal | ___ |

---

## Controlled Test Results

| Test | Purpose | Expected | Actual | Result |
|------|---------|----------|--------|--------|
| T1 | Hard Override | abiotic>=0.60, spray=false, tokens=0 | ___ | ⏳ |
| T2 | Biotic normal | tokens>0, biotic>0, abiotic<0.40 | ___ | ⏳ |
| T3 | Compound | compound=true, secondary!=null | ___ | ⏳ |
| T4 | Metal zone | heavy_metal>=0.20 | ___ | ⏳ |
| T5 | Critical early exit | tokens=0, stress=Abiotic_Pollution | ___ | ⏳ |
| T6 | Nothing detected | unknown, no false diagnosis | ___ | ⏳ |
| T7 | Mimic cap | confidence<=0.65 | ___ | ⏳ |
| T8 | Cache hit | hit_count>0 | ___ | ⏳ |
| T9 | Columns saved | no nulls in biotic/abiotic/metal scores | ___ | ⏳ |
| T10 | Multi-factory plume | plume>0, per_factory_hours | ___ | ⏳ |

---

## Module Scorecard

### MODULE A — BIOTIC DETECTION
| Test | Result |
|------|--------|
| Test 2 (Biotic runs when clean) | ⏳ |
| Test 7 (Mimic pollution cap) | ⏳ |
| **Score** | **_/2** |

### MODULE B — ABIOTIC DETECTION
| Test | Result |
|------|--------|
| Test 1 (Hard Override fires) | ⏳ |
| Test 3 (Compound detected) | ⏳ |
| Test 10 (Multi-factory plume) | ⏳ |
| **Score** | **_/3** |

### MODULE C — HEAVY METAL
| Test | Result |
|------|--------|
| Test 4 (Metal zone detection) | ⏳ |
| Test 5 (Critical early exit) | ⏳ |
| **Score** | **_/2** |

### SYSTEM ARCHITECTURE
| Test | Result |
|------|--------|
| Test 6 (Unknown handled cleanly) | ⏳ |
| Test 8 (Cache hit works) | ⏳ |
| Test 9 (All columns saved) | ⏳ |
| **Score** | **_/3** |

---

## Summary

**OVERALL: _/10 tests passed**

Rule-based accuracy: ___% (tests 1,4,5,9 = deterministic)
