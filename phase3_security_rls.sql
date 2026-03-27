-- AgroSentinel Phase 3 Security Migration
-- Purpose: enforce tenant-safe access for diagnosis/risk data and admin read pathways.

-- ============================================================================
-- 1) Enable RLS on target tables
-- ============================================================================
ALTER TABLE IF EXISTS public.scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.heavy_metal_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.farm_risk_scores ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2) Helper: centralized admin check (JWT role or farmers.badge_level)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    (auth.jwt() ->> 'role' = 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.farmers f
      WHERE f.id = auth.uid()
        AND f.badge_level = 'Admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- ============================================================================
-- 3) scan_logs policies
-- ============================================================================
DROP POLICY IF EXISTS scan_logs_select_policy ON public.scan_logs;
DROP POLICY IF EXISTS scan_logs_insert_policy ON public.scan_logs;
DROP POLICY IF EXISTS scan_logs_update_policy ON public.scan_logs;
DROP POLICY IF EXISTS scan_logs_delete_policy ON public.scan_logs;

CREATE POLICY scan_logs_select_policy
ON public.scan_logs
FOR SELECT
USING (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
);

CREATE POLICY scan_logs_insert_policy
ON public.scan_logs
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
);

CREATE POLICY scan_logs_update_policy
ON public.scan_logs
FOR UPDATE
USING (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
)
WITH CHECK (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
);

CREATE POLICY scan_logs_delete_policy
ON public.scan_logs
FOR DELETE
USING (public.is_platform_admin());

-- ============================================================================
-- 4) heavy_metal_reports policies
--    Farmers can read only their own records; write restricted to admins/service.
-- ============================================================================
DROP POLICY IF EXISTS heavy_metal_reports_select_policy ON public.heavy_metal_reports;
DROP POLICY IF EXISTS heavy_metal_reports_insert_policy ON public.heavy_metal_reports;
DROP POLICY IF EXISTS heavy_metal_reports_update_policy ON public.heavy_metal_reports;
DROP POLICY IF EXISTS heavy_metal_reports_delete_policy ON public.heavy_metal_reports;

CREATE POLICY heavy_metal_reports_select_policy
ON public.heavy_metal_reports
FOR SELECT
USING (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
);

CREATE POLICY heavy_metal_reports_insert_policy
ON public.heavy_metal_reports
FOR INSERT
WITH CHECK (public.is_platform_admin());

CREATE POLICY heavy_metal_reports_update_policy
ON public.heavy_metal_reports
FOR UPDATE
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY heavy_metal_reports_delete_policy
ON public.heavy_metal_reports
FOR DELETE
USING (public.is_platform_admin());

-- ============================================================================
-- 5) farm_risk_scores policies
-- ============================================================================
DROP POLICY IF EXISTS farm_risk_scores_select_policy ON public.farm_risk_scores;
DROP POLICY IF EXISTS farm_risk_scores_insert_policy ON public.farm_risk_scores;
DROP POLICY IF EXISTS farm_risk_scores_update_policy ON public.farm_risk_scores;
DROP POLICY IF EXISTS farm_risk_scores_delete_policy ON public.farm_risk_scores;

CREATE POLICY farm_risk_scores_select_policy
ON public.farm_risk_scores
FOR SELECT
USING (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
);

CREATE POLICY farm_risk_scores_insert_policy
ON public.farm_risk_scores
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
);

CREATE POLICY farm_risk_scores_update_policy
ON public.farm_risk_scores
FOR UPDATE
USING (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
)
WITH CHECK (
  public.is_platform_admin()
  OR farmer_id = auth.uid()
);

CREATE POLICY farm_risk_scores_delete_policy
ON public.farm_risk_scores
FOR DELETE
USING (public.is_platform_admin());
