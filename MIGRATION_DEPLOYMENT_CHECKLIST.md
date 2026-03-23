# AgroSentinel Database V2 Migration - Deployment Checklist

## ⚠️ CRITICAL: Follow this order exactly. DO NOT skip steps.

---

## Step 1: Deploy Database Schema (V2 Tables + RPCs)

**Action:** Run `database_redesign_v2.sql` in Supabase SQL Editor

**What it does:**
- Drops old functions (submit_weekly_survey, get_latest_land_profile, etc.)
- Creates new tables:
  - `survey_questions` (static, 45 research-level questions)
  - `surveys` (one row per farmer-land-week)
  - `farm_profiles` (accumulated state per land)
- Seeds all 45 survey questions across 5 categories
- Creates 4 new RPC functions:
  - `submit_survey(p_farmer_id, p_land_id, p_answers)`
  - `get_farm_profile(p_farmer_id, p_land_id)`
  - `get_survey_questions()`
  - `check_survey_status(p_farmer_id, p_land_id, p_week_number, p_year)`

**Verify:**
```sql
-- Check tables exist
SELECT COUNT(*) FROM survey_questions; -- Should return 45
SELECT * FROM farm_profiles LIMIT 1;
SELECT * FROM surveys LIMIT 1;

-- Check functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('submit_survey', 'get_farm_profile', 'get_survey_questions', 'check_survey_status');
```

**Status:** [ ] Complete

---

## Step 2: Deploy Risk Calculation Function

**Action:** Run `improved_risk_calculation.sql` in Supabase SQL Editor

**What it does:**
- Creates `calculate_farm_risk_score_v2(p_land_id)` function
- Uses correct table/column names:
  - `farm_profiles` (not farmer_land_profile)
  - `spray_events` (not community_spray_events)
  - `satellite_water_data` with correct columns (turbidity, chlorophyll, location)
  - `farmer_lands.boundary` (not coordinates)
- Removes disease/pest components from environmental risk
- Calculates environmental risk from 7 components (weighted /13)

**Verify:**
```sql
-- Check function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'calculate_farm_risk_score_v2';

-- Test with a land_id
SELECT calculate_farm_risk_score_v2('your-land-id-here');
```

**Status:** [ ] Complete

---

## Step 3: Deploy Backend API (route.ts)

**Action:** Deploy updated `app/api/diagnose/route.ts` to Vercel/server

**What changed:**
- Reads from `farm_profiles` table (not farmer_land_profile)
- Reads from `surveys` table (not survey_responses)
- Uses new column names:
  - `scan_context` (not scan_context_string)
  - `soil_ph`, `water_color`, `water_risk`
  - `smoke_exposure`, `neighbor_problem`, `pest_level`
- Updated abiotic signal derivation for water_risk check

**Verify:**
- Backend build succeeds
- No TypeScript errors
- Environment variables still valid (SUPABASE_URL, SUPABASE_ANON_KEY, etc.)

**Status:** [ ] Complete

---

## Step 4: Deploy Frontend Survey Component

**Action:** Replace WeeklySurvey.tsx with WeeklySurveyV2.tsx in your codebase

**What changed:**
- Removed all `localStorage` usage (3 occurrences)
- Now uses React state only
- Calls new RPCs:
  - `get_survey_questions()` to fetch questions
  - `submit_survey()` to save answers
  - `check_survey_status()` to check completion
  - `get_farm_profile()` to fetch profile
- Shows "লোড হচ্ছে..." when questions are loading

**Verify:**
- Frontend build succeeds
- Survey page loads without errors
- Category cards show loading state initially

**Status:** [ ] Complete

---

## Step 5: End-to-End Testing (CRITICAL - Do NOT skip)

**Test Flow:**

1. **Submit a survey:**
   - Go to Survey page
   - Select a land
   - Answer questions in at least 3 categories
   - Submit

2. **Verify `farm_profiles` created:**
   ```sql
   SELECT * FROM farm_profiles WHERE land_id = 'your-land-id';
   -- Check that scan_context is populated (not "Unknown")
   ```

3. **Verify `surveys` record created:**
   ```sql
   SELECT * FROM surveys WHERE land_id = 'your-land-id' 
   ORDER BY submitted_at DESC LIMIT 1;
   ```

4. **Do a plant scan:**
   - Take a photo of a plant
   - Submit scan
   - Verify it reads `scan_context` from farm_profiles
   - Check scan completes successfully

5. **Calculate risk score:**
   ```sql
   SELECT calculate_farm_risk_score_v2('your-land-id');
   -- Should return a valid JSONB result with risk components
   ```

**Status:** [ ] Complete

---

## Step 6: Drop Old Tables (ONLY after Step 5 passes)

⚠️ **WARNING:** This deletes data. Only run after confirming Step 5 works completely.

**Action:** Run these DROP statements in Supabase SQL Editor:

```sql
-- Drop old tables
DROP TABLE IF EXISTS survey_responses CASCADE;
DROP TABLE IF EXISTS farmer_land_profile CASCADE;
DROP TABLE IF EXISTS diagnostic_questions CASCADE;
DROP TABLE IF EXISTS survey_templates CASCADE;
DROP TABLE IF EXISTS survey_inference_logs CASCADE;

-- Verify they're gone
SELECT tablename FROM pg_tables 
WHERE tablename IN ('survey_responses', 'farmer_land_profile', 'diagnostic_questions', 'survey_templates', 'survey_inference_logs');
-- Should return 0 rows
```

**Status:** [ ] Complete

---

## Rollback Plan (If something fails)

If Step 5 fails and you need to rollback:

1. **DO NOT run Step 6** (old tables still exist)
2. Revert backend deployment (rollback route.ts)
3. Revert frontend deployment (use old WeeklySurvey.tsx)
4. Old system should still work with old tables
5. Debug the issue before retrying

---

## Post-Migration Monitoring

After successful migration, monitor:

- Survey submission success rate
- `scan_context` population (should not be "Unknown")
- Scan success rate (no survey gate blocks)
- Risk score calculation errors
- Any Supabase errors in logs

---

## Key Changes Summary

### Table Migrations:
- `farmer_land_profile` → `farm_profiles`
- `survey_responses` → `surveys`
- Multiple tables → `survey_questions`

### Column Renames:
- `scan_context_string` → `scan_context`
- `soil_ph_status` → `soil_ph`
- `water_color_status` → `water_color`
- `water_contamination_risk` → `water_risk`
- `recent_smoke_exposure` → `smoke_exposure`
- `neighbor_same_problem` → `neighbor_problem`
- `pest_pressure` → `pest_level`

### Conceptual Changes:
- Environmental risk NO LONGER includes disease/pest data
- Disease/pest belong in separate `farm_health_score` system
- Satellite water data and spray proximity ARE valid for environmental risk
- Survey data now stored as flexible JSONB (no FK constraints)

---

## Success Criteria

✅ All 6 steps completed in order  
✅ End-to-end test passed (Step 5)  
✅ Old tables dropped (Step 6)  
✅ No errors in Supabase logs  
✅ Survey submissions working  
✅ Scans reading context correctly  
✅ Risk scores calculating properly  

---

## Migration Date: _______________
## Completed By: _______________
