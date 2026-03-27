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
 * LAYER 7 (NEW): Live scan-time score from route.ts diagnostic engine
 *
 * Flow:
 *   1. Fetch ISRIC pH for GPS coordinates
 *   2. Update farm_profiles.soil_ph (feeds Layer 2 of RPC)
 *   3. Call detect_and_save_metal_risk RPC (Layers 1-5)
 *   4. Apply ISRIC pH bonus to confidence_score (Layer 6 post-RPC)
 *   5. Apply LIVE scan score if provided (Layer 7 — closes async gap)
 *   6. Update heavy_metal_reports with final adjusted score
 */
export async function triggerHeavyMetalDetection(
  landId: string,
  lat: number,
  lng: number,
  liveScanScore?: number  // ← NEW: Live score from current scan's scoreHeavyMetal()
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

    // ══════════════════════════════════════════════════════════════════════════
    // LAYER 7 (NEW): Apply LIVE Scan Score (Closes the Async Gap)
    // If route.ts computed a live score during THIS scan, use it to update
    // the report immediately so the NEXT scan sees fresh data
    // ══════════════════════════════════════════════════════════════════════════
    if (liveScanScore !== undefined && liveScanScore > 0 && rpc.inserted) {
      const { data: latestReport } = await supabase
        .from('heavy_metal_reports')
        .select('id, confidence_score, notes')
        .eq('land_id', landId)
        .order('reported_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestReport) {
        const currentScore = latestReport.confidence_score ?? 0
        // Blend RPC score with live scan score (weighted average for stability)
        const blendedScore = Math.min(1.0, currentScore * 0.6 + liveScanScore * 0.4)

        const updatedNotes = latestReport.notes
          ? `${latestReport.notes} | Live scan score: ${(liveScanScore * 100).toFixed(0)}% (blended)`
          : `Live scan score: ${(liveScanScore * 100).toFixed(0)}% (blended)`

        const { error: liveUpdateError } = await supabase
          .from('heavy_metal_reports')
          .update({
            confidence_score: blendedScore,
            notes: updatedNotes,
          })
          .eq('id', latestReport.id)

        if (liveUpdateError) {
          console.warn('[HeavyMetal] Layer 7 live score update failed:', liveUpdateError.message)
        } else {
          console.log(
            `[HeavyMetal] Layer 7 applied: ${currentScore.toFixed(2)} → ${blendedScore.toFixed(2)} (live: ${liveScanScore.toFixed(2)})`
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
 * Pre-scan prior: call this BEFORE scan to get baseline metal risk.
 * READ-ONLY — does NOT insert any data.
 * Sources: kb_zones (arsenic risk) + industrial_hotspots (proximity) + ISRIC pH (optional)
 */
export async function getPreScanMetalPrior(
  landId: string,
  lat: number,
  lng: number
): Promise<{
  prior_score: number
  zone_risk: number
  proximity_risk: number
  arsenic_zone: string
  known_metals: string[]
  isric_ph: number | null
  isric_source: string
  recommendation: 'low' | 'watch' | 'high'
}> {
  const FALLBACK = {
    prior_score: 0, zone_risk: 0, proximity_risk: 0,
    arsenic_zone: 'Low', known_metals: [] as string[],
    isric_ph: null, isric_source: 'fallback',
    recommendation: 'low' as const,
  }

  try {
    const supabase = await createServerClient()

    // ── Step 1: Get zone_id for this land ─────────────────────────────────
    const { data: landRow } = await supabase
      .from('farmer_lands')
      .select('zone_id')
      .eq('land_id', landId)
      .maybeSingle()

    const zoneId = landRow?.zone_id ?? null

    // ── Step 2: Fetch zone data + nearby factories + ISRIC in parallel ────
    const [zoneRes, hotspotsRes, soilData] = await Promise.all([
      zoneId
        ? supabase
            .from('kb_zones')
            .select('arsenic_zone_risk, known_metal_types, heavy_metal_risk')
            .eq('zone_id', zoneId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      supabase
        .from('industrial_hotspots')
        .select('id, max_plume_km, primary_pollutant_id')
        .eq('is_currently_active', true),

      // ISRIC pH — fully non-blocking, fallback if it fails
      fetchISRICSoilData(lat, lng).catch(() => ({
        ph_h2o: null,
        soil_organic_carbon: null,
        clay_content: null,
        data_source: 'fallback' as const,
      })),
    ])

    const zone = zoneRes.data

    // ── Step 3: Zone arsenic risk score (mirrors scoreHeavyMetal logic) ───
    let zoneRisk = 0
    const arsenic_zone: string = (zone?.arsenic_zone_risk as string) ?? 'Low'
    const known_metals: string[] = Array.isArray(zone?.known_metal_types)
      ? (zone.known_metal_types as string[])
      : []

    if (arsenic_zone === 'High')   zoneRisk = 20
    else if (arsenic_zone === 'Moderate') zoneRisk = 10
    if (zone?.heavy_metal_risk === true && zoneRisk === 0) zoneRisk = 5
    if (known_metals.length > 0) zoneRisk = Math.min(25, zoneRisk + 5)

    // ── Step 4: Industrial proximity score ────────────────────────────────
    // Lightweight: count active hotspots as proxy (full bearing calc in scan)
    const hotspotCount = hotspotsRes.data?.length ?? 0
    let proximityRisk = 0
    if (hotspotCount >= 5)      proximityRisk = 20
    else if (hotspotCount >= 3) proximityRisk = 12
    else if (hotspotCount >= 1) proximityRisk = 6

    // ── Step 5: ISRIC pH modifier ─────────────────────────────────────────
    let phModifier = 0
    if (soilData.ph_h2o !== null) {
      if (soilData.ph_h2o < 5.0)      phModifier = 10
      else if (soilData.ph_h2o < 5.5) phModifier = 7
      else if (soilData.ph_h2o < 6.0) phModifier = 4
      else if (soilData.ph_h2o > 8.0) phModifier = 6
      else if (soilData.ph_h2o > 7.5) phModifier = 3
    }

    // ── Step 6: Total prior score ─────────────────────────────────────────
    const totalPrior = Math.min(100, zoneRisk + proximityRisk + phModifier)

    return {
      prior_score:    totalPrior,
      zone_risk:      zoneRisk,
      proximity_risk: proximityRisk,
      arsenic_zone,
      known_metals,
      isric_ph:       soilData.ph_h2o,
      isric_source:   soilData.data_source,
      recommendation:
        totalPrior >= 25 ? 'high' :
        totalPrior >= 10 ? 'watch' : 'low',
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown'
    console.error('[HeavyMetal] getPreScanMetalPrior failed:', message)
    return FALLBACK
  }
}


