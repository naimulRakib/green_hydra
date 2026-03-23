# AgroSentinel — SQL & Code Audit Report (No Fixes)

This report lists **errors**, **likely bugs**, **inconsistencies**, and **extra/duplicate “dust”** found by scanning the repository scripts and running the existing lint.

> Scope note: This is a static repo audit (no live DB). Some items are “will likely fail” based on Postgres/Supabase conventions.

---

## 1) Critical SQL issues (will break deployment)

### 1.1 Invalid `GRANT EXECUTE ON FUNCTION` syntax
Postgres requires function signatures when granting execute, e.g.

```sql
GRANT EXECUTE ON FUNCTION get_water_sources_near(double precision, double precision, double precision) TO authenticated;
```

**Repo locations using invalid form (missing signature):**
- `add_water_system.sql` (end of file)
- `water_explicit_cast.sql` (end of file)
- `improved_risk_calculation.sql` (grant near end + commented legacy block)
- `database_redesign_v2.sql` (Step 5 grants)
- `create_survey_and_risk_functions.sql` (grants near end)

Impact: these statements will fail during migration runs.

---

## 2) PostGIS type mismatches / geospatial correctness problems

### 2.1 `ST_DWithin` geography vs geometry mismatch
**File:** `add_water_system.sql`
- `water_sources.location` is defined as `GEOGRAPHY(Point, 4326)`.
- In `get_water_sources_near`, the predicate uses:
  - `ST_DWithin(s.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), ...)`
  - The second argument is **geometry**, not geography (missing `::geography`).

Impact: can error at runtime (or behave unexpectedly depending on implicit cast behavior).

### 2.2 Nearest-hotspot KNN ordering type mismatch
**File:** `add_water_system.sql`
- LATERAL join orders by: `ORDER BY location <-> s.location`
- If `industrial_hotspots.location` is geometry and `s.location` is geography, this can break.

Evidence: `water_explicit_cast.sql` contains a revised implementation that explicitly casts types to avoid these conflicts.

### 2.3 `add_satellite_water_data.sql` uses degrees for km
**File:** `add_satellite_water_data.sql`
- `satellite_water_data.location` is `GEOMETRY(Point, 4326)`.
- Filter uses `p_radius_km * 0.009` inside `ST_DWithin(...)` which is a **degrees approximation** (not meters, varies by latitude).
- Distance is computed using `ST_DistanceSphere` (meters) but filtering is not.

Impact: wrong radius filtering, inconsistent behavior across regions.

---

## 3) Schema & data consistency problems

### 3.1 Mixed insertion types for `water_sources.location`
- `add_water_system.sql`: `water_sources.location GEOGRAPHY(Point, 4326)`
- `seed_agro_sentinel.sql`: inserts into `public.water_sources.location` using `...::geometry`

Impact: insert may fail unless the actual DB column is geometry (or implicit casts exist). This suggests the schema is not consistently defined across scripts.

### 3.2 Missing table definitions in repo for referenced objects
Some scripts reference tables (e.g., `industrial_hotspots`) without a `CREATE TABLE` for them in this repository.

Evidence:
- `seed_agro_sentinel.sql` inserts into `public.industrial_hotspots`
- Several functions query/join `industrial_hotspots`

Impact: migrations are incomplete unless the table exists elsewhere.

---

## 4) PL/pgSQL compile-time bugs (high confidence)

### 4.1 `add_heavy_metal_risk_system.sql` — `RECORD` field access / invalid INTO target
**File:** `add_heavy_metal_risk_system.sql`
- Declares `v_zone RECORD;`
- Does: `SELECT ... INTO v_farmer_id, v_zone.zone_id, v_land_centroid ...`

In PL/pgSQL, a `RECORD` does **not** have predefined fields; referencing `v_zone.zone_id` as an INTO target is very likely to fail.

### 4.2 Geometry assigned into geography without explicit cast
**File:** `add_heavy_metal_risk_system.sql`
- Declares: `v_land_centroid GEOGRAPHY;`
- Uses `ST_Centroid(fl.boundary)` (returns geometry) without explicit `::geography`.

Impact: potential runtime error or implicit cast reliance.

### 4.3 Reusing the same identifier for different record shapes
**File:** `add_heavy_metal_risk_system.sql`
- `v_hotspot` is used as a loop record, then later used as a target for `SELECT ... INTO v_hotspot` with a different shape.

Impact: error-prone and can lead to runtime failures.

---

## 5) Security issues / unsafe patterns

### 5.1 `SECURITY DEFINER` without `SET search_path`
Many SQL functions are declared `SECURITY DEFINER` but do not set a safe `search_path`.

Files containing `SECURITY DEFINER`:
- `add_water_system.sql`
- `water_explicit_cast.sql`
- `add_satellite_water_data.sql`
- `improved_risk_calculation.sql`
- `database_redesign_v2.sql`
- `create_survey_and_risk_functions.sql`
- `add_heavy_metal_risk_system.sql`

Impact: potential privilege escalation via object shadowing.

### 5.2 Hard-coded admin email in RLS policy
**File:** `admin_rls_policy.sql`
- Uses `'admin@example.com'` inside policy logic.
- Not idempotent; may require `DROP POLICY` or `ALTER POLICY` if it already exists.

Impact: easy to forget to update; could lock out admin access or unintentionally grant access.

### 5.3 Plaintext API keys + permissive RLS
**File:** `add_data_export_tables.sql`
- Stores `api_key` plaintext (`TEXT UNIQUE`).
- Policies allow broad reads to authenticated users.

Impact: high risk if keys leak; access is over-broad.

---

## 6) Duplicates / legacy “dust” (conflicting systems)

### 6.1 Duplicate water RPC definitions
- `add_water_system.sql` defines water functions.
- `water_explicit_cast.sql` drops and redefines water functions (explicit casts), suggesting the earlier version caused signature/type issues.

Impact: confusion on which script is authoritative; deployment order becomes critical.

### 6.2 Two survey systems (V1 vs V2) co-exist
- `create_survey_and_risk_functions.sql`: weekly survey + `farmer_land_profile`
- `database_redesign_v2.sql`: new tables (`surveys`, `farm_profiles`) and new RPCs

Impact: conflicting migrations, duplicated functionality, unclear canonical schema.

### 6.3 FK fix script is “choose-your-own-adventure” but Option A runs by default
**File:** `fix_survey_inference_fk.sql`
- Option A is active (runs) and Option B is commented.

Impact: easy to apply wrong FK target depending on real parent table.

---

## 7) Empty / placeholder SQL files (pure dust)

These files exist but are **0 bytes**:
- `init_database.sql`
- `optimize_database.sql`
- `supabase_schema.sql`

Impact: misleading; suggests missing migrations/schema export.

---

## 8) App code audit (existing lint result)

### 8.1 `npm run lint` fails
Result:
- **157 problems** total (**108 errors**, **49 warnings**)

High-signal issues:
- Many `@typescript-eslint/no-explicit-any` errors:
  - `app/api/diagnose/route.ts`
  - `app/components/LandRegistration.tsx`
  - `app/components/OverviewMap.tsx`
  - `lib/heavyMetalEngine.ts`
- React lint errors:
  - `app/components/OverviewMap.tsx`: “calling setState synchronously within an effect” (`react-hooks/set-state-in-effect`) can cause cascading renders/perf problems.
- JSX text escaping errors:
  - `app/slide/page.tsx`: many `react/no-unescaped-entities`
- Warnings indicating dead/unused variables:
  - multiple files (`@typescript-eslint/no-unused-vars`)

---

## 9) Recommended next step (you choose)
Pick a target track and I’ll help execute it:
1) **DB-first cleanup:** choose authoritative SQL scripts (Water + Surveys + Risk), remove/ignore duplicates, fix compile blockers.
2) **App-first cleanup:** make lint pass and then align API routes/components with the final DB schema.
3) **Migration plan:** produce a deterministic deployment order + “safe idempotent” versions of scripts.
