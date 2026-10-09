import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const { data: f } = await supabase.from('farmers').select('*').limit(1)
  console.log('Farmer schema:', f?.[0] ? Object.keys(f[0]) : 'No farmers')
  
  const { data: c } = await supabase.from('kb_crops').select('*').limit(5)
  console.log('Crops:', c)
}

main()
