import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS for aggregated queries
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─────────────────────────────────────────────────────────────────
// Auth: validate API key from header
// ─────────────────────────────────────────────────────────────────
async function validateApiKey(req: NextRequest): Promise<{
  valid:  boolean
  buyer?: { id: string; org_name: string; org_type: string; subscription_tier: string; licensed_districts: string[]; can_access_heavy_metals: boolean; can_access_loss_estimates: boolean }
  error?: string
}> {
  const apiKey = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('api_key')

  if (!apiKey) return { valid: false, error: 'x-api-key header required' }

  const { data: buyer, error } = await supabase
    .from('data_buyers')
    .select('id, org_name, org_type, subscription_tier, licensed_districts, can_access_heavy_metals, can_access_loss_estimates, is_active, contract_ends_at')
    .eq('api_key', apiKey)
    .maybeSingle()

  if (error || !buyer) return { valid: false, error: 'Invalid API key' }
  if (!buyer.is_active) return { valid: false, error: 'Account suspended' }
  if (buyer.contract_ends_at && new Date(buyer.contract_ends_at) < new Date()) {
    return { valid: false, error: 'Contract expired' }
  }

  return { valid: true, buyer }
}

// ─────────────────────────────────────────────────────────────────
// Log the export
// ─────────────────────────────────────────────────────────────────
async function logExport(params: {
  buyerId:      string
  exportType:   string
  district?:    string
  dateFrom?:    string
  dateTo?:      string
  recordsCount: number
  queryParams:  object
  ipAddress?:   string
}) {
  await supabase.from('data_export_logs').insert({
    buyer_id:      params.buyerId,
    export_type:   params.exportType,
    district:      params.district ?? null,
    date_from:     params.dateFrom ?? null,
    date_to:       params.dateTo   ?? null,
    records_count: params.recordsCount,
    query_params:  params.queryParams,
    ip_address:    params.ipAddress ?? null,
    status:        'success',
  })
}

type HeavyMetalReport = {
  metal_type: string
  confidence_score: number | null
  severity: string | null
  reported_at: string
}

// ─────────────────────────────────────────────────────────────────
// GET /api/risk-report?land_id=xxx&api_key=xxx
// Single farm risk + loss for authenticated buyers
// ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req)
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const landId = req.nextUrl.searchParams.get('land_id')

  if (!landId) {
    return NextResponse.json({ error: 'land_id required' }, { status: 400 })
  }

  // Fetch from view (anonymized — no farmer PII except farm data)
  const { data: summary, error } = await supabase
    .from('v_farm_risk_summary')
    .select(`
      land_id, land_name_bn, area_bigha, crop_id, district,
      risk_score, risk_level, breakdown, dominant_threat, advice_bn,
      calculated_at, valid_until,
      expected_loss_bdt, loss_percentage, loss_crop_name
    `)
    .eq('land_id', landId)
    .maybeSingle()

  if (error || !summary) {
    return NextResponse.json({ error: 'Farm not found or no risk data' }, { status: 404 })
  }

  // Heavy metals — only if buyer has permission
  let heavyMetals: HeavyMetalReport[] = []
  if (auth.buyer!.can_access_heavy_metals) {
    const { data: metals } = await supabase
      .from('heavy_metal_reports')
      .select('metal_type, confidence_score, severity, reported_at')
      .eq('land_id', landId)
      .eq('is_anonymized_for_export', true)
      .order('reported_at', { ascending: false })
      .limit(5)
    heavyMetals = metals ?? []
  }

  let expectedLoss = summary.expected_loss_bdt ?? null
  let lossPercentage = summary.loss_percentage ?? null
  let lossCropName = summary.loss_crop_name ?? null

  if (!auth.buyer!.can_access_loss_estimates) {
    expectedLoss = null
    lossPercentage = null
    lossCropName = null
  } else if ((expectedLoss == null || lossPercentage == null || lossCropName == null) && summary.risk_score != null) {
    const { data: existingLosses, error: lossFetchError } = await supabase
      .from('loss_estimates')
      .select('expected_loss_bdt, loss_percentage, crop_name, estimated_at')
      .eq('land_id', landId)
      .order('estimated_at', { ascending: false })
      .limit(1)

    if (lossFetchError) {
      console.error('[API] loss_estimates fetch error:', lossFetchError.message)
    } else if (existingLosses && existingLosses.length > 0) {
      const latest = existingLosses[0]
      expectedLoss = latest.expected_loss_bdt ?? null
      lossPercentage = latest.loss_percentage ?? null
      lossCropName = latest.crop_name ?? null
    } else {
      const { data: lossData, error: lossRpcError } = await supabase.rpc('estimate_crop_loss', {
        p_land_id: landId,
      })
      if (lossRpcError) {
        console.error('[API] estimate_crop_loss error:', lossRpcError.message)
      } else if (lossData && typeof lossData === 'object' && !('error' in lossData)) {
        const loss = lossData as {
          expected_loss_bdt?: number
          loss_percentage?: number
          crop_name?: string
        }
        expectedLoss = loss.expected_loss_bdt ?? null
        lossPercentage = loss.loss_percentage ?? null
        lossCropName = loss.crop_name ?? null
      }
    }
  }

  await logExport({
    buyerId:      auth.buyer!.id,
    exportType:   'single_farm_risk',
    recordsCount: 1,
    queryParams:  { land_id: landId },
    ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    land_id:           summary.land_id,
    land_name_bn:      summary.land_name_bn,
    area_bigha:        summary.area_bigha,
    crop_id:           summary.crop_id,
    district:          summary.district,
    risk_score:        summary.risk_score,
    risk_level:        summary.risk_level,
    breakdown:         summary.breakdown,
    dominant_threat:   summary.dominant_threat,
    advice_bn:         summary.advice_bn,
    calculated_at:     summary.calculated_at,
    valid_until:       summary.valid_until,
    expected_loss_bdt: expectedLoss,
    loss_percentage:   lossPercentage,
    loss_crop_name:    lossCropName,
    heavy_metals:      heavyMetals,
    generated_at:      new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────
// POST /api/risk-report/bulk
// District-level aggregate for insurance/govt/research
// Body: { district, date_from?, date_to?, export_type? }
// ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req)
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  let body: {
    district:    string
    date_from?:  string
    date_to?:    string
    export_type?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.district) {
    return NextResponse.json({ error: 'district required' }, { status: 400 })
  }

  // Check district license (premium buyers get all; others need license)
  const buyer = auth.buyer!
  if (
    buyer.subscription_tier !== 'premium' &&
    buyer.licensed_districts.length > 0 &&
    !buyer.licensed_districts.map(d => d.toLowerCase()).includes(body.district.toLowerCase())
  ) {
    return NextResponse.json({
      error: `District "${body.district}" not in your license. Upgrade to premium or add district.`
    }, { status: 403 })
  }

  const dateFrom = body.date_from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const dateTo   = body.date_to   ?? new Date().toISOString().slice(0, 10)

  // Call the aggregate RPC
  const { data: aggregate, error } = await supabase.rpc('get_district_risk_aggregate', {
    p_district:  body.district,
    p_date_from: dateFrom,
    p_date_to:   dateTo,
  })

  if (error) {
    console.error('[API] district aggregate error:', error.message)
    return NextResponse.json({ error: 'Aggregation failed' }, { status: 500 })
  }

  // Strip heavy metals if buyer doesn't have access
  let result = aggregate
  if (!buyer.can_access_heavy_metals && result?.heavy_metal_hotspots) {
    result = { ...result, heavy_metal_hotspots: [] }
  }

  await logExport({
    buyerId:      buyer.id,
    exportType:   body.export_type ?? 'district_aggregate',
    district:     body.district,
    dateFrom,
    dateTo,
    recordsCount: result?.total_farms_analyzed ?? 0,
    queryParams:  body,
    ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    ...result,
    buyer_org:  buyer.org_name,
    tier:       buyer.subscription_tier,
  })
}
