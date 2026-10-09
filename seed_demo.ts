import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const email = 'farmer1@gmail.com'
  const password = '12345678'

  console.log(`Setting up demo account for: ${email}`)

  // 1. Try to create the user or fetch existing
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  let userId = authData?.user?.id
  
  if (authError && (authError.message.includes('already registered') || authError.code === 'email_exists')) {
    console.log('User already exists, finding ID...')
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (loginError) {
      console.error('Failed to login existing user:', loginError)
      return
    }
    userId = loginData.user.id
  } else if (authError) {
    console.error('Auth error:', authError)
    return
  }

  console.log('User ID:', userId)

  // 2. Setup Farmer Profile
  // We want a peri-urban area scenario. Say, Savar (near brick kilns/tanneries).
  // Coordinates around Savar, Dhaka: Lat 23.8354, Lng 90.2559
  const farmLat = 23.8354
  const farmLng = 90.2559
  
  console.log('Upserting farmer profile...')
  const { error: profileError } = await supabase.from('farmers').upsert({
    id: userId,
    phone_number: '+8801700000001',
    name_bn: 'গবেষণা ডেমো (AI Prototype)',
    farm_location: `SRID=4326;POINT(${farmLng} ${farmLat})`,
    zone_id: 'dhaka-savar',
    badge_level: 'Agronomist',
    total_scans: 12,
    data_sharing_consent: true,
  })
  
  if (profileError) {
    console.error('Profile error:', profileError)
  }

  // 3. Clear existing lands
  await supabase.from('farmer_lands').delete().eq('farmer_id', userId)

  // 4. Insert Demo Lands (Peri-urban scenario)
  console.log('Inserting demo lands...')
  const lands = [
    {
      farmer_id: userId,
      land_name: 'Savar Plot A',
      land_name_bn: 'সাভার প্লট ক - ধানের জমি',
      // Small polygon around Savar
      boundary: `SRID=4326;POLYGON((${farmLng} ${farmLat}, ${farmLng+0.001} ${farmLat}, ${farmLng+0.001} ${farmLat+0.001}, ${farmLng} ${farmLat+0.001}, ${farmLng} ${farmLat}))`,
      crop_id: 'rice_boro',
      zone_id: 'dhaka-savar',
      notes_bn: 'কারখানার পাশের জমি',
      is_active: true
    },
    {
      farmer_id: userId,
      land_name: 'Hemayetpur Block',
      land_name_bn: 'হেমায়েতপুর ব্লক - সবজি',
      boundary: `SRID=4326;POLYGON((${farmLng-0.005} ${farmLat-0.002}, ${farmLng-0.004} ${farmLat-0.002}, ${farmLng-0.004} ${farmLat-0.001}, ${farmLng-0.005} ${farmLat-0.001}, ${farmLng-0.005} ${farmLat-0.002}))`,
      crop_id: 'bitter_gourd',
      zone_id: 'dhaka-savar',
      notes_bn: 'ট্যানারি এলাকার নিকটে',
      is_active: true
    }
  ]

  const { error: landsError } = await supabase.from('farmer_lands').insert(lands)
  if (landsError) {
    console.error('Lands error:', landsError)
  } else {
    console.log('Demo data seeded successfully!')
  }
}

main().catch(console.error)
