'use server'

import { createClient } from '@/app/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface RiskScore {
  risk_score:      number
  risk_level:      'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  breakdown: {
    industrial: number
    water:      number
    community:  number
    air:        number
    soil:       number
    weather:    number
  }
  dominant_threat: string
  advice_bn:       string
  calculated_at:   string
}

export interface LossEstimate {
  expected_loss_bdt: number
  loss_percentage:   number
  area_acres:        number
  crop_name:         string
  price_per_maund:   number
  yield_per_acre:    number
  risk_score:        number
  risk_level:        string
}

export interface FarmRiskSummary {
  land_id:           string
  land_name:         string
  land_name_bn:      string | null
  area_bigha:        number
  crop_id:           string | null
  risk_score:        number | null
  risk_level:        string | null
  breakdown:         RiskScore['breakdown'] | null
  dominant_threat:   string | null
  advice_bn:         string | null
  calculated_at:     string | null
  valid_until:       string | null
  expected_loss_bdt: number | null
  loss_percentage:   number | null
  loss_crop_name:    string | null
}

// ─────────────────────────────────────────────────────────────────
// Calculate risk score for a land
// ─────────────────────────────────────────────────────────────────
export async function calculateFarmRisk(landId: string): Promise<{
  success: boolean
  data?: RiskScore
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { success: false, error: 'লগইন করুন' }

    // Verify land belongs to farmer
    const { data: land } = await supabase
      .from('farmer_lands')
      .select('land_id')
      .eq('land_id', landId)
      .eq('farmer_id', user.id)
      .maybeSingle()

    if (!land) return { success: false, error: 'জমি পাওয়া যায়নি' }

    const { data, error } = await supabase.rpc('calculate_farm_risk_score_v2', {
      p_land_id: landId,
    })

    if (error) {
      console.error('[Risk] calculate error:', error.message)
      return { success: false, error: 'রিস্ক স্কোর হিসাব করতে সমস্যা হয়েছে' }
    }

    revalidatePath('/dashboard')
    return { success: true, data: data as RiskScore }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Risk] unexpected error:', message)
    return { success: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────
// Estimate crop loss for a land
// ─────────────────────────────────────────────────────────────────
export async function estimateCropLoss(landId: string): Promise<{
  success: boolean
  data?: LossEstimate
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { success: false, error: 'লগইন করুন' }

    const { data, error } = await supabase.rpc('estimate_crop_loss', {
      p_land_id: landId,
    })

    if (error) {
      console.error('[Loss] estimate error:', error.message)
      return { success: false, error: 'ক্ষতি হিসাব করতে সমস্যা হয়েছে' }
    }

    revalidatePath('/dashboard')
    return { success: true, data: data as LossEstimate }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────
// Update crop price for a land
// ─────────────────────────────────────────────────────────────────
export async function updateCropPrice(
  landId:       string,
  cropName:     string,
  pricePerMaund: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!pricePerMaund || pricePerMaund <= 0) {
      return { success: false, error: 'সঠিক দাম দিন' }
    }

    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { success: false, error: 'লগইন করুন' }

    const { error } = await supabase.rpc('upsert_crop_price', {
      p_land_id:        landId,
      p_farmer_id:      user.id,
      p_crop_name:      cropName,
      p_price_per_maund: pricePerMaund,
    })

    if (error) {
      console.error('[CropPrice] upsert error:', error.message)
      return { success: false, error: 'দাম সেভ করতে সমস্যা হয়েছে' }
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────
// Get all farm risk summaries for a farmer (dashboard overview)
// ─────────────────────────────────────────────────────────────────
export async function getFarmRiskSummaries(farmerId: string): Promise<FarmRiskSummary[]> {
  try {
    const supabase = await createClient()

    const { data: lands, error: landError } = await supabase
      .from('farmer_lands')
      .select('land_id, land_name, land_name_bn, area_bigha, crop_id')
      .eq('farmer_id', farmerId)

    if (landError) {
      console.error('[Risk] summaries land fetch error:', landError.message)
      return []
    }

    if (!lands || lands.length === 0) return []

    const { data: scores, error: scoreError } = await supabase
      .from('farm_risk_scores')
      .select('id, land_id, risk_score, risk_level, breakdown, dominant_threat, advice_bn, calculated_at, valid_until')
      .eq('farmer_id', farmerId)
      .eq('is_current', true)
      .order('calculated_at', { ascending: false })

    if (scoreError) {
      console.error('[Risk] summaries score fetch error:', scoreError.message)
      return []
    }

    const riskByLand = new Map<string, (typeof scores)[number]>()
    const riskIds: string[] = []

    for (const score of scores ?? []) {
      if (!riskByLand.has(score.land_id)) {
        riskByLand.set(score.land_id, score)
        if (score.id) riskIds.push(score.id)
      }
    }

    const lossByRiskId = new Map<string, {
      expected_loss_bdt: number | null
      loss_percentage:   number | null
      crop_name:         string | null
    }>()

    if (riskIds.length > 0) {
      const { data: losses, error: lossError } = await supabase
        .from('loss_estimates')
        .select('risk_score_id, expected_loss_bdt, loss_percentage, crop_name, estimated_at')
        .in('risk_score_id', riskIds)
        .order('estimated_at', { ascending: false })

      if (lossError) {
        console.error('[Risk] summaries loss fetch error:', lossError.message)
      } else {
        for (const loss of losses ?? []) {
          if (loss?.risk_score_id && !lossByRiskId.has(loss.risk_score_id)) {
            lossByRiskId.set(loss.risk_score_id, loss)
          }
        }
      }
    }

    return (lands ?? []).map((land) => {
      const risk = riskByLand.get(land.land_id)
      const loss = risk?.id ? lossByRiskId.get(risk.id) : undefined

      return {
        land_id:           land.land_id,
        land_name:         land.land_name,
        land_name_bn:      land.land_name_bn,
        area_bigha:        land.area_bigha,
        crop_id:           land.crop_id,
        risk_score:        risk?.risk_score ?? null,
        risk_level:        risk?.risk_level ?? null,
        breakdown:         risk?.breakdown ?? null,
        dominant_threat:   risk?.dominant_threat ?? null,
        advice_bn:         risk?.advice_bn ?? null,
        calculated_at:     risk?.calculated_at ?? null,
        valid_until:       risk?.valid_until ?? null,
        expected_loss_bdt: loss?.expected_loss_bdt ?? null,
        loss_percentage:   loss?.loss_percentage ?? null,
        loss_crop_name:    loss?.crop_name ?? null,
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Risk] unexpected summaries error:', message)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────
// Get current crop price for a land
// ─────────────────────────────────────────────────────────────────
export async function getCropPrice(landId: string): Promise<{
  crop_name:      string
  price_per_maund: number
  updated_at:     string
} | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('crop_market_prices')
      .select('crop_name, price_per_maund, updated_at')
      .eq('land_id', landId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null
    return data
  } catch {
    return null
  }
}
