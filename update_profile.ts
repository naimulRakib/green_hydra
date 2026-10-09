import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  const email = 'farmer1@gmail.com'
  const password = '12345678'

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (loginError) {
    console.error('Failed to login existing user:', loginError)
    return
  }
  const userId = loginData.user.id
  console.log('Logged in user:', userId)

  const farmLat = 23.8354
  const farmLng = 90.2559

  const { error: profileError } = await supabase.from('farmers').update({
    phone_number: '+8801700000001',
    name_bn: 'গবেষণা ডেমো (AI Prototype)',
    farm_location: `SRID=4326;POINT(${farmLng} ${farmLat})`,
    zone_id: 'dhaka-savar',
    badge_level: 'Agronomist',
    total_scans: 12,
    data_sharing_consent: true,
  }).eq('id', userId)

  if (profileError) {
    console.error('Profile update error:', profileError)
  } else {
    console.log('Profile updated successfully!')
  }
}

main()
