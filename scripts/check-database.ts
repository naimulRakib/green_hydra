// Database Diagnostic Script
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load environment variables from .env.local
const envPath = join(process.cwd(), '.env.local')
const envFile = readFileSync(envPath, 'utf-8')
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/)
  if (match) {
    const key = match[1].trim()
    const value = match[2].trim()
    process.env[key] = value
  }
})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkDatabase() {
  console.log('🔍 Starting Database Diagnostic...\n')

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Test 1: Check connection
  console.log('1️⃣ Testing Database Connection...')
  try {
    const { error } = await supabase.from('farmers').select('count', { count: 'exact', head: true })
    if (error) {
      console.error('❌ Connection Error:', error.message)
    } else {
      console.log('✅ Database connection successful')
    }
  } catch (e) {
    console.error('❌ Connection Failed:', e)
  }

  // Test 2: Check critical tables
  console.log('\n2️⃣ Checking Critical Tables...')
  const tables = [
    'farmers',
    'farmer_lands',
    'scan_logs',
    'kb_crops',
    'kb_diseases',
    'kb_zones',
    'kb_remedies',
    'kb_industrial_pollutants',
    'industrial_hotspots',
    'heavy_metal_reports',
    'farm_profiles',
    'farm_risk_scores',
    'loss_estimates',
    'community_alerts',
    'water_sources',
    'water_pollution_events'
  ]

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (error) {
        console.log(`❌ ${table}: ${error.message}`)
      } else {
        console.log(`✅ ${table}: ${count ?? 0} records`)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.log(`❌ ${table}: ${message}`)
    }
  }

  // Test 3: Check for PostGIS extension
  console.log('\n3️⃣ Checking PostGIS Extension...')
  try {
    const { data, error } = await supabase.rpc('postgis_version')
    if (error) {
      console.log('⚠️  PostGIS check failed:', error.message)
    } else {
      console.log('✅ PostGIS is installed:', data)
    }
  } catch {
    console.log('⚠️  Could not verify PostGIS (this might be okay)')
  }

  // Test 4: Check sample data
  console.log('\n4️⃣ Checking Sample Data...')

  // Check farmers
  const { data: farmers, error: farmersError } = await supabase
    .from('farmers')
    .select('id, phone_number, name_bn, zone_id')
    .limit(3)

  if (farmersError) {
    console.log('❌ Farmers query failed:', farmersError.message)
  } else {
    console.log(`✅ Farmers: Found ${farmers?.length ?? 0} sample records`)
    if (farmers && farmers.length > 0) {
      console.log('   Sample farmer:', farmers[0])
    }
  }

  // Check zones (knowledge base)
  const { data: zones, error: zonesError } = await supabase
    .from('kb_zones')
    .select('zone_id, zone_name_en, district')
    .limit(5)

  if (zonesError) {
    console.log('❌ Zones query failed:', zonesError.message)
  } else {
    console.log(`✅ Knowledge Base Zones: ${zones?.length ?? 0} records`)
    if (zones && zones.length > 0) {
      console.log('   Zones:', zones.map(z => z.zone_name_en).join(', '))
    } else {
      console.log('   ⚠️  No zones found - knowledge base might be empty!')
    }
  }

  // Check crops
  const { data: crops, error: cropsError } = await supabase
    .from('kb_crops')
    .select('crop_id, crop_name_en')
    .limit(10)

  if (cropsError) {
    console.log('❌ Crops query failed:', cropsError.message)
  } else {
    console.log(`✅ Knowledge Base Crops: ${crops?.length ?? 0} records`)
    if (crops && crops.length > 0) {
      console.log('   Crops:', crops.map(c => c.crop_name_en).join(', '))
    } else {
      console.log('   ⚠️  No crops found - knowledge base might be empty!')
    }
  }

  // Check diseases
  const { data: diseases, error: diseasesError } = await supabase
    .from('kb_diseases')
    .select('disease_id, disease_name_en')
    .limit(10)

  if (diseasesError) {
    console.log('❌ Diseases query failed:', diseasesError.message)
  } else {
    console.log(`✅ Knowledge Base Diseases: ${diseases?.length ?? 0} records`)
    if (diseases && diseases.length > 0) {
      console.log('   Diseases:', diseases.map(d => d.disease_name_en).join(', '))
    } else {
      console.log('   ⚠️  No diseases found - knowledge base might be empty!')
    }
  }

  // Test 5: Check for RLS policies
  console.log('\n5️⃣ Checking Row Level Security...')
  try {
    // Try to query as anonymous user (using anon key)
    const anonSupabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await anonSupabase.from('farmers').select('count', { count: 'exact', head: true })

    if (error) {
      console.log('⚠️  RLS might be enabled (anonymous access restricted)')
    } else {
      console.log('✅ Tables accessible with anon key')
    }
    } catch {
      console.log('⚠️  Could not check RLS policies')
    }

  // Test 6: Environment check
  console.log('\n6️⃣ Environment Configuration...')
  console.log('✅ NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing')
  console.log('✅ NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing')
  console.log('✅ SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓ Set' : '✗ Missing')
  console.log('✅ GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✓ Set' : '✗ Missing')

  console.log('\n✅ Database diagnostic complete!')
}

checkDatabase().catch(console.error)
