// ─────────────────────────────────────────
// AgroSentinel — Water System Types
// ─────────────────────────────────────────

export type RiskZone = 'safe' | 'watch' | 'warning' | 'danger'
export type WaterSourceType =
  | 'river' | 'canal' | 'pond'
  | 'reservoir' | 'tubewell' | 'beel' | 'other'
export type WaterColor =
  | 'clear' | 'brown' | 'black'
  | 'green' | 'foamy' | 'normal_monsoon'

export interface WaterSource {
  source_id:              string
  source_name_bn:         string | null
  source_type:            WaterSourceType
  risk_zone:              RiskZone
  risk_reason:            string | null
  lat:                    number
  lng:                    number
  verified_count:         number
  fish_kill_reports:      number
  last_color_report:      WaterColor | null
  distance_m:             number
  factory_name_bn:        string | null
  distance_to_hotspot_m:  number | null
}

export interface WaterAlert {
  event_id:         string
  source_id:        string
  source_name_bn:   string | null
  source_type:      WaterSourceType
  severity:         'low' | 'moderate' | 'high' | 'critical'
  alert_message_bn: string
  factory_name_bn:  string | null
  water_color:      WaterColor | null
  fish_kill:        boolean
  farmer_count:     number
  distance_m:       number
  reported_at:      string
  is_read:          boolean
}

export interface WaterReportInput {
  land_id:    string
  lat:        number
  lng:        number
  type:       WaterSourceType
  name_bn?:   string
  color:      WaterColor
  odor:       boolean
  fish_kill:  boolean
}

// Risk zone display config
export const RISK_CONFIG: Record<RiskZone, {
  label: string
  color: string
  bg: string
  border: string
  mapColor: string
  emoji: string
}> = {
  safe: {
    label:    'নিরাপদ',
    color:    'text-emerald-400',
    bg:       'bg-emerald-500/10',
    border:   'border-emerald-500/30',
    mapColor: '#10b981',
    emoji:    '🟢',
  },
  watch: {
    label:    'সতর্ক থাকুন',
    color:    'text-yellow-400',
    bg:       'bg-yellow-500/10',
    border:   'border-yellow-500/30',
    mapColor: '#eab308',
    emoji:    '🟡',
  },
  warning: {
    label:    'ব্যবহার করবেন না',
    color:    'text-orange-400',
    bg:       'bg-orange-500/10',
    border:   'border-orange-500/30',
    mapColor: '#f97316',
    emoji:    '🟠',
  },
  danger: {
    label:    'বিপজ্জনক',
    color:    'text-red-400',
    bg:       'bg-red-500/10',
    border:   'border-red-500/30',
    mapColor: '#ef4444',
    emoji:    '🔴',
  },
}

export const WATER_TYPE_CONFIG: Record<WaterSourceType, {
  label_bn: string
  emoji:    string
}> = {
  river:      { label_bn: 'নদী',      emoji: '🏞️' },
  canal:      { label_bn: 'খাল',      emoji: '〰️' },
  pond:       { label_bn: 'পুকুর',    emoji: '🔵' },
  reservoir:  { label_bn: 'জলাশয়',  emoji: '🌊' },
  tubewell:   { label_bn: 'নলকূপ',   emoji: '💧' },
  beel:       { label_bn: 'বিল',      emoji: '🌿' },
  other:      { label_bn: 'অন্যান্য', emoji: '💦' },
}

export const COLOR_OPTIONS: Array<{
  value: WaterColor
  label_bn: string
  is_danger: boolean
}> = [
  { value: 'clear',          label_bn: '✅ স্বচ্ছ — স্বাভাবিক',         is_danger: false },
  { value: 'normal_monsoon', label_bn: '🟫 বর্ষার স্বাভাবিক ঘোলা',      is_danger: false },
  { value: 'brown',          label_bn: '🟤 বাদামি — সন্দেহজনক',          is_danger: false },
  { value: 'green',          label_bn: '🟢 সবুজ — শেওলা',               is_danger: false },
  { value: 'black',          label_bn: '⚫ কালো — বিপজ্জনক',             is_danger: true  },
  { value: 'foamy',          label_bn: '🫧 ফেনাযুক্ত — রাসায়নিক',       is_danger: true  },
]