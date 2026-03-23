'use server'

import { createClient } from '@/app/utils/supabase/server'
import { fetchISRICSoilData } from '@/lib/heavyMetalEngine'

/**
 * Triggers the heavy metal detection multi-layer inference pipeline.
 * Intended to be fired asynchronously after an Abiotic scan is completed.
 * 
 * @param landId The UUID of the farmer's land
 * @param lat Latitude of the land plot for ISRIC API
 * @param lng Longitude of the land plot for ISRIC API
 */
export async function triggerHeavyMetalDetection(landId: string, lat: number, lng: number) {
  try {
    const supabase = await createClient()

    // 1. Fetch live soil data from ISRIC
    const soilData = await fetchISRICSoilData(lat, lng)

    // 2. If we got highly acidic pH, opportunistically update the farmer's land profile 
    // to feed into Layer 2 of the SQL RPC. (pH < 5.5 = acidic)
    if (soilData.ph_h2o !== null) {
      // IMPORTANT: Check very_acidic (ph < 4.5) FIRST.
      // ph < 4.5 implies ph < 5.5, so checking 5.5 first makes 4.5 unreachable.
      if (soilData.ph_h2o < 4.5) {
        await supabase
          .from('farm_profiles')
          .update({ soil_ph: 'Acidic' })
          .eq('land_id', landId)
      } else if (soilData.ph_h2o < 5.5) {
        await supabase
          .from('farm_profiles')
          .update({ soil_ph: 'Acidic' })
          .eq('land_id', landId)
      }
    }

    // 3. Trigger the massive 5-Layer SQL RPC function
    const { data: rpcResult, error } = await supabase.rpc('detect_and_save_metal_risk', {
      p_land_id: landId
    })

    if (error) {
      console.error('[HeavyMetalActions] RPC Error:', error.message)
      return { success: false, error: error.message }
    }

    return { 
      success: true, 
      result: rpcResult 
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[HeavyMetalActions] Unhandled exception:', message)
    return { success: false, error: message }
  }
}

/**
 * Fetches the most recent heavy metal risk report for a specific land plot.
 * Used by the UI component.
 */
export async function getHeavyMetalReport(landId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('heavy_metal_reports')
    .select('*')
    .eq('land_id', landId)
    .order('reported_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[HeavyMetalActions] Error fetching report:', error.message)
    return null
  }

  return data
}
