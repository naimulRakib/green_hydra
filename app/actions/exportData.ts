'use server'

import { createClient } from '@/app/utils/supabase/server'

export type ExportBuyerType = 'govt' | 'insurance' | 'ngo' | 'exporter'

interface ExportRow {
  land_name_bn: string | null
  district: string | null
  area_bigha: number | null
  crop_id: string | null
  stress_type: string | null
  biotic_score: number | null
  abiotic_score: number | null
  heavy_metal_score: number | null
  ai_confidence: number | null
  created_at: string | null
  compound_stress: boolean | null
  risk_score: number | null
  risk_level: string | null
  dominant_threat: string | null
  expected_loss_bdt: number | null
  metal_type: string | null
  metal_severity: string | null
  metal_confidence: number | null
  verification_status: string | null
}

/**
 * Generate anonymized data export for farmer.
 * Strips PII (farmer_id, exact GPS). Groups by buyer type.
 */
export async function generateFarmerExport(
  buyerType: ExportBuyerType
): Promise<{ success: boolean; data?: ExportRow[]; csv?: string; message?: string; meta?: object }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { success: false, message: 'লগইন করুন।' }
    }

    // Check consent
    const { data: farmer } = await supabase
      .from('farmers')
      .select('data_sharing_consent, zone_id')
      .eq('id', user.id)
      .single()

    if (!farmer?.data_sharing_consent) {
      return {
        success: false,
        message: 'ডেটা শেয়ারিং সম্মতি চালু করুন। ড্যাশবোর্ডের উপরে "ডেটা শেয়ারিং" টগল চালু করুন।',
      }
    }

    // Fetch scan logs with land details
    const { data: scans, error: scanErr } = await supabase
      .from('scan_logs')
      .select(`
        stress_type, biotic_score, abiotic_score, heavy_metal_score,
        ai_confidence, created_at, compound_stress, verification_status,
        land_id,
        farmer_lands!inner(land_name_bn, area_bigha, crop_id, zone_id)
      `)
      .eq('farmer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (scanErr) {
      console.error('[Export] scan_logs fetch error:', scanErr.message)
      return { success: false, message: 'ডেটা আনতে সমস্যা হয়েছে।' }
    }

    // Fetch zone → district mapping
    const zoneId = farmer.zone_id
    let district = 'অজানা'
    if (zoneId) {
      const { data: zone } = await supabase
        .from('kb_zones')
        .select('district')
        .eq('zone_id', zoneId)
        .maybeSingle()
      district = zone?.district ?? 'অজানা'
    }

    // Fetch heavy metal reports
    const landIds = [...new Set((scans ?? []).map(s => s.land_id).filter(Boolean))]
    const metalMap: Record<string, { metal_type: string; severity: string; confidence_score: number }> = {}
    if (landIds.length > 0) {
      const { data: metals } = await supabase
        .from('heavy_metal_reports')
        .select('land_id, metal_type, severity, confidence_score')
        .in('land_id', landIds)
        .order('reported_at', { ascending: false })

      for (const m of metals ?? []) {
        if (!metalMap[m.land_id]) {
          metalMap[m.land_id] = m
        }
      }
    }

    // Fetch risk summaries
    const riskMap: Record<string, { risk_score: number; risk_level: string; dominant_threat: string; expected_loss_bdt: number | null }> = {}
    if (landIds.length > 0) {
      const { data: risks } = await supabase
        .from('v_farm_risk_summary')
        .select('land_id, risk_score, risk_level, dominant_threat, expected_loss_bdt')
        .in('land_id', landIds)

      for (const r of risks ?? []) {
        riskMap[r.land_id] = r
      }
    }

    // Build export rows (anonymized — no farmer_id, no exact GPS)
    const rows: ExportRow[] = (scans ?? []).map((scan) => {
      const land = (scan as Record<string, unknown>).farmer_lands as Record<string, unknown> | null
      const metal = metalMap[scan.land_id]
      const risk = riskMap[scan.land_id]

      const row: ExportRow = {
        land_name_bn: (land?.land_name_bn as string) ?? null,
        district,
        area_bigha: (land?.area_bigha as number) ?? null,
        crop_id: (land?.crop_id as string) ?? null,
        stress_type: scan.stress_type,
        biotic_score: scan.biotic_score,
        abiotic_score: scan.abiotic_score,
        heavy_metal_score: scan.heavy_metal_score,
        ai_confidence: scan.ai_confidence,
        created_at: scan.created_at,
        compound_stress: scan.compound_stress,
        risk_score: risk?.risk_score ?? null,
        risk_level: risk?.risk_level ?? null,
        dominant_threat: risk?.dominant_threat ?? null,
        expected_loss_bdt: null, // Only for insurance
        metal_type: metal?.metal_type ?? null,
        metal_severity: metal?.severity ?? null,
        metal_confidence: metal?.confidence_score ?? null,
        verification_status: scan.verification_status,
      }

      // Filter fields by buyer type
      if (buyerType === 'insurance') {
        row.expected_loss_bdt = risk?.expected_loss_bdt ?? null
      }

      // NGO doesn't get loss estimates
      if (buyerType === 'ngo') {
        row.expected_loss_bdt = null
      }

      // Exporter only gets heavy metal + crop info
      if (buyerType === 'exporter') {
        row.biotic_score = null
        row.abiotic_score = null
        row.risk_score = null
        row.risk_level = null
        row.dominant_threat = null
        row.expected_loss_bdt = null
      }

      return row
    })

    // Generate CSV
    if (rows.length === 0) {
      return { success: false, message: 'কোনো ডেটা পাওয়া যায়নি।' }
    }

    const headers = Object.keys(rows[0]).filter(k => {
      // Skip null-only columns
      return rows.some(r => (r as unknown as Record<string, unknown>)[k] != null)
    })

    const csvLines = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => {
          const val = (r as unknown as Record<string, unknown>)[h]
          if (val == null) return ''
          if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`
          return String(val)
        }).join(',')
      ),
    ]

    const buyerLabels: Record<ExportBuyerType, string> = {
      govt: '🏛️ সরকার (DOE/DAE)',
      insurance: '🏦 বীমা কোম্পানি',
      ngo: '🌍 NGO/গবেষণা',
      exporter: '📦 এক্সপোর্টার',
    }

    return {
      success: true,
      data: rows,
      csv: csvLines.join('\n'),
      meta: {
        buyer_type: buyerType,
        buyer_label: buyerLabels[buyerType],
        total_records: rows.length,
        district,
        exported_at: new Date().toISOString(),
        farmer_consent: true,
        anonymized: true,
        fields_included: headers,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Export] Error:', message)
    return { success: false, message: 'এক্সপোর্ট ব্যর্থ হয়েছে।' }
  }
}
