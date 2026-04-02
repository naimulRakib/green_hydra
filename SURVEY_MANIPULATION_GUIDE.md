# 🧪 Survey Data Manipulation Guide for AI Testing

## Overview
These SQL scripts manipulate survey data to influence the AI diagnosis system and test how it distinguishes between **Biotic** (disease/pest) and **Abiotic** (pollution/environmental) stress.

---

## 📁 Files Created

1. **`insert_abiotic_survey_data.sql`** - Forces AI toward Abiotic diagnosis
2. **`insert_biotic_survey_data.sql`** - Forces AI toward Biotic diagnosis

---

## 🚀 How to Use

### Method 1: Using Supabase SQL Editor (Recommended)

1. Go to your Supabase Dashboard: https://mktxhuzpnurkxluoiggu.supabase.co
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of one of the SQL files
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Check the output for confirmation messages

### Method 2: Using psql Command Line

```bash
# Make sure you have PostgreSQL client installed
# Replace [YOUR-PASSWORD] with your actual database password

# For ABIOTIC stress test:
psql "postgresql://postgres:[YOUR-PASSWORD]@db.mktxhuzpnurkxluoiggu.supabase.co:5432/postgres" -f insert_abiotic_survey_data.sql

# For BIOTIC stress test:
psql "postgresql://postgres:[YOUR-PASSWORD]@db.mktxhuzpnurkxluoiggu.supabase.co:5432/postgres" -f insert_biotic_survey_data.sql
```

### Method 3: Quick One-Liner (No File Needed)

```bash
# ABIOTIC test
psql "postgresql://postgres:[YOUR-PASSWORD]@db.mktxhuzpnurkxluoiggu.supabase.co:5432/postgres" < insert_abiotic_survey_data.sql

# BIOTIC test
psql "postgresql://postgres:[YOUR-PASSWORD]@db.mktxhuzpnurkxluoiggu.supabase.co:5432/postgres" < insert_biotic_survey_data.sql
```

---

## 🎯 What Each Script Does

### 1️⃣ ABIOTIC Survey Data (`insert_abiotic_survey_data.sql`)

**Creates strong pollution/environmental signals:**

#### Key Indicators:
- **Water:** 💧
  - Color: `dark_brown` (severe contamination)
  - Odor: `chemical` (industrial pollution)
  - Deposits: `oily_film` (factory waste)
  - Fish kill: `yes_recent` **← CRITICAL SIGNAL**
  - Arsenic: `unsafe`

- **Smoke Exposure:** 🏭
  - Frequency: `daily`
  - Source: `factory_chimney`
  - Distance: `<500m` **← VERY CLOSE**

- **Canal:** 🌊
  - Pollution: `yes_untreated`
  - Distance: `<100m` **← VERY CLOSE**

- **Soil:** 🌱
  - Color: `gray_white` (chemical damage)
  - Drainage: `waterlogged`
  - Algae: `thick_green` (pollution bloom)
  - Roots: `black_rotting`

- **Environment:** 🌍
  - Neighbors: `whole_area` affected (suggests environmental, not disease)
  - Adjacent: `factory` nearby
  - Extreme weather: `heat_wave` (compound stress)

- **Pest Activity:** 🐛
  - Pests: `none`
  - Diseases: `none` **← Rules out biotic**

- **Damage Pattern:** 🍃
  - Yellowing: `uniform_pale` **← Uniform = Abiotic**

**Scan Context String Generated:**
```
Soil:clay,Drain:waterlogged,SoilColor:gray_white,Compact:very_hard,Algae:thick_green,Roots:black_rotting,YellowPattern:uniform_pale,Organic:never,Fert:urea_only,Lime:never,Mono:more_than_10,Yield:severe_decrease,PrevCrop:wheat,WaterSrc:canal_govt,WaterAvail:regular_shortage,WaterColor:dark_brown,WaterOdor:chemical,Deposits:oily_film,Taste:bitter,FishKill:yes_recent,Arsenic:unsafe,IrrigFreq:every_day,CropType:rice,Variety:brri_hybrid,Stage:tillering,Leaf:uniform_yellow,Stem:normal,Tillers:5_10,Height:stunted,Pests:none,Diseases:none,DamageLevel:none,DamageSpot:-,Beneficial:none,Pesticide:never,Weather:hot_humid,Smoke:daily,SmokeSrc:factory_chimney,SmokeDist:less_than_500m,CanalPoll:yes_untreated,CanalDist:less_than_100m,Neighbor:whole_area,NeighborSpray:no,Adjacent:factory,Extreme:heat_wave,pH_Risk:Acidic,Water_Risk:Chemical,Pest_Risk:Low,Env_Risk:Smoke_Heavy
```

**Expected AI Response:**
- ✅ Primary diagnosis: **Abiotic** (pollution)
- ✅ Detection scores: Abiotic 80-95%
- ✅ Remedy: Remove pollution source, test water, use clean irrigation
- ✅ Reasoning: "Daily factory smoke, chemical water contamination, fish kill"

---

### 2️⃣ BIOTIC Survey Data (`insert_biotic_survey_data.sql`)

**Creates strong disease/pest signals:**

#### Key Indicators:
- **Water:** 💧
  - Color: `clear` **← CLEAN**
  - Odor: `none`
  - Fish kill: `never` **← No pollution**
  - Arsenic: `safe`

- **Smoke Exposure:** 🏭
  - Frequency: `never` **← No pollution**

- **Canal:** 🌊
  - Pollution: `no` **← No pollution**

- **Soil:** 🌱
  - Type: `loam` (healthy)
  - Color: `dark_brown` (healthy)
  - Roots: `healthy_white`

- **Pest Activity:** 🐛
  - Pests: `stem_borer + leafhopper + aphid` **← MULTIPLE PESTS**
  - Diseases: `blast + blight` **← MULTIPLE DISEASES**
  - Damage: `severe`

- **Damage Pattern:** 🍃
  - Yellowing: `spots_patches` **← Spotted = Biotic**
  - Leaf: `brown_spots`
  - Stem: `soft_rotting`

- **Weather:** 🌦️
  - Condition: `rainy_foggy` **← Disease-favorable**

- **Environment:** 🌍
  - Neighbors: `whole_area` (epidemic spread)
  - Adjacent: `paddy_field` (not factory)

**Scan Context String Generated:**
```
Soil:loam,Drain:drains_6hrs,SoilColor:dark_brown,Compact:soft,Algae:none,Roots:healthy_white,YellowPattern:spots_patches,Organic:regular,Fert:balanced_npk,Lime:as_needed,Mono:3_5_years,Yield:stable,PrevCrop:wheat,WaterSrc:deep_tubewell,WaterAvail:always_available,WaterColor:clear,WaterOdor:none,Deposits:none,Taste:normal,FishKill:never,Arsenic:safe,IrrigFreq:every_2_3_days,CropType:rice,Variety:local_variety,Stage:flowering,Leaf:brown_spots,Stem:soft_rotting,Tillers:10_15,Height:normal,Pests:stem_borer+leafhopper+aphid,Diseases:blast+blight,DamageLevel:severe,DamageSpot:spots_patches,Beneficial:few,Pesticide:none,Weather:rainy_foggy,Smoke:never,SmokeSrc:-,SmokeDist:-,CanalPoll:no,CanalDist:-,Neighbor:whole_area,NeighborSpray:no,Adjacent:paddy_field,Extreme:none,pH_Risk:Normal,Water_Risk:Clear,Pest_Risk:High,Env_Risk:None
```

**Expected AI Response:**
- ✅ Primary diagnosis: **Biotic** (disease/pest)
- ✅ Detection scores: Biotic 85-98%
- ✅ Disease name: Rice Blast / Brown Spot / etc.
- ✅ Remedy: Fungicide application, remove infected plants
- ✅ Reasoning: "Spotted damage, high pest activity, rainy weather favorable for disease"

---

## 🧠 How the AI Uses This Data

When you scan a crop photo, the AI receives:

```
FARM CONTEXT (from farmer's weekly survey — use as ground truth):
Soil:loam,Drain:waterlogged,WaterColor:dark_brown,WaterOdor:chemical,FishKill:yes_recent,Smoke:daily,SmokeSrc:factory_chimney,...
```

The AI's expert models then analyze:

### 1️⃣ **Vision Expert** (analyzes the image)
- Looks for visual symptoms
- Detects crop type
- Identifies damage patterns

### 2️⃣ **Biotic Expert** (disease/pest analysis)
- Checks for disease-favorable weather (`rainy_foggy`)
- Looks for pest activity from survey
- Compares with RAG database of known diseases
- **Suppressed if pollution signals are strong**

### 3️⃣ **Abiotic Expert** (pollution analysis)
- Checks water contamination (`WaterColor`, `WaterOdor`, `FishKill`)
- Checks smoke exposure (`Smoke`, `SmokeSrc`, `SmokeDist`)
- Checks canal pollution (`CanalPoll`, `CanalDist`)
- Checks soil damage (`SoilColor`, `Algae`, `Roots`)
- **Strengthened if pollution signals present**

### 4️⃣ **Arbiter Model** (final decision)
- Weighs evidence from all experts
- Resolves contradictions
- Makes final diagnosis: `biotic` vs `abiotic` vs `heavy_metal`
- Detects compound stress (both present)

---

## 🎬 Testing Workflow

### Option A: Test ABIOTIC Diagnosis

1. Run `insert_abiotic_survey_data.sql`
2. Wait 5 seconds
3. Go to your app and scan **any crop photo**
4. Expected result: AI says **Abiotic stress** (pollution)

### Option B: Test BIOTIC Diagnosis

1. Run `insert_biotic_survey_data.sql`
2. Wait 5 seconds
3. Go to your app and scan **any crop photo with visible disease**
4. Expected result: AI says **Biotic stress** (disease/pest)

### Option C: Test Both (Switch Between)

```sql
-- First test abiotic
\i insert_abiotic_survey_data.sql
-- Scan photo → should say Abiotic

-- Then test biotic
\i insert_biotic_survey_data.sql
-- Scan photo → should say Biotic
```

---

## 📊 Verification

After running a script, verify the data was inserted:

```sql
-- Check farm profile
SELECT
  farmer_id,
  land_id,
  scan_context,
  water_risk,
  smoke_exposure,
  canal_contamination,
  fish_kill,
  pest_level,
  updated_at
FROM farm_profiles
ORDER BY updated_at DESC
LIMIT 1;

-- Check survey
SELECT
  farmer_id,
  land_id,
  week_number,
  year,
  soil_ph,
  water_risk,
  pest_level,
  env_stress,
  answers
FROM surveys
ORDER BY created_at DESC
LIMIT 1;
```

---

## 🛡️ Reset to Normal

If you want to remove the manipulated data:

```sql
-- Delete test survey
DELETE FROM surveys
WHERE farmer_id = (SELECT id FROM farmers LIMIT 1)
AND week_number = EXTRACT(WEEK FROM NOW())::INTEGER;

-- Reset farm profile
DELETE FROM farm_profiles
WHERE farmer_id = (SELECT id FROM farmers LIMIT 1);
```

Or simply run the opposite script (abiotic → biotic or vice versa).

---

## 🔬 Key Insight: Uniform vs Spotted Damage

The AI uses **damage pattern** as a critical signal:

- **Uniform yellowing** = Abiotic (pollution affects whole plant equally)
- **Spotted/patchy damage** = Biotic (disease spreads from infection points)

This is why:
- Abiotic script uses: `YellowPattern:uniform_pale`
- Biotic script uses: `YellowPattern:spots_patches`

---

## 🎯 Success Criteria

After scanning with manipulated data, you should see:

### For Abiotic Script:
```json
{
  "primary_diagnosis": "abiotic",
  "detection_scores": {
    "abiotic": { "percentage": 85 },
    "biotic": { "percentage": 10 }
  },
  "reasoning_bn": "কারখানার বিষাক্ত ধোঁয়া এবং দূষিত পানি...",
  "remedy_bn": "উৎস অপসারণ করুন, পরিষ্কার পানি ব্যবহার করুন..."
}
```

### For Biotic Script:
```json
{
  "primary_diagnosis": "biotic",
  "detection_scores": {
    "biotic": { "percentage": 92, "disease_name_bn": "ব্লাস্ট রোগ" },
    "abiotic": { "percentage": 5 }
  },
  "reasoning_bn": "পাতায় বাদামী দাগ, আর্দ্র আবহাওয়া...",
  "remedy_bn": "ছত্রাকনাশক প্রয়োগ করুন..."
}
```

---

## 📝 Notes

- Scripts use your **first farmer and land** in the database
- Survey data is stored **per week** (ISO week number)
- Running the same script twice will **UPDATE** the existing survey
- The AI receives the **full 45-field context string**
- Survey context is marked as **"ground truth"** for the AI

---

## 🎓 Educational Use

This is designed for:
- ✅ Testing AI accuracy
- ✅ Demonstrating how survey data influences diagnosis
- ✅ Creating controlled test cases
- ✅ Validating the multi-expert system

**Not for:**
- ❌ Production use
- ❌ Real farmer diagnosis (use real survey data)

---

## 🤝 Need Help?

If scripts fail, check:
1. Do you have at least one farmer in the database?
2. Do you have at least one land for that farmer?
3. Is the database connection working?
4. Run: `SELECT COUNT(*) FROM farmers;` and `SELECT COUNT(*) FROM lands;`

---

**Good luck testing! 🚀**
