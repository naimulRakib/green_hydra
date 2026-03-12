'use server'

import { createClient } from '../utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Bangladesh bounding box validation
function isValidBDCoord(lat: number, lng: number): boolean {
  return lat >= 20.5 && lat <= 26.7 && lng >= 87.9 && lng <= 92.7
}

export async function updateLocationManual(lat: number, lng: number, zoneId: string) {
  if (!isFinite(lat) || !isFinite(lng) || !isValidBDCoord(lat, lng)) {
    throw new Error('বাংলাদেশের বৈধ Lat (20-27) ও Lng (88-93) দিন')
  }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('লগইন সেশন মেয়াদ শেষ — পুনরায় লগইন করুন')

  // EWKT: lng comes FIRST in POINT, then lat
  const { error: dbError } = await supabase
    .from('farmers')
    .update({
      zone_id:       zoneId,
      farm_location: `SRID=4326;POINT(${lng} ${lat})`,
    })
    .eq('id', user.id)

  if (dbError) {
    console.error('[Location] Manual update error:', dbError.message)
    throw new Error('লোকেশন আপডেট করতে সমস্যা হয়েছে')
  }

  revalidatePath('/dashboard')
  return { success: true, zoneId }
}