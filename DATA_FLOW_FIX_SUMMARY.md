# Data Flow Mismatch - ROOT CAUSE & FIX

## 🔴 PROBLEM

You completed Survey 1 for 1 land, but dashboard shows 0.

## 🎯 ROOT CAUSE

**Survey writes to V2 tables, but Dashboard reads from V1 tables.**

### Data Flow Mismatch:

```
✅ SURVEY SUBMISSION FLOW (V2 - Working):
┌─────────────────────────────────────────────────────┐
│ User fills WeeklySurveyV2.tsx                      │
│         ↓                                           │
│ Calls submit_survey(farmer_id, land_id, answers)  │
│         ↓                                           │
│ RPC writes to:                                     │
│   • surveys table ✓                                │
│   • farm_profiles table ✓                          │
└─────────────────────────────────────────────────────┘

❌ DASHBOARD READ FLOW (V1 - Broken):
┌─────────────────────────────────────────────────────┐
│ Dashboard page.tsx renders                          │
│         ↓                                           │
│ Queries OLD tables:                                │
│   • survey_responses ✗ (should be surveys)         │
│   • farmer_land_profile ✗ (should be farm_profiles)│
│         ↓                                           │
│ Returns 0 results (old tables empty/don't exist)   │
└─────────────────────────────────────────────────────┘
```

---

## ✅ FIXES APPLIED

### Fix 1: `app/dashboard/page.tsx` (3 changes)

**Change 1 - Farm Profile Query:**
```typescript
// BEFORE (V1):
.from('farmer_land_profile')
.select('land_id, soil_ph_status, water_color_status, pest_pressure, recent_smoke_exposure, last_updated, scan_context_string')

// AFTER (V2):
.from('farm_profiles')
.select('land_id, soil_ph, water_color, pest_level, smoke_exposure, updated_at, scan_context')
```

**Change 2 - Profile Field Mapping:**
```typescript
// BEFORE (V1):
soil_ph: prof?.soil_ph_status ? phApprox[prof.soil_ph_status] ?? null : null,
soil_moisture: prof?.water_color_status ?? null,
pest_pressure: prof?.pest_pressure ?? null,
daysSince = prof?.last_updated

// AFTER (V2):
soil_ph: prof?.soil_ph ? phApprox[prof.soil_ph] ?? null : null,
soil_moisture: prof?.water_color ?? null,
pest_pressure: prof?.pest_level ?? null,
daysSince = prof?.updated_at
```

**Change 3 - Survey Completion Check:**
```typescript
// BEFORE (V1):
.from('survey_responses')
.select('land_id')

// AFTER (V2):
.from('surveys')
.select('land_id')
```

### Fix 2: `app/actions/heavyMetalActions.ts` (1 change)

**Change - pH Update:**
```typescript
// BEFORE (V1):
.from('farmer_land_profile')
.update({ soil_ph_status: 'acidic' })

// AFTER (V2):
.from('farm_profiles')
.update({ soil_ph: 'Acidic' })
```

---

## 📊 COLUMN NAME MAPPING REFERENCE

| Old Column (V1)          | New Column (V2)    | Usage                    |
|--------------------------|-------------------|--------------------------|
| `soil_ph_status`         | `soil_ph`         | Acidic/Normal/Alkaline   |
| `water_color_status`     | `water_color`     | Clear/Iron/Chemical      |
| `water_contamination_risk` | `water_risk`    | Risk level               |
| `recent_smoke_exposure`  | `smoke_exposure`  | Boolean                  |
| `neighbor_same_problem`  | `neighbor_problem`| Boolean                  |
| `pest_pressure`          | `pest_level`      | Low/Medium/High          |
| `scan_context_string`    | `scan_context`    | AI context text          |
| `last_updated`           | `updated_at`      | Timestamp                |

---

## 🧪 VERIFICATION STEPS

After deploying these fixes:

### 1. Check Survey Data Exists:
```sql
SELECT * FROM surveys 
WHERE farmer_id = 'your-farmer-id' 
ORDER BY submitted_at DESC LIMIT 5;

SELECT * FROM farm_profiles 
WHERE farmer_id = 'your-farmer-id';
```

### 2. Test Dashboard:
- Refresh dashboard
- Should now show survey count > 0
- Land cards should show profile data

### 3. Test Full Flow:
1. Submit a new survey
2. Refresh dashboard
3. Verify count increases
4. Check profile data updates

---

## 🔄 COMPLETE SYSTEM DATA FLOW (FIXED)

```
USER JOURNEY:
┌─────────────────────────────────────────────────────────────────┐
│ 1. User registers land → farmer_lands table                    │
│                                                                  │
│ 2. User submits weekly survey                                   │
│    → WeeklySurveyV2.tsx                                         │
│    → submit_survey() RPC                                        │
│    → Writes to surveys + farm_profiles ✓                        │
│                                                                  │
│ 3. Dashboard loads                                              │
│    → page.tsx queries farm_profiles ✓                           │
│    → page.tsx queries surveys ✓                                 │
│    → Shows correct count ✓                                      │
│                                                                  │
│ 4. User scans plant                                             │
│    → route.ts reads farm_profiles.scan_context ✓                │
│    → AI gets proper context ✓                                   │
│    → Diagnosis saves to scan_logs ✓                             │
│                                                                  │
│ 5. Risk calculation                                             │
│    → calculate_farm_risk_score_v2() reads farm_profiles ✓       │
│    → Returns risk breakdown ✓                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 FILES CHANGED

1. ✅ `app/dashboard/page.tsx` - 3 table/column updates
2. ✅ `app/actions/heavyMetalActions.ts` - 1 table/column update
3. ✅ `app/api/diagnose/route.ts` - Already fixed (8 changes)
4. ✅ `app/components/WeeklySurveyV2.tsx` - Already fixed (localStorage removed)
5. ✅ `database_redesign_v2.sql` - DROP TABLE statements removed
6. ✅ `improved_risk_calculation.sql` - All schema issues fixed

---

## 🚀 DEPLOYMENT CHECKLIST

- [x] Fix dashboard.page.tsx (JUST DONE)
- [x] Fix heavyMetalActions.ts (JUST DONE)
- [ ] Deploy to Vercel/production
- [ ] Test survey submission
- [ ] Verify dashboard shows correct count
- [ ] Test scan with context
- [ ] Verify risk calculation works

---

## ⚠️ IMPORTANT NOTES

1. **Do NOT run DROP TABLE statements yet** - Old tables are preserved in case of rollback
2. **Deploy all fixes together** - Partial deployment will cause more mismatches
3. **Test thoroughly** - Verify complete flow before dropping old tables
4. **Backup data** - Export old tables before final cleanup

---

## 🎯 EXPECTED RESULT

After deploying these fixes:

**BEFORE:**
- Survey submitted ✓
- Dashboard shows 0 ✗
- No profile data ✗
- Scans have no context ✗

**AFTER:**
- Survey submitted ✓
- Dashboard shows 1 ✓
- Profile data visible ✓
- Scans read context ✓
- Risk calculation works ✓

---

Generated: 2026-03-21
