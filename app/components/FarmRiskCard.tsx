'use client'
/**
 * FarmRiskCard — shows risk score gauge, breakdown bars, loss estimate
 * for a single land plot. Includes crop price input modal.
 *
 * Usage (in LandDigest or wherever land cards are shown):
 *   <FarmRiskCard
 *     landId={plot.land_id}
 *     landNameBn={plot.land_name_bn ?? plot.land_name}
 *     cropId={plot.crop_id}
 *     initialRiskScore={summary?.risk_score ?? null}
 *     initialRiskLevel={summary?.risk_level ?? null}
 *     initialBreakdown={summary?.breakdown ?? null}
 *     initialLoss={summary?.expected_loss_bdt ?? null}
 *     initialAdviceBn={summary?.advice_bn ?? null}
 *   />
 */

import { useState, useTransition } from 'react'
import {
  calculateFarmRisk,
  estimateCropLoss,
  updateCropPrice,
  type LossEstimate,
  type RiskScore,
} from '@/app/actions/riskActions'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface Props {
  landId:             string
  landNameBn:         string
  cropId:             string | null
  initialRiskScore:   number | null
  initialRiskLevel:   string | null
  initialBreakdown:   RiskScore['breakdown'] | null
  initialLoss:        number | null
  initialAdviceBn:    string | null
  dominantThreat?:    string | null
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────
const RISK_CONFIG = {
  LOW:      { color: '#22c55e', bg: 'bg-green-50',   border: 'border-green-200',  badge: 'bg-green-100 text-green-800',  label: 'নিম্ন' },
  MEDIUM:   { color: '#f59e0b', bg: 'bg-amber-50',   border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-800',  label: 'মধ্যম' },
  HIGH:     { color: '#ef4444', bg: 'bg-red-50',     border: 'border-red-200',    badge: 'bg-red-100 text-red-800',      label: 'উচ্চ' },
  CRITICAL: { color: '#dc2626', bg: 'bg-red-100',    border: 'border-red-300',    badge: 'bg-red-200 text-red-900',      label: 'সংকটাপন্ন' },
} as const

const BREAKDOWN_LABELS: Record<string, string> = {
  industrial: '🏭 শিল্প',
  water:      '💧 পানি',
  community:  '👥 সম্প্রদায়',
  air:        '💨 বায়ু',
  soil:       '🌱 মাটি',
  weather:    '🌤️ আবহাওয়া',
}

const CROP_OPTIONS = [
  { value: 'ধান',   label: 'ধান (Rice)' },
  { value: 'গম',    label: 'গম (Wheat)' },
  { value: 'সবজি',  label: 'সবজি (Vegetables)' },
  { value: 'পাট',   label: 'পাট (Jute)' },
  { value: 'ভুট্টা', label: 'ভুট্টা (Maize)' },
]

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function RiskGauge({ score, level }: { score: number; level: string }) {
  const cfg = RISK_CONFIG[level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.LOW
  // SVG arc gauge
  const radius    = 40
  const stroke    = 8
  const circ      = Math.PI * radius  // half circle
  const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0
  const dashOffset = circ - (circ * safeScore) / 100

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-14 overflow-hidden">
        <svg width="96" height="56" viewBox="0 0 96 56">
          {/* Track */}
          <path
            d="M 8 48 A 40 40 0 0 1 88 48"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {/* Score arc */}
          <path
            d="M 8 48 A 40 40 0 0 1 88 48"
            fill="none"
            stroke={cfg.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
          {/* Score text */}
          <text x="48" y="44" textAnchor="middle" fontSize="16" fontWeight="bold" fill={cfg.color}>
            {safeScore}
          </text>
        </svg>
      </div>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
        {cfg.label}
      </span>
    </div>
  )
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? '#ef4444' : value >= 40 ? '#f59e0b' : '#22c55e'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, value)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono text-gray-600 w-7 text-right">{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
export default function FarmRiskCard({
  landId, landNameBn, cropId,
  initialRiskScore, initialRiskLevel, initialBreakdown,
  initialLoss, initialAdviceBn, dominantThreat: initialDominantThreat,
}: Props) {
  const [riskScore,  setRiskScore]  = useState<number | null>(initialRiskScore)
  const [riskLevel,  setRiskLevel]  = useState<string | null>(initialRiskLevel)
  const [breakdown,  setBreakdown]  = useState<RiskScore['breakdown'] | null>(initialBreakdown)
  const [adviceBn,   setAdviceBn]   = useState<string | null>(initialAdviceBn)
  const [dominantThreat, setDominantThreat] = useState<string | null>(initialDominantThreat ?? null)
  const [lossAmount, setLossAmount] = useState<number | null>(initialLoss)
  const [lossPct,    setLossPct]    = useState<number | null>(null)
  const [lossCrop,   setLossCrop]   = useState<LossEstimate['crop_name'] | null>(null)

  const [showPriceModal, setShowPriceModal] = useState(false)
  const [cropName,       setCropName]       = useState(cropId ?? 'ধান')
  const [priceInput,     setPriceInput]     = useState('')
  const [feedback,       setFeedback]       = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [isPending,      startTransition]   = useTransition()

  const cfg = RISK_CONFIG[(riskLevel as keyof typeof RISK_CONFIG) ?? 'LOW'] ?? RISK_CONFIG.LOW

  // ── Calculate risk ────────────────────────────────────────────
  function handleCalculateRisk() {
    setError(null)
    setFeedback(null)
    startTransition(async () => {
      const res = await calculateFarmRisk(landId)
      if (!res.success || !res.data) {
        setError(res.error ?? 'ত্রুটি হয়েছে')
        return
      }
      setRiskScore(res.data.risk_score)
      setRiskLevel(res.data.risk_level)
      setBreakdown(res.data.breakdown)
      setAdviceBn(res.data.advice_bn)
      setDominantThreat(res.data.dominant_threat)
      setFeedback('রিস্ক স্কোর আপডেট হয়েছে ✓')

      // Auto-estimate loss after risk
      const lossRes = await estimateCropLoss(landId)
      if (lossRes.success && lossRes.data) {
        setLossAmount(lossRes.data.expected_loss_bdt)
        setLossPct(lossRes.data.loss_percentage)
        setLossCrop(lossRes.data.crop_name)
      }
    })
  }

  // ── Save crop price ───────────────────────────────────────────
  function handleSavePrice() {
    const price = parseFloat(priceInput)
    if (!cropName || isNaN(price) || price <= 0) {
      setError('সঠিক ফসলের নাম ও দাম দিন')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await updateCropPrice(landId, cropName, price)
      if (!res.success) {
        setError(res.error ?? 'ত্রুটি হয়েছে')
        return
      }
      setShowPriceModal(false)
      setFeedback('দাম সেভ হয়েছে। পুনরায় হিসাব করুন।')
    })
  }

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${cfg.border}`}>
      {/* ── Color strip ── */}
      <div className="h-1" style={{ background: cfg.color }} />

      <div className={`p-4 ${cfg.bg}`}>

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold text-gray-900 text-sm">{landNameBn}</p>
            {dominantThreat && dominantThreat !== 'none' && (
              <p className="text-xs text-gray-500 mt-0.5">
                প্রধান হুমকি: <span className="font-medium text-gray-700">{dominantThreat}</span>
              </p>
            )}
          </div>
          <button
            onClick={handleCalculateRisk}
            disabled={isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-60"
          >
            {isPending ? '⏳' : '🔄'} রিস্ক হিসাব
          </button>
        </div>

        {/* ── Risk gauge + breakdown ── */}
        {riskScore !== null && riskLevel ? (
          <div className="flex gap-4 items-start">
            <RiskGauge score={riskScore} level={riskLevel} />
            <div className="flex-1 space-y-1.5">
              {breakdown && Object.entries(breakdown).map(([key, val]) => (
                <BreakdownBar
                  key={key}
                  label={BREAKDOWN_LABELS[key] ?? key}
                  value={val as number}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-3">
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
              <span className="text-gray-300 text-lg">?</span>
            </div>
            <p className="text-xs text-gray-400">রিস্ক স্কোর এখনো হিসাব হয়নি। &quot;রিস্ক হিসাব&quot; চাপুন।</p>
          </div>
        )}

        {/* ── Advice ── */}
        {adviceBn && (
          <div className="mt-3 p-3 bg-white rounded-xl border border-gray-100 text-xs text-gray-700">
            <span className="font-semibold">পরামর্শ: </span>{adviceBn}
          </div>
        )}

        {/* ── Loss estimate ── */}
        {lossAmount !== null && (
          <div className="mt-3 p-3 bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">প্রত্যাশিত ক্ষতি</p>
                <p className="text-lg font-bold text-red-600">
                  ৳{lossAmount.toLocaleString('bn-BD')}
                </p>
                {lossPct !== null && (
                  <p className="text-xs text-gray-400">
                    {lossPct}% ক্ষতি · {lossCrop ?? cropId ?? 'ফসল'}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowPriceModal(true); setError(null) }}
                className="text-xs text-green-700 font-semibold underline hover:no-underline"
              >
                দাম আপডেট করুন
              </button>
            </div>
          </div>
        )}

        {/* ── Insurance CTA for high risk ── */}
        {(riskLevel === 'HIGH' || riskLevel === 'CRITICAL') && (
          <div className="mt-3 p-3 bg-white rounded-xl border border-amber-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-800">🛡️ বীমা পরামর্শ</p>
              <p className="text-xs text-amber-600">উচ্চ ঝুঁকিতে ফসল বীমা বিবেচনা করুন</p>
            </div>
            <a
              href="tel:16123"
              className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1.5 rounded-lg hover:bg-amber-200"
            >
              যোগাযোগ
            </a>
          </div>
        )}

        {/* ── Feedback / error ── */}
        {feedback && (
          <p className="mt-2 text-xs text-green-700 font-medium">{feedback}</p>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-600 font-medium">⚠️ {error}</p>
        )}
      </div>

      {/* ── Crop price modal ── */}
      {showPriceModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">ফসলের বাজারদর</h3>
            <p className="text-xs text-gray-400 mb-4">সঠিক ক্ষতি হিসাবের জন্য বর্তমান বাজারদর দিন</p>

            <label className="block text-xs font-medium text-gray-700 mb-1">ফসলের ধরন</label>
            <select
              value={cropName}
              onChange={e => setCropName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {CROP_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <label className="block text-xs font-medium text-gray-700 mb-1">
              দাম (৳ প্রতি মণ)
            </label>
            <input
              type="number"
              min="1"
              placeholder="যেমন: ১০৫০"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            {error && <p className="text-xs text-red-600 mb-3">⚠️ {error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setShowPriceModal(false)}
                className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                বাতিল
              </button>
              <button
                onClick={handleSavePrice}
                disabled={isPending}
                className="flex-1 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-60"
              >
                {isPending ? 'সেভ হচ্ছে...' : 'সেভ করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
