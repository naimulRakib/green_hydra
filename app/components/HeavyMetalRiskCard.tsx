import { getHeavyMetalReport, getPreScanMetalPrior } from '../actions/heavyMetalActions'

const metalBnMap: Record<string, string> = {
  'chromium': 'ক্রোমিয়াম (Chromium)',
  'lead': 'সীসা (Lead)',
  'arsenic': 'আর্সেনিক (Arsenic)',
  'cadmium': 'ক্যাডমিয়াম (Cadmium)',
  'mixed': 'মিশ্র ধাতু (Mixed)',
  'iron': 'আয়রন (Iron)',
  'manganese': 'ম্যাঙ্গানিজ (Manganese)',
}

export default async function HeavyMetalRiskCard({
  landId,
  lat,
  lng,
}: {
  landId: string
  lat?: number
  lng?: number
}) {
  // First try: fetch a confirmed report from heavy_metal_reports
  const report = await getHeavyMetalReport(landId)

  // Second try: if no confirmed report but we have GPS, show pre-scan prior score
  if (!report) {
    if (lat != null && lng != null) {
      let prior: Awaited<ReturnType<typeof getPreScanMetalPrior>> | null = null
      try {
        prior = await getPreScanMetalPrior(landId, lat, lng)
      } catch {
        prior = null
      }

      if (prior && prior.prior_score > 0) {
        const rec = prior.recommendation
        const bgClass =
          rec === 'high'  ? 'bg-red-50 border-red-200' :
          rec === 'watch' ? 'bg-amber-50 border-amber-200' :
          'bg-green-50 border-green-200'
        const textClass =
          rec === 'high'  ? 'text-red-800' :
          rec === 'watch' ? 'text-amber-800' :
          'text-green-800'
        const labelBn =
          rec === 'high'  ? 'উচ্চ ঝুঁকি' :
          rec === 'watch' ? 'পর্যবেক্ষণ করুন' :
          'নিম্ন ঝুঁকি'

        return (
          <div className={`rounded-xl shadow-sm border p-5 ${bgClass}`}>
            <div className="flex justify-between items-start mb-3 border-b border-black/5 pb-3">
              <div>
                <h3 className={`font-bold text-lg flex items-center gap-2 ${textClass}`}>
                  <span>🧪 ভারি ধাতু প্রি-স্কোর (প্রাক-বিশ্লেষণ)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  জোন ডেটা ও শিল্প নৈকট্য থেকে প্রাথমিক হিসাব — কোনো স্ক্যান ছাড়াই
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border
                ${rec === 'high'  ? 'bg-red-100 text-red-800 border-red-300' :
                  rec === 'watch' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                  'bg-green-100 text-green-800 border-green-300'}
              `}>
                {labelBn}
              </div>
            </div>

            {/* Score grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/60 p-3 rounded-lg border border-white">
                <div className="text-xs text-gray-500 font-bold mb-1">প্রি-স্কোর</div>
                <div className={`text-2xl font-black leading-none ${textClass}`}>
                  {prior.prior_score}
                </div>
                <div className="text-xs text-gray-400">/100</div>
              </div>
              <div className="bg-white/60 p-3 rounded-lg border border-white">
                <div className="text-xs text-gray-500 font-bold mb-1">জোন ঝুঁকি</div>
                <div className={`text-2xl font-black leading-none ${textClass}`}>
                  {prior.zone_risk}
                </div>
              </div>
              <div className="bg-white/60 p-3 rounded-lg border border-white">
                <div className="text-xs text-gray-500 font-bold mb-1">শিল্প নৈকট্য</div>
                <div className={`text-2xl font-black leading-none ${textClass}`}>
                  {prior.proximity_risk}
                </div>
              </div>
            </div>

            {/* Known metals in zone */}
            {prior.known_metals && prior.known_metals.length > 0 && (
              <div className="mt-3 text-xs bg-white/50 rounded px-3 py-2 flex items-center gap-2">
                <span>⚗️</span>
                <span className={`font-semibold ${textClass}`}>
                  এই অঞ্চলে পরিচিত ধাতু:{' '}
                  {prior.known_metals.map((m: string) =>
                    metalBnMap[m.toLowerCase()] || m
                  ).join(', ')}
                </span>
              </div>
            )}

            {/* Arsenic zone level */}
            {prior.arsenic_zone && prior.arsenic_zone !== 'Low' && (
              <div className="mt-2 text-xs bg-white/50 rounded px-3 py-1.5 flex items-center gap-2">
                <span>🗺️</span>
                <span>
                  আর্সেনিক জোন:{' '}
                  <strong className={textClass}>
                    {prior.arsenic_zone === 'High' ? 'উচ্চ ঝুঁকি অঞ্চল' : 'মধ্যম ঝুঁকি অঞ্চল'}
                  </strong>
                </span>
              </div>
            )}

            {/* ISRIC pH */}
            {prior.isric_ph != null && (
              <div className="mt-2 text-xs text-gray-500 bg-white/50 rounded px-3 py-1.5">
                🔬 মাটির pH (ISRIC): <strong>{prior.isric_ph.toFixed(1)}</strong>
                {prior.isric_source === 'isric_soilgrids' ? ' (লাইভ ডেটা)' : ' (অনুমান)'}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3 italic">
              * স্ক্যান করার পর সম্পূর্ণ ৬-স্তর বিশ্লেষণ পাওয়া যাবে।
            </p>
          </div>
        )
      }
    }

    // No report AND no GPS / zero prior score = graceful empty state
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="text-gray-400 text-sm flex items-center gap-2">
          <span className="text-xl">🧪</span>
          <span>এই জমির জন্য কোনো ভারি ধাতু পরীক্ষার রিপোর্ট নেই। (No Heavy Metal data)</span>
        </div>
      </div>
    )
  }

  // ── Confirmed report from heavy_metal_reports ──────────────────────────────
  const isCritical = report.severity === 'critical'
  const isHigh     = report.severity === 'high'
  const isModerate = report.severity === 'moderate'

  const bgClass = isCritical ? 'bg-rose-50 border-rose-200' :
                  isHigh     ? 'bg-red-50 border-red-200' :
                  isModerate ? 'bg-orange-50 border-orange-200' :
                               'bg-green-50 border-green-200'

  const textClass = isCritical ? 'text-rose-900' :
                    isHigh     ? 'text-red-800' :
                    isModerate ? 'text-orange-800' :
                                 'text-green-800'

  const scorePct  = Math.round(Number(report.confidence_score) * 100)
  const metalName = metalBnMap[report.metal_type] || report.metal_type

  return (
    <div className={`rounded-xl shadow-sm border p-5 ${bgClass}`}>
      <div className="flex justify-between items-start mb-4 border-b border-black/5 pb-3">
        <div>
          <h3 className={`font-bold text-lg flex items-center gap-2 ${textClass}`}>
            <span>⚠️ ভারি ধাতু দূষণ ঝুঁকি (Heavy Metal Risk)</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            শেষ আপডেট: {new Date(report.reported_at).toLocaleDateString('bn-BD')}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border
          ${isCritical ? 'bg-rose-100 text-rose-800 border-rose-300' :
            isHigh     ? 'bg-red-100 text-red-800 border-red-300' :
            isModerate ? 'bg-orange-100 text-orange-800 border-orange-300' :
                         'bg-green-100 text-green-800 border-green-300'}
        `}>
          {report.severity}
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/60 p-3 rounded-lg border border-white">
            <div className="text-xs text-gray-500 font-bold mb-1">সম্ভাব্য ধাতু</div>
            <div className={`text-base font-black ${textClass}`}>{metalName}</div>
          </div>
          <div className="bg-white/60 p-3 rounded-lg border border-white">
            <div className="text-xs text-gray-500 font-bold mb-1">ঝুঁকি স্কোর (Risk)</div>
            <div className="flex items-end gap-1">
              <span className={`text-2xl font-black leading-none ${textClass}`}>{scorePct}</span>
              <span className="text-sm font-bold text-gray-400 mb-0.5">/100</span>
            </div>
          </div>
        </div>

        {report.notes && (
          <div className="bg-white/80 p-3 text-sm rounded-lg border border-black/5 text-gray-700 leading-relaxed font-medium">
            <span className="font-bold text-gray-900 block mb-1">AI বিশ্লেষণ:</span>
            {report.notes}
          </div>
        )}

        {/* ── 6-Layer Data Pipeline Breakdown ─────────────────── */}
        <div className="bg-white/70 rounded-lg border border-black/5 p-4">
          <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
            <span>🔬</span>
            <span>৬-স্তর ডেটা বিশ্লেষণ (6-Layer Data Pipeline)</span>
          </h4>
          <div className="space-y-2.5">
            {/* Layer 1 */}
            <div className="flex items-start gap-2 text-xs">
              <span className="bg-blue-100 text-blue-800 font-black px-1.5 py-0.5 rounded shrink-0">L1</span>
              <div>
                <span className="font-bold text-gray-800">জোন স্ট্যাটিক ডেটা (Zone Static)</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-gray-500">kb_zones টেবিল</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">
                  আর্সেনিক জোন ঝুঁকি, পরিচিত ধাতুর তালিকা ও ঐতিহাসিক heavy_metal_risk ফ্ল্যাগ থেকে max ২০ পয়েন্ট
                </p>
              </div>
            </div>
            {/* Layer 2 */}
            <div className="flex items-start gap-2 text-xs">
              <span className="bg-green-100 text-green-800 font-black px-1.5 py-0.5 rounded shrink-0">L2</span>
              <div>
                <span className="font-bold text-gray-800">মাটির প্রোফাইল (Soil Profile)</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-gray-500">farm_profiles টেবিল</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">
                  arsenic_risk, iron_risk, canal_contamination, soil_ph, water_color, fish_kill — max ২০ পয়েন্ট
                </p>
              </div>
            </div>
            {/* Layer 3 */}
            <div className="flex items-start gap-2 text-xs">
              <span className="bg-amber-100 text-amber-800 font-black px-1.5 py-0.5 rounded shrink-0">L3</span>
              <div>
                <span className="font-bold text-gray-800">স্ক্যান প্রমাণ (Scan Evidence)</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-gray-500">scan_logs টেবিল</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">
                  সাম্প্রতিক ৩টি Abiotic_Pollution স্ক্যান — plume স্কোর, এক্সপোজার ঘণ্টা, AI কনফিডেন্স — max ৩০ পয়েন্ট
                </p>
              </div>
            </div>
            {/* Layer 4 */}
            <div className="flex items-start gap-2 text-xs">
              <span className="bg-purple-100 text-purple-800 font-black px-1.5 py-0.5 rounded shrink-0">L4</span>
              <div>
                <span className="font-bold text-gray-800">সার্ভে প্রমাণ (Survey Evidence)</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-gray-500">surveys টেবিল</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">
                  সাপ্তাহিক সার্ভে থেকে water_risk, env_stress (ধোঁয়া), soil_ph_risk — max ১৫ পয়েন্ট
                </p>
              </div>
            </div>
            {/* Layer 5 */}
            <div className="flex items-start gap-2 text-xs">
              <span className="bg-red-100 text-red-800 font-black px-1.5 py-0.5 rounded shrink-0">L5</span>
              <div>
                <span className="font-bold text-gray-800">শিল্প নৈকট্য (Industrial Proximity)</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-gray-500">industrial_hotspots + PostGIS</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">
                  ১০km ব্যাসার্ধে সক্রিয় কারখানা — দূরত্ব ও শিল্প ধরন (tannery ×1.5, battery ×1.4) — max ১৫ পয়েন্ট
                </p>
              </div>
            </div>
            {/* Layer 6 */}
            <div className="flex items-start gap-2 text-xs">
              <span className="bg-cyan-100 text-cyan-800 font-black px-1.5 py-0.5 rounded shrink-0">L6</span>
              <div>
                <span className="font-bold text-gray-800">ISRIC মাটির pH (ISRIC SoilGrids)</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-gray-500">HTTP API → farm_profiles আপডেট</span>
                <p className="text-gray-400 mt-0.5 leading-relaxed">
                  ISRIC FAO SoilGrids থেকে pH → computePhRiskModifier (0-10 বোনাস) → confidence_score-এ যোগ
                </p>
              </div>
            </div>
          </div>
        </div>

        {scorePct >= 50 && (
          <div className="mt-2 text-xs bg-red-100/50 text-red-800 p-2 rounded flex gap-2">
            <span className="text-lg">🛑</span>
            <span>
              <strong>সতর্কতা:</strong> এই জমিতে উৎপাদিত ফসলে ভারি ধাতুর উপস্থিতি থাকতে পারে।{' '}
              সরাসরি বিক্রির আগে ল্যাব টেস্ট করার পরামর্শ দেওয়া হচ্ছে।
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
