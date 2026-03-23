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
import WaterAlertBanner         from '../components/WaterAlertBanner'
import ConsentToggle            from '../components/ConsentToggle'
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
  if (activeTab === 'overview' && rawPlots.length > 0) {
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
  if (rawPlots.length > 0) {
    const { data: responses } = await supabase
      .from('surveys')
      .select('land_id')
      .eq('farmer_id', user.id)
      .eq('week_number', thisWeek)   // ← FIXED: was 'survey_week'
      .eq('year', thisYear)          // ← FIXED: was 'survey_year'
    const respondedIds = new Set((responses ?? []).map((r: { land_id: string }) => r.land_id))
    completedLandIds = rawPlots.map((p) => p.land_id).filter((id: string) => respondedIds.has(id))
    weeklyComplete = rawPlots.length > 0 && completedLandIds.length >= rawPlots.length
  }

  // ── 8. Risk summaries for risk tab ────────────────────────────
  const riskSummaries = (activeTab === 'risk')
    ? await getFarmRiskSummaries(user.id)
    : []
  const riskMap = Object.fromEntries(riskSummaries.map(r => [r.land_id, r]))

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
  const activeSprays = rawPlots.filter((p) => p.spray_active && p.risk_level === 'red').length
  const riskPlots    = rawPlots.filter((p) => p.risk_level !== 'green' && p.spray_active)

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#f7f9f5]">

      {/* ── Sticky sub-header ─────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-14 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3 gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h1 className="text-base font-bold text-gray-900">খামার ড্যাশবোর্ড</h1>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>{badge}</span>
                {!weeklyComplete && rawPlots.length > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    ⚠️ সাপ্তাহিক সার্ভে বাকি
                  </span>
                )}
                {weeklyComplete && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    ✓ সার্ভে সম্পন্ন
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {lastUpdated ? `আবহাওয়া: ${lastUpdated}` : 'আবহাওয়া নেই'}
                {farmer?.total_scans !== undefined && <span className="ml-2">· স্ক্যান: {farmer.total_scans}</span>}
                {rawPlots.length > 0 && <span className="ml-2">· জমি: {rawPlots.length}টি ({totalBigha.toFixed(2)} বিঘা)</span>}
              </p>
              <ConsentToggle farmerId={user.id} initialConsent={farmer?.data_sharing_consent} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {coords ? (
                <RefreshWeatherButton
                  action={fetchAndSaveWeather.bind(null, user.id, coords.lat, coords.lng)}
                  satelliteAction={fetchSatelliteWaterData.bind(null, coords.lat, coords.lng)}
                />
              ) : (
                <button
                  disabled
                  className="bg-gray-100 text-gray-400 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 cursor-not-allowed"
                >
                  আগে লোকেশন সেট করুন
                </button>
              )}
            </div>
          </div>
          <Suspense fallback={<div className="h-[43px] overflow-x-auto" />}>
            <DashboardTabs active={activeTab} />
          </Suspense>
        </div>
      </div>

      {/* ════════════════════════════════
          TAB: OVERVIEW
      ════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4">

          {!weeklyComplete && rawPlots.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">📋</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  সাপ্তাহিক সার্ভে সম্পন্ন করুন ({completedLandIds.length}/{rawPlots.length} জমি)
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  স্ক্যান লগ জমা দেওয়ার আগে এই সপ্তাহের সার্ভে সব জমির জন্য সম্পন্ন করুন।
                </p>
                <a href="?tab=survey" className="inline-block mt-2 text-xs font-semibold text-amber-800 underline">
                  → সার্ভে ট্যাবে যান
                </a>
              </div>
            </div>
          )}

          <WaterAlertBanner alerts={waterAlerts} farmerId={user.id} />

          {!coords && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">খামারের অবস্থান সেট করা হয়নি</p>
              <p className="text-xs text-gray-400">নিচের ফর্মে Latitude ও Longitude দিন।</p>
            </div>
          )}

          {coords && !weather && (
            <div className="bg-amber-50 rounded-2xl border border-amber-100 px-5 py-3.5 flex items-center gap-3">
              <span className="text-lg">🌤️</span>
              <div>
                <p className="text-sm font-medium text-amber-800">আবহাওয়া ডাটা নেই</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  &quot;আবহাওয়া রিফ্রেশ&quot; চাপুন।
                </p>
              </div>
            </div>
          )}

          {weather && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🌡️</span>
                  <span className="text-xs font-medium text-gray-500">তাপমাত্রা</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{weather.temperature_2m}°</p>
                {daily?.temperature_2m_max?.[0] && (
                  <p className="text-xs text-gray-400 mt-0.5">সর্বোচ্চ {daily.temperature_2m_max[0]}°</p>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">💧</span>
                  <span className="text-xs font-medium text-gray-500">আর্দ্রতা</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{weather.relative_humidity_2m}%</p>
                <p className="text-xs text-gray-400 mt-0.5">বৃষ্টি {weather.precipitation} mm</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">💨</span>
                  <span className="text-xs font-medium text-gray-500">বাতাস</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {weather.wind_speed_10m} <span className="text-base font-medium text-gray-500">km/h</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{windDir} ({weather.wind_direction_10m}°)</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🏭</span>
                  <span className="text-xs font-medium text-gray-500">দূষণ ঝুঁকি</span>
                </div>
                {hotspots.filter(h => h.is_in_plume).length === 0 ? (
                  <>
                    <p className="text-2xl font-bold text-green-600">নিরাপদ</p>
                    <p className="text-xs text-gray-400 mt-0.5">{hotspots.length}টি কারখানা</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-red-600">{hotspots.filter(h => h.is_in_plume).length}</p>
                    <p className="text-xs text-gray-400 mt-0.5">সক্রিয় প্লাম</p>
                  </>
                )}
              </div>
            </div>
          )}

          {weather &&
            weather.relative_humidity_2m >= 85 &&
            weather.temperature_2m >= 17 &&
            weather.temperature_2m <= 28 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">ব্লাস্ট রোগের উচ্চ ঝুঁকি</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  তাপ {weather.temperature_2m}°C, আর্দ্রতা {weather.relative_humidity_2m}% —
                  ধানের ব্লাস্টের জন্য অনুকূল। ট্রাইসাইক্লাজল স্প্রে বিবেচনা করুন।
                </p>
              </div>
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
            />
          )}

          {coords && (
            <ImpactMapWrapper
              hotspots={hotspots}
              satelliteData={satelliteData}
              farmerLat={coords.lat}
              farmerLng={coords.lng}
              windFromDeg={windFromDeg}
              windSpeedKmh={windSpeedKmh}
            />
          )}

          <LocationUpdater
            currentLat={currentLat}
            currentLng={currentLng}
            currentZone={farmer?.zone_id ?? ''}
          />
        </div>
      )}

      {/* ════════════════════════════════
          TAB: LAND REGISTRATION
      ════════════════════════════════ */}
      {activeTab === 'land' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <LandRegistration farmerId={user.id} />
        </div>
      )}

      {/* ════════════════════════════════
          TAB: WEEKLY SURVEY
      ════════════════════════════════ */}
      {activeTab === 'survey' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          {rawPlots.length > 0 && (
            <div className={`mb-4 rounded-xl border px-4 py-3 flex items-center gap-3 ${weeklyComplete ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <span className="text-lg">{weeklyComplete ? '✅' : '⏳'}</span>
              <div>
                <p className={`text-sm font-semibold ${weeklyComplete ? 'text-green-800' : 'text-amber-800'}`}>
                  {weeklyComplete
                    ? 'এই সপ্তাহের সার্ভে সম্পন্ন — স্ক্যান লগ জমা দিতে পারবেন'
                    : `সার্ভে বাকি: ${rawPlots.length - completedLandIds.length}টি জমি`}
                </p>
                <p className={`text-xs mt-0.5 ${weeklyComplete ? 'text-green-600' : 'text-amber-600'}`}>
                  সপ্তাহ {thisWeek}/{thisYear} · {completedLandIds.length}/{rawPlots.length} জমি ✓
                </p>
              </div>
            </div>
          )}
          <WeeklySurvey farmerId={user.id} />
        </div>
      )}

      {/* ════════════════════════════════
          TAB: SCANNER
      ════════════════════════════════ */}
      {activeTab === 'scan' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <DiseaseScanner farmerId={user.id} plots={rawPlots} />
        </div>
      )}

      {/* ════════════════════════════════
          TAB: POLLUTION REPORT
      ════════════════════════════════ */}
      {activeTab === 'pollution' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 text-base mb-1">🏭 দূষণ রিপোর্ট</h2>
            <p className="text-xs text-gray-500">
              স্ক্যান লগ, পানি সতর্কতা, স্যাটেলাইট ও কারখানার তথ্য এক জায়গায়।
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">পলিউশন স্ক্যান (৯০ দিন)</p>
              <p className="text-2xl font-bold text-gray-900">{pollutionStats.scanCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                শেষ স্ক্যান: {pollutionStats.lastScanAt ? new Date(pollutionStats.lastScanAt).toLocaleDateString('bn-BD') : '—'}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">সক্রিয় পানির সতর্কতা</p>
              <p className="text-2xl font-bold text-gray-900">
                {waterAlerts.filter(a => !a.is_read).length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">মোট {waterAlerts.length}টি</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">স্যাটেলাইট সতর্ক পয়েন্ট</p>
              <p className="text-2xl font-bold text-gray-900">
                {satelliteData.filter(s => s.suspected_pollution).length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">মোট {satelliteData.length}টি</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">সক্রিয় প্লাম কারখানা</p>
              <p className="text-2xl font-bold text-gray-900">
                {hotspots.filter(h => h.is_in_plume).length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">মোট {hotspots.length}টি</p>
            </div>
          </div>

          {pollutionStats.pollutants.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-2">সন্দেহজনক দূষণকারী</p>
              <div className="flex flex-wrap gap-2">
                {pollutionStats.pollutants.map(p => (
                  <span key={p} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          <WaterAlertBanner alerts={waterAlerts} farmerId={user.id} />

          {coords && (
            <ImpactMapWrapper
              hotspots={hotspots}
              satelliteData={satelliteData}
              farmerLat={coords.lat}
              farmerLng={coords.lng}
              windFromDeg={windFromDeg}
              windSpeedKmh={windSpeedKmh}
            />
          )}
        </div>
      )}

      {/* ════════════════════════════════
          TAB: RISK & LOSS
      ════════════════════════════════ */}
      {activeTab === 'risk' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4">

          {/* Header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 text-base mb-1">🎯 রিস্ক ও ক্ষতি বিশ্লেষণ</h2>
            <p className="text-xs text-gray-500">
              শিল্প দূষণ, পানি, আবহাওয়া ও মাটির তথ্য মিলিয়ে প্রতিটি জমির ঝুঁকি হিসাব করা হয়।
              ফলাফল বীমা কোম্পানি ও সরকারকে দেওয়া হয়।
            </p>
          </div>

          {farmHealth && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">🧬 ফার্ম হেলথ স্কোর (জৈবিক)</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    বায়োটিক স্ক্যান ও সার্ভে থেকে পৃথক স্বাস্থ্য সূচক।
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  farmHealth.level === 'good'
                    ? 'bg-green-100 text-green-700'
                    : farmHealth.level === 'watch'
                    ? 'bg-amber-100 text-amber-700'
                    : farmHealth.level === 'stressed'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {farmHealth.level === 'good' && 'ভাল'}
                  {farmHealth.level === 'watch' && 'সতর্ক'}
                  {farmHealth.level === 'stressed' && 'ঝুঁকিপূর্ণ'}
                  {farmHealth.level === 'critical' && 'গুরুতর'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-xs text-gray-400">স্কোর</p>
                  <p className="text-2xl font-bold text-gray-900">{farmHealth.score}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-xs text-gray-400">বায়োটিক স্ক্যান</p>
                  <p className="text-2xl font-bold text-gray-900">{farmHealth.totalBiotic}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-xs text-gray-400">প্রধান সমস্যা</p>
                  <p className="text-sm font-semibold text-gray-700 mt-1">{farmHealth.dominantIssue}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-xs text-gray-400">পেস্ট অবস্থা</p>
                  <p className="text-sm font-semibold text-gray-700 mt-1">
                    {farmHealth.pestLevel === 'high' ? 'উচ্চ' : farmHealth.pestLevel === 'medium' ? 'মাঝারি' : 'স্বাভাবিক'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {rawPlots.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-2xl mb-2">🗺️</p>
              <p className="text-sm text-gray-500">কোনো জমি নথিভুক্ত নেই।</p>
              <a href="?tab=land" className="inline-block mt-2 text-xs font-semibold text-green-700 underline">
                → জমি নিবন্ধন করুন
              </a>
            </div>
          )}

          {/* Risk cards for each land */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rawPlots.map((plot: LandPlotOverview) => {
              const summary = riskMap[plot.land_id]
              return (
                <div key={plot.land_id} className="space-y-4">
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
                  <HeavyMetalRiskCard landId={plot.land_id} />
                </div>
              )
            })}
          </div>

          {/* Data selling promo banner */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-700 rounded-2xl p-5 text-white">
            <h3 className="font-bold text-base mb-1">🌾 আপনার ডেটা = আপনার শক্তি</h3>
            <p className="text-sm text-green-100 mb-3">
              আপনার জমির দূষণ তথ্য বীমা কোম্পানি ও সরকারকে পাঠানো হয়।
              এতে এলাকায় পরিবেশ আইন শক্তিশালী হয় এবং ভবিষ্যতে বীমা দাবি সহজ হয়।
            </p>
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full">🏦 বীমা কোম্পানি</span>
              <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full">🏛️ DOE/DAE</span>
              <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full">📦 এক্সপোর্টার</span>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
