# AgroSentinel Database V2 Migration - Complete Checklist

## Status: ✅ database_redesign_v2.sql FIXED

All 6 bugs have been fixed in `database_redesign_v2.sql`:
- ✅ BUG 1: Fixed `pest_damage` → `pest_damage_level` with proper CASE logic
- ✅ BUG 2: Added `dark_brown`, `black` to water contamination check
- ✅ BUG 3: Fixed env_stress to use complete CASE statement with `sometimes`
- ✅ BUG 4: Added `sometimes` to smoke_exposure boolean check
- ✅ BUG 5: Fixed canal_pollution to include `yes_untreated`, `yes_treated`
- ✅ BUG 6: Fixed neighbor_problem to include `few_neighbors`, `many_neighbors`, `whole_area`

---

## Remaining Fixes Needed

### DELIVERABLE 2: route.ts Fixes

**File**: `app/api/diagnose/route.ts`

#### Required Changes:

**CHANGE 1** - Line ~711: Update table and column names
```typescript
// FIND:
supabase.from("farmer_land_profile")
  .select(`
    soil_ph_status, water_color_status, water_contamination_risk,
    recent_smoke_exposure, canal_contamination, neighbor_same_problem,
    pest_pressure, scan_context_string
  `)
  .eq("farmer_id", farmerId).eq("land_id", landId)
  .maybeSingle(),

// REPLACE WITH:
supabase.from("farm_profiles")
  .select(`
    soil_ph, water_color, water_risk,
    smoke_exposure, canal_contamination, neighbor_problem,
    pest_level, scan_context
  `)
  .eq("farmer_id", farmerId).eq("land_id", landId)
  .maybeSingle(),
```

**CHANGE 2** - Line ~852: Fix scan_context reference
```typescript
// FIND: profile?.scan_context_string
// REPLACE: profile?.scan_context
```

**CHANGE 3** - Line ~854: Fix scan_context check
```typescript
// FIND: !profile?.scan_context_string
// REPLACE: !profile?.scan_context
```

**CHANGE 4** - Line ~864: Update survey table name
```typescript
// FIND:
.from("survey_responses").select("id")
.eq("farmer_id", farmerId).eq("land_id", landId)
.eq("week_number", thisWeek).eq("year", thisYear)
.maybeSingle();

// REPLACE:
.from("surveys").select("id")
.eq("farmer_id", farmerId).eq("land_id", landId)
.eq("week_number", thisWeek).eq("year", thisYear)
.maybeSingle();
```

**CHANGE 5** - Line ~884: Fix context argument
```typescript
// FIND: profile?.scan_context_string ?? ""
// REPLACE: profile?.scan_context ?? ""
```

**CHANGE 6** - Lines ~1005-1010: Fix profile field names
```typescript
// FIND:
ph: profile.soil_ph_status,
water: profile.water_color_status,
smoke: profile.recent_smoke_exposure,
canal: profile.canal_contamination,
neighbor: profile.neighbor_same_problem,
pest: profile.pest_pressure,

// REPLACE:
ph: profile.soil_ph,
water: profile.water_color,
smoke: profile.smoke_exposure,
canal: profile.canal_contamination,
neighbor: profile.neighbor_problem,
pest: profile.pest_level,
```

**CHANGE 7** - Line ~829-833: Fix abiotic signal derivations
```typescript
// FIND:
const canalSignal = profile?.canal_contamination ? 0.15 : 0.00;
const spraySignal = neighborSprays.length > 0 ? 0.10 : 0.00;
const smokeSignal = profile?.recent_smoke_exposure ? 0.08 : 0.00;
const waterSignal = profile?.water_contamination_risk === "Industrial" ? 0.07 : 0.00;
const neighborSignal = profile?.neighbor_same_problem ? 0.05 : 0.00;

// REPLACE:
const canalSignal = profile?.canal_contamination ? 0.15 : 0.00;
const spraySignal = neighborSprays.length > 0 ? 0.10 : 0.00;
const smokeSignal = profile?.smoke_exposure ? 0.08 : 0.00;
const waterSignal = profile?.water_risk === "Chemical" || 
                    profile?.water_risk === "Contaminated" ? 0.07 : 0.00;
const neighborSignal = profile?.neighbor_problem ? 0.05 : 0.00;
```

**CHANGE 8** - Line ~1030: Fix resolveStressType call
```typescript
// FIND: profile?.water_color_status
// REPLACE: profile?.water_color
```

---

### DELIVERABLE 3: WeeklySurveyV2.tsx Fixes

**File**: `app/components/WeeklySurveyV2.tsx`

#### Required Changes:

**CHANGE 1** - Remove localStorage in handleAnswer
```typescript
// FIND AND REMOVE (2 occurrences):
if (selectedLand) {
  localStorage.setItem(`survey_${selectedLand}_${getISOWeek(new Date())}`, JSON.stringify(updated));
}
```

**CHANGE 2** - Remove localStorage read in useEffect
```typescript
// FIND AND REMOVE:
// Try to load answers from localStorage first
const storageKey = `survey_${selectedLand}_${getISOWeek(new Date())}`;
const stored = localStorage.getItem(storageKey);
if (stored) {
  try {
    setAnswers(JSON.parse(stored));
  } catch (e) {
    console.error("Failed to parse stored answers:", e);
  }
}
```

**CHANGE 3** - Remove localStorage clear in submitAnswers
```typescript
// FIND AND REMOVE:
// Clear localStorage after successful submission
const storageKey = `survey_${selectedLand}_${getISOWeek(new Date())}`;
localStorage.removeItem(storageKey);
```

**CHANGE 4** - Add loading state for questions
```typescript
// FIND:
const answeredCount = questions
  .filter(q => q.category === cat.key)
  .filter(q => answers[q.key] !== undefined).length;
const totalCount = questions.filter(q => q.category === cat.key).length;

// ADD AFTER:
const isLoading = totalCount === 0;

// IN JSX, REPLACE:
<span style={S.catCount}>{answeredCount}/{totalCount}</span>

// WITH:
<span style={S.catCount}>{isLoading ? "লোড হচ্ছে..." : `${answeredCount}/${totalCount}`}</span>
```

---

### DELIVERABLE 4: improved_risk_calculation.sql Fixes

#### Type 1: Remove Disease/Pest Components

**Remove these variable declarations:**
```sql
v_disease_scans INTEGER := 0;      -- Line 35
v_pest_scans INTEGER := 0;         -- Line 36
v_disease_risk INTEGER := 0;       -- Line 49
v_pest_risk_from_scans INTEGER := 0;  -- Line 50
```

**Remove entire SCAN LOGS ANALYSIS section (lines ~68-106):**
- The section that counts disease/pest scans
- v_disease_risk calculation block
- v_pest_risk_from_scans calculation block

**Update total_score calculation:**
```sql
-- REMOVE disease and pest from formula (lines ~273-283):
(v_disease_risk * 3) +             -- DELETE THIS LINE
(v_pest_risk_from_scans * 2)      -- DELETE THIS LINE

-- UPDATE divisor:
) / 18;  -- CHANGE TO: ) / 13;
```

**Remove from dominant threat detection (lines ~297-309):**
```sql
-- DELETE these lines:
ELSIF v_max_risk = v_disease_risk THEN v_dominant := 'Disease';
ELSIF v_max_risk = v_pest_risk_from_scans THEN v_dominant := 'Pest';
```

**Remove from RETURN statement indicators:**
```sql
-- DELETE these keys:
'disease_scans', v_disease_scans,
'pest_scans', v_pest_scans,
```

#### Type 2: Fix Column/Table Names

**Fix 1 - Land coordinates:**
```sql
-- FIND: v_coords := v_land.coordinates;
-- REPLACE: v_coords := v_land.boundary;
```

**Fix 2 - Satellite data columns:**
```sql
-- FIND:
AVG(turbidity_ntu), AVG(chlorophyll_ugl), grid_center::geography

-- REPLACE:
AVG(turbidity), AVG(chlorophyll), location::geography
```

**Fix 3 - Spray events table:**
```sql
-- FIND:
FROM community_spray_events cse JOIN farmer_lands fl ON cse.land_id = fl.land_id

-- REPLACE:
FROM spray_events se JOIN farmer_lands fl ON se.land_id = fl.land_id

-- Also replace all cse. → se.
```

**Fix 4 - Spray proximity join:**
```sql
-- FIND: ST_DWithin(fl.coordinates::geography, v_coords, ...)
-- REPLACE: ST_DWithin(ST_Centroid(fl.boundary)::geography, v_coords, ...)
```

**Fix 5 - farm_profiles table and columns:**
```sql
-- FIND: v_profile farmer_land_profile%ROWTYPE;
-- REPLACE: v_profile farm_profiles%ROWTYPE;

-- FIND: FROM farmer_land_profile
-- REPLACE: FROM farm_profiles

-- Column renames:
v_profile.water_color_status → v_profile.water_color
v_profile.soil_ph_status → v_profile.soil_ph
v_profile.recent_smoke_exposure → v_profile.smoke_exposure
v_profile.neighbor_same_problem → v_profile.neighbor_problem
v_profile.soil_organic_matter → v_profile.soil_organic
```

**Fix 6 - Component weights:**
```sql
-- After removing disease (×3) and pest (×2):
-- industrial×2 + water×3 + satellite×2 + community×2 + air×1 + soil×2 + weather×1 = 13

-- UPDATE the total score calculation divisor from 18 to 13
```

---

## Deployment Order (CRITICAL)

### ⚠️ WARNING: Wrong order = System crash!

1. **Run `database_redesign_v2.sql`** ✅ FIXED
   - Creates new tables: survey_questions, surveys, farm_profiles
   - Creates 4 RPC functions
   - **DO NOT drop old tables yet!**

2. **Run fixed `improved_risk_calculation.sql`**
   - Creates calculate_farm_risk_score_v2
   - Uses farm_profiles (not farmer_land_profile)

3. **Deploy updated `route.ts`**
   - Now reads from farm_profiles + surveys
   - Test endpoint works

4. **Deploy `WeeklySurveyV2.tsx`**
   - Test survey submission
   - Verify data persists without localStorage

5. **Test Complete Flow:**
   ```sql
   -- Run survey
   SELECT submit_survey('farmer_id', 'land_id', '{"crop_type": "rice_boro"}'::jsonb);
   
   -- Verify farm_profiles created
   SELECT * FROM farm_profiles WHERE land_id = 'YOUR_LAND_ID';
   
   -- Verify scan_context populated
   SELECT scan_context FROM farm_profiles WHERE land_id = 'YOUR_LAND_ID';
   
   -- Do scan
   -- Verify it reads context
   ```

6. **ONLY AFTER step 5 passes**, drop old tables:
   ```sql
   DROP TABLE IF EXISTS survey_responses CASCADE;
   DROP TABLE IF EXISTS farmer_land_profile CASCADE;
   DROP TABLE IF EXISTS diagnostic_questions CASCADE;
   DROP TABLE IF EXISTS survey_templates CASCADE;
   DROP TABLE IF EXISTS survey_inference_logs CASCADE;
   ```

---

## Summary

- ✅ **database_redesign_v2.sql** - All 6 bugs fixed and ready
- ⏳ **route.ts** - 8 changes needed (see above)
- ⏳ **WeeklySurveyV2.tsx** - 4 changes needed (remove localStorage + loading state)
- ⏳ **improved_risk_calculation.sql** - Remove disease/pest + fix 7 column/table names
- ⏳ **Deploy in order** - See deployment checklist above

**Next Steps:**
1. Apply route.ts fixes manually
2. Apply WeeklySurveyV2.tsx fixes manually
3. Apply improved_risk_calculation.sql fixes manually
4. Follow deployment order exactly
5. Test before dropping old tables
