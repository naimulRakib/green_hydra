'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/app/utils/supabase/server'
import { fetchISRICSoilData, computePhRiskModifier, getMetalMobilityExplanation } from '@/lib/heavyMetalEngine'

/**
 * Triggers the full 6-layer heavy metal detection pipeline.
 *
 * LAYER 1: Zone static data (SQL RPC)
 * LAYER 2: Soil profile from farm_profiles (SQL RPC)
 * LAYER 3: Scan log evidence — Abiotic scans (SQL RPC)
 * LAYER 4: Survey evidence from surveys table (SQL RPC)
 * LAYER 5: Industrial proximity via PostGIS (SQL RPC)
 * LAYER 6: ISRIC FAO SoilGrids real pH — THIS FILE (HTTP → DB update → RPC)
 *
 * Flow:
 *   1. Fetch ISRIC pH for GPS coordinates
 *   2. Update farm_profiles.soil_ph (feeds Layer 2 of RPC)
 *   3. Call detect_and_save_metal_risk RPC (Layers 1-5)
 *   4. Apply ISRIC pH bonus to confidence_score (Layer 6 post-RPC)
 *   5. Update heavy_metal_reports with final Layer 6 adjusted score
 */
export async function triggerHeavyMetalDetection(
  landId: string,
  lat: number,
  lng: number
): Promise<{ success: boolean; result?: unknown; error?: string; isric?: unknown }> {
  try {
    const supabase = await createServerClient()

    // ══════════════════════════════════════════════════════
    // LAYER 6 — STEP A: Fetch ISRIC FAO SoilGrids pH
    // This runs BEFORE the RPC so it can feed Layer 2
    // ══════════════════════════════════════════════════════
    const soilData = await fetchISRICSoilData(lat, lng)

    console.log('[HeavyMetal] ISRIC result:', {
      ph_h2o: soilData.ph_h2o,
      source: soilData.data_source,
    })

    // ══════════════════════════════════════════════════════
    // LAYER 6 — STEP B: Update farm_profiles.soil_ph
    // This feeds into Layer 2 of the SQL RPC
    // ISRIC pH is ground truth — overrides survey-derived pH
    // ══════════════════════════════════════════════════════
    if (soilData.ph_h2o !== null && soilData.data_source === 'isric_soilgrids') {
      let soilPhValue: string

      if (soilData.ph_h2o < 5.5) {
        soilPhValue = 'Acidic'
      } else if (soilData.ph_h2o > 7.5) {
        soilPhValue = 'Alkaline'
      } else {
        soilPhValue = 'Normal'
      }

      const { error: phUpdateError } = await supabase
        .from('farm_profiles')
        .update({
          soil_ph: soilPhValue,
          updated_at: new Date().toISOString(),
        })
        .eq('land_id', landId)

      if (phUpdateError) {
        console.warn('[HeavyMetal] farm_profiles pH update failed:', phUpdateError.message)
        // Non-fatal — continue with RPC
      } else {
        console.log(`[HeavyMetal] soil_ph updated to ${soilPhValue} (ISRIC pH: ${soilData.ph_h2o})`)
      }
    }

    // ══════════════════════════════════════════════════════
    // LAYERS 1-5: Run the SQL RPC
    // Now benefits from updated soil_ph in farm_profiles
    // ══════════════════════════════════════════════════════
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'detect_and_save_metal_risk',
      { p_land_id: landId }
    )

    if (rpcError) {
      console.error('[HeavyMetal] RPC error:', rpcError.message)
      return { success: false, error: rpcError.message }
    }

    const rpc = rpcResult as {
      metal_risk_score: number
      severity: string
      metal_type: string
      inserted: boolean
      notes_bn: string
      layer_scores: Record<string, number>
    }

    // ══════════════════════════════════════════════════════
    // LAYER 6 — STEP C: Apply pH bonus to saved report
    // computePhRiskModifier returns 0-10 bonus points
    // This adjusts the confidence_score of the saved report
    // ══════════════════════════════════════════════════════
    const phModifier = computePhRiskModifier(soilData.ph_h2o)
    const phExplanation = getMetalMobilityExplanation(soilData.ph_h2o)

    if (phModifier > 0 && rpc.inserted && soilData.data_source === 'isric_soilgrids') {
      // Fetch the report we just inserted
      const { data: latestReport } = await supabase
        .from('heavy_metal_reports')
        .select('id, confidence_score, notes')
        .eq('land_id', landId)
        .order('reported_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestReport) {
        const currentScore = latestReport.confidence_score ?? 0
        // Add pH bonus (0-0.10 range) to confidence score, cap at 1.0
        const adjustedScore = Math.min(1.0, currentScore + phModifier / 100)
        // Append ISRIC explanation to notes
        const updatedNotes = latestReport.notes
          ? `${latestReport.notes} | ${phExplanation}`
          : phExplanation

        const { error: updateError } = await supabase
          .from('heavy_metal_reports')
          .update({
            confidence_score: adjustedScore,
            notes: updatedNotes,
          })
          .eq('id', latestReport.id)

        if (updateError) {
          console.warn('[HeavyMetal] Layer 6 confidence update failed:', updateError.message)
        } else {
          console.log(
            `[HeavyMetal] Layer 6 applied: confidence ${currentScore.toFixed(2)} → ${adjustedScore.toFixed(2)} (+${phModifier / 100})`
          )
        }
      }
    }

    // ══════════════════════════════════════════════════════
    // Return full result including Layer 6 data
    // ══════════════════════════════════════════════════════
    return {
      success: true,
      result: {
        ...rpc,
        layer6_isric: {
          ph_h2o: soilData.ph_h2o,
          ph_modifier_applied: phModifier,
          ph_explanation: phExplanation,
          data_source: soilData.data_source,
        },
      },
      isric: soilData,
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[HeavyMetal] Unhandled exception:', message)
    return { success: false, error: message }
  }
}

/**
 * Fetches the most recent heavy metal risk report for a land plot.
 * Used by FarmRiskCard and HeavyMetalRiskCard UI components.
 */
export async function getHeavyMetalReport(landId: string) {
  // Service role client — bypasses RLS for reads
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('heavy_metal_reports')
    .select('*')
    .eq('land_id', landId)
    .order('reported_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[HeavyMetal] fetch error:', error.message)
    return null
  }

  return data
}

/**
 * Pre-scan prior: call this BEFORE scan to get baseline metal risk
 * from static data only (Layer 1 + Layer 5).
 * Solves cold start problem — works with zero scan history.
 */
export async function getPreScanMetalPrior(
  landId: string,
  lat: number,
  lng: number
): Promise<{
  prior_score: number
  zone_risk: number
  proximity_risk: number
  isric_ph: number | null
  isric_source: string
  recommendation: 'low' | 'watch' | 'high'
}> {
  try {
    const supabase = await createServerClient()

    // Fetch ISRIC in parallel with RPC
    const [soilData, rpcResult] = await Promise.all([
      fetchISRICSoilData(lat, lng),
      supabase.rpc('detect_and_save_metal_risk', { p_land_id: landId }),
    ])

    const rpc = rpcResult.data as {
      layer_scores: { zone_static: number; industrial_proximity: number }
      prior_score: number
    } | null

    const priorScore = rpc?.prior_score ?? 0
    const phModifier = computePhRiskModifier(soilData.ph_h2o)
    const totalPrior = Math.min(100, priorScore + phModifier)

    return {
      prior_score: totalPrior,
      zone_risk: rpc?.layer_scores?.zone_static ?? 0,
      proximity_risk: rpc?.layer_scores?.industrial_proximity ?? 0,
      isric_ph: soilData.ph_h2o,
      isric_source: soilData.data_source,
      recommendation:
        totalPrior >= 25 ? 'high' :
        totalPrior >= 10 ? 'watch' : 'low',
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown'
    console.error('[HeavyMetal] getPreScanMetalPrior failed:', message)
    return {
      prior_score: 0,
      zone_risk: 0,
      proximity_risk: 0,
      isric_ph: null,
      isric_source: 'fallback',
      recommendation: 'low',
    }
  }
}
