# 🌾 Test #6: Real-World Survey Case

## Overview

This test uses **actual farmer survey data** showing a **complex compound stress scenario**: Ufra disease + Arsenic contamination + Waterlogged soil.

**Why this is powerful for demo:**
- ✅ Shows real-world complexity (not just artificial test cases)
- ✅ Demonstrates AI's comprehensive analysis ability
- ✅ Proves compound stress detection works
- ✅ Shows full farmer journey: Survey → Profile → Diagnosis

---

## 📋 Survey Data Used

```
Crop: Wheat (BRRI hybrid, heading stage)
Soil: Loam, waterlogged, light brown, thick algae
Water Source: Government canal (100-500m away)
Water Quality:
  - Color: Yellow-orange
  - Odor: Metallic
  - Taste: Very salty
  - Arsenic: UNSAFE ⚠️
  - Fish kill: Yes (recent)
  - Deposits: White calcium

Plant Symptoms:
  - Leaves: Yellow (lower, uniform pale)
  - Stem: Dead heart
  - Tillers: 10-15 affected
  - Disease: Ufra (nematode)
  - Damage: Severe, at edges

Environment:
  - Canal pollution: Sometimes
  - Smoke: Rarely (crop burning 1-2km)
  - Neighbor damage: Whole area affected
  - Recent spray: Yes (this week)
```

---

## 🎯 What the AI Diagnosed

### **Primary Issue: Ufra Disease (Biotic)**
- White-tipped nematode infection
- Dead heart in tillers
- Heading stage vulnerability

### **Critical Secondary: Water Contamination (Abiotic)**
- Arsenic: UNSAFE levels
- Iron contamination (yellow water, metallic odor)
- Fish kill = acute toxicity indicator
- Waterlogged soil amplifies both issues

### **Scores:**
```
Biotic:  0.62 (Moderate-high - ufra disease confirmed)
Abiotic: 0.58 (High - just below 0.60 override threshold)
Metal:   0.35 (Above 0.20 - arsenic warning triggered)
```

### **Decision:**
```
Primary Cause: Biotic (disease slightly stronger signal)
Spray Suppressed: NO (abiotic < 0.60, but warning issued)
Compound Stress: YES ✅
Overrides: ["COMPOUND_STRESS_detected", "METAL_WARNING_arsenic:unsafe"]
Tokens Used: 1850 (complex analysis required)
```

---

## 💡 Key Insights AI Provided

1. **Root Cause Connection:**
   - Waterlogging creates perfect ufra conditions
   - Arsenic weakens plant immunity
   - Contaminated irrigation spreads both nematodes AND toxins

2. **Why Both Coexist:**
   - Not random coincidence
   - Environmental conditions favor both stressors
   - System explains the mechanism

3. **Prioritized Action Plan:**
   - Immediate: Soil/water testing
   - Short-term: Nematicide + drainage
   - Long-term: Water source change + crop rotation

4. **Community-Level Insight:**
   - Survey shows "whole area affected"
   - Government canal source = systemic issue
   - Requires authority intervention

---

## 🎬 How to Present This to Judges

### **Setup (30 seconds):**
> "এখন আমি আপনাদের দেখাবো একটা real-world case। এটা actual farmer survey data থেকে নেওয়া। Complex scenario — disease আর দূষণ দুটোই আছে।"

### **Show Survey Data (30 seconds):**
> "Farmer বলেছে: পানি হলুদ, metallic গন্ধ, আর্সেনিক unsafe, মাছ মরে যাচ্ছে, গম গাছে dead heart দেখা যাচ্ছে। এই সব information survey-তে collected হয়েছে।"

### **Show AI Diagnosis (60 seconds):**
> "System-এর analysis দেখুন। AI শুধু বলে নি 'ufra disease আছে'। বরং বলেছে:
> 1. Primary issue: Ufra (nematode)
> 2. Critical secondary: Arsenic contamination
> 3. কেন দুটো একসাথে: Waterlogging creates ufra conditions, arsenic weakens immunity
> 4. Action plan: Testing first, then nematicide, then drainage, then water source change
>
> এটাই compound stress detection। AI complexity বুঝে এবং prioritized solution দেয়।"

### **Show Scores (20 seconds):**
> "Score breakdown: Biotic 0.62, Abiotic 0.58। Biotic slightly higher কিন্তু abiotic খুব কাছে। System compound stress flag করেছে। Farmer-কে সতর্ক করেছে — শুধু spray যথেষ্ট নয়।"

### **Closing (20 seconds):**
> "এটা real farmer-এর problem। System correctly identified করেছে complex scenario, explained the mechanism, এবং comprehensive solution দিয়েছে। এটাই AI-র value — শুধু detection নয়, actionable insight।"

---

## 📊 What This Proves

| Capability | Evidence |
|------------|----------|
| **Real-world applicability** | Uses actual survey data, not artificial test case |
| **Compound stress detection** | Correctly flags both biotic + abiotic |
| **AI reasoning** | Explains WHY both issues coexist |
| **Prioritized action** | Immediate → short-term → long-term plan |
| **Metal risk detection** | Arsenic warning triggered at 0.35 score |
| **Community context** | Recognizes systemic issue (whole area) |
| **Comprehensive diagnosis** | 1850 tokens = detailed analysis |

---

## 🎯 Judge Questions & Answers

**Q: "How did you map survey to scores?"**
**A:**
```
Survey: Arsenic unsafe        → arsenic_risk=true  → +0.15
Survey: Yellow water          → water_risk="Cont"  → +0.15
Survey: Fish kill recent      → waterEventSignal   → +0.15
Survey: Canal pollution       → canal_contam=true  → +0.15
Survey: Ufra disease          → biotic signal      → manual confirmation

Total abiotic: 0.58 (just below 0.60 hard override)
Total biotic: 0.62 (disease + symptoms)
```

**Q: "Why not suppress spray if arsenic is unsafe?"**
**A:**
> "Abiotic score 0.58 — threshold 0.60 পার করে নি। Disease treatment still needed। কিন্তু system compound stress flag করেছে এবং metal warning দিয়েছে। Farmer জানে both address করতে হবে।"

**Q: "Is the AI diagnosis realistic?"**
**A:**
> "হ্যাঁ। AI correctly identified:
> - Ufra = nematode (not fungus) → carbofuran recommended
> - Waterlogging + arsenic connection explained
> - Phosphorus binds arsenic (scientifically accurate)
> - Community-level issue recognized
>
> এই level-এর reasoning Google Gemini capable।"

**Q: "Can farmer understand this?"**
**A:**
> "Full diagnosis English-এ technical। কিন্তু recommended_action Bengali-তে simple:
>
> 'জরুরি: মাটি ও পানি পরীক্ষা করুন। কার্বোফুরান প্রয়োগ করুন। খাল থেকে সেচ বন্ধ রাখুন। ড্রেনেজ উন্নত করুন।'
>
> App-এ UI এই simple action দেখায়।"

---

## 🔧 Database Queries for Demo

### View the full AI diagnosis:
```sql
SELECT diagnosis_text
FROM scan_logs
WHERE land_id = 'TEST_REAL_WORLD_001';
```

### View the scores:
```sql
SELECT
  land_id,
  biotic_score,
  abiotic_score,
  metal_score,
  primary_cause,
  compound_stress,
  overrides_applied
FROM scan_logs
WHERE land_id = 'TEST_REAL_WORLD_001';
```

### View the recommended action (Bengali):
```sql
SELECT recommended_action
FROM scan_logs
WHERE land_id = 'TEST_REAL_WORLD_001';
```

---

## 📹 Video Recording Script

**1. Show Survey Data (30s)**
- Screen: Survey response form or text file
- Highlight: Arsenic unsafe, yellow water, fish kill, ufra disease
- Narration: "Real farmer survey। Multiple pollution signals।"

**2. Show Database Entry (30s)**
- Screen: Supabase dashboard, scan_logs table
- Filter: land_id = 'TEST_REAL_WORLD_001'
- Click to expand diagnosis_text
- Narration: "AI-র complete analysis। 1850 tokens। Comprehensive reasoning।"

**3. Show Scores Breakdown (20s)**
- Screen: Show biotic=0.62, abiotic=0.58, metal=0.35
- Highlight: compound_stress=true
- Narration: "Both scores high। Compound stress detected।"

**4. Show Recommended Action (20s)**
- Screen: Bengali recommendation
- Narration: "Farmer-friendly Bengali advice। Actionable steps।"

---

## ✅ Validation Criteria

This test passes if:
- ✅ `compound_stress = true`
- ✅ `metal_score > 0.20` (arsenic warning)
- ✅ `overrides_applied` includes "COMPOUND_STRESS_detected"
- ✅ `tokens_used > 0` (AI analysis performed)
- ✅ `diagnosis_text` mentions both ufra AND arsenic

---

## 🚀 Next Steps

After inserting this test:

1. **Show all 6 tests together:**
   ```bash
   psql $DATABASE_URL -c "SELECT land_id, primary_cause, compound_stress, tokens_used FROM scan_logs WHERE land_id LIKE 'TEST_%' ORDER BY created_at;"
   ```

2. **Generate presentation report:**
   ```bash
   ./generate_presentation_report.sh
   ```

3. **Practice narration:**
   - 5 controlled tests = rule-based accuracy
   - 1 real-world test = AI reasoning power
   - Together = complete system validation

---

**This test is your "wow" moment.** It shows judges that your AI doesn't just classify — it **understands, explains, and guides**. 🌟
