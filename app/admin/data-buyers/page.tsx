'use client'
/**
 * /admin/data-buyers — Admin panel for managing B2B data buyers
 *
 * Route: app/admin/data-buyers/page.tsx
 * Protection: check service role or admin flag server-side before rendering
 *
 * Features:
 *  - List all data buyers with org type badge
 *  - Toggle is_active
 *  - Show/copy API key
 *  - Export data modal (district + date range + type)
 *  - Revenue tracker
 */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/app/utils/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────
interface DataBuyer {
  id:                  string
  org_name:            string
  org_name_bn:         string | null
  org_type:            'insurance' | 'ngo' | 'government' | 'research' | 'export_cert'
  contact_email:       string
  contact_person:      string | null
  api_key:             string
  subscription_tier:   'basic' | 'standard' | 'premium'
  is_active:           boolean
  monthly_fee_bdt:     number
  licensed_districts:  string[]
  can_access_heavy_metals: boolean
  contract_ends_at:    string | null
  created_at:          string
}

interface ExportLog {
  id:            string
  export_type:   string
  district:      string | null
  records_count: number
  exported_at:   string
  status:        string
}

// ─── Constants ─────────────────────────────────────────────────────
const ORG_TYPE_CONFIG = {
  insurance:   { label: 'বীমা',      emoji: '🏦', color: 'bg-blue-100 text-blue-800' },
  ngo:         { label: 'NGO',        emoji: '🌿', color: 'bg-green-100 text-green-800' },
  government:  { label: 'সরকার',     emoji: '🏛️', color: 'bg-purple-100 text-purple-800' },
  research:    { label: 'গবেষণা',    emoji: '🔬', color: 'bg-amber-100 text-amber-800' },
  export_cert: { label: 'এক্সপোর্ট', emoji: '📦', color: 'bg-teal-100 text-teal-800' },
}

const TIER_CONFIG = {
  basic:    { label: 'Basic',    color: 'bg-gray-100 text-gray-700',   fee: 5000 },
  standard: { label: 'Standard', color: 'bg-blue-100 text-blue-700',   fee: 15000 },
  premium:  { label: 'Premium',  color: 'bg-purple-100 text-purple-700', fee: 50000 },
}

const DISTRICTS = [
  'Gazipur', 'Dhaka', 'Narayanganj', 'Savar', 'Narsingdi',
  'Manikganj', 'Munshiganj', 'Rajshahi', 'Khulna', 'Sylhet',
] as const

const EXPORT_TYPES = [
  { value: 'risk_heatmap',    label: '🗺️ রিস্ক হিটম্যাপ' },
  { value: 'loss_aggregate',  label: '💰 ক্ষতি সমষ্টি' },
  { value: 'heavy_metal',     label: '⚗️ ভারী ধাতু রিপোর্ট' },
  { value: 'pollution_zone',  label: '🏭 দূষণ এলাকা' },
] as const

type OrgType = keyof typeof ORG_TYPE_CONFIG
type TierKey = keyof typeof TIER_CONFIG
type ExportType = (typeof EXPORT_TYPES)[number]['value']

interface NewBuyerForm {
  org_name: string
  org_name_bn: string
  org_type: OrgType
  contact_email: string
  contact_person: string
  phone: string
  subscription_tier: TierKey
  monthly_fee_bdt: number
  licensed_districts: string[]
  can_access_heavy_metals: boolean
  contract_ends_at: string
}

interface ExportFormState {
  district: string
  export_type: ExportType
  date_from: string
  date_to: string
}

const DEFAULT_EXPORT_RANGE = (() => {
  const now = new Date()
  const from = new Date(now.getTime() - 30 * 86400000)
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
})()

// ─── Main Page ──────────────────────────────────────────────────────
export default function DataBuyersAdmin() {
  const supabase = useMemo(() => createClient(), [])

  const [buyers,      setBuyers]      = useState<DataBuyer[]>([])
  const [exportLogs,  setExportLogs]  = useState<ExportLog[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<'buyers' | 'revenue' | 'logs'>('buyers')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState<DataBuyer | null>(null)
  const [copiedKey,   setCopiedKey]   = useState<string | null>(null)
  const [feedback,    setFeedback]    = useState<string | null>(null)

  // Add buyer form state
  const [newBuyer, setNewBuyer] = useState<NewBuyerForm>({
    org_name: '',
    org_name_bn: '',
    org_type: 'insurance',
    contact_email: '',
    contact_person: '',
    phone: '',
    subscription_tier: 'basic',
    monthly_fee_bdt: 5000,
    licensed_districts: [],
    can_access_heavy_metals: false,
    contract_ends_at: '',
  })

  // Export form state
  const [exportForm, setExportForm] = useState<ExportFormState>({
    district: '',
    export_type: 'risk_heatmap',
    date_from: DEFAULT_EXPORT_RANGE.from,
    date_to: DEFAULT_EXPORT_RANGE.to,
  })

  // ── Fetch data ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: buyerData } = await supabase
        .from('data_buyers')
        .select('*')
        .order('created_at', { ascending: false })

      const { data: logData } = await supabase
        .from('data_export_logs')
        .select('id, export_type, district, records_count, exported_at, status')
        .order('exported_at', { ascending: false })
        .limit(50)

      setBuyers(buyerData ?? [])
      setExportLogs(logData ?? [])
      setLoading(false)
    }
    load()
  }, [supabase])

  // ── Toggle buyer active ──────────────────────────────────────────
  async function toggleActive(buyerId: string, current: boolean) {
    const { error } = await supabase
      .from('data_buyers')
      .update({ is_active: !current, updated_at: new Date().toISOString() })
      .eq('id', buyerId)

    if (!error) {
      setBuyers(prev => prev.map(b => b.id === buyerId ? { ...b, is_active: !current } : b))
      setFeedback(`স্ট্যাটাস আপডেট হয়েছে`)
      setTimeout(() => setFeedback(null), 2000)
    }
  }

  // ── Copy API key ──────────────────────────────────────────────────
  function copyKey(key: string, id: string) {
    navigator.clipboard.writeText(key)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // ── Add new buyer ─────────────────────────────────────────────────
  async function handleAddBuyer() {
    if (!newBuyer.org_name || !newBuyer.contact_email) {
      setFeedback('প্রতিষ্ঠানের নাম ও ইমেইল আবশ্যিক')
      return
    }
    const { data, error } = await supabase
      .from('data_buyers')
      .insert({
        org_name:               newBuyer.org_name,
        org_name_bn:            newBuyer.org_name_bn || null,
        org_type:               newBuyer.org_type,
        contact_email:          newBuyer.contact_email,
        contact_person:         newBuyer.contact_person || null,
        phone:                  newBuyer.phone || null,
        subscription_tier:      newBuyer.subscription_tier,
        monthly_fee_bdt:        newBuyer.monthly_fee_bdt,
        licensed_districts:     newBuyer.licensed_districts,
        can_access_heavy_metals: newBuyer.can_access_heavy_metals,
        contract_ends_at:       newBuyer.contract_ends_at || null,
      })
      .select()
      .single()

    if (!error && data) {
      setBuyers(prev => [data as DataBuyer, ...prev])
      setShowAddModal(false)
      setFeedback('নতুন ক্রেতা যোগ করা হয়েছে ✓')
      setTimeout(() => setFeedback(null), 3000)
    } else {
      setFeedback(`ত্রুটি: ${error?.message ?? 'অজানা সমস্যা'}`)
    }
  }

  // ── Revenue calculations ─────────────────────────────────────────
  const totalMonthlyRevenue = buyers
    .filter(b => b.is_active)
    .reduce((sum, b) => sum + (b.monthly_fee_bdt ?? 0), 0)

  const revenueByTier = Object.entries(TIER_CONFIG).map(([tier, cfg]) => ({
    tier, label: cfg.label,
    count: buyers.filter(b => b.subscription_tier === tier && b.is_active).length,
    revenue: buyers
      .filter(b => b.subscription_tier === tier && b.is_active)
      .reduce((s, b) => s + (b.monthly_fee_bdt ?? 0), 0),
    color: cfg.color,
  }))

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">লোড হচ্ছে...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">ডেটা ক্রেতা ম্যানেজমেন্ট</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {buyers.filter(b => b.is_active).length} সক্রিয় ·
            মাসিক আয়: ৳{totalMonthlyRevenue.toLocaleString('bn-BD')}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700"
        >
          ＋ নতুন ক্রেতা
        </button>
      </div>

      {/* ── Feedback toast ── */}
      {feedback && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {feedback}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0">
          {(['buyers', 'revenue', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab === 'buyers' ? '👥 ক্রেতা তালিকা' :
               tab === 'revenue' ? '💰 রাজস্ব' : '📊 এক্সপোর্ট লগ'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ════ TAB: BUYERS ════ */}
        {activeTab === 'buyers' && (
          <div className="space-y-3">
            {buyers.length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-2xl mb-2">🏦</p>
                <p className="text-sm text-gray-500">কোনো ক্রেতা নেই। &quot;নতুন ক্রেতা&quot; যোগ করুন।</p>
              </div>
            )}
            {buyers.map(buyer => {
              const orgCfg  = ORG_TYPE_CONFIG[buyer.org_type]
              const tierCfg = TIER_CONFIG[buyer.subscription_tier]
              return (
                <div key={buyer.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${!buyer.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-gray-900">{buyer.org_name}</h3>
                        {buyer.org_name_bn && (
                          <span className="text-gray-500 text-sm">{buyer.org_name_bn}</span>
                        )}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${orgCfg.color}`}>
                          {orgCfg.emoji} {orgCfg.label}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tierCfg.color}`}>
                          {tierCfg.label}
                        </span>
                        {buyer.can_access_heavy_metals && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            ⚗️ Heavy Metal Access
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs mt-2">
                        <div><span className="text-gray-400">ইমেইল: </span><span className="text-gray-700">{buyer.contact_email}</span></div>
                        {buyer.contact_person && (
                          <div><span className="text-gray-400">যোগাযোগ: </span><span className="text-gray-700">{buyer.contact_person}</span></div>
                        )}
                        <div><span className="text-gray-400">মাসিক ফি: </span><span className="font-semibold text-gray-800">৳{buyer.monthly_fee_bdt?.toLocaleString()}</span></div>
                        {buyer.licensed_districts.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-400">লাইসেন্সপ্রাপ্ত জেলা: </span>
                            <span className="text-gray-700">{buyer.licensed_districts.join(', ')}</span>
                          </div>
                        )}
                        {buyer.contract_ends_at && (
                          <div>
                            <span className="text-gray-400">চুক্তি শেষ: </span>
                            <span className={new Date(buyer.contract_ends_at) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                              {new Date(buyer.contract_ends_at).toLocaleDateString('bn-BD')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* API Key row */}
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-600 truncate max-w-[200px]">
                          {buyer.api_key.slice(0, 8)}••••••••{buyer.api_key.slice(-4)}
                        </code>
                        <button
                          onClick={() => copyKey(buyer.api_key, buyer.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {copiedKey === buyer.id ? '✓ কপি হয়েছে' : 'কপি করুন'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      {/* Active toggle */}
                      <button
                        onClick={() => toggleActive(buyer.id, buyer.is_active)}
                        className={[
                          'text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors',
                          buyer.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800'
                            : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-800',
                        ].join(' ')}
                      >
                        {buyer.is_active ? '● সক্রিয়' : '○ নিষ্ক্রিয়'}
                      </button>

                      {/* Export button */}
                      <button
                        onClick={() => setShowExportModal(buyer)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        📊 এক্সপোর্ট
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ════ TAB: REVENUE ════ */}
        {activeTab === 'revenue' && (
          <div className="space-y-4">
            {/* Total */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-sm text-gray-500 mb-1">মোট মাসিক আয় (সক্রিয় ক্রেতা)</p>
              <p className="text-4xl font-bold text-green-600">
                ৳{totalMonthlyRevenue.toLocaleString('bn-BD')}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {buyers.filter(b => b.is_active).length}টি সক্রিয় সাবস্ক্রিপশন
              </p>
            </div>

            {/* By tier */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {revenueByTier.map(t => (
                <div key={t.tier} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                    <span className="text-xs text-gray-400">{t.count} ক্রেতা</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    ৳{t.revenue.toLocaleString('bn-BD')}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">/মাস</p>
                </div>
              ))}
            </div>

            {/* Pricing guide */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">মূল্য তালিকা</h3>
              <div className="space-y-2">
                {[
                  { tier: 'Basic',    price: '৳৫,০০০/মাস',  features: 'রিস্ক স্কোর, ক্ষতি হিসাব, ১টি জেলা' },
                  { tier: 'Standard', price: '৳১৫,০০০/মাস', features: 'সব Basic + ৩টি জেলা, ইতিহাস ৯০ দিন' },
                  { tier: 'Premium',  price: '৳৫০,০০০/মাস', features: 'সব জেলা, ভারী ধাতু ডেটা, API সীমাহীন' },
                ].map(p => (
                  <div key={p.tier} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                    <div>
                      <span className="font-semibold text-gray-800">{p.tier}</span>
                      <span className="text-gray-400 text-xs ml-2">{p.features}</span>
                    </div>
                    <span className="font-bold text-green-700">{p.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB: EXPORT LOGS ════ */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">সাম্প্রতিক এক্সপোর্ট ({exportLogs.length}টি)</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {exportLogs.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">কোনো এক্সপোর্ট লগ নেই</div>
              )}
              {exportLogs.map(log => (
                <div key={log.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-gray-700">{log.export_type}</span>
                    {log.district && <span className="text-gray-400 ml-2">· {log.district}</span>}
                    <span className="text-gray-400 ml-2">· {log.records_count} রেকর্ড</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {log.status}
                    </span>
                    <span className="text-gray-400">
                      {new Date(log.exported_at).toLocaleString('bn-BD')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ════ MODAL: Add Buyer ════ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-gray-900 text-lg mb-4">নতুন ডেটা ক্রেতা যোগ করুন</h2>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">প্রতিষ্ঠানের নাম *</label>
                  <input value={newBuyer.org_name}
                    onChange={e => setNewBuyer(p => ({ ...p, org_name: e.target.value }))}
                    placeholder="Sadharan Bima Corporation"
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">বাংলা নাম</label>
                  <input value={newBuyer.org_name_bn}
                    onChange={e => setNewBuyer(p => ({ ...p, org_name_bn: e.target.value }))}
                    placeholder="সাধারণ বীমা কর্পোরেশন"
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">ধরন *</label>
                  <select value={newBuyer.org_type}
                    onChange={e => setNewBuyer(p => ({ ...p, org_type: e.target.value as OrgType }))}
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {Object.entries(ORG_TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.emoji} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">প্যাকেজ *</label>
                  <select value={newBuyer.subscription_tier}
                    onChange={e => {
                      const tier = e.target.value as keyof typeof TIER_CONFIG
                      setNewBuyer(p => ({ ...p, subscription_tier: tier, monthly_fee_bdt: TIER_CONFIG[tier].fee }))
                    }}
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {Object.entries(TIER_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} (৳{v.fee.toLocaleString()}/মাস)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">ইমেইল *</label>
                <input type="email" value={newBuyer.contact_email}
                  onChange={e => setNewBuyer(p => ({ ...p, contact_email: e.target.value }))}
                  placeholder="contact@example.com"
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">যোগাযোগ ব্যক্তি</label>
                  <input value={newBuyer.contact_person}
                    onChange={e => setNewBuyer(p => ({ ...p, contact_person: e.target.value }))}
                    placeholder="নাম"
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">ফোন</label>
                  <input value={newBuyer.phone}
                    onChange={e => setNewBuyer(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+880..."
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">মাসিক ফি (৳)</label>
                <input type="number" value={newBuyer.monthly_fee_bdt}
                  onChange={e => setNewBuyer(p => ({ ...p, monthly_fee_bdt: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">চুক্তি শেষের তারিখ</label>
                <input type="date" value={newBuyer.contract_ends_at}
                  onChange={e => setNewBuyer(p => ({ ...p, contract_ends_at: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox"
                  id="heavy_metals"
                  checked={newBuyer.can_access_heavy_metals}
                  onChange={e => setNewBuyer(p => ({ ...p, can_access_heavy_metals: e.target.checked }))}
                  className="w-4 h-4 accent-green-600"
                />
                <label htmlFor="heavy_metals" className="text-sm text-gray-700">
                  ⚗️ ভারী ধাতু ডেটা অ্যাক্সেস দিন
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                বাতিল
              </button>
              <button onClick={handleAddBuyer}
                className="flex-1 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700">
                যোগ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: Export ════ */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="font-bold text-gray-900 text-lg mb-1">ডেটা এক্সপোর্ট</h2>
            <p className="text-xs text-gray-400 mb-4">
              ক্রেতা: <strong>{showExportModal.org_name}</strong>
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">এক্সপোর্টের ধরন</label>
                <select value={exportForm.export_type}
                  onChange={e => setExportForm(p => ({ ...p, export_type: e.target.value as ExportType }))}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {EXPORT_TYPES.filter(et =>
                    et.value !== 'heavy_metal' || showExportModal.can_access_heavy_metals
                  ).map(et => (
                    <option key={et.value} value={et.value}>{et.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">জেলা</label>
                <select value={exportForm.district}
                  onChange={e => setExportForm(p => ({ ...p, district: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">সব জেলা</option>
                  {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">তারিখ থেকে</label>
                  <input type="date" value={exportForm.date_from}
                    onChange={e => setExportForm(p => ({ ...p, date_from: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">তারিখ পর্যন্ত</label>
                  <input type="date" value={exportForm.date_to}
                    onChange={e => setExportForm(p => ({ ...p, date_to: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowExportModal(null)}
                className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                বাতিল
              </button>
              <button
                onClick={async () => {
                  // Trigger export via API
                  const res = await fetch('/api/risk-report', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-api-key': showExportModal.api_key,
                    },
                    body: JSON.stringify({
                      district:    exportForm.district || undefined,
                      date_from:   exportForm.date_from,
                      date_to:     exportForm.date_to,
                      export_type: exportForm.export_type,
                    }),
                  })
                  const data = await res.json()
                  // Download as JSON
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url  = URL.createObjectURL(blob)
                  const a    = document.createElement('a')
                  a.href     = url
                  a.download = `agrosentinel_${exportForm.export_type}_${exportForm.date_from}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                  setShowExportModal(null)
                  setFeedback('এক্সপোর্ট ডাউনলোড শুরু হয়েছে ✓')
                  setTimeout(() => setFeedback(null), 3000)
                }}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                ডাউনলোড করুন
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
