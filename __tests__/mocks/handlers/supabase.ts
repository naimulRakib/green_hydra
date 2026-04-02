import { vi } from 'vitest'

export const createMockSupabaseClient = () => ({
  from: vi.fn((table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),

  rpc: vi.fn((fnName: string, params?: any) => {
    // Mock RPC responses based on function name
    if (fnName === 'detect_and_save_metal_risk') {
      return Promise.resolve({
        data: {
          confidence_score: 0.65,
          severity: 'Medium',
          detected_at: new Date().toISOString(),
          contributing_metals: ['Pb', 'Cd'],
          layer_scores: {
            zone_static: 0.7,
            soil_profile: 0.6,
            scan_evidence: 0.5,
            survey_evidence: 0.4,
            industrial_proximity: 0.6,
            isric_ph: 0.7,
            live_scan: 0.5,
          }
        },
        error: null
      })
    }

    if (fnName === 'get_farmer_lands') {
      return Promise.resolve({
        data: [{
          land_id: 'test-farm-001',
          land_name: 'Test Farm',
          land_name_bn: 'পরীক্ষা খামার',
          crop_id: 'rice_001',
          area_bigha: 2.5,
          risk_level: 'green',
          spray_active: false,
        }],
        error: null
      })
    }

    if (fnName === 'check_pollution_hazards') {
      return Promise.resolve({
        data: [{
          hotspot_id: 'hotspot-001',
          factory_name: 'Test Factory',
          factory_lat: 23.7940,
          factory_lng: 90.4152,
          distance_km: 1.5,
          is_in_plume: false,
          risk_level: 'Low',
        }],
        error: null
      })
    }

    return Promise.resolve({ data: null, error: null })
  }),

  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({
        data: { path: 'scans/test-farmer-123/test-scan.jpg' },
        error: null
      }),
      getPublicUrl: vi.fn(() => ({
        data: {
          publicUrl: 'https://test.supabase.co/storage/v1/object/public/scan-images/test-scan.jpg'
        }
      })),
    }))
  },

  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: {
        user: {
          id: 'test-user-123',
          email: 'test@example.com',
          created_at: new Date().toISOString(),
        }
      },
      error: null
    }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'test-user-123' } } },
      error: null
    }),
  }
})

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>
