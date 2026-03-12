"use server";

import { createClient } from "../utils/supabase/server";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WeatherCurrent {
  temperature_2m:        number;
  relative_humidity_2m:  number;
  precipitation:         number;
  wind_speed_10m:        number;
  wind_direction_10m:    number;
}

export interface WeatherComputed {
  consecutive_wet_days: number;
  avg_temp_7d:          number;
  avg_temp_min_7d:      number;
  avg_humidity_7d:      number;
  rainfall_7d_mm:       number;
  hourly_count:         number;
  computed_at:          string;
}

export interface WeatherData {
  current:  WeatherCurrent;
  hourly:   Record<string, number[]>;
  daily:    Record<string, number[]>;
  computed: WeatherComputed;
  meta: {
    latitude:  number;
    longitude: number;
    timezone:  string;
    elevation: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * safeNums: extracts only finite numbers from an array.
 * Open-Meteo WILL return null for today's incomplete day (e.g. today only has
 * 14 hours so daily max is null). Without filtering, avg() / reduce() receive
 * null values and produce NaN, which throws on .toFixed().
 */
function safeNums(arr: unknown[]): number[] {
  return arr.filter((v): v is number => typeof v === 'number' && isFinite(v));
}

/** avg of finite numbers only — always returns a safe finite number */
function avg(arr: unknown[]): number {
  const nums = safeNums(arr);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** sum of finite numbers only — always returns a safe finite number */
function sum(arr: unknown[]): number {
  return safeNums(arr).reduce((a, b) => a + b, 0);
}

/** Converts any value to a rounded float — never throws */
function toF(val: unknown, decimals = 1): number {
  const n = Number(val);
  return parseFloat((isFinite(n) ? n : 0).toFixed(decimals));
}

function computeConsecutiveWetDays(
  hourlyTime: unknown[],
  hourlyPrecip: unknown[]
): number {
  // Group hourly → daily totals
  const dailyMap: Record<string, number> = {};
  for (let i = 0; i < hourlyTime.length; i++) {
    const t = hourlyTime[i];
    const day = typeof t === 'string' ? t.slice(0, 10) : null;
    if (!day) continue;
    const p = hourlyPrecip[i];
    dailyMap[day] = (dailyMap[day] ?? 0) + (typeof p === 'number' && isFinite(p) ? p : 0);
  }
  // Count streak from newest day backward
  let streak = 0;
  for (const day of Object.keys(dailyMap).sort((a, b) => b.localeCompare(a))) {
    if (dailyMap[day] > 0.5) streak++;
    else break;
  }
  return streak;
}

// ── Main fetch function ───────────────────────────────────────────────────────
export async function fetchAndSaveWeather(
  farmerId: string,
  lat:      number,
  lng:      number
): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = await createClient();

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m` +
      `&hourly=wind_speed_10m,wind_direction_10m,precipitation,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
      `&past_days=7` +
      `&timezone=Asia%2FDhaka`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      next:   { revalidate: 1800 },
    });

    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

    const raw = await res.json();

    if (!raw?.current || !raw?.hourly?.wind_direction_10m) {
      throw new Error("Open-Meteo returned incomplete data");
    }

  // Use unknown[] cast to accept null values Open-Meteo puts for today's
  // incomplete day — safeNums/sum/avg filter them out before any math.
  const hourlyPrecip = (raw.hourly?.precipitation        ?? []) as unknown[];
  const hourlyTime   = (raw.hourly?.time                 ?? []) as unknown[];
  const hourlyHum    = (raw.hourly?.relative_humidity_2m ?? []) as unknown[];
  const dailyTemps   = (raw.daily?.temperature_2m_max    ?? []) as unknown[];
  const dailyMins    = (raw.daily?.temperature_2m_min    ?? []) as unknown[];
  const dailyRain    = (raw.daily?.precipitation_sum     ?? []) as unknown[];

  const consecutiveWetDays = computeConsecutiveWetDays(hourlyTime, hourlyPrecip);

    const structuredData: WeatherData = {
      current:  raw.current,
      hourly:   raw.hourly,
      daily:    raw.daily,
      // BUG FIX: was saving under "grid" key but route.ts reads "computed"
      // All consumers must read: weather_data.computed.consecutive_wet_days
      computed: {
        consecutive_wet_days: consecutiveWetDays,
        avg_temp_7d:          toF(avg(dailyTemps.slice(0, 7))),
        avg_temp_min_7d:      toF(avg(dailyMins.slice(0, 7))),
        avg_humidity_7d:      toF(avg(hourlyHum)),
        rainfall_7d_mm:       toF(sum(dailyRain.slice(0, 7))),
        hourly_count:         raw.hourly?.time?.length ?? 0,
        computed_at:          new Date().toISOString(),
      },
      meta: {
        latitude:  raw.latitude,
        longitude: raw.longitude,
        timezone:  raw.timezone,
        elevation: raw.elevation,
      },
    };

    const { error: upsertError } = await supabase
      .from("weather_details")
      .upsert(
        { farmer_id: farmerId, weather_data: structuredData, last_fetched_at: new Date().toISOString() },
        { onConflict: "farmer_id" }
      );

    if (upsertError) throw upsertError;

    console.log(
      `[Weather] ✅ farmer:${farmerId.slice(0, 8)} | ` +
      `wet_days:${consecutiveWetDays} | ` +
      `hourly:${structuredData.computed.hourly_count} | ` +
      `rain_7d:${structuredData.computed.rainfall_7d_mm}mm`
    );

    revalidatePath("/dashboard");
    return {
      success: true,
      message: `আবহাওয়া আপডেট হয়েছে! (${consecutiveWetDays} দিন একটানা বৃষ্টি)`,
    };
  } catch (err: any) {
    console.error("[Weather] fetchAndSaveWeather error:", err.message);
    return { success: false, message: `আবহাওয়া আপডেট ব্যর্থ: ${err.message}` };
  }
}

// ── BUG FIX: LiveGpsButton imports this function but it didn't exist ──────────
// syncLiveGPSAndWeather: gets current user from auth, then fetches+saves weather.
// Returns zone name for the success toast.
export async function syncLiveGPSAndWeather(
  lat: number,
  lng: number
): Promise<{ zoneName: string }> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("লগইন করুন");

  // Nearest zone lookup from DB
  const { data: zoneRow } = await supabase.rpc("snap_to_zone", {
    p_lat: lat, p_lng: lng,
  }).maybeSingle().catch(() => ({ data: null }));

  const zoneId = zoneRow?.zone_id ?? "dhaka-savar";

  // Update farmer GPS + zone
  const { error: updateError } = await supabase
    .from("farmers")
    .update({
      farm_location: `SRID=4326;POINT(${lng} ${lat})`,
      zone_id:       zoneId,
    })
    .eq("id", user.id);

  if (updateError) throw new Error("লোকেশন আপডেট করতে সমস্যা হয়েছে");

  // Fetch+save weather for new location
  const weatherResult = await fetchAndSaveWeather(user.id, lat, lng);
  if (!weatherResult.success) {
    // Non-fatal — location updated, weather failed
    console.warn("[GPS Sync] Weather fetch failed:", weatherResult.message);
  }

  revalidatePath("/dashboard");
  return { zoneName: zoneRow?.zone_name_bn ?? "বাংলাদেশ" };
}