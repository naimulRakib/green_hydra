'use server'

import { createClient } from '../utils/supabase/server'
import { redirect } from 'next/navigation'

export async function saveFarmerLocation(lat: number, lng: number, zoneId: string) {
  if (!isFinite(lat) || !isFinite(lng)) {
    throw new Error('অবৈধ স্থানাঙ্ক (Invalid coordinates)')
  }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('ব্যবহারকারী লগইন নেই')

  // PostGIS EWKT: POINT(lng lat) — longitude FIRST, latitude SECOND
  const { error: dbError } = await supabase
    .from('farmers')
    .update({
      zone_id:       zoneId,
      farm_location: `SRID=4326;POINT(${lng} ${lat})`,
    })
    .eq('id', user.id)

  if (dbError) {
    console.error('[Onboarding] Location save error:', dbError.message)
    throw new Error('লোকেশন সেভ করতে সমস্যা হয়েছে')
  }

  redirect('/dashboard')
}