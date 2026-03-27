'use server'

import { createClient } from '@/app/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { fetchSatelliteWaterData } from './industrial'
import type {
  WaterAlert,
  WaterSource,
  WaterReportInput,
} from '@/app/types/water'

// ─────────────────────────────────────────
// Fetch active water alerts near a farmer
// ─────────────────────────────────────────
export async function getWaterAlertsForFarmer(
  farmerId: string,
  radiusKm: number = 5
): Promise<WaterAlert[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'get_water_alerts_near_farmer',
    { p_farmer_id: farmerId, p_radius_km: radiusKm }
  )

  if (error) {
    console.error('[Water] alerts fetch error:', error.message)
    return []
  }

  return (data ?? []) as WaterAlert[]
}

// ─────────────────────────────────────────
// Fetch water sources for map rendering
// ─────────────────────────────────────────
export async function getWaterSourcesNear(
  lat: number,
  lng: number,
  radiusKm: number = 10
): Promise<WaterSource[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_water_sources_near', {
    p_lat: lat, p_lng: lng, p_radius_km: radiusKm,
  })

  if (error) {
    console.error('[Water] sources fetch error:', error.message)
    return []
  }

  return (data ?? []) as WaterSource[]
}

// ─────────────────────────────────────────
// Report a water source (from survey step)
// ─────────────────────────────────────────
export async function reportWaterSource(
  input: WaterReportInput
): Promise<{ success: boolean; source_id?: string; error?: string }> {
  const supabase = await createClient()

  // Get current user (farmer)
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return { success: false, error: 'অনুমোদিত নন' }
  }

  // Validate Bangladesh bounding box
  if (
    input.lat < 20.5 || input.lat > 26.7 ||
    input.lng < 87.9 || input.lng > 92.7
  ) {
    return { success: false, error: 'অবস্থান বাংলাদেশের বাইরে' }
  }

  const { data, error } = await supabase.rpc('upsert_water_source', {
    p_farmer_id: user.id,
    p_land_id:   input.land_id,
    p_lat:       input.lat,
    p_lng:       input.lng,
    p_type:      input.type,
    p_name_bn:   input.name_bn ?? null,
    p_color:     input.color,
    p_odor:      input.odor,
    p_fish_kill: input.fish_kill,
  })

  if (error) {
    console.error('[Water] upsert error:', error.message)
    return { success: false, error: 'সংরক্ষণে সমস্যা হয়েছে' }
  }

  const sourceId = data as string

  // Best-effort satellite enrichment after user report is saved
  const sat = await fetchSatelliteWaterData(input.lat, input.lng)
  if (sat.success) {
    const ndwiValue = typeof sat.data?.ndwi === 'number' && isFinite(sat.data.ndwi)
      ? sat.data.ndwi
      : null

    const { error: enrichError } = await supabase
      .from('water_sources')
      .update({
        last_satellite_check: new Date().toISOString(),
        last_ndwi_value: ndwiValue,
      })
      .eq('source_id', sourceId)

    if (enrichError) {
      console.error('[Water] satellite enrichment update failed:', enrichError.message)
    }
  } else {
    console.warn('[Water] satellite enrichment skipped:', sat.error)
  }

  revalidatePath('/dashboard')
  return { success: true, source_id: sourceId }
}

// ─────────────────────────────────────────
// Mark an alert as read
// ─────────────────────────────────────────
export async function markWaterAlertRead(
  farmerId: string,
  eventId: string
): Promise<void> {
  const supabase = await createClient()
  await supabase.rpc('mark_water_alert_read', {
    p_farmer_id: farmerId,
    p_event_id:  eventId,
  })
}

// ─────────────────────────────────────────
// Resolve a water pollution event (admin)
// ─────────────────────────────────────────
export async function resolveWaterEvent(
  eventId: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('water_pollution_events')
    .update({ is_active: false, resolved_at: new Date().toISOString() })
    .eq('event_id', eventId)

  if (error) return { success: false }
  revalidatePath('/dashboard')
  return { success: true }
}
