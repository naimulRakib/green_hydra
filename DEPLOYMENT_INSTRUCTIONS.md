# 🛠️ Wind Direction Bug Fix - Deployment Instructions

## Problem Summary
The `check_pollution_hazards` function incorrectly calculates when farms are in pollution plumes, causing false alarms when wind is blowing smoke **away** from farms.

## 📋 What You Need To Do

### Step 1: Deploy the SQL Fix

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your AgroSentinel project

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Deploy the Fix**
   - **⚠️ IMPORTANT**: If you see an error about "Could not choose the best candidate function", use `fix_function_conflict.sql` instead
   - **First try**: Copy the entire content from `fix_function_conflict.sql` (this handles function conflicts)
   - Paste it into the SQL Editor
   - Click "Run"

   - **If you still get errors**: Use the simpler backup version from `backup_simple_fix.sql`

4. **Verify Success**
   - You should see "Success. No rows returned" or "CREATE FUNCTION" message
   - If there's still an error about data types, the backup version should work

### Step 2: Test the Fix

**Option A: Quick Test in SQL Editor**
```sql
-- Test case: Wind blowing away from farm (should be FALSE)
SELECT
  factory_name_bn,
  is_in_plume,
  wind_to_deg,
  distance_km
FROM check_pollution_hazards(23.8050, 90.4262, 45.0, 12.0)
WHERE factory_name_bn ILIKE '%তান্নারি%' OR factory_name_bn ILIKE '%tannery%';

-- Expected result: is_in_plume = FALSE
```

**Option B: Test in Your App**
1. Open your AgroSentinel map
2. Navigate to Keraniganj area
3. Check the Hazaribagh Tannery popup
4. With SW wind, it should now show "ধোঁয়া আপনার দিকে: না ✓"

**Option C: Run TypeScript Validator**
```bash
# If you have Node.js/TypeScript set up
npx ts-node plume-algorithm-validator.ts
```

### Step 3: Validate Edge Cases

Run these test queries in Supabase SQL Editor:

```sql
-- Test 1: Wind toward farm (should be TRUE)
SELECT is_in_plume FROM check_pollution_hazards(23.8050, 90.4262, 225.0, 12.0) LIMIT 1;

-- Test 2: Wind away from farm (should be FALSE)
SELECT is_in_plume FROM check_pollution_hazards(23.8050, 90.4262, 45.0, 12.0) LIMIT 1;

-- Test 3: Perpendicular wind (should be FALSE)
SELECT is_in_plume FROM check_pollution_hazards(23.8050, 90.4262, 315.0, 12.0) LIMIT 1;
```

### Step 4: Monitor for Issues

**Check Application Logs:**
- Go to Supabase Dashboard > Logs
- Look for any errors from `check_pollution_hazards`
- Monitor for ~30 minutes after deployment

**Check Map Behavior:**
- Test different wind directions
- Verify plume wedges match the "smoke coming to farm" warnings
- Check that nearby farms show different risk levels

## 🚨 Rollback Plan (If Something Goes Wrong)

If the new function causes errors:

1. **Quick Rollback in SQL Editor:**
```sql
-- Restore to proximity-only calculation (temporary fix)
CREATE OR REPLACE FUNCTION check_pollution_hazards(
    p_farmer_lat DOUBLE PRECISION,
    p_farmer_lng DOUBLE PRECISION,
    p_wind_from_deg DOUBLE PRECISION,
    p_wind_speed_kmh DOUBLE PRECISION
)
RETURNS TABLE(/* same signature */)
AS $$
BEGIN
    -- Simple proximity check only - wind direction ignored
    RETURN QUERY
    SELECT ... WHERE distance_km <= max_plume_km;
END;
$$;
```

2. **Notify the team** and investigate the specific error

## 🔧 Troubleshooting Common Errors

### Error: "Could not choose the best candidate function between..."
- **Problem**: Multiple versions of the same function exist with different parameters
- **Solution**: Use `fix_function_conflict.sql` which drops all versions first then recreates the function

### Error: "RETURN NEXT cannot have a parameter in function with OUT parameters"
- **Solution**: Use the `backup_simple_fix.sql` version instead

### Error: "column does not exist"
- **Check**: Your `industrial_hotspots` table column names
- **Common issues**: `factory_name` vs `factory_name_bn`, `id` type (UUID vs TEXT)

### Error: "function does not exist"
- **Check**: Function permissions and schema
- **Solution**: Add `GRANT EXECUTE ... TO authenticated;` at the end

### Error: Data type mismatches
- **Solution**: Use the backup version which uses TEXT types instead of VARCHAR

## 🔍 Quick Debugging Steps

1. **Check table structure:**
```sql
\d industrial_hotspots;
-- OR
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'industrial_hotspots';
```

2. **Test basic query:**
```sql
SELECT id, factory_name_bn, industry_type
FROM industrial_hotspots
WHERE is_currently_active = true
LIMIT 5;
```

3. **Test the function with minimal data:**
```sql
SELECT COUNT(*) FROM check_pollution_hazards(23.8, 90.4, 45.0, 12.0);
```

4. **If function exists but returns empty:** Check your data - you might not have any active industrial_hotspots in your database yet.

## 📊 Expected Results After Fix

| Scenario | Wind From | Factory Position | Expected Result |
|----------|-----------|------------------|-----------------|
| Your bug case | NE (45°) | WSW of farm | ❌→✅ No longer in plume |
| Direct hit | SW (225°) | WSW of farm | ✅ Still in plume |
| Perpendicular | NW (315°) | WSW of farm | ✅ Not in plume |
| Too far | Any | >5km away | ✅ Not in plume |

## 🔧 Technical Changes Made

**Before (Buggy):**
- Likely used proximity only: `distance < max_plume_km`
- OR calculated wrong bearing direction
- OR used `wind_from` instead of `wind_to`

**After (Fixed):**
1. ✅ Convert `wind_from` → `wind_to` (direction smoke travels)
2. ✅ Calculate bearing FROM factory TO farm
3. ✅ Find shortest angular difference
4. ✅ Check: `angle_diff <= cone_angle/2 AND distance <= max_range`

## 📞 Need Help?

If you encounter issues:

1. **Check Supabase logs** for specific error messages
2. **Test with the TypeScript validator** to verify algorithm logic
3. **Run the SQL test queries** to isolate the problem
4. **Temporarily rollback** if users are being affected

## ✅ Verification Checklist

- [ ] Deployed SQL fix to Supabase
- [ ] Tested your specific bug case (Keraniganj + SW wind)
- [ ] Verified at least 3 edge cases with SQL queries
- [ ] Checked map popups show correct warnings
- [ ] Monitored logs for 30 minutes with no errors
- [ ] Confirmed plume visualization matches warnings

**Status: Ready for deployment** 🚀