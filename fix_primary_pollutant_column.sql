-- ============================================================================
-- FIX: Add missing primary_pollutant column to industrial_hotspots table
-- ============================================================================
-- This fixes the error: column "primary_pollutant" does not exist
-- Run this BEFORE running complete_fix_mod_and_data.sql

-- ============================================================================
-- Step 1: Add the missing column to industrial_hotspots table
-- ============================================================================
ALTER TABLE public.industrial_hotspots
ADD COLUMN IF NOT EXISTS primary_pollutant VARCHAR(50);

-- ============================================================================
-- Step 2: Update existing rows with default values
-- ============================================================================
-- Set reasonable default pollutants based on industry type
UPDATE public.industrial_hotspots
SET primary_pollutant = CASE
    WHEN industry_type = 'Textile/Dyeing' THEN 'Chemical Dyes'
    WHEN industry_type = 'Tannery' THEN 'Chromium'
    WHEN industry_type = 'Brick_Kiln' THEN 'PM2.5'
    WHEN industry_type = 'Chemical' THEN 'SO2'
    WHEN industry_type = 'Garment_Factory' THEN 'Dyes'
    ELSE 'Unknown'
END
WHERE primary_pollutant IS NULL;

-- ============================================================================
-- Step 3: Add index for performance (optional but recommended)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_industrial_hotspots_pollutant
ON public.industrial_hotspots(primary_pollutant);

-- ============================================================================
-- Success! Now you can run complete_fix_mod_and_data.sql
-- ============================================================================
-- The primary_pollutant column is now available and populated with defaults.

-- Verify the fix:
SELECT factory_name_bn, industry_type, primary_pollutant, is_currently_active
FROM public.industrial_hotspots
WHERE is_currently_active = true
LIMIT 5;