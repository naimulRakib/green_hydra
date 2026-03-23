# AgroSentinel Risk Calculation System - Complete Verification Guide

## Overview
The `calculate_farm_risk_score_v2` function calculates a comprehensive risk score (0-100) for each farm by analyzing 10 different risk components from multiple data sources.

---

## Risk Formula

```
TOTAL SCORE = (
  (Industrial × 2) + 
  (Water Baseline × 3) + 
  (Satellite Water × 2) + 
  (Community × 2) + 
  (Spray Proximity × 2) +
  (Air × 1) + 
  (Soil × 2) + 
  (Weather × 1) + 
  (Disease × 3) + 
  (Pest × 2)
) / 18

Total Weight = 18
```

### Risk Levels
- **0-24**: LOW - স্বাভাবিক অবস্থা। নিয়মিত পর্যবেক্ষণ চালিয়ে যান।
- **25-49**: MEDIUM - নিয়মিত পর্যবেক্ষণ করুন এবং সতর্ক থাকুন।
- **50-74**: HIGH - দ্রুত সতর্কতামূলক ব্যবস্থা নিন।
- **75-100**: CRITICAL - তাৎক্ষণিক ব্যবস্থা নিন! বিশেষজ্ঞের পরামর্শ নিন।

---

## 1. Industrial Risk (Weight: ×2)

### Data Sources
- `scan_logs` table (AI disease scanner) - `stress_type = 'Abiotic_Pollution'`
- `heavy_metal_reports` table - verified reports
- `kb_zones` table - `heavy_metal_risk` flag

### Calculation
```sql
Industrial Risk = MIN(100, 
  (pollution_scans × 15) + 
  (heavy_metal_reports × 25) + 
  (zone_has_heavy_metal_risk ? 20 : 0)
)
```

### Scoring Rules
| Component | Points | When |
|-----------|--------|------|
| Each pollution scan (last 90 days) | +15 | AI scanner detected pollution stress |
| Each verified heavy metal report | +25 | Confirmed toxic metal presence |
| High-risk zone | +20 | Land is in industrial zone |

### Example
- 2 pollution scans in last 90 days = 2 × 15 = 30 points
- 1 verified arsenic report = 1 × 25 = 25 points
- In heavy metal zone = 20 points
- **Total = 75 (HIGH)**

---

## 2. Water Baseline Risk (Weight: ×3)

### Data Sources
- `farmer_land_profile` table - survey data fields
- `water_pollution_events` table - active pollution events

### Calculation
```sql
Water Risk = MIN(100,
  water_color_points + 
  (arsenic_risk ? 30 : 0) + 
  (iron_toxicity ? 20 : 0) + 
  (fish_kill ? 25 : 0) + 
  (active_water_events × 10)
)
```

### Scoring Rules
| Component | Points | Condition |
|-----------|--------|-----------|
| Contaminated water | 50 | `water_color_status = 'Contaminated'` |
| Chemical contamination | 40 | `water_color_status = 'Chemical'` |
| Iron-colored water | 30 | `water_color_status = 'Iron'` |
| Arsenic detected | 30 | `arsenic_risk = TRUE` |
| Iron toxicity | 20 | `iron_toxicity_risk = TRUE` |
| Fish kill reported | 25 | `fish_kill_reported = TRUE` |
| Each active water event | 10 | From pollution monitoring |

### Example
- Water color: Contaminated = 50
- Arsenic detected = 30
- Fish kill = 25
- **Total = 105 → capped at 100 (CRITICAL)**

---

## 3. Satellite Water Risk (Weight: ×2) **[NEW]**

### Data Sources
- `satellite_water_data` table (from NASA/Sentinel satellites)
- Radius: 5km around farm coordinates
- Timeframe: Last 30 days

### Calculation
```sql
Satellite Risk = MIN(100,
  turbidity_points + 
  chlorophyll_points + 
  (poor_quality_cells × 5)
)
```

### Scoring Rules

#### Turbidity (NTU - Nephelometric Turbidity Units)
| Turbidity Level | Points | Meaning |
|-----------------|--------|---------|
| > 50 NTU | 40 | Very high sediment/pollution |
| 30-50 NTU | 25 | High turbidity |
| 15-30 NTU | 15 | Moderate turbidity |
| < 15 NTU | 0 | Clear water |

#### Chlorophyll (μg/L - micrograms per liter)
| Chlorophyll Level | Points | Meaning |
|-------------------|--------|---------|
| > 20 μg/L | 30 | Severe algae bloom risk |
| 10-20 μg/L | 15 | Moderate algae risk |
| < 10 μg/L | 0 | Normal |

#### Poor Quality Cells
- Each grid cell with `water_quality_index < 40` = +5 points
- Indicates widespread contamination

### Example
- Average turbidity: 55 NTU = 40 points
- Average chlorophyll: 22 μg/L = 30 points
- 3 poor quality cells nearby = 3 × 5 = 15 points
- **Total = 85 (CRITICAL)**

---

## 4. Community Risk (Weight: ×2)

### Data Sources
- `spray_events` table - global spray count
- `farmer_land_profile` - survey data
- Does NOT include spray proximity (separate component)

### Calculation
```sql
Community Risk = MIN(100,
  (global_sprays × 5) + 
  (neighbor_same_problem ? 25 : 0) + 
  (canal_contamination ? 20 : 0)
)
```

### Scoring Rules
| Component | Points | When |
|-----------|--------|------|
| Each active spray globally | 5 | `spray_events` with `is_active = TRUE` |
| Neighbor has same problem | 25 | Survey answer confirms |
| Canal contamination | 20 | Irrigation canal is polluted |

### Example
- 8 active sprays in community = 8 × 5 = 40
- Neighbor reported same crop damage = 25
- **Total = 65 (HIGH)**

---

## 5. Spray Proximity Risk (Weight: ×2) **[NEW]**

### Data Sources
- `community_spray_events` table
- `farmer_lands` table (for coordinates)
- Uses PostGIS `ST_DWithin` for spatial calculation

### Calculation
```sql
Spray Proximity Risk = MIN(100, nearby_sprays × 20)

WHERE nearby_sprays = COUNT of sprays where:
  - is_active = TRUE
  - expires_at > NOW()
  - land_id != current farm
  - ST_DWithin(spray_coords, farm_coords, harm_radius_m)
```

### Scoring Rules
| Nearby Active Sprays | Points | Risk Level |
|---------------------|--------|------------|
| 0 | 0 | No risk |
| 1 | 20 | Low |
| 2 | 40 | Medium |
| 3 | 60 | High |
| 4 | 80 | Critical |
| 5+ | 100 | Maximum |

### Key Features
- Uses **actual harm radius** from spray event (default: 500m)
- Only counts **active** sprays (not expired)
- **Excludes farmer's own sprays**
- Real spatial distance calculation via PostGIS

### Example
- 2 neighbors spraying within 400m = 2 × 20 = 40 (MEDIUM)
- 5 farms spraying within radius = 5 × 20 = 100 (CRITICAL)

---

## 6. Air Risk (Weight: ×1)

### Data Sources
- `farmer_land_profile` - survey responses

### Calculation
```sql
Air Risk = MIN(100,
  (recent_smoke_exposure ? 40 : 0) + 
  smoke_weather_points
)
```

### Scoring Rules
| Component | Points | Condition |
|-----------|--------|-----------|
| Recent smoke exposure | 40 | Brick kiln / factory smoke nearby |
| Heavy smoke weather | 30 | `weekly_weather = 'smoke_heavy'` |

### Example
- Brick kiln smoke = 40
- Heavy smoke week = 30
- **Total = 70 (HIGH)**

---

## 7. Soil Risk (Weight: ×2)

### Data Sources
- `farmer_land_profile` - soil survey data
- `scan_logs` - nutrient deficiency scans

### Calculation
```sql
Soil Risk = MIN(100,
  pH_points + 
  compaction_points + 
  monoculture_points + 
  organic_matter_points + 
  (nutrient_scans × 8)
)
```

### Scoring Rules

#### pH Status
| pH Level | Points | Problem |
|----------|--------|---------|
| Acidic | 25 | Too acidic (< 5.5) |
| Alkaline | 20 | Too alkaline (> 8.0) |
| Normal | 0 | pH 5.5-8.0 |

#### Compaction
| Status | Points | Problem |
|--------|--------|---------|
| Hard/Cracked | 20 | Poor drainage, root stress |
| Normal | 0 | Good soil structure |

#### Monoculture
| Years | Points | Risk |
|-------|--------|------|
| 10+ years | 15 | Severe nutrient depletion |
| 5-10 years | 15 | High depletion |
| 3-5 years | 10 | Moderate depletion |
| < 3 years | 0 | Healthy rotation |

#### Organic Matter
| Level | Points | Problem |
|-------|--------|---------|
| Low | 15 | Poor soil health |
| Medium/High | 0 | Good soil health |

#### Nutrient Scans
- Each nutrient deficiency scan (last 90 days) = +8 points

### Example
- Acidic soil = 25
- Hard/cracked = 20
- Monoculture 8 years = 15
- Low organic matter = 15
- 2 nutrient scans = 2 × 8 = 16
- **Total = 91 → capped at 100 (CRITICAL)**

---

## 8. Weather Risk (Weight: ×1)

### Data Sources
- `farmer_land_profile.weekly_weather` - current weather conditions

### Calculation
```sql
Weather Risk = weather_severity_points
```

### Scoring Rules
| Weather Event | Points | Impact |
|---------------|--------|--------|
| Flood | 40 | Waterlogging, crop damage |
| Drought | 35 | Water stress, wilting |
| Storm | 30 | Physical damage |
| Normal | 0 | No extreme weather |

### Example
- Flood this week = 40 (MEDIUM)
- Drought = 35 (MEDIUM)

---

## 9. Disease Risk (Weight: ×3) **[NEW]**

### Data Sources
- `scan_logs` table - `stress_type = 'Biotic_Disease'`
- Last 90 days only

### Calculation
```sql
Disease Risk = MIN(100,
  (disease_scans × 12) + 
  frequency_bonus
)

Where frequency_bonus =
  - 5+ scans = +25 (persistent disease problem)
  - 3-4 scans = +15 (recurring issue)
  - 0-2 scans = 0 (normal)
```

### Scoring Rules
| Disease Scans | Base Points | Frequency Bonus | Total |
|---------------|-------------|-----------------|-------|
| 0 | 0 | 0 | 0 (LOW) |
| 1 | 12 | 0 | 12 (LOW) |
| 2 | 24 | 0 | 24 (LOW) |
| 3 | 36 | 15 | 51 (HIGH) |
| 4 | 48 | 15 | 63 (HIGH) |
| 5 | 60 | 25 | 85 (CRITICAL) |
| 8+ | 96 | 25 | 100+ (CRITICAL) |

### Why High Weight (×3)?
- AI-detected diseases are **actual observations**, not predictions
- Multiple scans = **persistent problem**
- Requires **immediate action** to prevent spread

### Example
- 6 disease scans in 3 months = (6 × 12) + 25 = 97 (CRITICAL)

---

## 10. Pest Risk (Weight: ×2) **[NEW]**

### Data Sources
- `scan_logs` table - `stress_type = 'Biotic_Pest'`
- Last 90 days only

### Calculation
```sql
Pest Risk = MIN(100,
  (pest_scans × 12) + 
  frequency_bonus
)

Same frequency bonus as disease risk
```

### Scoring Rules
| Pest Scans | Base Points | Frequency Bonus | Total |
|------------|-------------|-----------------|-------|
| 0 | 0 | 0 | 0 (LOW) |
| 1 | 12 | 0 | 12 (LOW) |
| 2 | 24 | 0 | 24 (LOW) |
| 3 | 36 | 15 | 51 (HIGH) |
| 4 | 48 | 15 | 63 (HIGH) |
| 5 | 60 | 25 | 85 (CRITICAL) |

### Example
- 4 pest scans (BPH, stem borer) = (4 × 12) + 15 = 63 (HIGH)

---

## Complete Example Calculation

### Scenario
A rice farm in industrial zone near canal with recent disease outbreak.

### Component Breakdown
| Component | Score | Weight | Weighted Score |
|-----------|-------|--------|----------------|
| **Industrial** | 65 | ×2 | 130 |
| - 3 pollution scans | 45 | | |
| - 0 heavy metals | 0 | | |
| - In risk zone | 20 | | |
| **Water Baseline** | 55 | ×3 | 165 |
| - Iron water | 30 | | |
| - Arsenic detected | 30 | | |
| **Satellite Water** | 40 | ×2 | 80 |
| - High turbidity | 40 | | |
| **Community** | 30 | ×2 | 60 |
| - 6 active sprays | 30 | | |
| **Spray Proximity** | 40 | ×2 | 80 |
| - 2 nearby sprays | 40 | | |
| **Air** | 40 | ×1 | 40 |
| - Brick kiln smoke | 40 | | |
| **Soil** | 60 | ×2 | 120 |
| - Acidic pH | 25 | | |
| - Monoculture 8yr | 15 | | |
| - Low OM | 15 | | |
| - 1 nutrient scan | 8 | | |
| **Weather** | 0 | ×1 | 0 |
| - Normal weather | 0 | | |
| **Disease** | 51 | ×3 | 153 |
| - 3 disease scans | 36 | | |
| - Bonus | 15 | | |
| **Pest** | 24 | ×2 | 48 |
| - 2 pest scans | 24 | | |

### Final Calculation
```
Total Weighted Score = 130 + 165 + 80 + 60 + 80 + 40 + 120 + 0 + 153 + 48 = 876

Average Score = 876 / 18 = 48.67 → 49

Risk Level = MEDIUM (25-49)
Dominant Threat = Disease (51 points)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                              │
├─────────────────────────────────────────────────────────────┤
│ 1. scan_logs                → Disease, Pest, Pollution      │
│ 2. farmer_land_profile      → Survey answers (pH, water)    │
│ 3. heavy_metal_reports      → Verified toxic metals         │
│ 4. kb_zones                 → Zone risk flags               │
│ 5. satellite_water_data     → Turbidity, chlorophyll        │
│ 6. community_spray_events   → Active sprays + harm radius   │
│ 7. water_pollution_events   → Active water contamination    │
│ 8. spray_events             → Global spray count            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         calculate_farm_risk_score_v2(land_id)                │
├─────────────────────────────────────────────────────────────┤
│ 1. Count scan_logs by stress_type (90 days)                 │
│ 2. Calculate 10 risk components (0-100 each)                │
│ 3. Apply weights and sum                                    │
│ 4. Divide by total weight (18)                              │
│ 5. Determine risk level                                     │
│ 6. Identify dominant threat                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      OUTPUT JSON                             │
├─────────────────────────────────────────────────────────────┤
│ {                                                            │
│   total_score: 49,                                           │
│   risk_level: "MEDIUM",                                      │
│   dominant_threat: "Disease",                                │
│   advice: "নিয়মিত পর্যবেক্ষণ করুন",                         │
│   components: { industrial: 65, water_baseline: 55, ... },   │
│   satellite_data: { avg_turbidity: 42.5, ... },             │
│   spray_data: { nearby_active_sprays: 2, ... },             │
│   indicators: { pollution_scans: 3, disease_scans: 3, ... } │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Queries

### 1. Test with your land_id
```sql
SELECT calculate_farm_risk_score_v2('YOUR_LAND_ID'::uuid);
```

### 2. Check scan logs
```sql
SELECT 
  stress_type,
  COUNT(*) as scan_count,
  MAX(created_at) as last_scan
FROM scan_logs
WHERE land_id = 'YOUR_LAND_ID'
  AND created_at > NOW() - INTERVAL '90 days'
GROUP BY stress_type;
```

### 3. Check satellite data
```sql
SELECT 
  COUNT(*) as cells,
  AVG(turbidity_ntu) as avg_turbidity,
  AVG(chlorophyll_ugl) as avg_chlorophyll,
  COUNT(*) FILTER (WHERE water_quality_index < 40) as poor_cells
FROM satellite_water_data
WHERE ST_DWithin(
  grid_center::geography,
  (SELECT coordinates FROM farmer_lands WHERE land_id = 'YOUR_LAND_ID'),
  5000
)
AND observation_date > NOW() - INTERVAL '30 days';
```

### 4. Check nearby sprays
```sql
SELECT 
  cse.spray_type,
  cse.harm_radius_m,
  ST_Distance(
    fl.coordinates::geography,
    (SELECT coordinates FROM farmer_lands WHERE land_id = 'YOUR_LAND_ID')
  )::integer as distance_m
FROM community_spray_events cse
JOIN farmer_lands fl ON cse.land_id = fl.land_id
WHERE cse.is_active = TRUE
  AND cse.expires_at > NOW()
  AND ST_DWithin(
    fl.coordinates::geography,
    (SELECT coordinates FROM farmer_lands WHERE land_id = 'YOUR_LAND_ID'),
    cse.harm_radius_m
  )
ORDER BY distance_m;
```

---

## Deployment Checklist

- [ ] Run `improved_risk_calculation.sql` in Supabase SQL Editor
- [ ] Verify function exists: `SELECT proname FROM pg_proc WHERE proname = 'calculate_farm_risk_score_v2';`
- [ ] Test with sample land_id
- [ ] Update `app/actions/riskActions.ts` to call `calculate_farm_risk_score_v2`
- [ ] Update `FarmRiskCard.tsx` to display new components
- [ ] Verify satellite data is recent (last 30 days)
- [ ] Verify spray events have `harm_radius_m` populated
- [ ] Test with different risk scenarios

---

## Key Improvements Over Old Version

1. **Satellite Water Quality** - Now uses real NASA/Sentinel data
2. **Spray Proximity** - Actual distance calculation instead of global count
3. **Disease Detection** - Uses AI scan logs for real disease observations
4. **Pest Detection** - Separate pest risk calculation
5. **Nutrient Deficiency** - Added to soil risk from scan logs
6. **Higher Accuracy** - 10 components instead of 6
7. **Better Weighting** - Disease risk has ×3 weight (most critical)
8. **Spatial Analysis** - Uses PostGIS for real geographic calculations

---

## Troubleshooting

### No satellite data showing
- Check if `satellite_water_data` table has recent records
- Verify farm has valid `coordinates` (lat/lon)
- Run seed script or manually insert sample data

### Spray proximity always 0
- Check `community_spray_events` has `harm_radius_m` populated
- Verify `is_active = TRUE` and `expires_at > NOW()`
- Check farm coordinates are valid

### Disease/Pest risk always 0
- Check `scan_logs` table has recent entries (last 90 days)
- Verify `stress_type` values match exactly ('Biotic_Disease', 'Biotic_Pest')
- Check `land_id` matches between tables

---

## Conclusion

This risk calculation system provides:
- **Comprehensive** - 10 different risk factors
- **Real-time** - Uses latest scans, surveys, satellites
- **Accurate** - Spatial calculations with actual distances
- **Actionable** - Identifies dominant threat for focused response
- **Weighted** - Prioritizes critical risks (disease ×3, water ×3)

The weighted average ensures that critical issues (disease, water contamination) have more impact on the final score than less urgent ones (weather, air quality).
