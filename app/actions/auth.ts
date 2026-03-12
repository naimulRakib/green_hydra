'use server'

import { createClient } from '../utils/supabase/server'
import { redirect } from 'next/navigation'

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email    = (formData.get('email')    as string)?.trim()
  const password = (formData.get('password') as string)
  const phone    = (formData.get('phone')    as string)?.trim()

  if (!email || !password || !phone) {
    return redirect('/signup?error=' + encodeURIComponent('সব তথ্য পূরণ করুন'))
  }

  // Step 1: Create auth user
  const { data, error: signupError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { phone_number: phone } },
  })

  if (signupError) {
    console.error('[Auth] Signup error:', signupError.message)
    const msg = signupError.message.includes('already registered')
      ? 'এই ইমেইল দিয়ে আগেই একাউন্ট আছে'
      : 'একাউন্ট তৈরি করা সম্ভব হয়নি'
    return redirect('/signup?error=' + encodeURIComponent(msg))
  }

  if (!data.user) {
    return redirect('/signup?error=' + encodeURIComponent('একাউন্ট তৈরি করা সম্ভব হয়নি'))
  }

  // Step 2: Insert farmer row
  // farm_location uses Bangladesh centroid as default — overwritten in onboarding.
  // SRID=4326;POINT(lng lat) — PostGIS EWKT format, lng comes FIRST.
  const { error: dbError } = await supabase
    .from('farmers')
    .insert({
      id:            data.user.id,
      phone_number:  phone,
      farm_location: 'SRID=4326;POINT(90.3563 23.8103)',
    })

  if (dbError) {
    // Non-fatal: auth user exists, farmer row can be retried in onboarding.
    // Log for monitoring — if this happens consistently, check RLS policies.
    console.error('[Auth] Farmer row insert error:', dbError.message, '| user:', data.user.id)
  }

  redirect('/onboarding')
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email    = (formData.get('email')    as string)?.trim()
  const password = (formData.get('password') as string)

  if (!email || !password) {
    return redirect('/login?error=' + encodeURIComponent('ইমেইল ও পাসওয়ার্ড দিন'))
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('[Auth] Login error:', error.message)
    const msg = error.message.includes('Invalid login')
      ? 'ইমেইল বা পাসওয়ার্ড ভুল হয়েছে'
      : 'লগইন করতে সমস্যা হয়েছে'
    return redirect('/login?error=' + encodeURIComponent(msg))
  }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}