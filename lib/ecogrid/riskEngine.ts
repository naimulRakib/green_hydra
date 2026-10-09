export type RiskLevel = 'danger' | 'moderate' | 'safe'

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface RiskBreakdown {
  aqi_score: number
  waste_density: number
  waterlog_risk: number
  industry_distance_risk: number
  population_density_risk: number
}

export interface ZoneRiskFeature {
  zone_id: string
  zone_name: string
  zone_name_bn: string
  centroid: { lat: number; lng: number }
  boundary: PolygonGeometry
  risk_score: number
  risk_level: RiskLevel
  breakdown: RiskBreakdown
  latest_aqi: number
  waste_reports_7d: number
  waterlog_events_30d: number
  nearest_industry_km: number
  population_density_per_km2: number
  last_updated: string
  risk_history_7d: Array<{ date: string; score: number }>
}

export interface ZoneObservationInput {
  zone_id: string
  zone_name: string
  zone_name_bn: string
  centroid_lat: number
  centroid_lng: number
  boundary?: PolygonGeometry
  aqi: number
  waste_reports_7d: number
  waterlog_events_30d: number
  nearest_industry_km: number
  population_density_per_km2: number
  observed_at?: string
}

export interface WorkerOrder {
  zone_id: string
  zone_name: string
  zone_name_bn: string
  risk_score: number
  priority: 'P1' | 'P2' | 'P3'
  reason: string
  nav_target: { lat: number; lng: number }
}

const WEIGHTS = {
  aqi: 0.3,
  waste: 0.2,
  waterlog: 0.2,
  industryDistance: 0.15,
  population: 0.15,
} as const

function clamp0to100(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeAqi(aqi: number): number {
  return clamp0to100((aqi / 500) * 100)
}

function normalizeWasteDensity(reportsPerKm2: number): number {
  // 0-30 reports/km² treated as full-scale risk for MVP
  return clamp0to100((reportsPerKm2 / 30) * 100)
}

function normalizeWaterlog(eventsPerMonth: number): number {
  // 0-20 events/month treated as full-scale risk
  return clamp0to100((eventsPerMonth / 20) * 100)
}

function normalizeIndustryDistance(distanceKm: number): number {
  // Closer industry => higher risk; >=10km treated low risk
  const safeDistance = 10
  const normalized = ((safeDistance - distanceKm) / safeDistance) * 100
  return clamp0to100(normalized)
}

function normalizePopulationDensity(density: number): number {
  // Dhaka ward dense range mapped to 0-100 (2k -> 35k people/km²)
  const min = 2000
  const max = 35000
  const normalized = ((density - min) / (max - min)) * 100
  return clamp0to100(normalized)
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return 'danger'
  if (score >= 40) return 'moderate'
  return 'safe'
}

function createRiskHistory(score: number, now: Date): Array<{ date: string; score: number }> {
  const history: Array<{ date: string; score: number }> = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(now.getDate() - i)
    const drift = ((i % 3) - 1) * 3
    history.push({
      date: date.toISOString().slice(0, 10),
      score: clamp0to100(score + drift),
    })
  }
  return history
}

export function computeZoneRisk(input: ZoneObservationInput, now = new Date()): ZoneRiskFeature {
  const breakdown: RiskBreakdown = {
    aqi_score: normalizeAqi(input.aqi),
    waste_density: normalizeWasteDensity(input.waste_reports_7d),
    waterlog_risk: normalizeWaterlog(input.waterlog_events_30d),
    industry_distance_risk: normalizeIndustryDistance(input.nearest_industry_km),
    population_density_risk: normalizePopulationDensity(input.population_density_per_km2),
  }

  const weightedScore =
    breakdown.aqi_score * WEIGHTS.aqi +
    breakdown.waste_density * WEIGHTS.waste +
    breakdown.waterlog_risk * WEIGHTS.waterlog +
    breakdown.industry_distance_risk * WEIGHTS.industryDistance +
    breakdown.population_density_risk * WEIGHTS.population

  const riskScore = clamp0to100(weightedScore)

  return {
    zone_id: input.zone_id,
    zone_name: input.zone_name,
    zone_name_bn: input.zone_name_bn,
    centroid: { lat: input.centroid_lat, lng: input.centroid_lng },
    boundary:
      input.boundary ??
      squareBoundary(input.centroid_lat, input.centroid_lng, 0.018),
    risk_score: riskScore,
    risk_level: scoreToRiskLevel(riskScore),
    breakdown,
    latest_aqi: input.aqi,
    waste_reports_7d: input.waste_reports_7d,
    waterlog_events_30d: input.waterlog_events_30d,
    nearest_industry_km: input.nearest_industry_km,
    population_density_per_km2: input.population_density_per_km2,
    last_updated: input.observed_at ?? now.toISOString(),
    risk_history_7d: createRiskHistory(riskScore, now),
  }
}

export function buildZoneRiskDataset(inputs: ZoneObservationInput[], now = new Date()): ZoneRiskFeature[] {
  return inputs.map((input) => computeZoneRisk(input, now))
}

export function buildRiskRanking(zones: ZoneRiskFeature[]): ZoneRiskFeature[] {
  return [...zones].sort((a, b) => b.risk_score - a.risk_score)
}

export function buildWorkerOrders(zones: ZoneRiskFeature[]): WorkerOrder[] {
  return buildRiskRanking(zones)
    .slice(0, 8)
    .map((zone) => ({
      zone_id: zone.zone_id,
      zone_name: zone.zone_name,
      zone_name_bn: zone.zone_name_bn,
      risk_score: zone.risk_score,
      priority: zone.risk_score >= 80 ? 'P1' : zone.risk_score >= 60 ? 'P2' : 'P3',
      reason: `AQI ${zone.latest_aqi}, waste ${zone.waste_reports_7d}/7d, waterlog ${zone.waterlog_events_30d}/30d`,
      nav_target: zone.centroid,
    }))
}

export function buildPopulationHeatPoints(zones: ZoneRiskFeature[]): Array<{ lat: number; lng: number; intensity: number }> {
  return zones.map((zone) => ({
    lat: zone.centroid.lat,
    lng: zone.centroid.lng,
    intensity: normalizePopulationDensity(zone.population_density_per_km2),
  }))
}

function squareBoundary(lat: number, lng: number, delta: number): PolygonGeometry {
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - delta, lat - delta],
      [lng + delta, lat - delta],
      [lng + delta, lat + delta],
      [lng - delta, lat + delta],
      [lng - delta, lat - delta],
    ]],
  }
}

export function getDhakaMockObservationInputs(): ZoneObservationInput[] {
  return [
    {
      zone_id: 'mirpur',
      zone_name: 'Mirpur',
      zone_name_bn: 'মিরপুর',
      centroid_lat: 23.8225,
      centroid_lng: 90.3654,
      aqi: 182,
      waste_reports_7d: 22,
      waterlog_events_30d: 12,
      nearest_industry_km: 2.8,
      population_density_per_km2: 29800,
    },
    {
      zone_id: 'mohammadpur',
      zone_name: 'Mohammadpur',
      zone_name_bn: 'মোহাম্মদপুর',
      centroid_lat: 23.7582,
      centroid_lng: 90.3587,
      aqi: 146,
      waste_reports_7d: 18,
      waterlog_events_30d: 9,
      nearest_industry_km: 4.1,
      population_density_per_km2: 27500,
    },
    {
      zone_id: 'jatrabari',
      zone_name: 'Jatrabari',
      zone_name_bn: 'যাত্রাবাড়ী',
      centroid_lat: 23.7118,
      centroid_lng: 90.4447,
      aqi: 210,
      waste_reports_7d: 27,
      waterlog_events_30d: 14,
      nearest_industry_km: 1.7,
      population_density_per_km2: 33200,
    },
    {
      zone_id: 'gulshan',
      zone_name: 'Gulshan',
      zone_name_bn: 'গুলশান',
      centroid_lat: 23.7925,
      centroid_lng: 90.4078,
      aqi: 112,
      waste_reports_7d: 7,
      waterlog_events_30d: 4,
      nearest_industry_km: 6.8,
      population_density_per_km2: 16800,
    },
    {
      zone_id: 'badda',
      zone_name: 'Badda',
      zone_name_bn: 'বাড্ডা',
      centroid_lat: 23.7808,
      centroid_lng: 90.4273,
      aqi: 161,
      waste_reports_7d: 16,
      waterlog_events_30d: 11,
      nearest_industry_km: 3.2,
      population_density_per_km2: 28600,
    },
    {
      zone_id: 'tejgaon',
      zone_name: 'Tejgaon',
      zone_name_bn: 'তেজগাঁও',
      centroid_lat: 23.7639,
      centroid_lng: 90.3974,
      aqi: 194,
      waste_reports_7d: 21,
      waterlog_events_30d: 8,
      nearest_industry_km: 1.2,
      population_density_per_km2: 24100,
    },
  ]
}
