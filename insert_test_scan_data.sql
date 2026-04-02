-- ============================================
-- Manually Insert Test Scan Data
-- Creates 5 realistic scan_logs entries for demo
-- ============================================

-- First, let's check what columns exist in scan_logs
-- Run this first to see the schema:
-- \d scan_logs

-- Clean up any previous test scans
DELETE FROM scan_logs WHERE land_id LIKE 'TEST_%';

-- ============================================
-- Test 1: Pure Biotic (Disease detected, spray recommended)
-- ============================================
INSERT INTO scan_logs (
  id,
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
  diagnosis_text,
  created_at
) VALUES (
  'SCN-TEST-BIOTIC-001',
  'TEST_BIOTIC_001',
  (SELECT id FROM auth.users LIMIT 1), -- Use first user
  'https://example.com/test-biotic.jpg',
  'rice',
  0.75, -- High biotic score
  0.15, -- Low abiotic score
  0.08, -- Low metal score
  'biotic',
  0.75,
  false, -- Spray NOT suppressed
  false, -- No compound stress
  '{}', -- No overrides
  1250, -- LLM was used
  'Rice blast disease detected. Fungal infection with characteristic lesion patterns. Spray recommended with approved fungicide.',
  NOW() - INTERVAL '10 minutes'
);

-- ============================================
-- Test 2: Pure Abiotic (High pollution, spray blocked)
-- ============================================
INSERT INTO scan_logs (
  id,
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
  diagnosis_text,
  created_at
) VALUES (
  'SCN-TEST-ABIOTIC-001',
  'TEST_ABIOTIC_001',
  (SELECT id FROM auth.users LIMIT 1),
  'https://example.com/test-abiotic.jpg',
  'rice',
  0.35, -- Low biotic score
  0.72, -- HIGH abiotic score (triggers override)
  0.12, -- Low metal score
  'abiotic',
  0.72,
  true, -- Spray IS suppressed (HARD OVERRIDE)
  false,
  ARRAY['ABIOTIC_OVERRIDE_score:0.72', 'SPRAY_SUPPRESSED_abiotic>=0.60'], -- Overrides applied!
  0, -- LLM was skipped (early exit)
  'High pollution stress detected from multiple sources: canal contamination, smoke exposure, and contaminated water. Pesticide spray will not help. Address pollution first.',
  NOW() - INTERVAL '8 minutes'
);

-- ============================================
-- Test 3: Heavy Metal Zone (Metal contamination flagged)
-- ============================================
INSERT INTO scan_logs (
  id,
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
  diagnosis_text,
  created_at
) VALUES (
  'SCN-TEST-METAL-001',
  'TEST_METAL_001',
  (SELECT id FROM auth.users LIMIT 1),
  'https://example.com/test-metal.jpg',
  'rice',
  0.28, -- Low biotic
  0.35, -- Moderate abiotic
  0.37, -- HIGH metal score (>0.20 threshold)
  'metal',
  0.58,
  false, -- Spray not suppressed (but warning issued)
  false,
  ARRAY['METAL_WARNING_score:0.37'], -- Metal warning override
  980,
  'Heavy metal contamination detected. Arsenic, iron, and chromium levels elevated. Soil testing strongly recommended. Symptoms may mimic disease but are toxicity-related.',
  NOW() - INTERVAL '6 minutes'
);

-- ============================================
-- Test 4: Early Exit (Extreme pollution, LLM bypassed)
-- ============================================
INSERT INTO scan_logs (
  id,
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
  diagnosis_text,
  created_at
) VALUES (
  'SCN-TEST-EARLY-EXIT-001',
  'TEST_EARLY_EXIT_001',
  (SELECT id FROM auth.users LIMIT 1),
  'https://example.com/test-early-exit.jpg',
  'rice',
  0.25, -- Low biotic
  0.85, -- VERY HIGH abiotic (extreme pollution)
  0.42, -- High metal too
  'abiotic',
  0.85,
  true, -- Spray suppressed
  false,
  ARRAY['ABIOTIC_OVERRIDE_score:0.85', 'SPRAY_SUPPRESSED_abiotic>=0.60', 'EARLY_EXIT_bypassed_LLM'],
  0, -- ZERO tokens (LLM bypassed completely)
  'Extreme pollution detected. Early exit triggered - AI analysis skipped. All pollution signals present. Immediate environmental intervention required.',
  NOW() - INTERVAL '4 minutes'
);

-- ============================================
-- Test 5: Compound Stress (Both biotic + abiotic detected)
-- ============================================
INSERT INTO scan_logs (
  id,
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
  diagnosis_text,
  created_at
) VALUES (
  'SCN-TEST-COMPOUND-001',
  'TEST_COMPOUND_001',
  (SELECT id FROM auth.users LIMIT 1),
  'https://example.com/test-compound.jpg',
  'rice',
  0.58, -- Moderate-high biotic
  0.52, -- Moderate-high abiotic (close to threshold)
  0.28, -- Moderate metal
  'biotic', -- Biotic slightly higher, but compound flagged
  0.58,
  false, -- Spray not suppressed (abiotic < 0.60)
  true, -- COMPOUND STRESS flagged!
  ARRAY['COMPOUND_STRESS_detected'], -- Compound override
  1450,
  'Complex stress pattern detected: fungal disease symptoms combined with pollution stress. Both biotic and abiotic factors present. Treat disease but also investigate water/soil contamination.',
  NOW() - INTERVAL '2 minutes'
);

-- Verify the inserts
SELECT
  land_id,
  ROUND(biotic_score::numeric, 2) as biotic,
  ROUND(abiotic_score::numeric, 2) as abiotic,
  ROUND(metal_score::numeric, 2) as metal,
  primary_cause,
  spray_suppressed,
  compound_stress,
  tokens_used,
  CASE
    WHEN land_id = 'TEST_BIOTIC_001' AND spray_suppressed = false AND primary_cause = 'biotic' THEN '✅ PASS'
    WHEN land_id = 'TEST_ABIOTIC_001' AND spray_suppressed = true AND primary_cause = 'abiotic' THEN '✅ PASS'
    WHEN land_id = 'TEST_METAL_001' AND metal_score > 0.20 THEN '✅ PASS'
    WHEN land_id = 'TEST_EARLY_EXIT_001' AND tokens_used = 0 AND primary_cause = 'abiotic' THEN '✅ PASS'
    WHEN land_id = 'TEST_COMPOUND_001' AND compound_stress = true THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as validation
FROM scan_logs
WHERE land_id LIKE 'TEST_%'
ORDER BY created_at DESC;
