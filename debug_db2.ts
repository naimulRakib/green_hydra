import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const { data: s } = await supabase.from('surveys').select('*').limit(1)
  console.log('Surveys schema:', s?.[0] ? Object.keys(s[0]) : 'No surveys')
  
  const { data: l } = await supabase.from('scan_logs').select('*').limit(1)
  console.log('Scan logs schema:', l?.[0] ? Object.keys(l[0]) : 'No scan logs')
}

main()
