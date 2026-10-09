import { NextRequest, NextResponse } from 'next/server'
import {
  buildPopulationHeatPoints,
  buildRiskRanking,
  buildWorkerOrders,
  buildZoneRiskDataset,
  getDhakaMockObservationInputs,
} from '@/lib/ecogrid/riskEngine'

export async function GET(req: NextRequest) {
  try {
    const includeMock = (req.nextUrl.searchParams.get('demo') ?? 'true') !== 'false'

    if (!includeMock) {
      return NextResponse.json(
        {
          success: false,
          error: 'ডেটা উৎস কনফিগার করা নেই। (Data source is not configured.)',
        },
        { status: 400 }
      )
    }

    const observedAt = new Date()
    const zones = buildZoneRiskDataset(getDhakaMockObservationInputs(), observedAt)
    const ranking = buildRiskRanking(zones)
    const workerOrders = buildWorkerOrders(zones)
    const heatPoints = buildPopulationHeatPoints(zones)

    return NextResponse.json({
      success: true,
      generated_at: observedAt.toISOString(),
      city: 'Dhaka',
      zones,
      ranking,
      worker_orders: workerOrders,
      population_heat_points: heatPoints,
      top_risk_summary: ranking.slice(0, 3).map((zone) => ({
        zone_id: zone.zone_id,
        zone_name_bn: zone.zone_name_bn,
        risk_score: zone.risk_score,
        risk_level: zone.risk_level,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'জোন রিস্ক লোড করতে সমস্যা হয়েছে। (Failed to load zone risks.)',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
