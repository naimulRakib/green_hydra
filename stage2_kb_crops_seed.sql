CREATE TABLE IF NOT EXISTS kb_crops (
  crop_id                VARCHAR PRIMARY KEY,
  crop_name_en           VARCHAR NOT NULL,
  crop_name_bn           TEXT NOT NULL,
  seasons                TEXT[] DEFAULT '{}',
  planting_months        INTEGER[] DEFAULT '{}',
  harvest_months         INTEGER[] DEFAULT '{}',
  suitable_zones         TEXT[] DEFAULT '{}',
  soil_pref              TEXT[] DEFAULT '{}',
  flood_tolerant         BOOLEAN DEFAULT FALSE,
  drought_tolerant       BOOLEAN DEFAULT FALSE,
  salinity_tolerant      BOOLEAN DEFAULT FALSE,
  special_notes_bn       TEXT
);

INSERT INTO kb_crops (crop_id, crop_name_en, crop_name_bn,
  planting_months, harvest_months, flood_tolerant, drought_tolerant,
  soil_pref, special_notes_bn)
VALUES
  ('rice_boro', 'Boro Rice', 'বোরো ধান',
   ARRAY[11,12,1,2], ARRAY[4,5,6], false, false,
   ARRAY['loam','clay_loam','clay'],
   'শীতকালীন সেচনির্ভর ধান। হাওর এলাকায় ফ্ল্যাশ ফ্লাড ঝুঁকি।'),

  ('rice_aman', 'Aman Rice', 'আমন ধান',
   ARRAY[6,7,8], ARRAY[11,12], true, false,
   ARRAY['loam','clay_loam','clay','silty'],
   'বর্ষাকালীন ধান। বন্যাসহিষ্ণু জাত পাওয়া যায়।'),

  ('rice_aus', 'Aus Rice', 'আউশ ধান',
   ARRAY[3,4,5], ARRAY[8,9], false, true,
   ARRAY['loam','sandy_loam'],
   'গ্রীষ্মকালীন খরাসহিষ্ণু ধান।'),

  ('wheat', 'Wheat', 'গম',
   ARRAY[11,12], ARRAY[3,4], false, true,
   ARRAY['loam','clay_loam'],
   'শীতকালীন ফসল। উচ্চ তাপমাত্রায় ক্ষতি হয়।'),

  ('maize', 'Maize', 'ভুট্টা',
   ARRAY[10,11,2,3], ARRAY[2,3,6,7], false, true,
   ARRAY['loam','sandy_loam'],
   'সারা বছর চাষযোগ্য। জলাবদ্ধতা সহ্য করে না।')

ON CONFLICT (crop_id) DO NOTHING;
