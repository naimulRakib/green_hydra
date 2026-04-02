-- ============================================
-- Test #6: Real-World Survey Data with AI Diagnosis
-- Based on actual farmer survey showing compound stress
-- ============================================

-- Clean up previous
DELETE FROM scan_logs WHERE land_id = 'TEST_REAL_WORLD_001';

-- Get user
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  -- ============================================
  -- Compound Stress Case: Real Survey Data
  -- Water contamination + Ufra disease
  -- ============================================
  INSERT INTO scan_logs (
    land_id,
    user_id,
    image_url,
    detected_crop,

    -- Scores reflecting survey data
    biotic_score,      -- Moderate-high: ufra disease + yellow leaves + dead heart
    abiotic_score,     -- High: arsenic unsafe + yellow water + metallic + fish kill
    metal_score,       -- High: arsenic + iron indicators

    primary_cause,
    confidence_score,
    spray_suppressed,
    compound_stress,
    overrides_applied,
    tokens_used,

    -- Realistic AI diagnosis based on survey
    diagnosis_text,

    symptoms_detected,
    recommended_action

  ) VALUES (
    'TEST_REAL_WORLD_001',
    v_user_id,
    'https://example.com/wheat-yellowing-waterlogged.jpg',
    'wheat',

    -- Scores
    0.62,  -- Biotic: ufra (nematode disease) + dead heart + yellowing
    0.58,  -- Abiotic: high water contamination (just below override threshold)
    0.35,  -- Metal: arsenic unsafe + iron (yellow water + metallic odor)

    'biotic',  -- Biotic slightly higher, but compound flagged
    0.62,
    false,     -- Not suppressed (abiotic < 0.60), but warning issued
    true,      -- COMPOUND STRESS flagged
    ARRAY['COMPOUND_STRESS_detected', 'METAL_WARNING_arsenic:unsafe', 'WATERLOGGED_soil_factor'],
    1850,      -- LLM was used (complex analysis needed)

    -- AI Diagnosis (realistic, comprehensive)
    E'**COMPOUND STRESS DETECTED: Multiple Stressors Present**

🔬 **Primary Diagnosis: Ufra Disease (Nematode Infection)**
White-tipped nematode (Aphelenchoides besseyi) infestation detected. Classic symptoms observed:
- Dead heart in tillers (10-15 affected)
- Yellow discoloration on lower leaves (uniform pale pattern)
- Heading stage vulnerability (critical timing)
- Severe damage level at leaf edges

⚠️ **Critical Secondary Factor: Water Contamination**
Significant abiotic stress overlapping with disease:
- **Arsenic contamination: UNSAFE levels** (survey confirmed)
- Water quality issues: Yellow-orange color, metallic odor, very salty taste
- Recent fish kill event (indicator of acute toxicity)
- Canal pollution source within 100-500m proximity
- Waterlogged soil conditions (light brown, slightly hard, thick algae growth)

🧪 **Heavy Metal Indicators:**
- Arsenic risk: High (survey: unsafe levels)
- Iron contamination: Likely (yellow water + metallic odor + white calcium deposits)
- Metal score: 0.35 (above 0.20 threshold → warning triggered)

📊 **Environmental Context:**
- Soil: Loam texture, waterlogged drainage, light brown color
- Water source: Government canal (contamination: "sometimes")
- Irrigation: Every 2-3 days (frequent exposure to contaminated water)
- Neighbor impact: Whole area affected, recent pesticide spray this week
- Smoke exposure: Rare (crop burning 1-2km away, minimal impact)

🧬 **Why Both Issues Coexist:**
1. **Waterlogging creates perfect ufra conditions** (nematodes thrive in wet soil)
2. **Arsenic weakens plant immunity** → more susceptible to disease
3. **Iron toxicity mimics nutrient deficiency** → yellowing amplified
4. **Contaminated irrigation spreads both** nematodes AND toxins

⚠️ **DO NOT rely solely on pesticide spray** - addressing only the disease will not solve the problem.

✅ **RECOMMENDED ACTIONS (Priority Order):**

**IMMEDIATE (This Week):**
1. **Soil & Water Testing:**
   - Test irrigation water for arsenic, iron, salinity
   - Test soil for heavy metal accumulation
   - pH testing (risk assessment shows: pH normal, but verify)

2. **Disease Management:**
   - Apply carbofuran 3G or carbosulfan for nematode control
   - Seed treatment for future crops (hot water 53°C / 10min)
   - Remove severely affected tillers to prevent spread

3. **Water Source:**
   - **Avoid canal water immediately** if fish kill persists
   - Switch to tubewell or rainwater if available
   - If canal unavoidable: settle water 24h, test before use

**SHORT-TERM (2-4 Weeks):**
4. **Drainage Improvement:**
   - Install field drains to reduce waterlogging
   - Root health critical given contamination stress

5. **Soil Amendment:**
   - Add lime (you're using both types - good!)
   - Organic matter (vermicompost continues, increase量)
   - Phosphorus application (binds arsenic, reduces uptake)

6. **Monitoring:**
   - Track new yellowing patterns (separate disease vs toxicity)
   - Monitor fish in canal (early warning system)
   - Document plant response to treatments

**LONG-TERM (Next Season):**
7. **Crop Rotation:**
   - Rotate to arsenic-tolerant varieties
   - Avoid rice-wheat if arsenic persists (rice accumulates As)

8. **Water Infrastructure:**
   - Advocate for canal cleaning (government source)
   - Community testing program
   - Rainwater harvesting setup

🚫 **What NOT to Do:**
- Do NOT apply fungicide (this is nematode, not fungus)
- Do NOT over-irrigate (worsens both issues)
- Do NOT ignore water testing (critical for long-term)
- Do NOT assume spray alone will fix this

📱 **Follow-Up Required:**
Rescan in 10-14 days to assess:
- Disease progression after nematicide
- Plant response after water source change
- New symptom patterns (helps separate stressors)

💡 **Why This Matters:**
Your survey indicated whole area affected + recent neighbor spray. This suggests:
1. **Systemic contamination issue** (not just your field)
2. **Community-level response needed**
3. **Government canal source requires authority intervention**

**System confidence: 62%** (High biotic confidence, but abiotic overlap reduces certainty)

**Arsenic warning issued. Soil testing MANDATORY before next season planting.**',

    -- Detected symptoms (structured)
    E'Ufra nematode (dead heart, white-tip), Leaf yellowing (uniform pale, lower leaves), Waterlogged soil stress, Arsenic contamination indicators, Iron toxicity symptoms, Severe damage at leaf edges',

    -- Recommended action (Bengali)
    E'জরুরি: মাটি ও পানি পরীক্ষা করুন (আর্সেনিক)। নেমাটোড নিয়ন্ত্রণে কার্বোফুরান প্রয়োগ করুন। খাল থেকে সেচ বন্ধ রাখুন যদি মাছ মরা অব্যাহত থাকে। জলাবদ্ধতা কমাতে ড্রেনেজ উন্নত করুন। ১০-১৪ দিনে পুনরায় স্ক্যান করুন।'
  );

  RAISE NOTICE 'Test #6 inserted: Real-world survey data with compound stress';

END $$;

-- Verify the insert
SELECT
  land_id,
  detected_crop,
  ROUND(biotic_score::numeric, 2) as biotic,
  ROUND(abiotic_score::numeric, 2) as abiotic,
  ROUND(metal_score::numeric, 2) as metal,
  primary_cause,
  spray_suppressed,
  compound_stress,
  tokens_used,
  cardinality(overrides_applied) as num_overrides,
  LEFT(diagnosis_text, 100) || '...' as diagnosis_preview
FROM scan_logs
WHERE land_id = 'TEST_REAL_WORLD_001';

-- Show overrides applied
SELECT
  land_id,
  overrides_applied
FROM scan_logs
WHERE land_id = 'TEST_REAL_WORLD_001';
