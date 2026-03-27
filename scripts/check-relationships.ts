// Check Foreign Key Relationships
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

async function checkRelationships() {
  console.log('🔍 Checking Foreign Key Relationships...\n')

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Query the information schema to check FK relationships
  const query = `
    SELECT
      tc.table_name as source_table,
      kcu.column_name as source_column,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (tc.table_name = 'scan_logs' OR tc.table_name = 'farmer_lands' OR tc.table_name = 'farm_profiles')
    ORDER BY tc.table_name, tc.constraint_name;
  `

  const { data, error } = await supabase.rpc('exec_sql', { sql: query }) as {
    data: unknown[] | null
    error: { message?: string } | null
  }

  if (error) {
    console.log('❌ Could not query FK relationships directly')
    console.log('   Checking scan_logs structure...\n')

    // Alternative: check scan_logs columns
    const { data: scanLogs } = await supabase
      .from('scan_logs')
      .select('*')
      .limit(1)

    if (scanLogs && scanLogs.length > 0) {
      console.log('scan_logs columns:', Object.keys(scanLogs[0]))

      // Count references
      const farmerIdRefs = Object.keys(scanLogs[0]).filter(k => k.includes('farmer'))
      console.log('\nFarmer-related columns:', farmerIdRefs)
    }
  } else {
    console.log('✅ Foreign Key Relationships:\n')
    console.table(data)
  }

  // Test different join approaches
  console.log('\n🧪 Testing Join Workarounds...\n')

  // Test 1: Explicit join with farmer_id
  console.log('1️⃣ Join scan_logs with farmers using farmer_id')
  try {
    const { data, error } = await supabase
      .from('scan_logs')
      .select(`
        id,
        farmer_id,
        farmers!scan_logs_farmer_id_fkey(id, phone_number, name_bn)
      `)
      .limit(2)

    if (error) {
      console.log('❌ Failed:', error.message)
    } else {
      console.log('✅ Success:', data)
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Exception:', message)
  }

  // Test 2: Alternative join syntax
  console.log('\n2️⃣ Join with verified_by_farmer_id')
  try {
    const { data, error } = await supabase
      .from('scan_logs')
      .select(`
        id,
        verified_by_farmer_id,
        farmers!scan_logs_verified_by_farmer_id_fkey(id, phone_number)
      `)
      .limit(2)

    if (error) {
      console.log('❌ Failed:', error.message)
    } else {
      console.log('✅ Success:', data)
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Exception:', message)
  }

  // Test 3: Check farmer_lands --> farmers
  console.log('\n3️⃣ Join farmer_lands with farmers')
  try {
    const { data, error } = await supabase
      .from('farmer_lands')
      .select(`
        land_id,
        land_name,
        farmer:farmers(id, phone_number, name_bn)
      `)
      .limit(2)

    if (error) {
      console.log('❌ Failed:', error.message)
    } else {
      console.log('✅ Success')
      console.log('   Sample:', data?.[0])
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Exception:', message)
  }

  // Test 4: Check heavy_metal_reports relationships
  console.log('\n4️⃣ Join heavy_metal_reports')
  try {
    const { data, error } = await supabase
      .from('heavy_metal_reports')
      .select(`
        id,
        metal_type,
        land:farmer_lands(land_id, land_name),
        farmer:farmers(id, phone_number)
      `)
      .limit(2)

    if (error) {
      console.log('❌ Failed:', error.message)
    } else {
      console.log('✅ Success')
      console.log('   Sample:', data?.[0])
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log('❌ Exception:', message)
  }

  console.log('\n✅ Relationship check complete!')
}

checkRelationships().catch(console.error)
