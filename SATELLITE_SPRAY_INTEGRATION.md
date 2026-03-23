# Satellite, Spray & Scan Data Integration - Action Plan

## Current Status ✅

### What's Working:
1. **Satellite Water Data Table** (`satellite_water_data`)
   - Stores: NDTI, turbidity (NTU), chlorophyll (μg/L), water_quality_index
   - Grid cells cover 15km radius around farms
   - Displayed on OverviewMap as color-coded rectangles (red = pollution, blue = clear)

2. **Spray Events Table** (`community_spray_events`)
   - Tracks neighbor pesticide sprays
   - Fields: chemical name, harm_radius_m, expires_at, is_active
   - Displayed on OverviewMap as polygons with drift buffer zones

3. **Scan Logs Table** (`scan_logs`)
   - AI disease scanner results
   - Types: Biotic_Disease, Biotic_Pest, Abiotic_Pollution, Abiotic_Nutrient
   - Currently only pollution scans used in risk calculation

4. **Data Fetching**
   - `getSatelliteWaterData()` works
   - `getCommunitySprayForLands()` works
   - Both displayed on overview map

## Current Gaps ❌

### What's NOT Working:
1. **Satellite data NOT used in risk calculation**
   - Water risk only considers manual survey answers (water_color_status)
   - High turbidity/chlorophyll from satellites ignored

2. **Spray events NOT proximity-based**
   - Risk calculation counts ALL sprays globally (not just nearby)
   - Ignores actual harm_radius_m and distance to farmer's land

3. **Scan logs underutilized**
   - Disease scans ignored (Biotic_Disease)
   - Pest scans ignored (Biotic_Pest)
   - Nutrient deficiency scans ignored (Abiotic_Nutrient)
   - Only pollution scans counted

4. **Risk score incomplete**
   - Missing satellite water component
   - Missing spray proximity component
   - Missing disease/pest risk from AI scanner

## Solution Created ✅

### New File: `improved_risk_calculation.sql`

**New Risk Function: `calculate_farm_risk_score_v2()`**

#### Key Improvements:

1. **Satellite Water Quality Risk** (NEW component)
   ```sql
   - Fetches satellite data within 5km radius
   - Calculates risk from:
     * Turbidity > 50 NTU = 40 points
     * Chlorophyll > 20 μg/L = 30 points (algae bloom)
     * Poor quality cells nearby = 5 points each
   - Max satellite water risk: 100 points
   ```

2. **Spray Proximity Risk** (NEW component)
   ```sql
   - Finds sprays within actual harm_radius_m
   - Uses ST_DWithin for distance calculation
   - Each nearby spray = 20 risk points
   - Max spray risk: 100 points
   ```

3. **Disease Risk from AI Scanner** (NEW component)
   ```sql
   - Counts Biotic_Disease scans in last 90 days
   - Each scan = 12 points
   - Frequent scanning (5+) = additional 25 points
   - Max disease risk: 100 points
   ```

4. **Pest Risk from AI Scanner** (NEW component)
   ```sql
   - Counts Biotic_Pest scans in last 90 days
   - Each scan = 12 points
   - Frequent scanning (5+) = additional 25 points
   - Max pest risk: 100 points
   ```

5. **Nutrient Deficiency from Scans** (integrated)
   ```sql
   - Counts Abiotic_Nutrient scans
   - Added to soil risk calculation
   - Each nutrient scan = 8 points to soil risk
   ```

6. **Weighted Risk Score**
   ```
   Total Score = (
     Industrial×2 + 
     Water_Baseline×3 + 
     Satellite_Water×2 +  ← NEW
     Community×2 + 
     Spray_Proximity×2 +  ← NEW (not counted in community)
     Air×1 + 
     Soil×2 + 
     Weather×1 +
     Disease×3 +          ← NEW (from scan_logs)
     Pest×2               ← NEW (from scan_logs)
   ) / 18
   ```

7. **Enhanced Output**
   ```json
   {
     "total_score": 65,
     "risk_level": "HIGH",
     "dominant_threat": "Disease",  ← Can now be Disease/Pest
     "components": {
       "water_satellite": 45,
       "spray_proximity": 40,
       "disease": 55,          ← NEW
       "pest": 38              ← NEW
     },
     "satellite_data": {
       "avg_turbidity_ntu": 55.3,
       "avg_chlorophyll_ugl": 18.7,
       "poor_quality_cells": 3
     },
     "spray_data": {
       "nearby_active_sprays": 2,
       "global_sprays": 15
     },
     "indicators": {
       "pollution_scans": 3,
       "disease_scans": 5,     ← NEW
       "pest_scans": 4,        ← NEW
       "nutrient_scans": 2     ← NEW
     }
   }
   ```

## Installation Steps

### Step 1: Deploy New Risk Function
```bash
# Run in Supabase SQL Editor:
/improved_risk_calculation.sql
```

This creates `calculate_farm_risk_score_v2()` function.

### Step 2: Update Frontend to Use V2
In `app/actions/riskActions.ts`, change:
```typescript
// OLD:
const { data } = await supabase.rpc('calculate_farm_risk_score', ...)

// NEW:
const { data } = await supabase.rpc('calculate_farm_risk_score_v2', ...)
```

### Step 3: Display New Risk Components in UI

#### Update `app/components/FarmRiskCard.tsx`:
Add sections for:
- 💧 Satellite Water Risk (turbidity, chlorophyll, quality index)
- 🌾 Spray Proximity Risk (number of nearby active sprays)

Example:
```tsx
{riskData.components.water_satellite > 20 && (
  <div className="risk-item">
    <span>🛰️ Satellite Water Risk</span>
    <span className="risk-value">{riskData.components.water_satellite}/100</span>
    <div className="satellite-details">
      <small>Turbidity: {riskData.satellite_data.avg_turbidity_ntu} NTU</small>
      <small>Chlorophyll: {riskData.satellite_data.avg_chlorophyll_ugl} μg/L</small>
    </div>
  </div>
)}

{riskData.spray_data.nearby_active_sprays > 0 && (
  <div className="risk-item">
    <span>🌾 Nearby Spray Events</span>
    <span className="risk-value">{riskData.spray_data.nearby_active_sprays}</span>
    <small>Active sprays within harm radius</small>
  </div>
)}
```

## Testing

### Step 1: Check Satellite Data Exists
```sql
SELECT COUNT(*), AVG(turbidity_ntu), AVG(chlorophyll_ugl)
FROM satellite_water_data
WHERE observation_date > NOW() - INTERVAL '30 days';
```

Should show recent data. If empty, need to:
1. Call `/api/satellite/ingest` endpoint
2. Or run `fetchSatelliteWaterData()` from dashboard

### Step 2: Check Spray Events Exist
```sql
SELECT 
  cse.spray_id,
  cse.chemical_name,
  cse.harm_radius_m,
  cse.expires_at,
  cse.is_active,
  ST_AsText(fl.coordinates) as land_coords
FROM community_spray_events cse
JOIN farmer_lands fl ON cse.land_id = fl.land_id
WHERE cse.is_active = TRUE;
```

Should show active sprays with coordinates.

### Step 3: Test Risk Calculation
```sql
-- Replace with your actual land_id
SELECT calculate_farm_risk_score_v2('YOUR_LAND_ID_HERE'::uuid);
```

Should return JSON with `water_satellite` and `spray_proximity` components.

## Benefits

### More Accurate Risk Assessment
- Real water quality from satellites (not just farmer's perception)
- Proximity-based spray risk (not global noise)
- Better early warning for water contamination

### Better Farmer Experience
- "Why is my risk high?" → Show satellite data + nearby sprays
- Actionable: "2 sprays active within 500m - avoid irrigation for 48hrs"
- Trust: Satellite data = objective, scientific

### Dynamic Overview
- Risk scores update with satellite data (weekly)
- Spray events expire automatically
- Real-time risk changes reflected

## Next Steps

1. ✅ Run `improved_risk_calculation.sql` in Supabase
2. ⬜ Update `riskActions.ts` to call `_v2` function
3. ⬜ Update `FarmRiskCard.tsx` to show new components
4. ⬜ Test with real land_id
5. ⬜ Verify satellite data is fetched regularly (cron job?)

## Files Created
- `/improved_risk_calculation.sql` - New risk function with satellite + spray integration
- `/test_survey.sql` - Diagnostic queries for survey system
