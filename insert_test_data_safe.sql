-- ============================================
-- SAFER: Insert Test Scan Data (Minimal Columns)
-- Only uses core columns that definitely exist
-- ============================================

-- Clean up any previous test scans
DELETE FROM scan_logs WHERE land_id LIKE 'TEST_%';

-- Get a valid user_id (or use NULL if auth system allows)
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to get first user, or set to NULL
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := '00000000-0000-0000-0000-000000000000'::uuid; -- placeholder
  END IF;

  -- ============================================
  -- Test 1: Pure Biotic
  -- ============================================
  INSERT INTO scan_logs (
    land_id,
    user_id,
    image_url,
    detected_crop,
    biotic_score,
    abiotic_score,
    metal_score,
    primary_cause,
    confidence_score,
    spray_suppressed,
    compound_stress,
    overrides_applied,
    tokens_used,
    diagnosis_text
  ) VALUES (
    'TEST_BIOTIC_001',
    v_user_id,
    'https://example.com/test-biotic.jpg',
    'rice',
    0.75,
    0.15,
    0.08,
    'biotic',
    0.75,
    false,
    false,
    '{}',
    1250,
    'Rice blast disease detected. Fungal infection with characteristic lesion patterns. Spray recommended.'
  );

  -- ============================================
  -- Test 2: Pure Abiotic (HARD OVERRIDE)
  -- ============================================
  INSERT INTO scan_logs (
    land_id,
    user_id,
    image_url,
    detected_crop,
    biotic_score,
    abiotic_score,
    metal_score,
    primary_cause,
    confidence_score,
    spray_suppressed,
    compound_stress,
    overrides_applied,
    tokens_used,
    diagnosis_text
  ) VALUES (
    'TEST_ABIOTIC_001',
    v_user_id,
    'https://example.com/test-abiotic.jpg',
    'rice',
    0.35,
    0.72,
    0.12,
    'abiotic',
    0.72,
    true, -- SPRAY SUPPRESSED
    false,
    ARRAY['ABIOTIC_OVERRIDE_score:0.72', 'SPRAY_SUPPRESSED_abiotic>=0.60'],
    0, -- LLM skipped
    'Hard override: High pollution stress. Canal contamination + smoke + water contamination detected. Spray will not help.'
  );

  -- ============================================
  -- Test 3: Heavy Metal
  -- ============================================
  INSERT INTO scan_logs (
    land_id,
    user_id,
    image_url,
    detected_crop,
    biotic_score,
    abiotic_score,
    metal_score,
    primary_cause,
    confidence_score,
    spray_suppressed,
    compound_stress,
    overrides_applied,
    tokens_used,
    diagnosis_text
  ) VALUES (
    'TEST_METAL_001',
    v_user_id,
    'https://example.com/test-metal.jpg',
    'rice',
    0.28,
    0.35,
    0.37, -- HIGH metal
    'metal',
    0.58,
    false,
    false,
    ARRAY['METAL_WARNING_score:0.37'],
    980,
    'Heavy metal contamination: arsenic + iron + chromium detected. Soil testing recommended.'
  );

  -- ============================================
  -- Test 4: Early Exit
  -- ============================================
  INSERT INTO scan_logs (
    land_id,
    user_id,
    image_url,
    detected_crop,
    biotic_score,
    abiotic_score,
    metal_score,
    primary_cause,
    confidence_score,
    spray_suppressed,
    compound_stress,
    overrides_applied,
    tokens_used,
    diagnosis_text
  ) VALUES (
    'TEST_EARLY_EXIT_001',
    v_user_id,
    'https://example.com/test-early-exit.jpg',
    'rice',
    0.25,
    0.85, -- VERY HIGH
    0.42,
    'abiotic',
    0.85,
    true,
    false,
    ARRAY['ABIOTIC_OVERRIDE_score:0.85', 'EARLY_EXIT_bypassed_LLM'],
    0, -- ZERO tokens
    'Extreme pollution. Early exit - LLM bypassed. Immediate environmental intervention required.'
  );

  -- ============================================
  -- Test 5: Compound Stress
  -- ============================================
  INSERT INTO scan_logs (
    land_id,
    user_id,
    image_url,
    detected_crop,
    biotic_score,
    abiotic_score,
    metal_score,
    primary_cause,
    confidence_score,
    spray_suppressed,
    compound_stress,
    overrides_applied,
    tokens_used,
    diagnosis_text
  ) VALUES (
    'TEST_COMPOUND_001',
    v_user_id,
    'https://example.com/test-compound.jpg',
    'rice',
    0.58,
    0.52,
    0.28,
    'biotic',
    0.58,
    false,
    true, -- COMPOUND!
    ARRAY['COMPOUND_STRESS_detected'],
    1450,
    'Compound stress: fungal disease + pollution. Both biotic and abiotic factors present. Treat disease but investigate contamination.'
  );

END $$;

-- Verify inserts
SELECT
  land_id,
  primary_cause,
  ROUND(biotic_score::numeric, 2) as biotic,
  ROUND(abiotic_score::numeric, 2) as abiotic,
  ROUND(metal_score::numeric, 2) as metal,
  spray_suppressed,
  compound_stress,
  tokens_used,
  cardinality(overrides_applied) as num_overrides
FROM scan_logs
WHERE land_id LIKE 'TEST_%'
ORDER BY created_at DESC;

-- Final validation
SELECT
  '========== VALIDATION RESULTS ==========' as header;

SELECT
  land_id,
  CASE
    WHEN land_id = 'TEST_BIOTIC_001' AND spray_suppressed = false AND primary_cause = 'biotic' THEN '✅ PASS'
    WHEN land_id = 'TEST_ABIOTIC_001' AND spray_suppressed = true AND tokens_used = 0 THEN '✅ PASS'
    WHEN land_id = 'TEST_METAL_001' AND metal_score > 0.20 THEN '✅ PASS'
    WHEN land_id = 'TEST_EARLY_EXIT_001' AND tokens_used = 0 THEN '✅ PASS'
    WHEN land_id = 'TEST_COMPOUND_001' AND compound_stress = true THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result,
  primary_cause,
  spray_suppressed as spray_blocked,
  compound_stress,
  tokens_used
FROM scan_logs
WHERE land_id LIKE 'TEST_%'
ORDER BY land_id;
