#!/bin/bash
# ============================================
# ONE-STEP DEMO DATA SETUP
# Creates test farms + manually inserts scan data
# ============================================

echo "🚀 Setting up demo test data..."
echo ""

# Set DATABASE_URL from .env.local if not already set
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL=$(grep DATABASE_URL .env.local | cut -d '=' -f2-)
fi

# Validate DATABASE_URL
if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" == *"[YOUR-PASSWORD]"* ]]; then
  echo "❌ Error: DATABASE_URL not configured"
  echo ""
  echo "Update .env.local with your actual Supabase password:"
  echo "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.mktxhuzpnurkxluoiggu.supabase.co:5432/postgres"
  echo ""
  exit 1
fi

# Step 1: Create test farm profiles
echo "Step 1/2: Creating test farm profiles..."
psql "$DATABASE_URL" -f setup_controlled_tests.sql > /dev/null 2>&1
echo "✅ Test farms created (TEST_BIOTIC_001 through TEST_COMPOUND_001)"

# Step 2: Insert scan data
echo ""
echo "Step 2/2: Inserting test scan data..."
psql "$DATABASE_URL" -f insert_test_data_safe.sql 2>&1 | tail -25

echo ""
echo "=========================================="
echo "✅ DEMO DATA READY!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Generate presentation report: ./generate_presentation_report.sh"
echo "2. Get overall stats: psql \$DATABASE_URL < get_demo_statistics.sql"
echo "3. Check QUICK_REFERENCE.md for slide content"
