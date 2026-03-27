// Test Database Operations
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

async function testOperations() {
  console.log('🧪 Testing Common Database Operations...\n')

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Test 1: Query with joins
  console.log('1️⃣ Testing Complex Joins...')
  try {
    const { data, error } = await supabase
      .from('scan_logs')
      .select(`
        *,
        farmer:farmers(id, phone_number, name_bn),
        land:farmer_lands(land_id, land_name, area_bigha)
      `)
      .limit(5)

    if (error) {
      console.log('❌ Join query failed:', error.message)
    } else {
      console.log(`✅ Join query successful: ${data?.length} records`)
      if (data && data.length > 0) {
        console.log('   Sample:', {
          farmer: data[0].farmer,
          land: data[0].land
        })
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Join test exception:', message)
  }

  // Test 2: Geographic queries
  console.log('\n2️⃣ Testing Geographic Queries...')
  try {
    // Query lands with their boundaries
    const { data: lands, error: landErr } = await supabase
      .from('farmer_lands')
      .select('land_id, land_name, boundary, area_sqm, zone_id')
      .limit(3)

    if (landErr) {
      console.log('❌ Geographic query failed:', landErr.message)
    } else {
      console.log(`✅ Geographic query successful: ${lands?.length} lands`)
      if (lands && lands.length > 0) {
        const hasBoundary = lands.filter(l => l.boundary).length
        console.log(`   ${hasBoundary}/${lands.length} have boundaries`)
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Geographic test exception:', message)
  }

  // Test 3: JSONB queries
  console.log('\n3️⃣ Testing JSONB Queries...')
  try {
    const { data, error } = await supabase
      .from('scan_logs')
      .select('id, vision_output, environmental_context, questionnaire_answers')
      .limit(3)

    if (error) {
      console.log('❌ JSONB query failed:', error.message)
    } else {
      console.log(`✅ JSONB query successful: ${data?.length} records`)
      if (data && data.length > 0) {
        console.log('   Has vision_output:', !!data[0].vision_output)
        console.log('   Has environmental_context:', !!data[0].environmental_context)
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ JSONB test exception:', message)
  }

  // Test 4: Array queries
  console.log('\n4️⃣ Testing Array Queries...')
  try {
    const { data, error } = await supabase
      .from('kb_diseases')
      .select('disease_id, disease_name_en, affected_crops')
      .contains('affected_crops', ['rice'])

    if (error) {
      console.log('❌ Array query failed:', error.message)
    } else {
      console.log(`✅ Array query successful: ${data?.length} rice diseases found`)
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Array test exception:', message)
  }

  // Test 5: Full-text search
  console.log('\n5️⃣ Testing Text Search...')
  try {
    const { data, error } = await supabase
      .from('kb_diseases')
      .select('disease_id, disease_name_en, disease_name_bn')
      .ilike('disease_name_en', '%blast%')

    if (error) {
      console.log('❌ Text search failed:', error.message)
    } else {
      console.log(`✅ Text search successful: ${data?.length} matches for "blast"`)
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Text search exception:', message)
  }

  // Test 6: Aggregations
  console.log('\n6️⃣ Testing Aggregations...')
  try {
    const { count, error } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.log('❌ Count query failed:', error.message)
    } else {
      console.log(`✅ Count query successful: ${count} scan logs`)
    }

    // Check farm profiles aggregate data
    const { data: profiles, error: profileErr } = await supabase
      .from('farm_profiles')
      .select('farmer_id, soil_ph, water_risk, pest_level')
      .limit(5)

    if (profileErr) {
      console.log('❌ Profile query failed:', profileErr.message)
    } else {
      console.log(`✅ Profile query successful: ${profiles?.length} profiles`)
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Aggregation test exception:', message)
  }

  // Test 7: Insert and update operations
  console.log('\n7️⃣ Testing Write Operations (rollback)...')
  try {
    // Try inserting a test farmer
    const testPhone = '01700000999'
    const { data: insertData, error: insertErr } = await supabase
      .from('farmers')
      .insert({
        phone_number: testPhone,
        name_bn: 'Test Farmer',
        zone_id: 'test-zone'
      })
      .select()

    if (insertErr) {
      console.log('❌ Insert failed:', insertErr.message)
    } else {
      console.log(`✅ Insert successful`)

      // Clean up test data
      if (insertData && insertData.length > 0) {
        const { error: deleteErr } = await supabase
          .from('farmers')
          .delete()
          .eq('id', insertData[0].id)

        if (deleteErr) {
          console.log('⚠️  Cleanup failed:', deleteErr.message)
        } else {
          console.log('✅ Cleanup successful')
        }
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Write test exception:', message)
  }

  // Test 8: Check RLS policies
  console.log('\n8️⃣ Testing Row Level Security...')
  try {
    // Create client with anon key
    const anonSupabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

    const { data, error } = await anonSupabase
      .from('farmers')
      .select('id')
      .limit(1)

    if (error) {
      console.log('⚠️  RLS policy blocked anon access:', error.message)
    } else {
      console.log(`✅ Anon access allowed: ${data?.length} records accessible`)
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ RLS test exception:', message)
  }

  console.log('\n✅ Operation tests complete!')
}

testOperations().catch(console.error)
