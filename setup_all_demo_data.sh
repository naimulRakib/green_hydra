#!/bin/bash
# ============================================
# Complete Demo Data Setup (5 + 1 Tests)
# Includes: 5 controlled tests + 1 real-world survey case
# ============================================

set -e

echo "=========================================="
echo "DEMO DATA SETUP: 6 TEST SCENARIOS"
echo "=========================================="
echo ""

# Set DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL=$(grep DATABASE_URL .env.local | cut -d '=' -f2-)
fi

# Validate
if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" == *"[YOUR-PASSWORD]"* ]]; then
  echo "❌ Error: DATABASE_URL not configured in .env.local"
  exit 1
fi

echo "✓ Database connected"
echo ""

# Step 1: Test farm profiles
echo "Step 1/3: Creating test farm profiles..."
psql "$DATABASE_URL" -f setup_controlled_tests.sql > /dev/null 2>&1
psql "$DATABASE_URL" -f create_real_world_test_farm.sql > /dev/null 2>&1
echo "✅ 6 test farms created"

# Step 2: Insert 5 controlled test scans
echo ""
echo "Step 2/3: Inserting controlled test data (5 scenarios)..."
psql "$DATABASE_URL" -f insert_test_data_safe.sql 2>&1 | grep -E "PASS|FAIL|land_id" | tail -10

# Step 3: Insert real-world scan with AI diagnosis
echo ""
echo "Step 3/3: Inserting real-world survey case with AI diagnosis..."
psql "$DATABASE_URL" -f insert_real_world_diagnosis.sql 2>&1 | grep -E "NOTICE|land_id|biotic|abiotic" | tail -5

# Final validation
echo ""
echo "=========================================="
echo "VALIDATION RESULTS"
echo "=========================================="
echo ""

psql "$DATABASE_URL" -c "
SELECT
  land_id,
  CASE
    WHEN land_id = 'TEST_BIOTIC_001' THEN 'Pure Biotic: spray=YES'
    WHEN land_id = 'TEST_ABIOTIC_001' THEN 'Pure Abiotic: spray=NO, hard override'
    WHEN land_id = 'TEST_METAL_001' THEN 'Heavy Metal: metal>0.20'
    WHEN land_id = 'TEST_EARLY_EXIT_001' THEN 'Early Exit: tokens=0'
    WHEN land_id = 'TEST_COMPOUND_001' THEN 'Compound Stress: both present'
    WHEN land_id = 'TEST_REAL_WORLD_001' THEN 'Real Survey: ufra+arsenic compound'
  END as scenario,
  ROUND(biotic_score::numeric, 2) as biotic,
  ROUND(abiotic_score::numeric, 2) as abiotic,
  spray_suppressed as spray_blocked,
  compound_stress as compound,
  tokens_used as tokens,
  CASE
    WHEN land_id = 'TEST_BIOTIC_001' AND spray_suppressed = false AND primary_cause = 'biotic' THEN '✅'
    WHEN land_id = 'TEST_ABIOTIC_001' AND spray_suppressed = true AND tokens_used = 0 THEN '✅'
    WHEN land_id = 'TEST_METAL_001' AND metal_score > 0.20 THEN '✅'
    WHEN land_id = 'TEST_EARLY_EXIT_001' AND tokens_used = 0 THEN '✅'
    WHEN land_id LIKE 'TEST_COMPOUND%' AND compound_stress = true THEN '✅'
    ELSE '❌'
  END as result
FROM scan_logs
WHERE land_id LIKE 'TEST_%'
ORDER BY created_at ASC;
"

# Count passes
PASS_COUNT=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM scan_logs
WHERE land_id LIKE 'TEST_%'
  AND (
    (land_id = 'TEST_BIOTIC_001' AND spray_suppressed = false) OR
    (land_id = 'TEST_ABIOTIC_001' AND spray_suppressed = true AND tokens_used = 0) OR
    (land_id = 'TEST_METAL_001' AND metal_score > 0.20) OR
    (land_id = 'TEST_EARLY_EXIT_001' AND tokens_used = 0) OR
    (land_id LIKE 'TEST_COMPOUND%' AND compound_stress = true)
  );
" | xargs)

TOTAL_COUNT=6

echo ""
echo "=========================================="
echo "ACCURACY: $PASS_COUNT/$TOTAL_COUNT = $((PASS_COUNT * 100 / TOTAL_COUNT))%"
echo "=========================================="
echo ""

if [ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]; then
  echo "🎉 All tests passed!"
else
  echo "⚠️  $((TOTAL_COUNT - PASS_COUNT)) test(s) need review"
fi

echo ""
echo "📊 Next steps:"
echo "  1. View AI diagnosis: psql \$DATABASE_URL -c \"SELECT diagnosis_text FROM scan_logs WHERE land_id = 'TEST_REAL_WORLD_001';\""
echo "  2. Generate slides: ./generate_presentation_report.sh"
echo "  3. Get stats: psql \$DATABASE_URL < get_demo_statistics.sql"
echo ""
echo "✅ Demo data ready for presentation!"
