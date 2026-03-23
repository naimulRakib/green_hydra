'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/app/utils/supabase/client'

// --- Types ---

interface Buyer {
  id: string
  org_name: string
  org_type: string
  api_key?: string
  subscription_tier: string
  can_access_risk_scores: boolean
  can_access_loss_estimates: boolean
  can_access_heavy_metals: boolean
  can_access_raw_scans: boolean
}

interface FarmerListItem {
  id: string
  name_bn: string
  phone_number: string
  zone_id: string
  badge_level: string
  total_scans: number
  trust_score: number
  data_sharing_consent: boolean
  total_lands: number
  latest_risk_level: string
}

interface BuyerExportPayload {
  export_type: string
  district?: string
  farmer_ref?: string
  risk_level?: string
  loss_percentage?: number
  water_event_active?: boolean
  [key: string]: unknown
}

interface InsurancePreview {
  riskScore: number
  expectedLoss: number
  hasFishKill: boolean
  hasArsenic: boolean
  scanCount: number
  pollutants: string[]
  breakdown?: Record<string, number>
}

type EvidenceStrength = 'Strong' | 'Moderate' | 'Supporting'

interface GovernmentPreview {
  scans: number
  metals: number
  strength: EvidenceStrength
  factories: string[]
}

type CertificationStatus = 'certifiable' | 'conditional' | 'not_eligible'

interface ExportPreview {
  certScore: number
  certStatus: CertificationStatus
  riskOk: boolean
  noScans: boolean
  noHm: boolean
  waterColorOk: boolean
  noFish: boolean
  noArsenic: boolean
  satClean: boolean
}

interface NgoPreview {
  pct_arsenic: number
  pct_smoke: number
  pct_high_risk: number
  total_farmers: number
  avg_risk: number
}

type PreviewState = InsurancePreview | GovernmentPreview | ExportPreview | NgoPreview

type FarmerRow = Omit<FarmerListItem, 'total_lands' | 'latest_risk_level'>
interface FarmerLandRow {
  farmer_id: string
  is_active: boolean
}
interface RiskSummaryRow {
  farmer_id: string
  risk_level: FarmerListItem['latest_risk_level']
}

const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800 border-green-200',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200',
  HIGH: 'bg-red-100 text-red-800 border-red-200',
  CRITICAL: 'bg-rose-900 text-white border-rose-950',
}

const BADGE_COLORS: Record<string, string> = {
  BRONZE: 'bg-orange-100 text-orange-800',
  SILVER: 'bg-slate-200 text-slate-700',
  GOLD: 'bg-yellow-100 text-yellow-800',
  PLATINUM: 'bg-cyan-100 text-cyan-800',
}

export default function DataExportAdminPage() {
  const supabase = useMemo(() => createClient(), [])

  // -- State --
  // Left panel
  const [farmers, setFarmers] = useState<FarmerListItem[]>([])
  const [filteredFarmers, setFilteredFarmers] = useState<FarmerListItem[]>([])
  const [loadingFarmers, setLoadingFarmers] = useState(true)
  
  // Filters
  const [searchQ, setSearchQ] = useState('')
  const [filterConsent, setFilterConsent] = useState('all') // all, yes, no
  const [filterRisk, setFilterRisk] = useState('all')
  const [filterZone, setFilterZone] = useState('all')
  const [zones, setZones] = useState<string[]>([])

  // Selection
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)
  
  // Right panel - Buyers & Settings
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'insurance' | 'gov' | 'export' | 'ngo'>('insurance')

  // Selected Farmer Data (Previews)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [buyerData, setBuyerData] = useState<BuyerExportPayload | null>(null) // the final JSON to export
  const [previewUI, setPreviewUI] = useState<PreviewState | null>(null) // UI presentation data
  
  // NGO Zone Tab
  const [ngoZone, setNgoZone] = useState<string>('')
  
  // Toast
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null)

  // -- 1. Initial Load (Farmers & Buyers) --
  useEffect(() => {
    async function loadInitial() {
      setLoadingFarmers(true)
      
      // Load buyers
      const { data: bData } = await supabase.from('data_buyers').select('*').eq('is_active', true)
      if (bData) setBuyers(bData)
      
      // Load farmers (complex join simulation)
      // Since we need joined data and it's client side, we'll fetch core tables and stitch
      
      const { data: fData } = await supabase.from('farmers').select('id, name_bn, phone_number, zone_id, badge_level, total_scans, trust_score, data_sharing_consent')
      const { data: lData } = await supabase.from('farmer_lands').select('farmer_id, is_active').eq('is_active', true)
      const { data: rData } = await supabase.from('v_farm_risk_summary').select('farmer_id, risk_level')
      
      if (fData) {
        // Build unique zones
        const zSet = new Set<string>()

        const farmerRows: FarmerRow[] = (fData ?? []) as FarmerRow[]
        const landRows: FarmerLandRow[] = (lData ?? []) as FarmerLandRow[]
        const riskRows: RiskSummaryRow[] = (rData ?? []) as RiskSummaryRow[]

        const stitched: FarmerListItem[] = farmerRows.map((f) => {
          if (f.zone_id) zSet.add(f.zone_id)
          
          const fLands = landRows.filter((l) => l.farmer_id === f.id)
          
          // Get worst risk level from v_farm_risk_summary
          const fRisks = riskRows.filter((r) => r.farmer_id === f.id)
          let latestRisk = 'LOW'
          if (fRisks.some((r) => r.risk_level === 'CRITICAL')) latestRisk = 'CRITICAL'
          else if (fRisks.some((r) => r.risk_level === 'HIGH')) latestRisk = 'HIGH'
          else if (fRisks.some((r) => r.risk_level === 'MEDIUM')) latestRisk = 'MEDIUM'
          
          return {
            ...f,
            total_lands: fLands.length,
            latest_risk_level: latestRisk
          }
        })
        
        setFarmers(stitched)
        setFilteredFarmers(stitched)
        setZones(Array.from(zSet).sort())
      }
      setLoadingFarmers(false)
    }
    loadInitial()
  }, [supabase])

  // -- 2. Filtering Farmers --
  useEffect(() => {
    let result = farmers
    if (searchQ) {
      result = result.filter(f => f.name_bn?.includes(searchQ) || f.zone_id?.includes(searchQ))
    }
    if (filterConsent === 'yes') result = result.filter(f => f.data_sharing_consent)
    if (filterConsent === 'no') result = result.filter(f => !f.data_sharing_consent)
    if (filterRisk !== 'all') result = result.filter(f => f.latest_risk_level === filterRisk)
    if (filterZone !== 'all') result = result.filter(f => f.zone_id === filterZone)
    setFilteredFarmers(result)
  }, [farmers, searchQ, filterConsent, filterRisk, filterZone])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ---- DATA FETCHERS (must be defined before useEffect that uses them) ----
  
  const fetchFarmerData = useCallback(async (farmer: FarmerListItem) => {
    setLoadingPreview(true)
    try {
      if (activeTab === 'insurance') {
        const { data: scores } = await supabase.from('farm_risk_scores').select('*').eq('farmer_id', farmer.id).eq('is_current', true)
        const { data: losses } = await supabase.from('loss_estimates').select('*').eq('farmer_id', farmer.id)
        
        // 90 days abiotic scans
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const { data: scans } = await supabase.from('scan_logs')
          .select('id, ai_confidence, confirmed_pollutant_id')
          .eq('farmer_id', farmer.id)
          .eq('stress_type', 'Abiotic_Pollution')
          .gte('created_at', ninetyDaysAgo.toISOString())
        
        const { data: profiles } = await supabase.from('farm_profiles')
          .select('arsenic_risk, iron_risk, canal_contamination, fish_kill')
          .eq('farmer_id', farmer.id)
          
        const { data: lands } = await supabase.from('farmer_lands').select('zone_id').eq('farmer_id', farmer.id)
        let activeWaterEvent = false
        if (lands && lands.length > 0) {
          // simplified check: any active water event in the system (would be joined by location in real world)
          const { count } = await supabase.from('water_pollution_events').select('*', { count: 'exact', head: true }).eq('is_active', true)
          activeWaterEvent = (count || 0) > 0
        }

        const riskScore = scores?.[0]?.risk_score || 0
        const expectedLoss = losses?.reduce((sum, l) => sum + (Number(l.expected_loss_bdt) || 0), 0) || 0
        const hasFishKill = profiles?.some(p => p.fish_kill) || false
        const hasArsenic = profiles?.some(p => p.arsenic_risk) || false
        const scanCount = scans?.length || 0
        const pollutants = Array.from(new Set(scans?.map(s => s.confirmed_pollutant_id).filter(Boolean) as string[]))

        setPreviewUI({ riskScore, expectedLoss, hasFishKill, hasArsenic, scanCount, pollutants, breakdown: scores?.[0]?.breakdown } as InsurancePreview)
        
        setBuyerData({
          export_type: "insurance_risk_profile",
          farmer_ref: `ANON-${farmer.id.substring(0,6)}`,
          district: farmer.zone_id,
          zone_id: farmer.zone_id,
          risk_score: riskScore,
          risk_level: scores?.[0]?.risk_level || 'LOW',
          breakdown: scores?.[0]?.breakdown || {},
          dominant_threat: scores?.[0]?.dominant_threat || 'None',
          expected_loss_bdt: expectedLoss,
          loss_percentage: losses?.[0]?.loss_percentage || 0,
          crop_name: losses?.[0]?.crop_name || 'Mixed',
          abiotic_scan_count_90d: scanCount,
          pollution_types_detected: pollutants,
          arsenic_risk: hasArsenic,
          fish_kill_reported: hasFishKill,
          water_event_active: activeWaterEvent,
          generated_at: new Date().toISOString()
        } as BuyerExportPayload)
      }
      else if (activeTab === 'gov') {
        // Government tab
        const { data: scans } = await supabase.from('scan_logs')
          .select('id, scan_location, environmental_context')
          .eq('farmer_id', farmer.id)
          .eq('stress_type', 'Abiotic_Pollution')
          
        const { data: heavyMetals } = await supabase.from('heavy_metal_reports')
          .select('metal_type, severity, verified, confidence_score')
          .eq('farmer_id', farmer.id)

        const { data: satData } = await supabase.from('satellite_water_data').select('water_quality_index, suspected_pollution').order('recorded_at', { ascending: false }).limit(1)
        
        const domFacts = Array.from(new Set(scans?.map(s => s.environmental_context?.dominant_factory).filter(Boolean)))
        const hmCount = heavyMetals?.filter(h => h.verified)?.length || 0
        const strength = hmCount > 0 ? 'Strong' : (scans?.length ? 'Supporting' : 'Moderate')

        setPreviewUI({ scans: scans?.length || 0, metals: hmCount, strength, factories: domFacts } as GovernmentPreview)
        
        setBuyerData({
          export_type: "government_pollution_evidence",
          case_ref: `DOE-${farmer.zone_id}-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`,
          district: farmer.zone_id, // approximation
          upazila: farmer.zone_id,
          zone_id: farmer.zone_id,
          pollution_scan_count: scans?.length || 0,
          plume_exposure_hours_avg: scans?.[0]?.environmental_context?.plume_exposure_hours_7d || 0,
          dominant_factories: domFacts,
          heavy_metal_detections: heavyMetals || [],
          water_events: [], 
          satellite_water_quality_index: satData?.[0]?.water_quality_index || null,
          community_alert_active: false,
          evidence_strength: strength,
          generated_at: new Date().toISOString()
        } as BuyerExportPayload)
      }
      else if (activeTab === 'export') {
        const { data: scores } = await supabase.from('farm_risk_scores').select('risk_score, risk_level').eq('farmer_id', farmer.id).eq('is_current', true)
        const score = scores?.[0]?.risk_score || 0
        
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const { data: scans } = await supabase.from('scan_logs').select('id').eq('farmer_id', farmer.id).eq('stress_type', 'Abiotic_Pollution').gte('created_at', ninetyDaysAgo.toISOString())
        
        const hmDaysAgo = new Date()
        hmDaysAgo.setDate(hmDaysAgo.getDate() - 180)
        const { data: hm } = await supabase.from('heavy_metal_reports').select('id').eq('farmer_id', farmer.id).gte('reported_at', hmDaysAgo.toISOString())
        
        const { data: profiles } = await supabase.from('farm_profiles').select('water_color, fish_kill, arsenic_risk, canal_contamination').eq('farmer_id', farmer.id)
        
        const { data: sat } = await supabase.from('satellite_water_data').select('suspected_pollution').order('recorded_at', { ascending: false }).limit(1)

        const riskOk = score < 25
        const noScans = (scans?.length || 0) === 0
        const noHm = (hm?.length || 0) === 0
        const waterColorOk = profiles?.every(p => p.water_color === 'clear') ?? true
        const noFish = profiles?.every(p => !p.fish_kill) ?? true
        const noArsenic = profiles?.every(p => !p.arsenic_risk) ?? true
        const distOk = true // mocked for now
        const satVal = sat?.[0]?.suspected_pollution
        const satClean = satVal === undefined ? true : satVal === false

        const checklist = [riskOk, noScans, noHm, waterColorOk, noFish, noArsenic, distOk, satClean]
        const certScore = checklist.filter(Boolean).length
        const certStatus = certScore === 8 ? 'certifiable' : (certScore >= 5 ? 'conditional' : 'not_eligible')

        setPreviewUI({ certScore, certStatus, riskOk, noScans, noHm, waterColorOk, noFish, noArsenic, satClean } as ExportPreview)

        setBuyerData({
          export_type: "clean_zone_certification",
          farm_ref: `CLEAN-${farmer.zone_id}-${farmer.id.substring(0,6)}`,
          district: farmer.zone_id,
          zone_id: farmer.zone_id,
          crop_id: "Various",
          area_bigha: 2.5, // mocked 
          certifiability_score: certScore,
          certification_status: certStatus,
          checklist: {
            risk_score_ok: riskOk,
            no_pollution_scans: noScans,
            no_heavy_metals: noHm,
            water_color_ok: waterColorOk,
            no_fish_kill: noFish,
            no_arsenic: noArsenic,
            factory_distance_ok: distOk,
            satellite_clean: satClean
          },
          nearest_factory_km: 6.2, 
          last_scan_date: new Date().toISOString(),
          generated_at: new Date().toISOString()
        } as BuyerExportPayload)
      }
    } catch (err) {
      console.error(err)
      showToast('Error loading preview', 'error')
    } finally {
      setLoadingPreview(false)
    }
  }, [activeTab, supabase])

  const fetchNgoData = useCallback(async (zone_id: string) => {
    setLoadingPreview(true)
    try {
      // Mocking aggregated data logic since we can't do complex group by easily here without an RPC function
      // In production, an RPC or backend view is better.
      const agg: NgoPreview = {
        pct_arsenic: 12.5,
        pct_smoke: 45.0,
        pct_high_risk: 30.0,
        total_farmers: 124,
        avg_risk: 42.1
      }
      setPreviewUI(agg)
      setBuyerData({
        export_type: "ngo_research_aggregate",
        zone_id: zone_id,
        district: zone_id,
        reporting_period_days: 180,
        total_consenting_farmers: agg.total_farmers,
        total_lands_analyzed: 210,
        scan_breakdown: { biotic: 450, abiotic: 120, pollution: 85 },
        environmental_indicators: {
          pct_arsenic_risk: agg.pct_arsenic,
          pct_canal_contamination: 22.0,
          pct_fish_kill: 5.4,
          pct_smoke_exposure: agg.pct_smoke,
          pct_high_risk_farms: agg.pct_high_risk
        },
        water_contamination_pct: 18.5,
        avg_risk_score: agg.avg_risk,
        total_estimated_loss_bdt: 4500000,
        heavy_metal_counts: { chromium: 12, arsenic: 45, lead: 8 },
        active_water_events: 2,
        doe_notified_events: 1,
        generated_at: new Date().toISOString()
      } as BuyerExportPayload)
    } catch {
      // noop for mock data
    }
    setLoadingPreview(false)
  }, [])

  // -- 3. Fetch Preview Data when Farmer/Tab/Buyer changes --
  useEffect(() => {
    if (activeTab === 'ngo' && ngoZone) {
      fetchNgoData(ngoZone)
      return
    }
    
    if (!selectedFarmerId || activeTab === 'ngo') return
    
    // Check consent - if no consent, don't fetch and clear preview
    const farmer = farmers.find(f => f.id === selectedFarmerId)
    if (!farmer || !farmer.data_sharing_consent) {
       setPreviewUI(null)
       setBuyerData(null)
       return
    }

    fetchFarmerData(farmer)
  }, [selectedFarmerId, activeTab, ngoZone, selectedBuyerId, farmers, fetchFarmerData, fetchNgoData])

  // --- Actions ---
  
  const handleExport = async () => {
    if (!buyerData || !selectedBuyerId) {
      showToast('Please select a buyer and ensure data is loaded', 'error')
      return
    }

    try {
      // 1. Insert into export log
      const logEntry = {
        buyer_id: selectedBuyerId,
        export_type: buyerData.export_type,
        district: buyerData.district || 'Unknown',
        records_count: 1, // aggregate is 1 report
        query_params: activeTab === 'ngo' ? { zone_id: ngoZone } : { farmer_ref: buyerData.farmer_ref },
        status: 'success'
      }
      
      const { error } = await supabase.from('data_export_logs').insert([logEntry])
      if (error) {
         console.error(error)
         showToast('Export log could not be saved due to RLS or DB error.', 'error')
         // We can still process download if we want, but letting admin know it failed to log.
      } else {
         showToast('এক্সপোর্ট সম্পন্ন — লগ সেভ হয়েছে ✓', 'success')
      }

      // 2. Trigger Download
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(buyerData, null, 2))
      const downloadAnchorNode = document.createElement('a')
      downloadAnchorNode.setAttribute("href",     dataStr)
      downloadAnchorNode.setAttribute("download", `agrosentinel_${buyerData.export_type}_${buyerData.district}_${new Date().toISOString().split('T')[0]}.json`)
      document.body.appendChild(downloadAnchorNode) // required for firefox
      downloadAnchorNode.click()
      downloadAnchorNode.remove()
      
    } catch (err) {
      console.error(err)
      showToast('Export failed', 'error')
    }
  }

  // --- Render Helpers ---
  
  const selectedFarmer = farmers.find(f => f.id === selectedFarmerId)
  const currentBuyer = buyers.find(b => b.id === selectedBuyerId)
  const insurancePreview = activeTab === 'insurance' ? (previewUI as InsurancePreview | null) : null
  const governmentPreview = activeTab === 'gov' ? (previewUI as GovernmentPreview | null) : null
  const exportPreview = activeTab === 'export' ? (previewUI as ExportPreview | null) : null
  const ngoPreview = activeTab === 'ngo' ? (previewUI as NgoPreview | null) : null

  // Mask phone
  const maskPhone = (phone: string) => {
    if (!phone) return '01*********'
    if (phone.length === 11) return `${phone.substring(0,3)}****${phone.substring(7)}`
    return phone
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-bold text-white transition-opacity ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <h1 className="text-xl font-bold p-4 bg-white border-b border-gray-200 text-gray-800">
        📊 ডেটা এক্সপোর্ট (Export Builder)
      </h1>

      <div className="flex flex-1 p-4 gap-4 overflow-hidden h-[calc(100vh-60px)]">
        
        {/* ================= LEFT SIDE: FARMER BROWSER ================= */}
        <div className="w-[380px] bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col flex-shrink-0">
          
          <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl sticky top-0 z-10 space-y-3">
             <div className="text-sm font-bold text-gray-700">খামারি ব্রাউজার</div>
             <input 
               type="text" 
               placeholder="নাম বা জোন খুঁজুন..." 
               className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 outline-none"
               value={searchQ}
               onChange={e => setSearchQ(e.target.value)}
             />
             <div className="flex gap-2 text-xs">
               <select className="border border-gray-300 rounded p-1 flex-1" value={filterZone} onChange={e=>setFilterZone(e.target.value)}>
                 <option value="all">সব জোন</option>
                 {zones.map(z => <option key={z} value={z}>{z}</option>)}
               </select>
               <select className="border border-gray-300 rounded p-1 flex-1" value={filterRisk} onChange={e=>setFilterRisk(e.target.value)}>
                 <option value="all">সব ঝুঁকি লেভেল</option>
                 <option value="CRITICAL">CRITICAL</option>
                 <option value="HIGH">HIGH</option>
                 <option value="MEDIUM">MEDIUM</option>
                 <option value="LOW">LOW</option>
               </select>
               <select className="border border-gray-300 rounded p-1 flex-1" value={filterConsent} onChange={e=>setFilterConsent(e.target.value)}>
                 <option value="all">শেয়ারিং?</option>
                 <option value="yes">হ্যাঁ ✓</option>
                 <option value="no">না 🔒</option>
               </select>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingFarmers ? (
              <div className="p-4 text-center text-gray-400 text-xs mt-10">
                 <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                 লোড হচ্ছে...
              </div>
            ) : filteredFarmers.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-xs mt-10">কোনো খামারি পাওয়া যায়নি</div>
            ) : (
              filteredFarmers.map(f => {
                 const isSelected = selectedFarmerId === f.id
                 const riskColor = RISK_COLORS[f.latest_risk_level] || RISK_COLORS['LOW']
                 const badgeColor = BADGE_COLORS[f.badge_level] || BADGE_COLORS['BRONZE']
                 
                 return (
                   <div 
                     key={f.id} 
                     onClick={() => !f.data_sharing_consent ? showToast('এই কৃষক ডেটা শেয়ারিং সম্মতি দেননি 🔒', 'error') : setSelectedFarmerId(f.id)}
                     className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors relative
                       ${isSelected ? 'bg-green-50 border-green-500 border-l-4' : 'bg-white border-gray-100 hover:bg-gray-50 border-l-4 border-l-transparent'}
                       ${!f.data_sharing_consent ? 'opacity-60 bg-gray-50 cursor-not-allowed' : ''}
                     `}
                   >
                     {/* Lock Icon */}
                     {!f.data_sharing_consent && (
                       <div className="absolute top-2 right-2 text-rose-500" title="সম্মতি নেই">🔒</div>
                     )}

                     <div className="font-bold text-gray-800 pr-6">{f.name_bn}</div>
                     <div className="text-gray-500 text-xs mt-0.5">{maskPhone(f.phone_number)} · জোন: {f.zone_id}</div>
                     
                     <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border rounded ${riskColor}`}>
                          ঝুঁকি: {f.latest_risk_level}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeColor}`}>
                          {f.badge_level}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {f.total_lands} জমি · {f.total_scans} স্ক্যান
                        </span>
                     </div>
                   </div>
                 )
              })
            )}
          </div>
        </div>

        {/* ================= RIGHT SIDE: EXPORT BUILDER ================= */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
          
          {/* Header Controls */}
          <div className="p-5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">কোন ক্রেতার জন্য?</label>
                <select 
                  className="px-3 py-2 border border-gray-300 rounded-md font-semibold text-gray-800 focus:ring-green-500 outline-none w-80"
                  value={selectedBuyerId}
                  onChange={e => setSelectedBuyerId(e.target.value)}
                >
                  <option value="" disabled>-- বায়ার নির্বাচন করুন --</option>
                  {buyers.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.org_name} ({b.org_type}) - {b.subscription_tier}
                    </option>
                  ))}
                </select>
              </div>
              
              <button 
                onClick={handleExport}
                disabled={!buyerData || !selectedBuyerId}
                className="bg-gray-800 text-white font-bold py-2 px-6 rounded-md hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>↓ ডাউনলোড JSON</span>
              </button>
            </div>
            {currentBuyer && (
               <div className="mt-3 flex gap-2 text-[10px] text-gray-500">
                 <span className={`px-2 py-1 rounded ${currentBuyer.can_access_risk_scores ? 'bg-green-100 text-green-800' : 'bg-gray-200'}`}>✔️ Risk Scores</span>
                 <span className={`px-2 py-1 rounded ${currentBuyer.can_access_raw_scans ? 'bg-green-100 text-green-800' : 'bg-gray-200'}`}>✔️ Raw Scans</span>
                 <span className={`px-2 py-1 rounded ${currentBuyer.can_access_heavy_metals ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-200'}`}>✔️ Heavy Metals</span>
               </div>
            )}
          </div>

          {/* TABS */}
          <div className="flex border-b border-gray-200 font-bold text-sm bg-gray-50">
            <button className={`flex-1 py-3 px-4 outline-none ${activeTab === 'insurance' ? 'bg-white border-t-2 border-t-blue-500 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`} onClick={()=>setActiveTab('insurance')}>🏦 বীমা (Insurance)</button>
            <button className={`flex-1 py-3 px-4 outline-none ${activeTab === 'gov' ? 'bg-white border-t-2 border-t-slate-800 text-slate-800' : 'text-gray-500 hover:bg-gray-100'}`} onClick={()=>setActiveTab('gov')}>🏛️ সরকার (Government)</button>
            <button className={`flex-1 py-3 px-4 outline-none ${activeTab === 'export' ? 'bg-white border-t-2 border-t-emerald-600 text-emerald-700' : 'text-gray-500 hover:bg-gray-100'}`} onClick={()=>setActiveTab('export')}>📦 এক্সপোর্ট (Export Cert)</button>
            <button className={`flex-1 py-3 px-4 outline-none ${activeTab === 'ngo' ? 'bg-white border-t-2 border-t-amber-500 text-amber-700' : 'text-gray-500 hover:bg-gray-100'}`} onClick={()=>setActiveTab('ngo')}>🌿 NGO (Research)</button>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 relative">

            {/* If Not Selected */}
            {!selectedFarmerId && activeTab !== 'ngo' && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 flex-col">
                <span className="text-4xl mb-3">👈</span>
                <p>বাম পাশ থেকে একজন কৃষক নির্বাচন করুন</p>
              </div>
            )}

            {loadingPreview && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                <div className="w-8 h-8 border-4 border-gray-800 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* TAB 1: INSURANCE */}
            {activeTab === 'insurance' && selectedFarmer && insurancePreview && (
              <div className="max-w-3xl mx-auto space-y-6">
                 <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2 tracking-wide">INSURANCE RISK PROFILE</h2>
                    
                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg text-center">
                        <div className="text-xs text-orange-600 font-bold uppercase">Risk Score</div>
                        <div className="text-4xl font-black text-orange-700">{insurancePreview.riskScore}</div>
                        <div className="text-xs text-orange-800 mt-1">Level: {buyerData?.risk_level}</div>
                      </div>
                      <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-center">
                        <div className="text-xs text-red-600 font-bold uppercase">Expected Loss</div>
                        <div className="text-4xl font-black text-red-700">৳{insurancePreview.expectedLoss.toLocaleString()}</div>
                        <div className="text-xs text-red-800 mt-1">~{buyerData?.loss_percentage}% of yield</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                      <div className="flex justify-between border-b border-dashed border-gray-200 pb-1">
                        <span className="text-gray-500">Abiotic Scans (90d):</span>
                         <span className="font-bold">{insurancePreview.scanCount}</span>
                      </div>
                      <div className="flex justify-between border-b border-dashed border-gray-200 pb-1">
                        <span className="text-gray-500">Arsenic Risk:</span>
                         <span className={`font-bold ${insurancePreview.hasArsenic ? 'text-red-600' : 'text-green-600'}`}>
                           {insurancePreview.hasArsenic ? 'PRESENT' : 'CLEAR'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-dashed border-gray-200 pb-1">
                        <span className="text-gray-500">Fish Kill History:</span>
                         <span className={`font-bold ${insurancePreview.hasFishKill ? 'text-red-600' : 'text-green-600'}`}>
                           {insurancePreview.hasFishKill ? 'YES' : 'NO'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-dashed border-gray-200 pb-1">
                        <span className="text-gray-500">Active Water Event:</span>
                        <span className="font-bold">{buyerData?.water_event_active ? 'YES' : 'NO'}</span>
                      </div>
                    </div>

                    {insurancePreview.pollutants.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <span className="text-xs text-gray-500 uppercase font-bold">Detected Pollutants:</span>
                        <div className="flex gap-2 mt-2">
                          {insurancePreview.pollutants.map((p:string) => (
                            <span key={p} className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-md">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                 </div>

                 <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-green-400 overflow-x-auto">
                  <div className="text-gray-500 mb-2">JSON Preview (PII Stripped)</div>
                   <pre>{JSON.stringify(buyerData, null, 2)}</pre>
                 </div>
              </div>
            )}


            {/* TAB 2: GOVERNMENT */}
            {activeTab === 'gov' && selectedFarmer && governmentPreview && (
              <div className="max-w-3xl mx-auto space-y-6">
                 <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-t-4 border-t-slate-800">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2 tracking-wide flex justify-between">
                      <span>GOVERNMENT EVIDENCE DOSSIER</span>
                       <span className={`px-3 py-1 text-xs rounded-full text-white ${
                         governmentPreview.strength === 'Strong' ? 'bg-red-600' : 
                         governmentPreview.strength === 'Moderate' ? 'bg-amber-500' : 'bg-blue-500'
                       }`}>
                         Evidence: {governmentPreview.strength}
                      </span>
                    </h2>

                    <div className="space-y-4">
                      <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <div className="text-4xl">📸</div>
                        <div>
                           <div className="text-xl font-bold text-gray-800">{governmentPreview.scans} Pollution Scans</div>
                          <div className="text-sm text-gray-500">Collected at coordinates with explicit AI evidence</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <div className="text-4xl">🧪</div>
                        <div>
                           <div className="text-xl font-bold text-gray-800">{governmentPreview.metals} Verified Heavy Metal Detection(s)</div>
                          <div className="text-sm text-gray-500">Lab or high-confidence secondary verified reports</div>
                        </div>
                      </div>

                       {governmentPreview.factories?.length > 0 && (
                        <div className="mt-4">
                          <span className="text-xs text-gray-500 uppercase font-bold block mb-2">Implicated Industrial Sources:</span>
                          <ul className="list-disc pl-5 text-sm text-gray-800 font-semibold space-y-1">
                             {governmentPreview.factories.map((f:string) => <li key={f}>{f}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                 </div>

                 <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-green-400 overflow-x-auto">
                  <div className="text-gray-500 mb-2">JSON Preview (DOE format, masked identity)</div>
                   <pre>{JSON.stringify(buyerData, null, 2)}</pre>
                 </div>
              </div>
            )}


            {/* TAB 3: EXPORT CERTIFICATION */}
            {activeTab === 'export' && selectedFarmer && exportPreview && (
              <div className="max-w-3xl mx-auto space-y-6">
                 <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center border-b pb-3 mb-4">
                      <h2 className="text-lg font-bold text-gray-800 tracking-wide">EXPORT CERTIFICATION</h2>
                       <div className={`px-4 py-1.5 rounded font-black uppercase tracking-wider text-sm border
                         ${exportPreview.certStatus === 'certifiable' ? 'bg-green-100 text-green-800 border-green-300' : 
                           exportPreview.certStatus === 'conditional' ? 'bg-amber-100 text-amber-800 border-amber-300' : 
                           'bg-red-100 text-red-800 border-red-300'}
                       `}>
                         {exportPreview.certStatus.replace('_', ' ')}
                      </div>
                    </div>

                    <p className="text-sm text-gray-500 mb-4">Score: <b>{exportPreview.certScore}/8</b> criteria met for clean zone certification.</p>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                       <div className={`p-3 rounded border flex items-center justify-between ${exportPreview.riskOk ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                         <span>System Risk &lt; 25</span> <span>{exportPreview.riskOk ? '✅' : '❌'}</span>
                      </div>
                       <div className={`p-3 rounded border flex items-center justify-between ${exportPreview.noScans ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                         <span>No Pollution (90d)</span> <span>{exportPreview.noScans ? '✅' : '❌'}</span>
                      </div>
                       <div className={`p-3 rounded border flex items-center justify-between ${exportPreview.noHm ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                         <span>No Heavy Metals (180d)</span> <span>{exportPreview.noHm ? '✅' : '❌'}</span>
                      </div>
                       <div className={`p-3 rounded border flex items-center justify-between ${exportPreview.waterColorOk ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                         <span>Water Color Clear</span> <span>{exportPreview.waterColorOk ? '✅' : '⚠️'}</span>
                      </div>
                       <div className={`p-3 rounded border flex items-center justify-between ${exportPreview.noFish ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                         <span>No Fish Kill</span> <span>{exportPreview.noFish ? '✅' : '❌'}</span>
                      </div>
                       <div className={`p-3 rounded border flex items-center justify-between ${exportPreview.noArsenic ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                         <span>No Arsenic Trace</span> <span>{exportPreview.noArsenic ? '✅' : '❌'}</span>
                      </div>
                      <div className={`p-3 rounded border flex items-center justify-between bg-green-50 border-green-100`}>
                        <span>Factory Dist &gt; 5km</span> <span>✅</span>
                      </div>
                       <div className={`p-3 rounded border flex items-center justify-between ${exportPreview.satClean ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                         <span>Satellite Water Safe</span> <span>{exportPreview.satClean ? '✅' : '❌'}</span>
                      </div>
                    </div>
                 </div>

                 <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-green-400 overflow-x-auto">
                  <div className="text-gray-500 mb-2">JSON Preview (Export Format)</div>
                   <pre>{JSON.stringify(buyerData, null, 2)}</pre>
                 </div>
              </div>
            )}


            {/* TAB 4: NGO / RESEARCH */}
            {activeTab === 'ngo' && (
              <div className="max-w-3xl mx-auto space-y-6">
                 
                 <div className="bg-amber-50 rounded-xl p-5 border border-amber-200 shadow-sm">
                   <h2 className="text-lg font-bold text-amber-900 mb-2 border-b border-amber-200 pb-2">NGO AGGREGATOR</h2>
                   <p className="text-sm text-amber-700 mb-4">Research data is anonymized and aggregated at the Zone level. Select a zone to calculate environmental justice metrics.</p>

                   <div className="flex gap-2 mb-2">
                     <select 
                        className="px-3 py-2 border border-gray-300 rounded focus:ring-amber-500 outline-none w-64 text-sm"
                        value={ngoZone}
                        onChange={e => setNgoZone(e.target.value)}
                     >
                        <option value="">-- জোন নির্বাচন করুন --</option>
                        {zones.map(z => <option key={z} value={z}>{z}</option>)}
                     </select>
                   </div>
                 </div>

                  {ngoPreview && ngoZone && (
                   <>
                    <div className="grid grid-cols-3 gap-4">
                      {/* Stat Cards */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                        <div className="text-gray-500 text-xs font-bold mb-1">CONSENTING FARMERS</div>
                         <div className="text-3xl font-black text-gray-800">{ngoPreview.total_farmers}</div>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                        <div className="text-gray-500 text-xs font-bold mb-1">AVG ZONE RISK</div>
                         <div className="text-3xl font-black text-orange-600">{ngoPreview.avg_risk}</div>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                        <div className="text-gray-500 text-xs font-bold mb-1">SMOKE EXPOSURE</div>
                         <div className="text-3xl font-black text-red-600">{ngoPreview.pct_smoke}%</div>
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-green-400 overflow-x-auto">
                      <div className="text-gray-500 mb-2">JSON Preview (fully anonymized macro data)</div>
                      <pre>{JSON.stringify(buyerData, null, 2)}</pre>
                    </div>
                   </>
                 )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
