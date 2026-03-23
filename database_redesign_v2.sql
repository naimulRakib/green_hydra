-- ============================================================================
-- AgroSentinel Database V2 - Clean Redesign
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP OLD SURVEY TABLES (careful - this deletes data!)
-- ============================================================================

-- Drop old functions first
DROP FUNCTION IF EXISTS submit_weekly_survey(UUID, UUID, VARCHAR, JSONB);
DROP FUNCTION IF EXISTS submit_weekly_survey(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS submit_weekly_survey CASCADE;
DROP FUNCTION IF EXISTS get_latest_land_profile(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_latest_land_profile CASCADE;
DROP FUNCTION IF EXISTS calculate_farm_risk_score(UUID) CASCADE;
DROP FUNCTION IF EXISTS calculate_farm_risk_score CASCADE;

-- NOTE: Old tables are dropped in Step 6 of the deployment checklist.
-- Do NOT drop them here. Old tables must stay alive until
-- route.ts and WeeklySurveyV2.tsx are deployed and tested.

-- ============================================================================
-- STEP 2: CREATE NEW CLEAN TABLES
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────
-- 2.1 SURVEY QUESTIONS (static, seeded once)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key VARCHAR(50) UNIQUE NOT NULL,  -- e.g., 'soil_texture', 'water_color'
  category VARCHAR(20) NOT NULL,             -- 'soil', 'water', 'pest', 'crop', 'environment'
  question_bn TEXT NOT NULL,
  question_en TEXT,
  input_type VARCHAR(20) DEFAULT 'single',   -- 'single', 'multi', 'number', 'text'
  options JSONB,                             -- [{value, label_bn, label_en}]
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sq_category ON survey_questions(category);
CREATE INDEX IF NOT EXISTS idx_sq_active ON survey_questions(is_active);

-- ───────────────────────────────────────────────────────────────────
-- 2.2 SURVEY SUBMISSIONS (one row per farmer-land-week)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  land_id UUID NOT NULL REFERENCES farmer_lands(land_id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- All answers stored as JSONB (flexible, no FK issues)
  answers JSONB NOT NULL DEFAULT '{}',
  
  -- Computed/derived values (updated on save)
  soil_ph_risk VARCHAR(20) DEFAULT 'Normal',      -- Normal, Acidic, Alkaline
  water_risk VARCHAR(20) DEFAULT 'Clear',         -- Clear, Iron, Chemical, Contaminated
  pest_level VARCHAR(10) DEFAULT 'Low',           -- Low, Medium, High
  env_stress VARCHAR(30) DEFAULT 'None',          -- None, Heat, Cold, Smoke, SO2
  
  -- Metadata
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One survey per land per week (can update)
  CONSTRAINT surveys_unique UNIQUE (farmer_id, land_id, week_number, year)
);

CREATE INDEX IF NOT EXISTS idx_surveys_farmer ON surveys(farmer_id);
CREATE INDEX IF NOT EXISTS idx_surveys_land ON surveys(land_id);
CREATE INDEX IF NOT EXISTS idx_surveys_week ON surveys(year, week_number);

-- ───────────────────────────────────────────────────────────────────
-- 2.3 FARM PROFILE (accumulated state per land)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farm_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  land_id UUID NOT NULL REFERENCES farmer_lands(land_id) ON DELETE CASCADE,
  
  -- Soil
  soil_texture VARCHAR(30),           -- clay, loam, sandy_loam, sandy
  soil_drainage VARCHAR(30),          -- drains_fast, drains_6hrs, drains_1day, waterlogged
  soil_ph VARCHAR(20) DEFAULT 'Normal',
  soil_organic VARCHAR(20),           -- low, medium, high
  soil_compaction VARCHAR(30),        -- normal, slightly_hard, hard_cracked
  
  -- Water
  water_source VARCHAR(30),           -- deep_tubewell, shallow_tubewell, canal, pond, rain
  water_color VARCHAR(30),            -- clear, yellow_orange, rust_red, green, black
  water_odor VARCHAR(30),             -- none, metallic, rotten_egg, chemical
  water_risk VARCHAR(20) DEFAULT 'Clear',
  
  -- Crop
  crop_stage VARCHAR(30),             -- seedling, tillering, panicle, flowering, grain, mature
  fertilizer_pattern VARCHAR(30),     -- none, urea_only, balanced, organic
  monoculture_years VARCHAR(20),      -- less_3, 3_5_years, 5_10_years, more_than_10
  yield_trend VARCHAR(20),            -- increasing, same, decreasing
  
  -- Pest & Environment
  pest_level VARCHAR(10) DEFAULT 'Low',
  pests_seen TEXT[],                  -- array of pest keys
  weekly_weather VARCHAR(30),
  smoke_exposure BOOLEAN DEFAULT FALSE,
  canal_contamination BOOLEAN DEFAULT FALSE,
  neighbor_problem BOOLEAN DEFAULT FALSE,
  
  -- Zone-level risks (from kb_zones)
  arsenic_risk BOOLEAN DEFAULT FALSE,
  iron_risk BOOLEAN DEFAULT FALSE,
  fish_kill BOOLEAN DEFAULT FALSE,
  
  -- Scan context for AI
  scan_context TEXT,
  
  -- Timestamps
  last_survey_week INTEGER,
  last_survey_year INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT farm_profiles_unique UNIQUE (farmer_id, land_id)
);

CREATE INDEX IF NOT EXISTS idx_fp_farmer ON farm_profiles(farmer_id);
CREATE INDEX IF NOT EXISTS idx_fp_land ON farm_profiles(land_id);

-- ============================================================================
-- STEP 3: SEED SURVEY QUESTIONS
-- ============================================================================

INSERT INTO survey_questions (question_key, category, question_bn, question_en, input_type, options, display_order) VALUES

-- ═══════════════════════════════════════════════════════════════════════════
-- SOIL QUESTIONS (Research-Level Detail)
-- ═══════════════════════════════════════════════════════════════════════════

('soil_texture', 'soil', 'মাটির ধরন কী?', 'What is the soil type?', 'single', 
 '[{"value":"clay","label_bn":"এঁটেল (ভারী, আঠালো)"},{"value":"clay_loam","label_bn":"এঁটেল দোআঁশ"},{"value":"loam","label_bn":"দোআঁশ (মাঝারি)"},{"value":"sandy_loam","label_bn":"বেলে দোআঁশ"},{"value":"sandy","label_bn":"বেলে (হালকা)"},{"value":"silty","label_bn":"পলিমাটি"}]', 1),

('soil_drainage', 'soil', 'বৃষ্টির পর পানি কতক্ষণে নামে?', 'How fast does water drain after rain?', 'single',
 '[{"value":"drains_fast","label_bn":"১-২ ঘন্টায় নামে"},{"value":"drains_6hrs","label_bn":"৬ ঘন্টার মধ্যে নামে"},{"value":"drains_1day","label_bn":"১ দিনে নামে"},{"value":"waterlogged","label_bn":"দিনের পরও জমে থাকে"}]', 2),

('soil_color', 'soil', 'মাটির উপরিভাগের রঙ কেমন?', 'What color is the topsoil?', 'single',
 '[{"value":"dark_brown","label_bn":"গাঢ় বাদামী (স্বাভাবিক)"},{"value":"light_brown","label_bn":"হালকা বাদামী"},{"value":"gray_white","label_bn":"ধূসর/সাদাটে দাগ (লবণাক্ত)"},{"value":"white_patches","label_bn":"সাদা পট্টি (এসিডিক)"},{"value":"red_yellow","label_bn":"লাল/হলুদ দাগ (আয়রন)"},{"value":"black","label_bn":"কালো/গাঢ় (জৈব পদার্থ)"}]', 3),

('soil_compaction', 'soil', 'মাটির ঘনত্ব/শক্ততা কেমন?', 'Soil compaction level?', 'single',
 '[{"value":"soft_crumbly","label_bn":"নরম ও ঝুরঝুরে"},{"value":"normal","label_bn":"স্বাভাবিক"},{"value":"slightly_hard","label_bn":"একটু শক্ত"},{"value":"hard_cracked","label_bn":"অনেক শক্ত/ফাটা"}]', 4),

('algae_on_soil', 'soil', 'মাটিতে শ্যাওলা/সবুজ আস্তরণ দেখা যায়?', 'Algae or green layer on soil?', 'single',
 '[{"value":"none","label_bn":"না"},{"value":"thin_green","label_bn":"পাতলা সবুজ"},{"value":"thick_green","label_bn":"মোটা সবুজ আস্তরণ (এসিডিক)"},{"value":"brown_crust","label_bn":"বাদামী খোসা"}]', 5),

('root_appearance', 'soil', 'গাছের শিকড় কেমন দেখায়?', 'How do plant roots look?', 'single',
 '[{"value":"white_healthy","label_bn":"সাদা ও সুস্থ"},{"value":"light_brown","label_bn":"হালকা বাদামী"},{"value":"brown_soft","label_bn":"বাদামী ও নরম (পচা)"},{"value":"black_rotten","label_bn":"কালো ও পচা"}]', 6),

('yellowing_pattern', 'soil', 'পাতা হলুদ হলে কোথা থেকে শুরু হয়?', 'If leaves yellow, where does it start?', 'single',
 '[{"value":"none","label_bn":"হলুদ হয় না"},{"value":"older_leaves","label_bn":"নিচের/পুরাতন পাতা (N অভাব)"},{"value":"newer_leaves","label_bn":"উপরের/নতুন পাতা (Fe/Mn অভাব)"},{"value":"interveinal_yellow","label_bn":"শিরার মাঝে হলুদ (Mg/Fe অভাব)"},{"value":"tip_burn","label_bn":"পাতার আগা পোড়া (K অভাব/লবণ)"},{"value":"uniform_pale","label_bn":"সব পাতা ফ্যাকাশে (S অভাব)"}]', 7),

('organic_input', 'soil', 'জৈব সার ব্যবহার করেন?', 'Do you use organic fertilizer?', 'single',
 '[{"value":"regular_compost","label_bn":"নিয়মিত কম্পোস্ট"},{"value":"regular_manure","label_bn":"নিয়মিত গোবর"},{"value":"vermicompost","label_bn":"কেঁচো সার"},{"value":"green_manure","label_bn":"সবুজ সার (ধইঞ্চা)"},{"value":"sometimes","label_bn":"মাঝে মাঝে"},{"value":"never","label_bn":"কখনো না"}]', 8),

('fertilizer_pattern', 'soil', 'রাসায়নিক সার কীভাবে দেন?', 'How do you apply chemical fertilizer?', 'single',
 '[{"value":"urea_only","label_bn":"শুধু ইউরিয়া"},{"value":"urea_tsp","label_bn":"ইউরিয়া + TSP"},{"value":"balanced_npk","label_bn":"সুষম NPK"},{"value":"excess_urea","label_bn":"বেশি ইউরিয়া দেই"},{"value":"soil_test_based","label_bn":"মাটি পরীক্ষা অনুযায়ী"},{"value":"none","label_bn":"রাসায়নিক সার দেই না"}]', 9),

('lime_gypsum_use', 'soil', 'চুন/জিপসাম ব্যবহার করেন?', 'Do you use lime/gypsum?', 'single',
 '[{"value":"never","label_bn":"কখনো না"},{"value":"lime_sometimes","label_bn":"মাঝে মাঝে চুন"},{"value":"lime_regular","label_bn":"নিয়মিত চুন"},{"value":"gypsum","label_bn":"জিপসাম ব্যবহার করি"},{"value":"both","label_bn":"দুটোই"}]', 10),

('monoculture_years', 'soil', 'কত বছর ধরে একই ফসল করছেন?', 'How many years of monoculture?', 'single',
 '[{"value":"rotate_yearly","label_bn":"প্রতি বছর বদলাই"},{"value":"less_3","label_bn":"১-৩ বছর"},{"value":"3_5_years","label_bn":"৩-৫ বছর"},{"value":"5_10_years","label_bn":"৫-১০ বছর"},{"value":"more_than_10","label_bn":"১০ বছরের বেশি"}]', 11),

('yield_trend', 'soil', 'গত কয়েক বছরে ফলন কেমন?', 'Yield trend in recent years?', 'single',
 '[{"value":"increasing","label_bn":"বাড়ছে"},{"value":"same","label_bn":"একই আছে"},{"value":"slightly_decreasing","label_bn":"একটু কমছে"},{"value":"decreasing","label_bn":"অনেক কমছে"}]', 12),

('previous_crop', 'soil', 'এর আগে কী ফসল ছিল?', 'What was the previous crop?', 'single',
 '[{"value":"rice_aman","label_bn":"আমন ধান"},{"value":"rice_boro","label_bn":"বোরো ধান"},{"value":"rice_aus","label_bn":"আউশ ধান"},{"value":"wheat","label_bn":"গম"},{"value":"vegetables","label_bn":"সবজি"},{"value":"pulses","label_bn":"ডাল"},{"value":"jute","label_bn":"পাট"},{"value":"fallow","label_bn":"পতিত ছিল"}]', 13),

-- ═══════════════════════════════════════════════════════════════════════════
-- WATER QUESTIONS (Research-Level Detail)
-- ═══════════════════════════════════════════════════════════════════════════

('water_source', 'water', 'সেচের পানির প্রধান উৎস কী?', 'Main irrigation source?', 'single',
 '[{"value":"deep_tubewell","label_bn":"গভীর নলকূপ (>১৫০ ফুট)"},{"value":"shallow_tubewell","label_bn":"অগভীর নলকূপ (<১৫০ ফুট)"},{"value":"submersible","label_bn":"সাবমার্সিবল পাম্প"},{"value":"canal_govt","label_bn":"সরকারি খাল"},{"value":"canal_private","label_bn":"ব্যক্তিগত খাল"},{"value":"river","label_bn":"নদী"},{"value":"pond","label_bn":"পুকুর"},{"value":"rain_only","label_bn":"শুধু বৃষ্টি"}]', 20),

('water_availability', 'water', 'সেচের পানি কতটুকু পাওয়া যায়?', 'Water availability?', 'single',
 '[{"value":"abundant","label_bn":"প্রচুর (সারা বছর)"},{"value":"adequate","label_bn":"পর্যাপ্ত"},{"value":"seasonal_shortage","label_bn":"মৌসুমে অভাব"},{"value":"regular_shortage","label_bn":"নিয়মিত অভাব"},{"value":"severe_shortage","label_bn":"তীব্র অভাব"}]', 21),

('water_color', 'water', 'পানির রঙ কেমন দেখায়?', 'What color is the water?', 'single',
 '[{"value":"clear","label_bn":"স্বচ্ছ/পরিষ্কার"},{"value":"slightly_turbid","label_bn":"একটু ঘোলা"},{"value":"yellow_orange","label_bn":"হলুদ/কমলা (আয়রন)"},{"value":"rust_red","label_bn":"মরিচা/লাল রঙ"},{"value":"green_algae","label_bn":"সবুজাভ (শ্যাওলা)"},{"value":"dark_brown","label_bn":"গাঢ় বাদামী"},{"value":"black","label_bn":"কালো (দূষিত)"}]', 22),

('water_odor', 'water', 'পানিতে কোনো গন্ধ আছে?', 'Does water have any odor?', 'single',
 '[{"value":"none","label_bn":"না, স্বাভাবিক"},{"value":"earthy","label_bn":"মাটির গন্ধ"},{"value":"metallic","label_bn":"ধাতব/লোহার গন্ধ"},{"value":"rotten_egg","label_bn":"পচা ডিমের গন্ধ (সালফার)"},{"value":"chemical","label_bn":"রাসায়নিক গন্ধ"},{"value":"sewage","label_bn":"পয়ঃনিষ্কাশনের গন্ধ"}]', 23),

('water_deposits', 'water', 'পানিতে তলানি/আস্তরণ দেখা যায়?', 'Any deposits in water?', 'single',
 '[{"value":"none","label_bn":"না"},{"value":"rust_deposit","label_bn":"মরিচা রঙের তলানি"},{"value":"white_calcium","label_bn":"সাদা তলানি (ক্যালসিয়াম)"},{"value":"oily_film","label_bn":"তেলতেলে আস্তরণ"},{"value":"foam","label_bn":"ফেনা (সাবান/ডিটারজেন্ট)"}]', 24),

('water_taste', 'water', 'পানির স্বাদ কেমন?', 'How does water taste?', 'single',
 '[{"value":"normal","label_bn":"স্বাভাবিক"},{"value":"slightly_salty","label_bn":"একটু নোনতা"},{"value":"very_salty","label_bn":"অনেক নোনতা"},{"value":"metallic","label_bn":"ধাতব স্বাদ"},{"value":"bitter","label_bn":"তেতো"}]', 25),

('fish_kill', 'water', 'আশেপাশে মাছ মরার ঘটনা আছে?', 'Any fish kills nearby?', 'single',
 '[{"value":"no","label_bn":"না"},{"value":"yes_once","label_bn":"একবার হয়েছে"},{"value":"yes_recent","label_bn":"সম্প্রতি হয়েছে"},{"value":"yes_frequent","label_bn":"প্রায়ই হয়"}]', 26),

('arsenic_test', 'water', 'পানিতে আর্সেনিক পরীক্ষা করেছেন?', 'Have you tested for arsenic?', 'single',
 '[{"value":"not_tested","label_bn":"পরীক্ষা করিনি"},{"value":"safe","label_bn":"নিরাপদ (সবুজ)"},{"value":"unsafe","label_bn":"অনিরাপদ (লাল)"},{"value":"borderline","label_bn":"সীমারেখায় (হলুদ)"}]', 27),

('irrigation_frequency', 'water', 'কতদিন পর পর সেচ দেন?', 'How often do you irrigate?', 'single',
 '[{"value":"daily","label_bn":"প্রতিদিন"},{"value":"every_2_3_days","label_bn":"২-৩ দিন পর পর"},{"value":"weekly","label_bn":"সপ্তাহে একবার"},{"value":"as_needed","label_bn":"প্রয়োজনমতো"},{"value":"rain_dependent","label_bn":"বৃষ্টির উপর নির্ভর"}]', 28),

-- ═══════════════════════════════════════════════════════════════════════════
-- CROP QUESTIONS (Research-Level Detail)
-- ═══════════════════════════════════════════════════════════════════════════

('crop_type', 'crop', 'এখন কোন ফসল আছে?', 'Current crop?', 'single',
 '[{"value":"rice_boro","label_bn":"বোরো ধান"},{"value":"rice_aman","label_bn":"আমন ধান"},{"value":"rice_aus","label_bn":"আউশ ধান"},{"value":"wheat","label_bn":"গম"},{"value":"maize","label_bn":"ভুট্টা"},{"value":"vegetables","label_bn":"সবজি"},{"value":"pulses","label_bn":"ডাল"},{"value":"oilseeds","label_bn":"তৈলবীজ"},{"value":"jute","label_bn":"পাট"},{"value":"sugarcane","label_bn":"আখ"}]', 30),

('crop_variety', 'crop', 'ধানের জাত কী?', 'Rice variety?', 'single',
 '[{"value":"brri_28","label_bn":"ব্রি ধান ২৮"},{"value":"brri_29","label_bn":"ব্রি ধান ২৯"},{"value":"brri_50","label_bn":"ব্রি ধান ৫০"},{"value":"brri_hybrid","label_bn":"ব্রি হাইব্রিড"},{"value":"local","label_bn":"স্থানীয় জাত"},{"value":"other_hyt","label_bn":"অন্য HYV"},{"value":"other","label_bn":"অন্যান্য"}]', 31),

('crop_stage', 'crop', 'ফসলের বর্তমান অবস্থা কী?', 'Current crop growth stage?', 'single',
 '[{"value":"seedbed","label_bn":"বীজতলায় চারা"},{"value":"transplanting","label_bn":"রোপণ করা হচ্ছে"},{"value":"seedling","label_bn":"চারা (১-২ সপ্তাহ)"},{"value":"tillering","label_bn":"কুশি গজানো"},{"value":"max_tillering","label_bn":"সর্বোচ্চ কুশি"},{"value":"panicle_initiation","label_bn":"থোড় আসা শুরু"},{"value":"booting","label_bn":"বুটিং"},{"value":"heading","label_bn":"শীষ বের হওয়া"},{"value":"flowering","label_bn":"ফুল ফোটা"},{"value":"grain_filling","label_bn":"দানা ভরা"},{"value":"mature","label_bn":"পাকা/কাটার সময়"}]', 32),

('leaf_condition', 'crop', 'পাতার অবস্থা কেমন?', 'Leaf condition?', 'single',
 '[{"value":"healthy_green","label_bn":"গাঢ় সবুজ ও সতেজ"},{"value":"light_green","label_bn":"হালকা সবুজ"},{"value":"yellow_tips","label_bn":"আগা হলুদ"},{"value":"yellow_lower","label_bn":"নিচের পাতা হলুদ"},{"value":"brown_spots","label_bn":"বাদামী দাগ"},{"value":"brown_tips","label_bn":"আগা বাদামী/পোড়া"},{"value":"rolling","label_bn":"পাতা গুটিয়ে যাওয়া"},{"value":"wilting","label_bn":"ঝিমিয়ে পড়া"}]', 33),

('stem_condition', 'crop', 'কাণ্ডের অবস্থা কেমন?', 'Stem condition?', 'single',
 '[{"value":"healthy","label_bn":"সবুজ ও শক্ত"},{"value":"thin_weak","label_bn":"পাতলা ও দুর্বল"},{"value":"lodging","label_bn":"হেলে পড়ছে"},{"value":"dead_heart","label_bn":"ডেড হার্ট (মাঝখান মরা)"},{"value":"white_head","label_bn":"সাদা শীষ"}]', 34),

('tiller_count', 'crop', 'প্রতি গাছে কুশি কতটি?', 'Tillers per plant?', 'single',
 '[{"value":"less_5","label_bn":"৫টির কম"},{"value":"5_10","label_bn":"৫-১০টি"},{"value":"10_15","label_bn":"১০-১৫টি"},{"value":"15_20","label_bn":"১৫-২০টি"},{"value":"more_20","label_bn":"২০টির বেশি"}]', 35),

('plant_height', 'crop', 'গাছের উচ্চতা কেমন?', 'Plant height compared to normal?', 'single',
 '[{"value":"normal","label_bn":"স্বাভাবিক"},{"value":"shorter","label_bn":"খাটো"},{"value":"much_shorter","label_bn":"অনেক খাটো"},{"value":"taller","label_bn":"লম্বা"},{"value":"uneven","label_bn":"অসমান"}]', 36),

-- ═══════════════════════════════════════════════════════════════════════════
-- PEST & DISEASE QUESTIONS (Research-Level Detail)
-- ═══════════════════════════════════════════════════════════════════════════

('pests_seen', 'pest', 'কোন পোকা দেখেছেন? (একাধিক নির্বাচন করুন)', 'Which pests have you seen?', 'multi',
 '[{"value":"stem_borer","label_bn":"মাজরা পোকা"},{"value":"bph","label_bn":"বাদামী ফড়িং (BPH)"},{"value":"wbph","label_bn":"সাদা পিঠ ফড়িং"},{"value":"gall_midge","label_bn":"গলমাছি"},{"value":"leaf_folder","label_bn":"পাতা মোড়ানো পোকা"},{"value":"rice_hispa","label_bn":"পাতা মাছি"},{"value":"rice_bug","label_bn":"গান্ধী পোকা"},{"value":"green_leafhopper","label_bn":"সবুজ ফড়িং"},{"value":"army_worm","label_bn":"সেনা পোকা"},{"value":"cut_worm","label_bn":"কাটুই পোকা"},{"value":"rat","label_bn":"ইঁদুর"},{"value":"snail","label_bn":"শামুক"},{"value":"crab","label_bn":"কাঁকড়া"},{"value":"none","label_bn":"কিছু দেখিনি"}]', 40),

('diseases_seen', 'pest', 'কোন রোগ দেখেছেন? (একাধিক নির্বাচন করুন)', 'Which diseases have you seen?', 'multi',
 '[{"value":"blast","label_bn":"ব্লাস্ট (পাতা/গলা)"},{"value":"sheath_blight","label_bn":"খোল পচা"},{"value":"brown_spot","label_bn":"বাদামী দাগ"},{"value":"bacterial_blight","label_bn":"পাতা পোড়া (BLB)"},{"value":"tungro","label_bn":"টুংরো"},{"value":"false_smut","label_bn":"ফলস স্মাট"},{"value":"sheath_rot","label_bn":"শীথ রট"},{"value":"ufra","label_bn":"উফরা"},{"value":"none","label_bn":"কোনো রোগ নেই"}]', 41),

('pest_damage_level', 'pest', 'পোকা/রোগের ক্ষতি কতটুকু?', 'Pest/disease damage level?', 'single',
 '[{"value":"none","label_bn":"নেই (০%)"},{"value":"trace","label_bn":"সামান্য (<৫%)"},{"value":"light","label_bn":"হালকা (৫-১৫%)"},{"value":"moderate","label_bn":"মাঝারি (১৫-৩০%)"},{"value":"severe","label_bn":"তীব্র (>৩০%)"}]', 42),

('pest_hotspot', 'pest', 'ক্ষতি কোথায় বেশি?', 'Where is damage concentrated?', 'single',
 '[{"value":"uniform","label_bn":"সব জায়গায় সমান"},{"value":"patches","label_bn":"জায়গায় জায়গায়"},{"value":"edges","label_bn":"জমির কিনারায়"},{"value":"low_areas","label_bn":"নিচু জায়গায়"},{"value":"near_water","label_bn":"পানির কাছে"}]', 43),

('beneficial_insects', 'pest', 'উপকারী পোকা দেখেছেন?', 'Have you seen beneficial insects?', 'single',
 '[{"value":"spider","label_bn":"মাকড়সা"},{"value":"dragonfly","label_bn":"ফড়িং"},{"value":"ladybug","label_bn":"লেডিবাগ"},{"value":"multiple","label_bn":"একাধিক"},{"value":"none","label_bn":"দেখিনি"}]', 44),

('pesticide_used', 'pest', 'এই সপ্তাহে কীটনাশক দিয়েছেন?', 'Did you apply pesticide this week?', 'single',
 '[{"value":"no","label_bn":"না"},{"value":"insecticide","label_bn":"পোকার ওষুধ"},{"value":"fungicide","label_bn":"ছত্রাকনাশক"},{"value":"herbicide","label_bn":"আগাছানাশক"},{"value":"multiple","label_bn":"একাধিক"}]', 45),

('weekly_weather', 'pest', 'এই সপ্তাহে আবহাওয়া কেমন ছিল?', 'Weather this week?', 'single',
 '[{"value":"sunny_hot","label_bn":"রোদ ও গরম (>৩৫°)"},{"value":"sunny_mild","label_bn":"রোদ ও মাঝারি"},{"value":"hot_humid","label_bn":"গরম ও ভ্যাপসা"},{"value":"cloudy","label_bn":"মেঘলা"},{"value":"light_rain","label_bn":"হালকা বৃষ্টি"},{"value":"heavy_rain","label_bn":"ভারী বৃষ্টি"},{"value":"flood","label_bn":"বন্যা/জলাবদ্ধতা"},{"value":"cold_foggy","label_bn":"ঠান্ডা/কুয়াশা"},{"value":"stormy","label_bn":"ঝড়ো"}]', 46),

-- ═══════════════════════════════════════════════════════════════════════════
-- ENVIRONMENT QUESTIONS (Research-Level Detail)
-- ═══════════════════════════════════════════════════════════════════════════

('smoke_exposure', 'environment', 'ইটভাটা/কারখানার ধোঁয়া আসে?', 'Industrial smoke exposure?', 'single',
 '[{"value":"none","label_bn":"না, আসে না"},{"value":"rarely","label_bn":"কদাচিৎ"},{"value":"sometimes","label_bn":"মাঝে মাঝে (সপ্তাহে ১-২ দিন)"},{"value":"often","label_bn":"প্রায়ই (সপ্তাহে ৩-৫ দিন)"},{"value":"daily","label_bn":"প্রতিদিন"}]', 50),

('smoke_source', 'environment', 'ধোঁয়ার উৎস কী?', 'Source of smoke?', 'multi',
 '[{"value":"brick_kiln","label_bn":"ইটভাটা"},{"value":"factory","label_bn":"কারখানা"},{"value":"vehicle","label_bn":"যানবাহন"},{"value":"crop_burning","label_bn":"ফসলের খড় পোড়ানো"},{"value":"unknown","label_bn":"জানি না"},{"value":"none","label_bn":"ধোঁয়া আসে না"}]', 51),

('smoke_distance', 'environment', 'ধোঁয়ার উৎস কত দূরে?', 'Distance to smoke source?', 'single',
 '[{"value":"less_500m","label_bn":"৫০০ মিটারের কম"},{"value":"500m_1km","label_bn":"৫০০মি - ১ কিমি"},{"value":"1_2km","label_bn":"১-২ কিমি"},{"value":"2_5km","label_bn":"২-৫ কিমি"},{"value":"more_5km","label_bn":"৫ কিমির বেশি"},{"value":"not_applicable","label_bn":"প্রযোজ্য নয়"}]', 52),

('canal_pollution', 'environment', 'কাছের খাল/নদীতে কারখানার বর্জ্য পড়ে?', 'Factory waste in nearby water?', 'single',
 '[{"value":"no","label_bn":"না"},{"value":"sometimes","label_bn":"মাঝে মাঝে"},{"value":"yes_untreated","label_bn":"হ্যাঁ, অপরিশোধিত"},{"value":"yes_treated","label_bn":"হ্যাঁ, পরিশোধিত"}]', 53),

('canal_distance', 'environment', 'দূষিত খাল/নদী কত দূরে?', 'Distance to polluted water?', 'single',
 '[{"value":"adjacent","label_bn":"জমি সংলগ্ন"},{"value":"less_100m","label_bn":"১০০ মিটারের কম"},{"value":"100_500m","label_bn":"১০০-৫০০ মিটার"},{"value":"more_500m","label_bn":"৫০০ মিটারের বেশি"},{"value":"not_applicable","label_bn":"প্রযোজ্য নয়"}]', 54),

('neighbor_problem', 'environment', 'প্রতিবেশী কৃষকদেরও একই সমস্যা?', 'Do neighbors have same problem?', 'single',
 '[{"value":"only_me","label_bn":"শুধু আমার"},{"value":"few_neighbors","label_bn":"কয়েকজনের"},{"value":"many_neighbors","label_bn":"অনেকের"},{"value":"whole_area","label_bn":"পুরো এলাকায়"}]', 55),

('neighbor_spray', 'environment', 'প্রতিবেশী সম্প্রতি কীটনাশক স্প্রে করেছে?', 'Did neighbors spray pesticide recently?', 'single',
 '[{"value":"no","label_bn":"না"},{"value":"yes_today","label_bn":"আজ করেছে"},{"value":"yes_this_week","label_bn":"এই সপ্তাহে"},{"value":"unknown","label_bn":"জানি না"}]', 56),

('land_nearby', 'environment', 'জমির পাশে কী আছে?', 'What is adjacent to your land?', 'multi',
 '[{"value":"other_farm","label_bn":"অন্য কৃষকের জমি"},{"value":"canal","label_bn":"খাল/নদী"},{"value":"road","label_bn":"রাস্তা"},{"value":"factory","label_bn":"কারখানা"},{"value":"brick_kiln","label_bn":"ইটভাটা"},{"value":"pond","label_bn":"পুকুর"},{"value":"house","label_bn":"বাসাবাড়ি"}]', 57),

('extreme_event', 'environment', 'এই মৌসুমে কোনো প্রাকৃতিক দুর্যোগ হয়েছে?', 'Any extreme events this season?', 'multi',
 '[{"value":"flood","label_bn":"বন্যা"},{"value":"drought","label_bn":"খরা"},{"value":"hailstorm","label_bn":"শিলাবৃষ্টি"},{"value":"cyclone","label_bn":"ঘূর্ণিঝড়"},{"value":"cold_wave","label_bn":"শীতলহর"},{"value":"heat_wave","label_bn":"তাপপ্রবাহ"},{"value":"none","label_bn":"কিছু হয়নি"}]', 58)

ON CONFLICT (question_key) DO UPDATE SET
  question_bn = EXCLUDED.question_bn,
  options = EXCLUDED.options,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- STEP 4: CREATE RPC FUNCTIONS
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────
-- 4.1 SUBMIT SURVEY
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_survey(
  p_farmer_id UUID,
  p_land_id UUID,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_week INTEGER;
  v_year INTEGER;
  v_survey_id UUID;
  
  -- Derived values
  v_soil_ph VARCHAR(20) := 'Normal';
  v_water_risk VARCHAR(20) := 'Clear';
  v_pest_level VARCHAR(10) := 'Low';
  v_env_stress VARCHAR(30) := 'None';
  v_context TEXT;
BEGIN
  v_week := EXTRACT(WEEK FROM NOW())::INTEGER;
  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  -- ─────────────────────────────────────────────────────────────────
  -- Derive risk indicators from answers
  -- ─────────────────────────────────────────────────────────────────
  
  -- Soil pH risk
  IF p_answers->>'soil_color' IN ('gray_white') THEN
    v_soil_ph := 'Acidic';
  ELSIF p_answers->>'organic_input' = 'never' AND p_answers->>'fertilizer_pattern' = 'urea_only' THEN
    v_soil_ph := 'Acidic';
  END IF;

  -- Water risk
  IF p_answers->>'water_color' IN ('rust_red', 'yellow_orange') OR p_answers->>'water_odor' = 'metallic' THEN
    v_water_risk := 'Iron';
  ELSIF p_answers->>'water_color' IN ('dark_brown', 'black') OR p_answers->>'water_odor' IN ('rotten_egg', 'sewage') THEN
    v_water_risk := 'Contaminated';
  ELSIF p_answers->>'water_odor' = 'chemical' OR p_answers->>'water_deposits' IN ('oily_film', 'foam') THEN
    v_water_risk := 'Chemical';
  END IF;

  -- Pest level
  IF p_answers->>'pest_damage_level' IN ('moderate', 'severe') THEN
    v_pest_level := CASE p_answers->>'pest_damage_level'
      WHEN 'severe' THEN 'High'
      WHEN 'moderate' THEN 'Medium'
      ELSE 'Low'
    END;
  ELSIF p_answers->'pests_seen' IS NOT NULL THEN
    IF jsonb_array_length(COALESCE(p_answers->'pests_seen', '[]'::jsonb)) >= 3 THEN
      v_pest_level := 'High';
    ELSIF jsonb_array_length(COALESCE(p_answers->'pests_seen', '[]'::jsonb)) >= 1 THEN
      v_pest_level := 'Medium';
    END IF;
  END IF;

  -- Environment stress
  v_env_stress := CASE p_answers->>'smoke_exposure'
    WHEN 'daily'     THEN 'Smoke_Heavy'
    WHEN 'often'     THEN 'Smoke_Moderate'
    WHEN 'sometimes' THEN 'Smoke_Light'
    ELSE
      CASE p_answers->>'weekly_weather'
        WHEN 'hot_humid'   THEN 'Heat'
        WHEN 'cold_foggy'  THEN 'Cold'
        WHEN 'heavy_rain'  THEN 'Flood'
        WHEN 'flood'       THEN 'Flood'
        ELSE 'None'
      END
  END;

  -- ─────────────────────────────────────────────────────────────────
  -- Build comprehensive context string for AI (all 45 fields)
  -- ─────────────────────────────────────────────────────────────────
  v_context := format(
    -- SOIL (13 fields)
    'Soil:%s,Drain:%s,SoilColor:%s,Compact:%s,Algae:%s,Roots:%s,YellowPattern:%s,Organic:%s,Fert:%s,Lime:%s,Mono:%s,Yield:%s,PrevCrop:%s,' ||
    -- WATER (9 fields)
    'WaterSrc:%s,WaterAvail:%s,WaterColor:%s,WaterOdor:%s,Deposits:%s,Taste:%s,FishKill:%s,Arsenic:%s,IrrigFreq:%s,' ||
    -- CROP (7 fields)  
    'CropType:%s,Variety:%s,Stage:%s,Leaf:%s,Stem:%s,Tillers:%s,Height:%s,' ||
    -- PEST (7 fields)
    'Pests:%s,Diseases:%s,DamageLevel:%s,DamageSpot:%s,Beneficial:%s,Pesticide:%s,Weather:%s,' ||
    -- ENVIRONMENT (9 fields)
    'Smoke:%s,SmokeSrc:%s,SmokeDist:%s,CanalPoll:%s,CanalDist:%s,Neighbor:%s,NeighborSpray:%s,Adjacent:%s,Extreme:%s,' ||
    -- DERIVED RISKS
    'pH_Risk:%s,Water_Risk:%s,Pest_Risk:%s,Env_Risk:%s',
    
    -- SOIL VALUES
    COALESCE(p_answers->>'soil_texture', '-'),
    COALESCE(p_answers->>'soil_drainage', '-'),
    COALESCE(p_answers->>'soil_color', '-'),
    COALESCE(p_answers->>'soil_compaction', '-'),
    COALESCE(p_answers->>'algae_on_soil', '-'),
    COALESCE(p_answers->>'root_appearance', '-'),
    COALESCE(p_answers->>'yellowing_pattern', '-'),
    COALESCE(p_answers->>'organic_input', '-'),
    COALESCE(p_answers->>'fertilizer_pattern', '-'),
    COALESCE(p_answers->>'lime_gypsum_use', '-'),
    COALESCE(p_answers->>'monoculture_years', '-'),
    COALESCE(p_answers->>'yield_trend', '-'),
    COALESCE(p_answers->>'previous_crop', '-'),
    
    -- WATER VALUES
    COALESCE(p_answers->>'water_source', '-'),
    COALESCE(p_answers->>'water_availability', '-'),
    COALESCE(p_answers->>'water_color', '-'),
    COALESCE(p_answers->>'water_odor', '-'),
    COALESCE(p_answers->>'water_deposits', '-'),
    COALESCE(p_answers->>'water_taste', '-'),
    COALESCE(p_answers->>'fish_kill', '-'),
    COALESCE(p_answers->>'arsenic_test', '-'),
    COALESCE(p_answers->>'irrigation_frequency', '-'),
    
    -- CROP VALUES
    COALESCE(p_answers->>'crop_type', '-'),
    COALESCE(p_answers->>'crop_variety', '-'),
    COALESCE(p_answers->>'crop_stage', '-'),
    COALESCE(p_answers->>'leaf_condition', '-'),
    COALESCE(p_answers->>'stem_condition', '-'),
    COALESCE(p_answers->>'tiller_count', '-'),
    COALESCE(p_answers->>'plant_height', '-'),
    
    -- PEST VALUES
    COALESCE((SELECT string_agg(value, '+') FROM jsonb_array_elements_text(p_answers->'pests_seen') AS value), '-'),
    COALESCE((SELECT string_agg(value, '+') FROM jsonb_array_elements_text(p_answers->'diseases_seen') AS value), '-'),
    COALESCE(p_answers->>'pest_damage_level', '-'),
    COALESCE(p_answers->>'pest_hotspot', '-'),
    COALESCE(p_answers->>'beneficial_insects', '-'),
    COALESCE(p_answers->>'pesticide_used', '-'),
    COALESCE(p_answers->>'weekly_weather', '-'),
    
    -- ENVIRONMENT VALUES
    COALESCE(p_answers->>'smoke_exposure', '-'),
    COALESCE((SELECT string_agg(value, '+') FROM jsonb_array_elements_text(p_answers->'smoke_source') AS value), '-'),
    COALESCE(p_answers->>'smoke_distance', '-'),
    COALESCE(p_answers->>'canal_pollution', '-'),
    COALESCE(p_answers->>'canal_distance', '-'),
    COALESCE(p_answers->>'neighbor_problem', '-'),
    COALESCE(p_answers->>'neighbor_spray', '-'),
    COALESCE((SELECT string_agg(value, '+') FROM jsonb_array_elements_text(p_answers->'land_nearby') AS value), '-'),
    COALESCE((SELECT string_agg(value, '+') FROM jsonb_array_elements_text(p_answers->'extreme_event') AS value), '-'),
    
    -- DERIVED RISKS
    v_soil_ph,
    v_water_risk,
    v_pest_level,
    v_env_stress
  );

  -- ─────────────────────────────────────────────────────────────────
  -- Upsert survey (allows update same week)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO surveys (
    farmer_id, land_id, week_number, year,
    answers, soil_ph_risk, water_risk, pest_level, env_stress,
    submitted_at, updated_at
  ) VALUES (
    p_farmer_id, p_land_id, v_week, v_year,
    p_answers, v_soil_ph, v_water_risk, v_pest_level, v_env_stress,
    NOW(), NOW()
  )
  ON CONFLICT (farmer_id, land_id, week_number, year) DO UPDATE SET
    answers = surveys.answers || EXCLUDED.answers,  -- Merge answers
    soil_ph_risk = EXCLUDED.soil_ph_risk,
    water_risk = EXCLUDED.water_risk,
    pest_level = EXCLUDED.pest_level,
    env_stress = EXCLUDED.env_stress,
    updated_at = NOW()
  RETURNING id INTO v_survey_id;

  -- ─────────────────────────────────────────────────────────────────
  -- Upsert farm profile (accumulated state)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO farm_profiles (
    farmer_id, land_id,
    soil_texture, soil_drainage, soil_ph, soil_organic, soil_compaction,
    water_source, water_color, water_odor, water_risk,
    crop_stage, fertilizer_pattern, monoculture_years, yield_trend,
    pest_level, pests_seen, weekly_weather,
    smoke_exposure, canal_contamination, neighbor_problem,
    fish_kill, scan_context,
    last_survey_week, last_survey_year, updated_at
  ) VALUES (
    p_farmer_id, p_land_id,
    p_answers->>'soil_texture',
    p_answers->>'soil_drainage',
    v_soil_ph,
    CASE WHEN p_answers->>'organic_input' = 'never' THEN 'low' WHEN p_answers->>'organic_input' = 'regular' THEN 'high' ELSE 'medium' END,
    NULL,
    p_answers->>'water_source',
    p_answers->>'water_color',
    p_answers->>'water_odor',
    v_water_risk,
    p_answers->>'crop_stage',
    p_answers->>'fertilizer_pattern',
    p_answers->>'monoculture_years',
    p_answers->>'yield_trend',
    v_pest_level,
    CASE WHEN p_answers->'pests_seen' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(p_answers->'pests_seen')) ELSE NULL END,
    p_answers->>'weekly_weather',
    p_answers->>'smoke_exposure' IN ('sometimes', 'often', 'daily'),
    p_answers->>'canal_pollution' IN ('sometimes', 'yes_untreated', 'yes_treated'),
    p_answers->>'neighbor_problem' IN ('few_neighbors', 'many_neighbors', 'whole_area'),
    p_answers->>'fish_kill' IN ('yes_recent', 'yes_frequent'),
    v_context,
    v_week, v_year, NOW()
  )
  ON CONFLICT (farmer_id, land_id) DO UPDATE SET
    soil_texture = COALESCE(EXCLUDED.soil_texture, farm_profiles.soil_texture),
    soil_drainage = COALESCE(EXCLUDED.soil_drainage, farm_profiles.soil_drainage),
    soil_ph = EXCLUDED.soil_ph,
    soil_organic = COALESCE(EXCLUDED.soil_organic, farm_profiles.soil_organic),
    water_source = COALESCE(EXCLUDED.water_source, farm_profiles.water_source),
    water_color = COALESCE(EXCLUDED.water_color, farm_profiles.water_color),
    water_odor = COALESCE(EXCLUDED.water_odor, farm_profiles.water_odor),
    water_risk = EXCLUDED.water_risk,
    crop_stage = COALESCE(EXCLUDED.crop_stage, farm_profiles.crop_stage),
    fertilizer_pattern = COALESCE(EXCLUDED.fertilizer_pattern, farm_profiles.fertilizer_pattern),
    monoculture_years = COALESCE(EXCLUDED.monoculture_years, farm_profiles.monoculture_years),
    yield_trend = COALESCE(EXCLUDED.yield_trend, farm_profiles.yield_trend),
    pest_level = EXCLUDED.pest_level,
    pests_seen = COALESCE(EXCLUDED.pests_seen, farm_profiles.pests_seen),
    weekly_weather = COALESCE(EXCLUDED.weekly_weather, farm_profiles.weekly_weather),
    smoke_exposure = COALESCE(EXCLUDED.smoke_exposure, farm_profiles.smoke_exposure),
    canal_contamination = COALESCE(EXCLUDED.canal_contamination, farm_profiles.canal_contamination),
    neighbor_problem = COALESCE(EXCLUDED.neighbor_problem, farm_profiles.neighbor_problem),
    fish_kill = COALESCE(EXCLUDED.fish_kill, farm_profiles.fish_kill),
    scan_context = EXCLUDED.scan_context,
    last_survey_week = EXCLUDED.last_survey_week,
    last_survey_year = EXCLUDED.last_survey_year,
    updated_at = NOW();

  -- Return result
  RETURN jsonb_build_object(
    'success', TRUE,
    'survey_id', v_survey_id,
    'week_number', v_week,
    'year', v_year,
    'scan_context', v_context,
    'risks', jsonb_build_object(
      'soil_ph', v_soil_ph,
      'water', v_water_risk,
      'pest', v_pest_level,
      'environment', v_env_stress
    )
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 4.2 GET FARM PROFILE
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_farm_profile(
  p_farmer_id UUID,
  p_land_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile farm_profiles%ROWTYPE;
  v_days_since INTEGER;
BEGIN
  SELECT * INTO v_profile
  FROM farm_profiles
  WHERE farmer_id = p_farmer_id AND land_id = p_land_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', FALSE,
      'message_bn', 'এই জমির জন্য কোনো সার্ভে নেই। সার্ভে সম্পন্ন করুন।'
    );
  END IF;

  v_days_since := EXTRACT(DAY FROM NOW() - v_profile.updated_at)::INTEGER;

  RETURN jsonb_build_object(
    'found', TRUE,
    'scan_context', v_profile.scan_context,
    'days_since_survey', v_days_since,
    'stale', v_days_since > 14,
    'soil', jsonb_build_object(
      'texture', v_profile.soil_texture,
      'drainage', v_profile.soil_drainage,
      'ph', v_profile.soil_ph,
      'organic', v_profile.soil_organic
    ),
    'water', jsonb_build_object(
      'source', v_profile.water_source,
      'color', v_profile.water_color,
      'odor', v_profile.water_odor,
      'risk', v_profile.water_risk
    ),
    'crop', jsonb_build_object(
      'stage', v_profile.crop_stage,
      'fertilizer', v_profile.fertilizer_pattern,
      'monoculture', v_profile.monoculture_years,
      'yield_trend', v_profile.yield_trend
    ),
    'environment', jsonb_build_object(
      'pest_level', v_profile.pest_level,
      'pests_seen', v_profile.pests_seen,
      'weather', v_profile.weekly_weather,
      'smoke', v_profile.smoke_exposure,
      'canal_pollution', v_profile.canal_contamination,
      'neighbor_problem', v_profile.neighbor_problem
    ),
    'last_updated', v_profile.updated_at,
    'last_survey_week', v_profile.last_survey_week
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 4.3 GET SURVEY QUESTIONS
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_survey_questions(p_category VARCHAR DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'key', question_key,
        'category', category,
        'question_bn', question_bn,
        'question_en', question_en,
        'type', input_type,
        'options', options
      ) ORDER BY display_order
    )
    FROM survey_questions
    WHERE is_active = TRUE
      AND (p_category IS NULL OR category = p_category)
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 4.4 CHECK SURVEY COMPLETION THIS WEEK
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_survey_status(
  p_farmer_id UUID,
  p_land_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_week INTEGER;
  v_year INTEGER;
  v_survey surveys%ROWTYPE;
  v_answered_keys TEXT[];
BEGIN
  v_week := EXTRACT(WEEK FROM NOW())::INTEGER;
  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  SELECT * INTO v_survey
  FROM surveys
  WHERE farmer_id = p_farmer_id 
    AND land_id = p_land_id
    AND week_number = v_week
    AND year = v_year;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_survey', FALSE,
      'week', v_week,
      'year', v_year,
      'answered_questions', 0
    );
  END IF;

  -- Get answered question keys
  SELECT array_agg(key) INTO v_answered_keys
  FROM jsonb_object_keys(v_survey.answers) AS key;

  RETURN jsonb_build_object(
    'has_survey', TRUE,
    'survey_id', v_survey.id,
    'week', v_week,
    'year', v_year,
    'answered_questions', COALESCE(array_length(v_answered_keys, 1), 0),
    'risks', jsonb_build_object(
      'soil_ph', v_survey.soil_ph_risk,
      'water', v_survey.water_risk,
      'pest', v_survey.pest_level,
      'environment', v_survey.env_stress
    ),
    'submitted_at', v_survey.submitted_at,
    'updated_at', v_survey.updated_at
  );
END;
$$;

-- ============================================================================
-- STEP 5: GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON survey_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON surveys TO authenticated;
GRANT SELECT, INSERT, UPDATE ON farm_profiles TO authenticated;

GRANT EXECUTE ON FUNCTION submit_survey(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_farm_profile(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_survey_questions(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION check_survey_status(UUID, UUID) TO authenticated;

-- ============================================================================
-- STEP 6: ENABLE RLS
-- ============================================================================

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS surveys_farmer_policy ON surveys;
DROP POLICY IF EXISTS farm_profiles_farmer_policy ON farm_profiles;
DROP POLICY IF EXISTS survey_questions_read ON survey_questions;

-- Surveys: farmers can only see/edit their own
CREATE POLICY surveys_farmer_policy ON surveys
  FOR ALL USING (farmer_id = auth.uid());

-- Farm profiles: farmers can only see/edit their own
CREATE POLICY farm_profiles_farmer_policy ON farm_profiles
  FOR ALL USING (farmer_id = auth.uid());

-- Questions are public read
CREATE POLICY survey_questions_read ON survey_questions
  FOR SELECT USING (TRUE);

-- ============================================================================
-- DONE! New clean survey system ready.
-- ============================================================================
