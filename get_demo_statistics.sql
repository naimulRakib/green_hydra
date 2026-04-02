-- ============================================
-- Database Statistics for Demo Presentation
-- Run these queries to get real numbers
-- ============================================

-- Query 1: Overall System Statistics
SELECT
  COUNT(*) as total_scans,
  COUNT(CASE WHEN overrides_applied != '{}' THEN 1 END) as hard_override_fired,
  COUNT(CASE WHEN spray_suppressed = true THEN 1 END) as sprays_prevented,
  COUNT(CASE WHEN compound_stress = true THEN 1 END) as compound_stress_detected,
  ROUND(AVG(confidence_score)::numeric, 2) as avg_confidence,
  COUNT(CASE WHEN tokens_used = 0 THEN 1 END) as llm_skipped,
  ROUND((COUNT(CASE WHEN tokens_used = 0 THEN 1 END)::numeric / NULLIF(COUNT(*)::numeric, 0) * 100), 1) as early_exit_percentage
FROM scan_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Query 2: Override Breakdown
SELECT
  CASE
    WHEN 'ABIOTIC_OVERRIDE' = ANY(overrides_applied) THEN 'Abiotic Override'
    WHEN 'SPRAY_SUPPRESSED' = ANY(overrides_applied) THEN 'Spray Suppressed'
    WHEN 'COMPOUND_STRESS' = ANY(overrides_applied) THEN 'Compound Stress'
    ELSE 'No Override'
  END as override_type,
  COUNT(*) as count
FROM scan_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY override_type
ORDER BY count DESC;

-- Query 3: Primary Cause Distribution
SELECT
  primary_cause,
  COUNT(*) as count,
  ROUND(AVG(confidence_score)::numeric, 2) as avg_confidence
FROM scan_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND primary_cause IS NOT NULL
GROUP BY primary_cause
ORDER BY count DESC;

-- Query 4: Score Distribution (for sanity check)
SELECT
  ROUND(AVG(biotic_score)::numeric, 2) as avg_biotic,
  ROUND(AVG(abiotic_score)::numeric, 2) as avg_abiotic,
  ROUND(AVG(metal_score)::numeric, 2) as avg_metal,
  ROUND(MAX(biotic_score)::numeric, 2) as max_biotic,
  ROUND(MAX(abiotic_score)::numeric, 2) as max_abiotic,
  ROUND(MAX(metal_score)::numeric, 2) as max_metal
FROM scan_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Query 5: Recent Test Scans (for decision trail)
SELECT
  id,
  land_id,
  biotic_score,
  abiotic_score,
  metal_score,
  primary_cause,
  spray_suppressed,
  compound_stress,
  overrides_applied,
  confidence_score,
  tokens_used,
  created_at
FROM scan_logs
WHERE land_id LIKE 'TEST_%'
ORDER BY created_at DESC
LIMIT 10;

-- Query 6: Detailed Decision Trail (pick one scan for demo)
-- Replace 'YOUR_SCAN_ID' with an actual scan ID from Query 5
/*
SELECT
  id as scan_id,
  land_id,
  '--- Input Signals ---' as section_1,
  canal_contamination,
  smoke_exposure,
  plume_score,
  water_event_signal,
  '--- Calculated Scores ---' as section_2,
  biotic_score,
  abiotic_score,
  metal_score,
  '--- Decision ---' as section_3,
  primary_cause,
  spray_suppressed,
  compound_stress,
  overrides_applied,
  confidence_score,
  '--- AI Usage ---' as section_4,
  tokens_used,
  llm_skipped
FROM scan_logs
WHERE id = 'YOUR_SCAN_ID';
*/

-- Query 7: Test Results Summary
SELECT
  land_id,
  CASE
    WHEN land_id = 'TEST_BIOTIC_001' THEN 'Expected: spray=true, biotic primary'
    WHEN land_id = 'TEST_ABIOTIC_001' THEN 'Expected: spray=false, abiotic primary'
    WHEN land_id = 'TEST_METAL_001' THEN 'Expected: metal_score > 0.20'
    WHEN land_id = 'TEST_EARLY_EXIT_001' THEN 'Expected: tokens=0, abiotic primary'
    WHEN land_id = 'TEST_COMPOUND_001' THEN 'Expected: compound_stress=true'
  END as expected_outcome,
  primary_cause as actual_primary,
  spray_suppressed as actual_spray_suppressed,
  metal_score as actual_metal_score,
  tokens_used as actual_tokens,
  compound_stress as actual_compound,
  CASE
    WHEN land_id = 'TEST_BIOTIC_001' AND spray_suppressed = false AND primary_cause = 'biotic' THEN '✅'
    WHEN land_id = 'TEST_ABIOTIC_001' AND spray_suppressed = true AND primary_cause = 'abiotic' THEN '✅'
    WHEN land_id = 'TEST_METAL_001' AND metal_score > 0.20 THEN '✅'
    WHEN land_id = 'TEST_EARLY_EXIT_001' AND tokens_used = 0 AND primary_cause = 'abiotic' THEN '✅'
    WHEN land_id = 'TEST_COMPOUND_001' AND compound_stress = true THEN '✅'
    ELSE '❌'
  END as result
FROM scan_logs
WHERE land_id LIKE 'TEST_%'
  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY land_id;
