import { createClient }        from '../utils/supabase/server'
import { fetchAndSaveWeather }  from '../actions/weather'
import { getHotspotsWithPlume, getCommunitySprayForLands, getSatelliteWaterData, fetchSatelliteWaterData } from '../actions/industrial'
import { getWaterAlertsForFarmer, getWaterSourcesNear } from '../actions/waterActions'
import { getFarmRiskSummaries } from '../actions/riskActions'
import { Suspense }            from 'react'
import { redirect }             from 'next/navigation'
import RefreshWeatherButton     from '../components/RefreshWeatherButton'
import LocationUpdater          from '../components/LocationUpdater'
import LandRegistration         from '../components/LandRegistration'
import WeeklySurvey             from '../components/WeeklySurveyV2'
import DashboardTabs            from '../components/DashboardTabs'
import LandDigest               from '../components/LandDigest'
import FarmRiskCard             from '../components/FarmRiskCard'
import HeavyMetalRiskCard       from '../components/HeavyMetalRiskCard'
import DiseaseScanner           from '../components/DiseaseScanner'
import HeavyMetalMap            from '../components/HeavyMetalMap'
import DataExport               from '../components/DataExport'
import WaterAlertBanner         from '../components/WaterAlertBanner'
import ConsentToggle            from '../components/ConsentToggle'
import AirExposureCard          from '../components/AirExposureCard'
import { ImpactMapWrapper }     from '../components/MapWrappers'
import type { LandPlotOverview } from '../components/OverviewMap'
import type { Hotspot } from '../components/ImpactMap'

// ── Helpers ────────────────────────────────────────────────────────────────

function parseLocation(raw: unknown): { lat: number; lng: number } | null {
  if (!raw) return null
  if (typeof raw === 'object' && raw !== null) {
    const coords = (raw as Record<string, unknown>).coordinates
    if (Array.isArray(coords)) {
      const [lng, lat] = coords
      if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
    }
  }
  if (typeof raw === 'string') {
    const clean = raw.replace(/SRID=\d+;/i, '').replace('POINT(', '').replace(')', '').trim()
    const [lngStr, latStr] = clean.split(/\s+/)
    const lat = parseFloat(latStr), lng = parseFloat(lngStr)
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }
  }
  return null
}

function windDegToCardinal(deg: number): string {
  const dirs = ['উত্তর','উ-পূ','পূর্ব','দ-পূ','দক্ষিণ','দ-প','পশ্চিম','উ-প']
  return dirs[Math.round(deg / 45) % 8]
}

// ISO week helper — matches WeeklySurvey component
function getISOWeek(d = new Date()): { week: number; year: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day  = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return {
    week: Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
    year: date.getUTCFullYear(),
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: 'overview' | 'land' | 'survey' | 'pollution' | 'risk' | 'scan' }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params    = await searchParams ?? {}
  // BUG FIX: Added 'risk' tab to valid tabs
  const activeTab = params.tab ?? 'overview'

  // ── 1. Farmer row ──────────────────────────────────────────────
  const { data: farmer } = await supabase
    .from('farmers')
    .select('farm_location, zone_id, badge_level, total_scans, data_sharing_consent')
    .eq('id', user.id)
    .single()

  const coords     = parseLocation(farmer?.farm_location)
  const currentLat = coords?.lat.toString() ?? ''
  const currentLng = coords?.lng.toString() ?? ''

  // ── 2. Weather ─────────────────────────────────────────────────
  const { data: weatherRecord } = await supabase
    .from('weather_details')
    .select('weather_data, last_fetched_at')
    .eq('farmer_id', user.id)
    .maybeSingle()

  const weather     = weatherRecord?.weather_data?.current ?? null
  const daily       = weatherRecord?.weather_data?.daily   ?? null
  const lastUpdated = weatherRecord?.last_fetched_at
    ? new Date(weatherRecord.last_fetched_at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
    : null

  const windFromDeg  = weather?.wind_direction_10m ?? 0
  const windSpeedKmh = weather?.wind_speed_10m     ?? 0
  const windDir      = windDegToCardinal(windFromDeg)

  const showPollutionData = activeTab === 'overview' || activeTab === 'pollution'

  const hotspots: Hotspot[] = (showPollutionData && coords)
    ? await getHotspotsWithPlume(coords.lat, coords.lng, windFromDeg, windSpeedKmh)
    : []

  const satelliteData = (showPollutionData && coords)
    ? await getSatelliteWaterData(coords.lat, coords.lng, 15.0)
    : []

  const waterAlerts = (showPollutionData)
    ? await getWaterAlertsForFarmer(user.id, 5)
    : []

  const waterSources = (showPollutionData && coords)
    ? await getWaterSourcesNear(coords.lat, coords.lng, 10)
    : []

  // ── 4. Farmer's land plots ─────────────────────────────────────
  let rawPlots: LandPlotOverview[] = []
  if (activeTab === 'overview' || activeTab === 'survey' || activeTab === 'risk' || activeTab === 'scan' || activeTab === 'pollution') {
    const { data } = await supabase.rpc('get_farmer_lands', { p_farmer_id: user.id })
    rawPlots = data ?? []
  }

  // ── 4b. Neighbour spray events ─────────────────────────────────
  const communitySpray = (activeTab === 'overview' && rawPlots.length > 0)
    ? await getCommunitySprayForLands(user.id, 1.0)
    : []

  // ── 5. Farmer land profiles ────────────────────────────────────
  type FarmProfileRow = {
    land_id: string
    soil_ph: string | null
    soil_texture: string | null
    pest_level: string | null
    smoke_exposure: string | null
    water_color: string | null
    updated_at: string | null
    scan_context: string | null
  }

  const profileMap: Record<string, FarmProfileRow> = {}
  if ((activeTab === 'overview' || activeTab === 'scan') && rawPlots.length > 0) {
    const { data: profiles } = await supabase
      .from('farm_profiles')
      .select('land_id, soil_ph, soil_texture, pest_level, smoke_exposure, water_color, updated_at, scan_context')
      .eq('farmer_id', user.id)
    if (profiles) {
      profiles.forEach((p: FarmProfileRow) => { profileMap[p.land_id] = p })
    }
  }

  // ── 6. Merge plots + profiles for OverviewMap ──────────────────
  const nowMs = new Date().getTime()

  const plots: LandPlotOverview[] = rawPlots.map((p) => {
    const prof = profileMap[p.land_id]
    const daysSince = prof?.updated_at
      ? Math.floor((nowMs - new Date(prof.updated_at).getTime()) / 86400000)
      : null
    const phApprox: Record<string, number> = { Acidic: 5.5, Normal: 6.5, Alkaline: 7.8 }
    return {
      ...p,
      soil_ph:          prof?.soil_ph ? phApprox[prof.soil_ph] ?? null : null,
      soil_moisture:    prof?.water_color ?? null,
      pest_pressure:    prof?.pest_level ?? null,
      last_survey_days: daysSince,
    }
  })

  // ── 7. Weekly survey completion gate ──────────────────────────
  // BUG FIX: schema uses 'week_number'/'year', not 'survey_week'/'survey_year'
  const { week: thisWeek, year: thisYear } = getISOWeek()
  let weeklyComplete = false
  let completedLandIds: string[] = []
  let respondedIds = new Set<string>()
  if (rawPlots.length > 0) {
    const { data: responses } = await supabase
      .from('surveys')
      .select('land_id')
      .eq('farmer_id', user.id)
      .eq('week_number', thisWeek)   // ← FIXED: was 'survey_week'
      .eq('year', thisYear)          // ← FIXED: was 'survey_year'
    respondedIds = new Set((responses ?? []).map((r: { land_id: string }) => r.land_id))
    completedLandIds = rawPlots.map((p) => p.land_id).filter((id: string) => respondedIds.has(id))
    weeklyComplete = rawPlots.length > 0 && completedLandIds.length >= rawPlots.length
  }

  // ── 7b. Add last_survey_days to rawPlots for DiseaseScanner ──────
  // If land has survey this week → 0, otherwise use farm_profile.updated_at or null
  const plotsWithSurvey = rawPlots.map((p) => {
    const hasSurveyThisWeek = respondedIds.has(p.land_id)
    const prof = profileMap[p.land_id]
    const daysSince = hasSurveyThisWeek
      ? 0
      : (prof?.updated_at
          ? Math.floor((new Date().getTime() - new Date(prof.updated_at).getTime()) / 86400000)
          : null)
    return { ...p, last_survey_days: daysSince }
  })

  // ── 8. Risk summaries for risk tab ────────────────────────────
  const riskSummaries = (activeTab === 'risk')
    ? await getFarmRiskSummaries(user.id)
    : []
  const riskMap = Object.fromEntries(riskSummaries.map(r => [r.land_id, r]))

  // Heavy metal scores for map
  type HeavyMetalMapPlot = {
    land_id: string
    land_name_bn: string
    lat: number
    lng: number
    heavy_metal_score: number | null
    severity: string | null
    metal_type: string | null
  }

  // Helper to extract centroid from GeoJSON
  function getGeoJSONCentroid(geojson: unknown): { lat: number; lng: number } | null {
    try {
      const geo = typeof geojson === 'string' ? JSON.parse(geojson) : geojson
      if (!geo || typeof geo !== 'object') return null

      const base = geo as Record<string, unknown>
      const geom = base.geometry
      const g = geom && typeof geom === 'object' ? (geom as Record<string, unknown>) : base

      const type = g.type
      const coordinates = g.coordinates

      let coords: number[][] = []

      if (type === 'Polygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
        coords = coordinates[0] as number[][]
      } else if (type === 'MultiPolygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
        coords = coordinates[0][0] as number[][]
      }

      if (coords.length === 0) return null

      // GeoJSON is [lng, lat]
      const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length
      const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length

      return { lat, lng }
    } catch {
      return null
    }
  }

  let hmMapPlots: HeavyMetalMapPlot[] = []
  if (activeTab === 'risk' && rawPlots.length > 0 && coords) {
    const landIds = rawPlots.map(p => p.land_id)
    // Get latest heavy metal score per land from scan_logs
    const { data: hmScans } = await supabase
      .from('scan_logs')
      .select('land_id, heavy_metal_score')
      .eq('farmer_id', user.id)
      .in('land_id', landIds)
      .order('created_at', { ascending: false })
    // Get heavy metal reports for severity + metal_type
    const { data: hmReports } = await supabase
      .from('heavy_metal_reports')
      .select('land_id, severity, metal_type')
      .in('land_id', landIds)
      .order('reported_at', { ascending: false })
    const hmScoreMap: Record<string, number> = {}
    for (const s of hmScans ?? []) {
      if (s.land_id && !(s.land_id in hmScoreMap) && typeof s.heavy_metal_score === 'number') {
        hmScoreMap[s.land_id] = s.heavy_metal_score
      }
    }
    const hmReportMap: Record<string, { severity: string; metal_type: string }> = {}
    for (const r of hmReports ?? []) {
      if (r.land_id && !(r.land_id in hmReportMap)) {
        hmReportMap[r.land_id] = r
      }
    }

    // Use actual land centroids instead of farm coordinates + offset
    hmMapPlots = rawPlots.map((p, i) => {
      const centroid = p.boundary_geojson
        ? getGeoJSONCentroid(p.boundary_geojson)
        : null

      return {
        land_id: p.land_id,
        land_name_bn: p.land_name_bn ?? p.land_name ?? `জমি ${i + 1}`,
        lat: centroid?.lat ?? (coords.lat + (i * 0.001)), // fallback to offset if no geojson
        lng: centroid?.lng ?? (coords.lng + (i * 0.001)),
        heavy_metal_score: hmScoreMap[p.land_id] ?? null,
        severity: hmReportMap[p.land_id]?.severity ?? null,
        metal_type: hmReportMap[p.land_id]?.metal_type ?? null,
      }
    })
  }

  let pollutionStats: {
    scanCount: number
    lastScanAt: string | null
    pollutants: string[]
  } = { scanCount: 0, lastScanAt: null, pollutants: [] }

  if (activeTab === 'pollution') {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const { data: scans, error } = await supabase
      .from('scan_logs')
      .select('created_at, confirmed_pollutant_id')
      .eq('farmer_id', user.id)
      .eq('stress_type', 'Abiotic_Pollution')
      .gte('created_at', ninetyDaysAgo.toISOString())

    if (error) {
      console.error('[Pollution] scan_logs fetch error:', error.message)
    }

    const lastScanAt = (scans ?? []).reduce<string | null>((latest, s) => {
      if (!s.created_at) return latest
      if (!latest) return s.created_at
      return new Date(s.created_at) > new Date(latest) ? s.created_at : latest
    }, null)

    pollutionStats = {
      scanCount: scans?.length ?? 0,
      lastScanAt,
      pollutants: Array.from(new Set(
        (scans ?? [])
          .map(s => s.confirmed_pollutant_id)
          .filter(Boolean) as string[]
      )),
    }
  }

  let farmHealth: {
    score: number
    level: 'good' | 'watch' | 'stressed' | 'critical'
    totalBiotic: number
    dominantIssue: string
    pestLevel: string | null
  } | null = null

  if (activeTab === 'risk') {
    const bioticWeights: Record<string, number> = {
      Biotic_Fungal: 6,
      Biotic_Pest: 8,
      Biotic_Viral: 10,
      Biotic_Bacterial: 9,
    }
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const { data: scans, error: scanErr } = await supabase
      .from('scan_logs')
      .select('stress_type')
      .eq('farmer_id', user.id)
      .gte('created_at', ninetyDaysAgo.toISOString())
      .in('stress_type', Object.keys(bioticWeights))

    if (scanErr) {
      console.error('[Health] scan_logs fetch error:', scanErr.message)
    }

    const counts: Record<string, number> = {}
    for (const s of scans ?? []) {
      const type = s.stress_type as string
      counts[type] = (counts[type] ?? 0) + 1
    }

    const totalBiotic = Object.values(counts).reduce((sum, v) => sum + v, 0)
    const penalty = Math.min(80, Object.entries(counts).reduce(
      (sum, [type, count]) => sum + (bioticWeights[type] ?? 0) * count,
      0
    ))

    const { data: pestProfiles } = await supabase
      .from('farm_profiles')
      .select('pest_level')
      .eq('farmer_id', user.id)

    const pestLevels = (pestProfiles ?? []).map(p => p.pest_level).filter(Boolean) as string[]
    const pestLevel = pestLevels.includes('high') ? 'high' : pestLevels.includes('medium') ? 'medium' : null
    const pestPenalty = pestLevel === 'high' ? 10 : pestLevel === 'medium' ? 5 : 0

    const score = Math.max(0, Math.round(100 - penalty - pestPenalty))
    const level = score >= 80 ? 'good' : score >= 60 ? 'watch' : score >= 40 ? 'stressed' : 'critical'
    const dominantIssue = Object.keys(counts).length > 0
      ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
      : 'No biotic issues'

    farmHealth = { score, level, totalBiotic, dominantIssue, pestLevel }
  }

  // ── 9. Badge styling ───────────────────────────────────────────
  const badgeColors: Record<string, string> = {
    New:        'bg-gray-100 text-gray-600',
    Bronze:     'bg-orange-100 text-orange-700',
    Silver:     'bg-slate-100 text-slate-700',
    Green:      'bg-green-100 text-green-700',
    Agronomist: 'bg-emerald-100 text-emerald-800',
  }
  const badge      = farmer?.badge_level ?? 'New'
  const badgeClass = badgeColors[badge] ?? badgeColors.New

  // ── 10. Digest stats ────────────────────────────────────────────
  const totalBigha   = rawPlots.reduce((s: number, p) => s + (p.area_bigha ?? 0), 0)
  const activeSprays = rawPlots.filter((p) => p.spray_active).length
  const riskPlots    = rawPlots.filter((p) => p.risk_level !== 'green' && p.spray_active)

  return (
    <div style={{ minHeight: 'calc(100vh - 132px)', background: 'var(--bg)' }}>

      {/* ── Dashboard Sub-Header ──────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '2px solid var(--border)', position: 'sticky', top: '88px', zIndex: 30 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', paddingBottom: '0', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                <h1 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Farmer Dashboard</h1>
                <span className={`stat-badge stat-badge-neutral`}>{badge}</span>
                {!weeklyComplete && rawPlots.length > 0 && (
                  <span className="stat-badge stat-badge-warn">Survey Pending</span>
                )}
                {weeklyComplete && (
                  <span className="stat-badge stat-badge-safe">Survey Complete</span>
                )}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {lastUpdated ? `Weather data: ${lastUpdated}` : 'No weather data'}
                {farmer?.total_scans !== undefined && <span style={{ marginLeft: '12px' }}>Scans: {farmer.total_scans}</span>}
                {rawPlots.length > 0 && <span style={{ marginLeft: '12px' }}>Plots: {rawPlots.length} ({totalBigha.toFixed(2)} bigha)</span>}
              </p>
              <ConsentToggle farmerId={user.id} initialConsent={farmer?.data_sharing_consent} />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {coords ? (
                <RefreshWeatherButton
                  action={fetchAndSaveWeather.bind(null, user.id, coords.lat, coords.lng)}
                  satelliteAction={fetchSatelliteWaterData.bind(null, coords.lat, coords.lng)}
                />
              ) : (
                <button disabled className="btn-ghost" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  Set location first
                </button>
              )}
            </div>
          </div>
          <Suspense fallback={<div style={{ height: '44px' }} />}>
            <DashboardTabs active={activeTab} />
          </Suspense>
        </div>
      </div>

      {/* ════════════════════════════════
          TAB: OVERVIEW
      ════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Survey pending notice */}
          {!weeklyComplete && rawPlots.length > 0 && (
            <div className="alert alert-warning">
              <strong>Weekly Field Survey Pending</strong> ({completedLandIds.length}/{rawPlots.length} plots completed).
              {' '}<a href="?tab=survey" style={{ color: 'var(--status-warn)', fontWeight: 600, textDecoration: 'underline' }}>Complete survey to unlock Diagnostic Scan.</a>
            </div>
          )}

          <WaterAlertBanner alerts={waterAlerts} farmerId={user.id} />

          {/* No location set */}
          {!coords && (
            <div className="card" style={{ textAlign: 'center', border: '1px dashed var(--border-strong)', padding: '40px' }}>
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Farm location not configured</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Enter Latitude and Longitude in the Location section below.</p>
            </div>
          )}

          {/* No weather data */}
          {coords && !weather && (
            <div className="alert alert-warning">
              No weather data available. Press &quot;Refresh Data&quot; to fetch current conditions.
            </div>
          )}

          {/* Weather metrics */}
          {weather && (
            <div>
              <div className="section-title">Current Atmospheric Conditions</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)' }}>
                <div style={{ background: '#fff', padding: '16px 18px' }}>
                  <div className="metric-label">Temperature</div>
                  <div className="metric-value" style={{ fontSize: '1.5rem' }}>{weather.temperature_2m}°C</div>
                  {daily?.temperature_2m_max?.[0] && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>Max: {daily.temperature_2m_max[0]}°C</div>}
                </div>
                <div style={{ background: '#fff', padding: '16px 18px' }}>
                  <div className="metric-label">Humidity</div>
                  <div className="metric-value" style={{ fontSize: '1.5rem' }}>{weather.relative_humidity_2m}%</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>Precipitation: {weather.precipitation} mm</div>
                </div>
                <div style={{ background: '#fff', padding: '16px 18px' }}>
                  <div className="metric-label">Wind Speed</div>
                  <div className="metric-value" style={{ fontSize: '1.5rem' }}>{weather.wind_speed_10m} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>km/h</span></div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{windDir} ({weather.wind_direction_10m}°)</div>
                </div>
                <div style={{ background: '#fff', padding: '16px 18px' }}>
                  <div className="metric-label">Industrial Plumes</div>
                  {hotspots.filter(h => h.is_in_plume).length === 0 ? (
                    <>
                      <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--status-safe)' }}>Clear</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{hotspots.length} sources monitored</div>
                    </>
                  ) : (
                    <>
                      <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--status-danger)' }}>{hotspots.filter(h => h.is_in_plume).length} Active</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>Plumes in wind path</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Blast risk alert */}
          {weather &&
            weather.relative_humidity_2m >= 85 &&
            weather.temperature_2m >= 17 &&
            weather.temperature_2m <= 28 && (
            <div className="alert alert-warning">
              <strong>High Risk Alert — Rice Blast Disease:</strong> Current conditions (Temp: {weather.temperature_2m}°C, Humidity: {weather.relative_humidity_2m}%) are favorable for <em>Magnaporthe oryzae</em> infection. Consider Tricyclazole application.
            </div>
          )}

          {coords && (
            <LandDigest
              farmerId={user.id}
              farmerLat={coords.lat}
              farmerLng={coords.lng}
              windFromDeg={windFromDeg}
              windSpeedKmh={windSpeedKmh}
              hotspots={hotspots}
              plots={plots}
              profileMap={profileMap}
              completedLandIds={completedLandIds}
              totalBigha={totalBigha}
              activeSprays={activeSprays}
              riskPlots={riskPlots}
              communitySpray={communitySpray}
              waterSources={waterSources}
              satelliteData={satelliteData}
            />
          )}

          {coords && (
            <div>
              <div className="section-title">GIS Impact Map — Pollution Hotspots &amp; Plumes</div>
              <ImpactMapWrapper
                hotspots={hotspots}
                satelliteData={satelliteData}
                farmerLat={coords.lat}
                farmerLng={coords.lng}
                windFromDeg={windFromDeg}
                windSpeedKmh={windSpeedKmh}
              />
            </div>
          )}

          <div>
            <div className="section-title">Location Settings</div>
            <LocationUpdater
              currentLat={currentLat}
              currentLng={currentLng}
              currentZone={farmer?.zone_id ?? ''}
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════
          TAB: LAND REGISTRATION
      ════════════════════════════════ */}
      {activeTab === 'land' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
          <div className="section-title">Land Parcel Registry</div>
          <LandRegistration farmerId={user.id} />
        </div>
      )}

      {activeTab === 'survey' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
          <div className="section-title">Weekly Field Survey — Week {thisWeek} / {thisYear}</div>
          {rawPlots.length > 0 && (
            <div className={`alert ${weeklyComplete ? 'alert-success' : 'alert-warning'}`} style={{ marginBottom: '16px' }}>
              {weeklyComplete
                ? `All ${rawPlots.length} plots surveyed this week. Diagnostic scan is now unlocked.`
                : `Survey incomplete: ${rawPlots.length - completedLandIds.length} of ${rawPlots.length} plots pending.`}
            </div>
          )}
          <WeeklySurvey farmerId={user.id} farmerLat={coords?.lat ?? null} farmerLng={coords?.lng ?? null} />
        </div>
      )}

      {activeTab === 'scan' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
          <div className="section-title">Crop Diagnostic Scan</div>
          <DiseaseScanner farmerId={user.id} plots={plotsWithSurvey} />
        </div>
      )}

      {/* ════════════════════════════════
          TAB: POLLUTION REPORT
      ════════════════════════════════ */}
      {activeTab === 'pollution' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div className="section-title">Pollution Monitoring Report</div>

          {/* Metric grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)' }}>
            <div style={{ background: '#fff', padding: '18px 20px' }}>
              <div className="metric-label">Abiotic Scans (90 days)</div>
              <div className="metric-value">{pollutionStats.scanCount}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Last: {pollutionStats.lastScanAt ? new Date(pollutionStats.lastScanAt).toLocaleDateString('en-GB') : 'N/A'}
              </div>
            </div>
            <div style={{ background: '#fff', padding: '18px 20px' }}>
              <div className="metric-label">Active Water Alerts</div>
              <div className="metric-value" style={{ color: waterAlerts.filter(a => !a.is_read).length > 0 ? 'var(--status-danger)' : 'var(--status-safe)' }}>
                {waterAlerts.filter(a => !a.is_read).length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Total: {waterAlerts.length}</div>
            </div>
            <div style={{ background: '#fff', padding: '18px 20px' }}>
              <div className="metric-label">Satellite Alert Points</div>
              <div className="metric-value" style={{ color: satelliteData.filter(s => s.suspected_pollution).length > 0 ? 'var(--status-warn)' : undefined }}>
                {satelliteData.filter(s => s.suspected_pollution).length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>of {satelliteData.length} total</div>
            </div>
            <div style={{ background: '#fff', padding: '18px 20px' }}>
              <div className="metric-label">Active Plume Sources</div>
              <div className="metric-value" style={{ color: hotspots.filter(h => h.is_in_plume).length > 0 ? 'var(--status-danger)' : 'var(--status-safe)' }}>
                {hotspots.filter(h => h.is_in_plume).length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>of {hotspots.length} sources</div>
            </div>
          </div>

          {/* Detected pollutants */}
          {pollutionStats.pollutants.length > 0 && (
            <div className="card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '10px' }}>Detected Pollutants (Confirmed)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {pollutionStats.pollutants.map(p => (
                  <span key={p} className="stat-badge stat-badge-danger">{p}</span>
                ))}
              </div>
            </div>
          )}

          <WaterAlertBanner alerts={waterAlerts} farmerId={user.id} />

          {rawPlots.length > 0 && (
            <div>
              <div className="section-title">Air Exposure Timeline</div>
              <AirExposureCard landId={rawPlots[0].land_id} />
            </div>
          )}

          {coords && (
            <div>
              <div className="section-title">GIS Impact Map — Industrial Zones &amp; Plumes</div>
              <ImpactMapWrapper
                hotspots={hotspots}
                satelliteData={satelliteData}
                farmerLat={coords.lat}
                farmerLng={coords.lng}
                windFromDeg={windFromDeg}
                windSpeedKmh={windSpeedKmh}
              />
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════
          TAB: RISK & LOSS
      ════════════════════════════════ */}
      {activeTab === 'risk' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div className="section-title">Risk Assessment &amp; Crop Loss Analysis</div>

          {farmHealth && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>Farm Health Index</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Derived from diagnostic scan logs, field surveys, and environmental sensor data.</p>
                </div>
                <span className={`stat-badge ${
                  farmHealth.level === 'good' ? 'stat-badge-safe'
                  : farmHealth.level === 'watch' ? 'stat-badge-warn'
                  : 'stat-badge-danger'
                }`}>
                  {farmHealth.level === 'good' && 'Good'}
                  {farmHealth.level === 'watch' && 'Caution'}
                  {farmHealth.level === 'stressed' && 'Stressed'}
                  {farmHealth.level === 'critical' && 'Critical'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)' }}>
                <div style={{ background: 'var(--surface-2)', padding: '14px 16px' }}>
                  <div className="metric-label">Health Score</div>
                  <div className="metric-value">{farmHealth.score}<span style={{ fontSize: '0.9rem', fontWeight: 500 }}>/100</span></div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '14px 16px' }}>
                  <div className="metric-label">Biotic Scans</div>
                  <div className="metric-value">{farmHealth.totalBiotic}</div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '14px 16px' }}>
                  <div className="metric-label">Primary Threat</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '4px' }}>{farmHealth.dominantIssue}</div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '14px 16px' }}>
                  <div className="metric-label">Pest Pressure</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {farmHealth.pestLevel === 'high' ? 'High' : farmHealth.pestLevel === 'medium' ? 'Medium' : 'Normal'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {rawPlots.length === 0 && (
            <div className="card" style={{ textAlign: 'center', border: '1px dashed var(--border-strong)', padding: '40px' }}>
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>No land parcels registered.</p>
              <a href="?tab=land" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)', textDecoration: 'underline' }}>Register a land parcel to begin monitoring.</a>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
            {rawPlots.map((plot: LandPlotOverview) => {
              const summary = riskMap[plot.land_id]
              const landCentroid = plot.boundary_geojson
                ? getGeoJSONCentroid(plot.boundary_geojson)
                : null

              return (
                <div key={plot.land_id} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <FarmRiskCard
                    landId={plot.land_id}
                    landNameBn={plot.land_name_bn ?? plot.land_name}
                    cropId={plot.crop_id}
                    initialRiskScore={summary?.risk_score ?? null}
                    initialRiskLevel={summary?.risk_level ?? null}
                    initialBreakdown={summary?.breakdown ?? null}
                    initialLoss={summary?.expected_loss_bdt ?? null}
                    initialAdviceBn={summary?.advice_bn ?? null}
                    dominantThreat={summary?.dominant_threat ?? null}
                  />
                  <HeavyMetalRiskCard
                    landId={plot.land_id}
                    lat={landCentroid?.lat ?? coords?.lat}
                    lng={landCentroid?.lng ?? coords?.lng}
                  />
                </div>
              )
            })}
          </div>

          {coords && hmMapPlots.length > 0 && (
            <div>
              <div className="section-title">Heavy Metal Spatial Distribution Map</div>
              <HeavyMetalMap
                plots={hmMapPlots}
                centerLat={coords.lat}
                centerLng={coords.lng}
              />
            </div>
          )}

          <DataExport hasConsent={farmer?.data_sharing_consent ?? false} />

          <div className="card" style={{ borderLeft: '3px solid var(--accent)', background: 'var(--accent-light)', borderRadius: '4px' }}>
            <h3 style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent)', marginBottom: '6px' }}>Data Sharing — Environmental Policy Support</h3>
            <p style={{ fontSize: '12px', color: '#1e3a5f', marginBottom: '12px', lineHeight: '1.6' }}>
              Anonymized field data from this farm is shared with DoE and DAE for environmental regulation enforcement and agricultural risk mapping.
              This supports insurance claim processing and enables government intervention in pollution-affected zones.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className="stat-badge stat-badge-neutral">Insurance Agencies</span>
              <span className="stat-badge stat-badge-neutral">DOE / DAE</span>
              <span className="stat-badge stat-badge-neutral">Export Compliance</span>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
