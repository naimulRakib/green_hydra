#!/bin/bash
# ============================================
# Demo Accuracy Test Automation Script
# ============================================

set -e

echo "=========================================="
echo "AGRO-SENTINEL ACCURACY TEST SUITE"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL environment variable not set${NC}"
  echo "Please set it in your .env.local file or export it"
  exit 1
fi

# Create results directory
mkdir -p test-results

echo -e "${YELLOW}Step 1: Setting up test farm profiles...${NC}"
psql "$DATABASE_URL" -f setup_controlled_tests.sql > test-results/setup_output.txt 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Test profiles created successfully${NC}"
else
  echo -e "${RED}✗ Failed to create test profiles${NC}"
  cat test-results/setup_output.txt
  exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Collecting database statistics...${NC}"

# Run each statistics query and save to separate files
echo "Running Query 1: Overall Statistics..."
psql "$DATABASE_URL" -t -A -F"," -c "
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
" > test-results/overall_stats.csv

echo -e "${GREEN}✓ Overall statistics saved${NC}"

echo "Running Query 3: Primary Cause Distribution..."
psql "$DATABASE_URL" -t -A -F"," -c "
SELECT
  primary_cause,
  COUNT(*) as count,
  ROUND(AVG(confidence_score)::numeric, 2) as avg_confidence
FROM scan_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND primary_cause IS NOT NULL
GROUP BY primary_cause
ORDER BY count DESC;
" > test-results/cause_distribution.csv

echo -e "${GREEN}✓ Cause distribution saved${NC}"

echo ""
echo -e "${YELLOW}Step 3: Test instruction summary${NC}"
echo ""
echo "Test profiles are ready. Now you need to:"
echo ""
echo "1. Open your app at http://localhost:3000/dashboard"
echo "2. For each test scenario, perform a scan:"
echo ""
echo "   TEST 1 - Pure Biotic (TEST_BIOTIC_001)"
echo "   → Upload a rice blast disease image"
echo "   → Expected: biotic primary, spray = YES"
echo ""
echo "   TEST 2 - Pure Abiotic (TEST_ABIOTIC_001)"
echo "   → Upload any leaf image (pollution context triggers)"
echo "   → Expected: abiotic primary, spray = NO"
echo ""
echo "   TEST 3 - Heavy Metal (TEST_METAL_001)"
echo "   → Upload leaf with chlorosis"
echo "   → Expected: metal score > 0.20"
echo ""
echo "   TEST 4 - Early Exit (TEST_EARLY_EXIT_001)"
echo "   → Upload any leaf image"
echo "   → Expected: LLM skipped (tokens = 0)"
echo ""
echo "   TEST 5 - Compound (TEST_COMPOUND_001)"
echo "   → Upload leaf with mixed symptoms"
echo "   → Expected: compound_stress = true"
echo ""
echo "3. After completing all 5 tests, run:"
echo "   ./run_demo_tests.sh validate"
echo ""

# If validate argument is passed, check results
if [ "$1" = "validate" ]; then
  echo ""
  echo -e "${YELLOW}Step 4: Validating test results...${NC}"
  echo ""

  psql "$DATABASE_URL" -c "
  SELECT
    land_id,
    CASE
      WHEN land_id = 'TEST_BIOTIC_001' THEN 'Expected: spray=YES, biotic primary'
      WHEN land_id = 'TEST_ABIOTIC_001' THEN 'Expected: spray=NO, abiotic primary'
      WHEN land_id = 'TEST_METAL_001' THEN 'Expected: metal_score > 0.20'
      WHEN land_id = 'TEST_EARLY_EXIT_001' THEN 'Expected: tokens=0, abiotic primary'
      WHEN land_id = 'TEST_COMPOUND_001' THEN 'Expected: compound_stress=true'
    END as expected_outcome,
    primary_cause as actual_primary,
    spray_suppressed as actual_spray_suppressed,
    ROUND(metal_score::numeric, 2) as actual_metal_score,
    tokens_used as actual_tokens,
    compound_stress as actual_compound,
    CASE
      WHEN land_id = 'TEST_BIOTIC_001' AND spray_suppressed = false AND primary_cause = 'biotic' THEN '✅ PASS'
      WHEN land_id = 'TEST_ABIOTIC_001' AND spray_suppressed = true AND primary_cause = 'abiotic' THEN '✅ PASS'
      WHEN land_id = 'TEST_METAL_001' AND metal_score > 0.20 THEN '✅ PASS'
      WHEN land_id = 'TEST_EARLY_EXIT_001' AND tokens_used = 0 AND primary_cause = 'abiotic' THEN '✅ PASS'
      WHEN land_id = 'TEST_COMPOUND_001' AND compound_stress = true THEN '✅ PASS'
      ELSE '❌ FAIL'
    END as result
  FROM scan_logs
  WHERE land_id LIKE 'TEST_%'
    AND created_at >= CURRENT_DATE - INTERVAL '1 day'
  ORDER BY land_id;
  " | tee test-results/validation_results.txt

  # Count passes
  PASS_COUNT=$(grep -c "✅ PASS" test-results/validation_results.txt || echo "0")
  TOTAL_COUNT=5

  echo ""
  echo "=========================================="
  echo -e "ACCURACY: ${PASS_COUNT}/${TOTAL_COUNT} = $((PASS_COUNT * 100 / TOTAL_COUNT))%"
  echo "=========================================="

  if [ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
  else
    echo -e "${YELLOW}Some tests failed. Review results above.${NC}"
  fi

  # Generate detailed report
  echo ""
  echo "Generating detailed decision trail for demo..."
  psql "$DATABASE_URL" -c "
  SELECT
    id as scan_id,
    land_id,
    ROUND(biotic_score::numeric, 2) as biotic,
    ROUND(abiotic_score::numeric, 2) as abiotic,
    ROUND(metal_score::numeric, 2) as metal,
    primary_cause,
    spray_suppressed,
    compound_stress,
    overrides_applied,
    tokens_used,
    ROUND(confidence_score::numeric, 2) as confidence
  FROM scan_logs
  WHERE land_id = 'TEST_ABIOTIC_001'
    AND created_at >= CURRENT_DATE - INTERVAL '1 day'
  ORDER BY created_at DESC
  LIMIT 1;
  " | tee test-results/decision_trail_example.txt

  echo ""
  echo -e "${GREEN}✓ Test results saved to test-results/ directory${NC}"
  echo ""
  echo "Files created:"
  echo "  - overall_stats.csv"
  echo "  - cause_distribution.csv"
  echo "  - validation_results.txt"
  echo "  - decision_trail_example.txt"
fi

echo ""
echo "=========================================="
echo "TEST SETUP COMPLETE"
echo "=========================================="
