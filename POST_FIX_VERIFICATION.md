# POST FIX VERIFICATION — AgroSentinel

This document summarizes the fixes applied from the audit execution order (SQL ➜ Security ➜ App/Lint), plus quick verification SQL and a final checklist.

## 1) Fix summary (by file)

### SQL
- **add_water_system.sql**
  - Ensured all `GRANT EXECUTE` statements use full function signatures.
  - Fixed `ST_DWithin(..., ST_SetSRID(ST_MakePoint(...), 4326)::geography, ...)` geography casts.
  - Fixed KNN ordering type mismatch in LATERAL join (`location::geometry <-> location::geometry`).
  - Hardened all `SECURITY DEFINER` functions with `SET search_path = public, extensions`.
  - Disabled deprecated duplicate RPC bodies (kept file, but removed conflicts with authoritative file).

- **water_explicit_cast.sql**
  - Treated as authoritative water RPC source.
  - Applied explicit geography/geometry casts for `ST_DWithin` and KNN ordering.
  - Ensured all `GRANT EXECUTE` use full signatures.
  - Added `SET search_path = public, extensions` to `SECURITY DEFINER` functions.

- **add_satellite_water_data.sql**
  - Replaced degree-based radius approximation with meters on geography (`p_radius_km * 1000.0`).
  - Replaced `ST_DistanceSphere` with `ST_Distance(...::geography, ...::geography)`.
  - Added `SET search_path = public, extensions` for `SECURITY DEFINER`.

- **seed_agro_sentinel.sql**
  - Fixed `water_sources.location` inserts to use geography (`ST_SetSRID(ST_MakePoint(...),4326)::geography`).

- **add_heavy_metal_risk_system.sql**
  - Fixed PL/pgSQL compile/runtime issues (explicit typed vars instead of RECORD target misuse; correct geometry→geography casts; separated hotspot loop/data variables).
  - Added `SET search_path = public, extensions` for `SECURITY DEFINER`.

- **improved_risk_calculation.sql**
  - Ensured all `GRANT EXECUTE` use full signatures.
  - Added `SET search_path = public, extensions` for `SECURITY DEFINER`.

- **database_redesign_v2.sql**
  - Ensured all `GRANT EXECUTE` use full signatures.
  - Added `SET search_path = public, extensions` for `SECURITY DEFINER`.

- **create_survey_and_risk_functions.sql**
  - Ensured all `GRANT EXECUTE` use full signatures.
  - Added `SET search_path = public, extensions` for `SECURITY DEFINER`.

### Security
- **admin_rls_policy.sql**
  - Replaced hard-coded admin email checks with role/JWT-claim + DB badge-based check.
  - Made policy idempotent via `DROP POLICY IF EXISTS ...`.

- **add_data_export_tables.sql**
  - Tightened `data_buyers` RLS: buyers can only read their own row (or admins); only admins can write.
  - Added clarity comments around plaintext API key storage and RLS expectations.

### App / Lint
- **app/layout.tsx**
  - Moved `themeColor` from `metadata` to `export const viewport`.

- **app/api/diagnose/route.ts**
  - Removed `any` types (replaced with `unknown`, minimal interfaces, and safe runtime checks) without changing prompts or diagnosis logic.
  - Normalized error handling to `unknown` + safe message extraction.

- **app/components/OverviewMap.tsx**
  - Removed `any` in Leaflet/window usage via minimal structural Leaflet types.
  - Guarded hook state updates to avoid cascading renders (setState-in-effect fixes).

- **app/components/LandRegistration.tsx**
  - Removed `any` in Leaflet/window usage via minimal structural Leaflet types.
  - Kept all behavior; changes are typing-only.

- **lib/heavyMetalEngine.ts**
  - Removed `any` by parsing SoilGrids response as `unknown` with runtime guards (no behavior change).

- **app/slide/page.tsx**
  - Fixed JSX entity escaping (`&apos;`, `&quot;`) where required.

### Dust / clarity
- **init_database.sql / optimize_database.sql / supabase_schema.sql**
  - Marked as intentionally empty with a clear header comment.

- **fix_survey_inference_fk.sql**
  - Added a clear Option A/B header comment explaining migration choice before running.


## 2) SQL verification queries

### 2.1 Verify functions exist + EXECUTE grants
Run this to validate expected routines exist in `public` and `authenticated` can execute them:

```sql
-- Functions expected from the audit scripts
WITH expected(name) AS (
  VALUES
    ('upsert_water_source'),
    ('get_water_sources_near'),
    ('get_water_alerts_near_farmer'),
    ('mark_water_alert_read'),
    ('get_satellite_water_data'),
    ('detect_and_save_metal_risk'),
    ('submit_weekly_survey'),
    ('get_latest_land_profile'),
    ('calculate_farm_risk_score'),
    ('calculate_farm_risk_score_v2'),
    ('estimate_crop_loss'),
    ('upsert_crop_price'),
    ('submit_survey'),
    ('get_farm_profile'),
    ('get_survey_questions'),
    ('check_survey_status')
)
SELECT
  e.name,
  p.oid IS NOT NULL AS exists,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config
FROM expected e
LEFT JOIN pg_proc p ON p.proname = e.name
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
ORDER BY e.name, identity_args;
```

### 2.2 Verify `SECURITY DEFINER` functions have hardened `search_path`

```sql
SELECT
  n.nspname AS schema,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  p.prosecdef,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname, identity_args;
-- Expect: proconfig includes something like: {'search_path=public, extensions'}
```


## 3) Final checklist

- [ ] Apply SQL scripts in order on your target DB (or verify they already ran).
- [ ] Verify key functions exist and `authenticated` has EXECUTE (query 2.1).
- [ ] Verify every `SECURITY DEFINER` function has `search_path` set (query 2.2).
- [ ] `npm run lint` should report **0 errors**.

## 4) Remaining manual notes
- `@next/next/no-img-element` warnings remain on `app/admin/team/page.tsx` (non-blocking).
- Several `react-hooks/exhaustive-deps` warnings remain (non-blocking; requires behavior decisions).
