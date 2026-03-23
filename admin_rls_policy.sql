-- If you have Row Level Security (RLS) enabled on your 'farmers' and 'farmer_lands' tables,
-- a logged-in user can usually only see their OWN data (auth.uid() = id).
-- That is why you only see 1 farmer on the Admin Export page.

-- This file replaces hard-coded email checks with a role/JWT-claim-based admin check.

-- Idempotent policy updates
DROP POLICY IF EXISTS "Admins can view all farmers" ON public.farmers;
DROP POLICY IF EXISTS "Admins can view all farmer lands" ON public.farmer_lands;

-- Admins can view all rows; regular users can still see only their own.
CREATE POLICY "Admins can view all farmers"
ON public.farmers
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id = auth.uid()
      AND f.badge_level = 'Admin'
  )
  OR auth.uid() = id
);

CREATE POLICY "Admins can view all farmer lands"
ON public.farmer_lands
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id = auth.uid()
      AND f.badge_level = 'Admin'
  )
  OR auth.uid() = farmer_id
);
