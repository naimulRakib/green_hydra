import { createClient }        from '../utils/supabase/server'
import { fetchAndSaveWeather }  from '../actions/weather'
import { getHotspotsWithPlume, getCommunitySprayForLands } from '../actions/industrial'
import { redirect }             from 'next/navigation'
import RefreshWeatherButton     from '../components/RefreshWeatherButton'
import LocationUpdater          from '../components/LocationUpdater'
import LandRegistration         from '../components/LandRegistration'
import WeeklySurvey             from '../components/WeeklySurvey'
import DashboardTabs            from '../components/DashboardTabs'
import LandDigest from '../components/LandDigest'
import { ImpactMapWrapper } from '../components/MapWrappers'
import type { LandPlotOverview, HotspotOverview } from '../components/OverviewMap'

// ── Helpers ────────────────────────────────────────────────────────────────

function parseLocation(raw: any): { lat: number; lng: number } | null {
  if (!raw) return null
  if (typeof raw === 'object' && Array.isArray(raw.coordinates)) {
    const [lng, lat] = raw.coordinates
    return { lat, lng }
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
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params    = await searchParams
  const activeTab = (params.tab ?? 'overview') as 'overview' | 'land' | 'survey'

  // ── 1. Farmer row ──────────────────────────────────────────────
  const { data: farmer } = await supabase
    .from('farmers')
    .select('farm_location, zone_id, badge_level, total_scans')
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

  // ── 3. Industrial hotspots (overview only) ─────────────────────
  const hotspots: HotspotOverview[] = (activeTab === 'overview' && coords)
    ? await getHotspotsWithPlume(coords.lat, coords.lng, windFromDeg, windSpeedKmh)
    : []

  // ── 4. Farmer's land plots ─────────────────────────────────────
  // Fetched on overview AND survey tab (survey needs plot count for gate)
  let rawPlots: any[] = []
  if (activeTab === 'overview' || activeTab === 'survey') {
    const { data } = await supabase.rpc('get_farmer_lands', { p_farmer_id: user.id })
    rawPlots = data ?? []
  }

  // ── 4b. Neighbour spray events — per own land boundary, 1km radius ─
  // Must be after rawPlots so we only call RPC when farmer has registered lands
  const communitySpray = (activeTab === 'overview' && rawPlots.length > 0)
    ? await getCommunitySprayForLands(user.id, 1.0)
    : []

  // ── 5. Farmer land profiles (pH, pest pressure, etc.) ──────────
  // Join with farmer_land_profile for enriched overview tooltips
  let profileMap: Record<string, any> = {}
  if (activeTab === 'overview' && rawPlots.length > 0) {
    const { data: profiles } = await supabase
      .from('farmer_land_profile')
      .select('land_id, soil_ph_status, soil_texture, pest_pressure, recent_smoke_exposure, water_color_status, last_updated, scan_context_string')
      .eq('farmer_id', user.id)
    if (profiles) {
      profiles.forEach((p: any) => { profileMap[p.land_id] = p })
    }
  }

  // ── 6. Merge plots + profiles for OverviewMap ──────────────────
  const plots: LandPlotOverview[] = rawPlots.map((p: any) => {
    const prof = profileMap[p.land_id]
    const daysSince = prof?.last_updated
      ? Math.floor((Date.now() - new Date(prof.last_updated).getTime()) / 86400000)
      : null
    // Map soil_ph_status to a numeric approx for display
    const phApprox: Record<string, number> = { Acidic: 5.5, Normal: 6.5, Alkaline: 7.8 }
    return {
      ...p,
      soil_ph:         prof?.soil_ph_status ? phApprox[prof.soil_ph_status] ?? null : null,
      soil_moisture:   prof?.water_color_status ?? null,
      pest_pressure:   prof?.pest_pressure ?? null,
      last_survey_days: daysSince,
    }
  })

  // ── 7. Weekly survey completion gate ──────────────────────────
  // Survey is "complete this week" if ALL active land plots have a
  // survey_response for the current ISO week.
  // scan_log submission should be blocked client-side if not complete.
  const { week: thisWeek, year: thisYear } = getISOWeek()
  let weeklyComplete = false
  let completedLandIds: string[] = []
  if (rawPlots.length > 0) {
    const { data: responses } = await supabase
      .from('survey_responses')
      .select('land_id')
      .eq('farmer_id', user.id)
      .eq('survey_week', thisWeek)
      .eq('survey_year', thisYear)
    const respondedIds = new Set((responses ?? []).map((r: any) => r.land_id))
    completedLandIds = rawPlots.map((p: any) => p.land_id).filter((id: string) => respondedIds.has(id))
    weeklyComplete = rawPlots.length > 0 && completedLandIds.length >= rawPlots.length
  }

  // ── 8. Badge styling ───────────────────────────────────────────
  const badgeColors: Record<string, string> = {
    New:        'bg-gray-100 text-gray-600',
    Bronze:     'bg-orange-100 text-orange-700',
    Silver:     'bg-slate-100 text-slate-700',
    Green:      'bg-green-100 text-green-700',
    Agronomist: 'bg-emerald-100 text-emerald-800',
  }
  const badge      = farmer?.badge_level ?? 'New'
  const badgeClass = badgeColors[badge] ?? badgeColors.New

  // ── 9. Digest stats ────────────────────────────────────────────
  const totalBigha   = rawPlots.reduce((s: number, p: any) => s + (p.area_bigha ?? 0), 0)
  const activeSprays = rawPlots.filter((p: any) => p.spray_active && p.risk_level === 'red').length
  const riskPlots    = rawPlots.filter((p: any) => p.risk_level !== 'green' && p.spray_active)

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
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {coords ? (
  <RefreshWeatherButton 
    action={fetchAndSaveWeather.bind(null, user.id, coords.lat, coords.lng)} 
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
          <DashboardTabs active={activeTab} />
        </div>
      </div>

      {/* ════════════════════════════════
          TAB: OVERVIEW
      ════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4">

          {/* Weekly survey gate banner */}
          {!weeklyComplete && rawPlots.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">📋</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  সাপ্তাহিক সার্ভে সম্পন্ন করুন ({completedLandIds.length}/{rawPlots.length} জমি সম্পন্ন)
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  স্ক্যান লগ জমা দেওয়ার আগে এই সপ্তাহের সার্ভে সব জমির জন্য সম্পন্ন করতে হবে।
                  সার্ভে থেকে pH, পোকার চাপ ও মাটির অবস্থা স্বয়ংক্রিয়ভাবে ম্যাপে দেখাবে।
                </p>
                <a href="?tab=survey" className="inline-block mt-2 text-xs font-semibold text-amber-800 underline">
                  → সার্ভে ট্যাবে যান
                </a>
              </div>
            </div>
          )}

          {/* No location */}
          {!coords && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">খামারের অবস্থান সেট করা হয়নি</p>
              <p className="text-xs text-gray-400">নিচের ফর্মে Latitude ও Longitude দিন। ম্যাপে GPS বাটন ব্যবহার করতে পারেন।</p>
            </div>
          )}

          {/* No weather */}
          {coords && !weather && (
            <div className="bg-amber-50 rounded-2xl border border-amber-100 px-5 py-3.5 flex items-center gap-3">
              <span className="text-lg">🌤️</span>
              <div>
                <p className="text-sm font-medium text-amber-800">আবহাওয়া ডাটা নেই</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  "আবহাওয়া রিফ্রেশ" চাপুন — ম্যাপে কারখানা দেখাচ্ছে কিন্তু বাতাসের দিক অজানা।
                </p>
              </div>
            </div>
          )}

          {/* Weather cards */}
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

          {/* Blast disease risk */}
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

          {/* ── LandDigest: OverviewMap + clickable land cards (client component) ── */}
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
            />
          )}

          {/* ── Map 2: Industrial plume map ── */}
          {coords && (
            <ImpactMapWrapper
              hotspots={hotspots}
              farmerLat={coords.lat}
              farmerLng={coords.lng}
              windFromDeg={windFromDeg}
              windSpeedKmh={windSpeedKmh}
            />
          )}

          {/* Manual location updater */}
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
          {/* Survey completion status */}
          {rawPlots.length > 0 && (
            <div className={`mb-4 rounded-xl border px-4 py-3 flex items-center gap-3 ${weeklyComplete ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <span className="text-lg">{weeklyComplete ? '✅' : '⏳'}</span>
              <div>
                <p className={`text-sm font-semibold ${weeklyComplete ? 'text-green-800' : 'text-amber-800'}`}>
                  {weeklyComplete
                    ? 'এই সপ্তাহের সার্ভে সম্পন্ন — স্ক্যান লগ জমা দিতে পারবেন'
                    : `সার্ভে বাকি: ${rawPlots.length - completedLandIds.length}টি জমি এখনো সম্পন্ন হয়নি`}
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

    </div>
  )
}