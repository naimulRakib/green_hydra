/**
 * Factory functions for creating test scan data
 */

export const createTestScan = (overrides: Partial<TestScan> = {}): TestScan => ({
  scan_id: crypto.randomUUID(),
  land_id: 'test-farm-001',
  farmer_id: 'test-farmer-123',
  crop_id: 'rice_001',
  image_url: 'https://test.supabase.co/storage/test/scan.jpg',
  latitude: 23.8050,
  longitude: 90.4262,
  created_at: new Date().toISOString(),
  ...overrides
})

export const createBioticDiagnosis = (overrides: Partial<BioticDiagnosis> = {}): BioticDiagnosis => ({
  scan_id: crypto.randomUUID(),
  primary_diagnosis: 'biotic',
  disease_type: 'Biotic',
  stress_subtype: 'Biotic_Fungal',
  confidence_score: 0.85,
  disease_name_en: 'Rice Blast',
  disease_name_bn: 'ব্লাস্ট রোগ',
  remedy_bn: 'ট্রাইসাইক্লাজল স্প্রে করুন',
  spray_suppressed: false,
  overrides_applied: [],
  created_at: new Date().toISOString(),
  ...overrides
})

export const createAbioticDiagnosis = (overrides: Partial<AbioticDiagnosis> = {}): AbioticDiagnosis => ({
  scan_id: crypto.randomUUID(),
  primary_diagnosis: 'abiotic',
  disease_type: 'Abiotic',
  stress_subtype: 'Abiotic_Pollution',
  confidence_score: 0.75,
  abiotic_factor: 'Heavy Metal Contamination',
  severity: 'Medium',
  spray_suppressed: true,
  overrides_applied: ['SPRAY_SUPPRESSED_HIGH_ABIOTIC'],
  created_at: new Date().toISOString(),
  ...overrides
})

export const createHealthyDiagnosis = (overrides: Partial<HealthyDiagnosis> = {}): HealthyDiagnosis => ({
  scan_id: crypto.randomUUID(),
  primary_diagnosis: 'healthy',
  disease_type: 'Healthy',
  confidence_score: 0.90,
  advice_bn: 'আপনার ফসল সুস্থ আছে। নিয়মিত পর্যবেক্ষণ চালিয়ে যান।',
  spray_suppressed: false,
  created_at: new Date().toISOString(),
  ...overrides
})

// TypeScript types
export interface TestScan {
  scan_id: string
  land_id: string
  farmer_id: string
  crop_id: string
  image_url: string
  latitude: number
  longitude: number
  created_at: string
}

export interface BioticDiagnosis {
  scan_id: string
  primary_diagnosis: 'biotic'
  disease_type: 'Biotic'
  stress_subtype: string
  confidence_score: number
  disease_name_en: string
  disease_name_bn: string
  remedy_bn: string
  spray_suppressed: boolean
  overrides_applied: string[]
  created_at: string
}

export interface AbioticDiagnosis {
  scan_id: string
  primary_diagnosis: 'abiotic'
  disease_type: 'Abiotic'
  stress_subtype: string
  confidence_score: number
  abiotic_factor: string
  severity: string
  spray_suppressed: boolean
  overrides_applied: string[]
  created_at: string
}

export interface HealthyDiagnosis {
  scan_id: string
  primary_diagnosis: 'healthy'
  disease_type: 'Healthy'
  confidence_score: number
  advice_bn: string
  spray_suppressed: boolean
  created_at: string
}
