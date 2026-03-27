// Advanced Database Schema Validation
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

async function validateSchema() {
  console.log('🔍 Advanced Database Schema Validation...\n')

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Test 1: Check foreign key relationships
  console.log('1️⃣ Validating Foreign Key Relationships...')

  // Check farmer_lands -> farmers relationship
  const { data: orphanedLands, error: landsError } = await supabase
    .from('farmer_lands')
    .select('land_id, farmer_id')
    .is('farmer_id', null)

  if (landsError) {
    console.log('❌ Error checking lands:', landsError.message)
  } else {
    console.log(`✅ Orphaned lands: ${orphanedLands?.length ?? 0}`)
  }

  // Check scan_logs relationships
  const { data: scans, error: scansError } = await supabase
    .from('scan_logs')
    .select('id, farmer_id, land_id, crop_id')

  if (scansError) {
    console.log('❌ Error checking scans:', scansError.message)
  } else {
    const orphanedScans = scans?.filter(s => !s.farmer_id || !s.land_id) ?? []
    console.log(`✅ Scan logs: ${scans?.length ?? 0} total, ${orphanedScans.length} missing FK references`)
    if (orphanedScans.length > 0) {
      console.log('   ⚠️  Some scans are missing farmer_id or land_id!')
    }
  }

  // Test 2: Check geographic data
  console.log('\n2️⃣ Validating Geographic Data...')

  const { data: farmerLocations, error: geoError } = await supabase
    .from('farmers')
    .select('id, farm_location')
    .not('farm_location', 'is', null)

  if (geoError) {
    console.log('❌ Error checking farmer locations:', geoError.message)
  } else {
    console.log(`✅ Farmers with locations: ${farmerLocations?.length ?? 0}`)
  }

  const { data: landBoundaries, error: boundError } = await supabase
    .from('farmer_lands')
    .select('land_id, boundary, area_sqm')

  if (boundError) {
    console.log('❌ Error checking land boundaries:', boundError.message)
  } else {
    const withBoundaries = landBoundaries?.filter(l => l.boundary) ?? []
    const withArea = landBoundaries?.filter(l => l.area_sqm) ?? []
    console.log(`✅ Lands with boundaries: ${withBoundaries.length}/${landBoundaries?.length}`)
    console.log(`✅ Lands with calculated area: ${withArea.length}/${landBoundaries?.length}`)
  }

  // Test 3: Check knowledge base completeness
  console.log('\n3️⃣ Validating Knowledge Base Completeness...')

  const { data: crops, error: cropsErr } = await supabase
    .from('kb_crops')
    .select('crop_id, crop_name_en, seasons, suitable_zones')

  if (cropsErr) {
    console.log('❌ Error checking crops:', cropsErr.message)
  } else {
    const incomplete = crops?.filter(c => !c.seasons || !c.suitable_zones) ?? []
    console.log(`✅ Crops: ${crops?.length} total, ${incomplete.length} missing data`)
  }

  const { data: diseases, error: diseasesErr } = await supabase
    .from('kb_diseases')
    .select('disease_id, disease_name_en, remedy_id, affected_crops')

  if (diseasesErr) {
    console.log('❌ Error checking diseases:', diseasesErr.message)
  } else {
    const noRemedy = diseases?.filter(d => !d.remedy_id) ?? []
    const noCrops = diseases?.filter(d => !d.affected_crops || d.affected_crops.length === 0) ?? []
    console.log(`✅ Diseases: ${diseases?.length} total`)
    if (noRemedy.length > 0) {
      console.log(`   ⚠️  ${noRemedy.length} diseases missing remedy_id`)
    }
    if (noCrops.length > 0) {
      console.log(`   ⚠️  ${noCrops.length} diseases missing affected_crops`)
    }
  }

  // Test 4: Check zone data integrity
  console.log('\n4️⃣ Validating Zone Data...')

  const { data: zones, error: zonesErr } = await supabase
    .from('kb_zones')
    .select('zone_id, zone_name_en, center_lat, center_lng, heavy_metal_risk')

  if (zonesErr) {
    console.log('❌ Error checking zones:', zonesErr.message)
  } else {
    const noCoords = zones?.filter(z => !z.center_lat || !z.center_lng) ?? []
    const metalRiskZones = zones?.filter(z => z.heavy_metal_risk) ?? []
    console.log(`✅ Zones: ${zones?.length} total`)
    if (noCoords.length > 0) {
      console.log(`   ⚠️  ${noCoords.length} zones missing coordinates`)
    }
    console.log(`   ℹ️  ${metalRiskZones.length} zones flagged for heavy metal risk`)
  }

  // Test 5: Check for data integrity issues
  console.log('\n5️⃣ Checking Data Integrity Issues...')

  // Check for duplicate farmers by phone
  const { data: allFarmers, error: allFarmersErr } = await supabase
    .from('farmers')
    .select('phone_number')

  if (allFarmersErr) {
    console.log('❌ Error checking farmers:', allFarmersErr.message)
  } else {
    const phoneMap = new Map()
    allFarmers?.forEach(f => {
      phoneMap.set(f.phone_number, (phoneMap.get(f.phone_number) || 0) + 1)
    })
    const duplicates = Array.from(phoneMap.entries()).filter(([_, count]) => count > 1)
    console.log(`✅ Duplicate phone numbers: ${duplicates.length}`)
    if (duplicates.length > 0) {
      console.log('   ⚠️  Found duplicate farmers:', duplicates.map(([phone, count]) => `${phone} (${count}x)`).join(', '))
    }
  }

  // Test 6: Check industrial hotspots and pollutants match
  console.log('\n6️⃣ Validating Industrial Data...')

  const { data: hotspots, error: hotspotsErr } = await supabase
    .from('industrial_hotspots')
    .select('id, factory_name, primary_pollutant_id, pollutants_list')

  const { data: pollutants, error: pollutantsErr } = await supabase
    .from('kb_industrial_pollutants')
    .select('pollutant_id, pollutant_name')

  if (hotspotsErr || pollutantsErr) {
    console.log('❌ Error checking industrial data')
  } else {
    const pollutantIds = new Set(pollutants?.map(p => p.pollutant_id))
    const missingPollutants = hotspots?.filter(h =>
      h.primary_pollutant_id && !pollutantIds.has(h.primary_pollutant_id)
    ) ?? []

    console.log(`✅ Industrial hotspots: ${hotspots?.length}`)
    console.log(`✅ Known pollutants: ${pollutants?.length}`)
    if (missingPollutants.length > 0) {
      console.log(`   ⚠️  ${missingPollutants.length} hotspots reference unknown pollutants`)
    }
  }

  // Test 7: Check farm risk scores validity
  console.log('\n7️⃣ Validating Farm Risk Scores...')

  const { data: riskScores, error: riskErr } = await supabase
    .from('farm_risk_scores')
    .select('id, land_id, risk_score, valid_until, is_current')
    .order('calculated_at', { ascending: false })

  if (riskErr) {
    console.log('❌ Error checking risk scores:', riskErr.message)
  } else {
    const expired = riskScores?.filter(r => new Date(r.valid_until) < new Date()) ?? []
    const current = riskScores?.filter(r => r.is_current) ?? []
    console.log(`✅ Risk scores: ${riskScores?.length} total`)
    console.log(`   ℹ️  ${current.length} marked as current`)
    console.log(`   ℹ️  ${expired.length} expired`)
  }

  // Test 8: Check for extension functions
  console.log('\n8️⃣ Checking Custom Functions...')

  const functionsToCheck = [
    'calculate_farm_risk_score',
    'check_heavy_metal_proximity',
    'estimate_crop_loss'
  ]

  for (const funcName of functionsToCheck) {
    try {
      // Try to query function existence from pg_proc
      const { data, error } = await supabase.rpc('version')
      if (!error) {
        console.log(`ℹ️  Cannot check function '${funcName}' - need custom query`)
      }
    } catch (e) {
      // Expected - we can't easily check functions this way
    }
  }

  console.log('\n✅ Schema validation complete!')
}

validateSchema().catch(console.error)
