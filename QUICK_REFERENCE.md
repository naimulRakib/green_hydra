# 🎯 Quick Reference: Survey Data Manipulation

## 🚀 Quick Start (3 Steps)

### 1️⃣ Choose Your Test Scenario

**Option A: Test ABIOTIC (Pollution) Diagnosis**
```bash
# Go to Supabase SQL Editor and run:
insert_abiotic_survey_data.sql
```

**Option B: Test BIOTIC (Disease) Diagnosis**
```bash
# Go to Supabase SQL Editor and run:
insert_biotic_survey_data.sql
```

### 2️⃣ Verify Data Was Inserted
```bash
# Go to Supabase SQL Editor and run:
verify_current_survey_data.sql
```

### 3️⃣ Scan a Crop Photo
- Open your app
- Select the land
- Upload any crop photo
- Watch the AI diagnose based on your survey data!

---

## 📊 What Makes AI Choose Abiotic vs Biotic?

### 🏭 ABIOTIC Signals (Pollution)
| Signal | Value | Impact |
|--------|-------|--------|
| Water Color | dark_brown, black | STRONG |
| Water Odor | chemical, sewage | STRONG |
| Fish Kill | yes_recent | **CRITICAL** |
| Smoke | daily from factory_chimney | STRONG |
| Canal | yes_untreated + <100m | STRONG |
| Pest Activity | none | Rules out biotic |
| Damage Pattern | uniform_yellow | Abiotic signature |
| Neighbors | whole_area + pollution | Environmental |

### 🦠 BIOTIC Signals (Disease/Pest)
| Signal | Value | Impact |
|--------|-------|--------|
| Water Color | clear | Rules out pollution |
| Smoke | never | Rules out pollution |
| Fish Kill | never | Rules out pollution |
| Pests | stem_borer, leafhopper | STRONG |
| Diseases | blast, blight | STRONG |
| Damage Level | severe | STRONG |
| Damage Pattern | spots_patches | Biotic signature |
| Weather | rainy_foggy | Disease-favorable |
| Neighbors | whole_area + no pollution | Epidemic |

---

## 🎬 Quick Test Commands

### Supabase SQL Editor Method (Recommended)
1. Open: https://mktxhuzpnurkxluoiggu.supabase.co
2. Click **SQL Editor** → **New Query**
3. Copy-paste one of these files:
   - insert_abiotic_survey_data.sql → Forces Abiotic
   - insert_biotic_survey_data.sql → Forces Biotic
   - verify_current_survey_data.sql → Check current data
4. Click **Run**

---

## 🔍 Expected Results

### After Running ABIOTIC Script:
- Primary diagnosis: **abiotic** (pollution)
- Abiotic score: 85-95%
- Reasoning: "Factory smoke, chemical water, fish kill"
- Remedy: "Remove pollution source, use clean water"

### After Running BIOTIC Script:
- Primary diagnosis: **biotic** (disease/pest)
- Biotic score: 85-98%
- Disease name: Rice Blast / Brown Spot / etc.
- Remedy: "Apply fungicide, remove infected plants"

---

## 🔬 Key AI Decision Factors

### Pattern Recognition:
- **Uniform yellowing** → Abiotic (whole plant affected equally)
- **Spotted/patchy** → Biotic (infection spreads from points)

### Environmental Context:
- **Fish kill + chemical water** → Abiotic (pollution)
- **Clean water + high pest activity** → Biotic (disease/pest)

### Neighborhood Pattern:
- **Whole area + smoke/pollution** → Environmental (abiotic)
- **Whole area + clean environment** → Epidemic (biotic)

---

## 📝 Files Created

| File | Purpose |
|------|---------|
| insert_abiotic_survey_data.sql | Insert pollution survey data |
| insert_biotic_survey_data.sql | Insert disease survey data |
| verify_current_survey_data.sql | Check what data is loaded |
| SURVEY_MANIPULATION_GUIDE.md | Full documentation |
| QUICK_REFERENCE.md | This file! |

---

**Happy Testing! 🚀**

For full details, see SURVEY_MANIPULATION_GUIDE.md
