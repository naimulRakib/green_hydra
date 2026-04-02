/**
 * Factory functions for creating test farm data
 */

export const createTestFarm = (overrides: Partial<TestFarm> = {}): TestFarm => ({
  land_id: 'test-farm-001',
  farmer_id: 'test-farmer-123',
  land_name: 'Test Farm',
  land_name_bn: 'পরীক্ষা খামার',
  crop_id: 'rice_001',
  area_bigha: 2.5,
  latitude: 23.8050,
  longitude: 90.4262,
  created_at: new Date().toISOString(),
  ...overrides
})

export const createTestFarmProfile = (overrides: Partial<TestFarmProfile> = {}): TestFarmProfile => ({
  land_id: 'test-farm-001',
  farmer_id: 'test-farmer-123',
  soil_type: 'Clay Loam',
  soil_ph: 'Acidic',
  soil_texture: 'Loamy',
  irrigation_method: 'Canal',
  pest_level: 'Low',
  smoke_exposure: 'None',
  water_color: 'Clear',
  updated_at: new Date().toISOString(),
  ...overrides
})

export const createTestFarmer = (overrides: Partial<TestFarmer> = {}): TestFarmer => ({
  id: 'test-farmer-123',
  email: 'test@example.com',
  phone: '+8801712345678',
  name: 'Test Farmer',
  name_bn: 'পরীক্ষা কৃষক',
  zone_id: 'zone-001',
  badge_level: 'Bronze',
  total_scans: 0,
  data_sharing_consent: true,
  created_at: new Date().toISOString(),
  ...overrides
})

// TypeScript types for test data
export interface TestFarm {
  land_id: string
  farmer_id: string
  land_name: string
  land_name_bn: string
  crop_id: string
  area_bigha: number
  latitude: number
  longitude: number
  created_at: string
}

export interface TestFarmProfile {
  land_id: string
  farmer_id: string
  soil_type: string
  soil_ph: string
  soil_texture: string
  irrigation_method: string
  pest_level: string
  smoke_exposure: string
  water_color: string
  updated_at: string
}

export interface TestFarmer {
  id: string
  email: string
  phone: string
  name: string
  name_bn: string
  zone_id: string
  badge_level: string
  total_scans: number
  data_sharing_consent: boolean
  created_at: string
}
