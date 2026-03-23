-- Drop tables if they exist to prevent errors during testing
DROP TABLE IF EXISTS public.data_export_logs;
DROP TABLE IF EXISTS public.data_buyers;

-- 1. Create data_buyers table
CREATE TABLE public.data_buyers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_name TEXT NOT NULL,
    org_type TEXT NOT NULL, -- 'Insurance', 'Government', 'Export', 'NGO'
    api_key TEXT UNIQUE,
    subscription_tier TEXT DEFAULT 'basic',
    can_access_risk_scores BOOLEAN DEFAULT false,
    can_access_loss_estimates BOOLEAN DEFAULT false,
    can_access_heavy_metals BOOLEAN DEFAULT false,
    can_access_raw_scans BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    licensed_districts TEXT[] DEFAULT '{}',
    monthly_fee_bdt NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create data_export_logs table
CREATE TABLE public.data_export_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    buyer_id UUID REFERENCES public.data_buyers(id) ON DELETE CASCADE,
    export_type TEXT NOT NULL, -- 'insurance_risk_profile', 'government_pollution_evidence', etc.
    district TEXT,
    records_count INTEGER DEFAULT 1,
    query_params JSONB,
    exported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'success'
);

-- 3. Enable RLS
ALTER TABLE public.data_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_export_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies

-- NOTE: api_key is stored in plaintext; restrict reads via RLS and consider hashing/encrypting.
COMMENT ON COLUMN public.data_buyers.api_key IS 'WARNING: Stored in plaintext. Restrict access via RLS, rotate keys regularly, and consider hashing/encrypting at rest.';

-- Idempotent policy updates
DROP POLICY IF EXISTS "Allow all read access for buyers to authenticated users" ON public.data_buyers;
DROP POLICY IF EXISTS buyers_read ON public.data_buyers;
DROP POLICY IF EXISTS buyers_write ON public.data_buyers;

DROP POLICY IF EXISTS "Allow all inserts for export logs to authenticated users" ON public.data_export_logs;
DROP POLICY IF EXISTS "Allow all selects for export logs to authenticated users" ON public.data_export_logs;
DROP POLICY IF EXISTS export_logs_insert ON public.data_export_logs;
DROP POLICY IF EXISTS export_logs_select ON public.data_export_logs;

-- Buyers can only see their own record (or admins)
CREATE POLICY buyers_read ON public.data_buyers
  FOR SELECT
  USING (
    id = auth.uid()
    OR auth.jwt() ->> 'role' = 'admin'
  );

-- Only admins can insert/update/delete buyer records
CREATE POLICY buyers_write ON public.data_buyers
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Export logs: keep current behavior but make it idempotent
CREATE POLICY export_logs_insert
  ON public.data_export_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY export_logs_select
  ON public.data_export_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- 5. Insert mock buyers for the UI 
INSERT INTO public.data_buyers 
(org_name, org_type, subscription_tier, can_access_risk_scores, can_access_loss_estimates, can_access_heavy_metals, can_access_raw_scans)
VALUES 
('Green Delta Insurance Ltd.', 'Insurance', 'premium', true, true, false, false),
('Department of Environment (DoE)', 'Government', 'enterprise', false, false, true, true),
('Bengal Agri Exports', 'Export', 'basic', true, false, true, false),
('AgroResearch Foundation', 'NGO', 'premium', false, true, false, false);
