"use client";
/**
 * AgroSentinel — Land Registration & Spray Tracker
 *
 * NEW in this version:
 *  ① Live GPS button  — browser geolocation → flyTo → pulsing blue marker
 *                       → auto-fills farmerLat/Lng → resolves zone_id
 *  ② Manual lat/lng   — two number inputs + "নিশ্চিত করুন" button
 *                       → same flyTo + zone_id resolve (dev-friendly)
 *  ③ zone_id resolve  — calls resolve_zone_from_point(lat, lng) RPC
 *                       OR fallback SELECT from kb_zones by proximity
 *                       written to landForm.zone_id → saved in INSERT
 *  ④ Community spray  — get_community_spray_risk(lat, lng, 2.0) called
 *                       whenever location is set; colored polygons +
 *                       dashed harm-radius buffers on the map with popups
 *
 * INSERT INTO farmer_lands:
 *   zone_id ← auto from GPS / manual confirm (editable fallback for dev)
 *   boundary ← EWKT POLYGON drawn on map
 *   area_sqm, area_bigha ← GENERATED ALWAYS AS (PostgreSQL handles it)
 *
 * RPCs used:
 *   get_farmer_lands(p_farmer_id)
 *   log_spray_event(...)
 *   get_community_spray_risk(p_lat, p_lng, p_radius_km)
 *   resolve_zone_from_point(p_lat, p_lng)   ← optional, graceful fallback
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "../utils/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LandPlot {
  land_id: string;
  land_name: string;
  land_name_bn: string | null;
  area_sqm: number;
  area_bigha: number;
  crop_id: string | null;
  zone_id: string | null;
  spray_active: boolean;
  chemical_name: string | null;
  risk_level: "red" | "yellow" | "green";
  spray_expires: string | null;
  boundary_geojson: string;
}

interface CommunitySpray {
  spray_id: string;
  land_name: string;
  chemical_name: string;
  chemical_type: string;
  risk_level: string;
  expires_at: string;
  hours_remaining: number;
  harm_radius_m: number;
  distance_m: number;
  boundary_geojson: string;
  buffer_geojson: string;
}

interface SprayForm {
  land_id: string;
  chemical_name: string;
  chemical_name_bn: string;
  chemical_type: string;
  active_ingredient: string;
  dose_per_bigha: string;
  harm_radius_m: number;
  notes_bn: string;
  visible_to_neighbors: boolean;
}

interface DrawState {
  active: boolean;
  coords: [number, number][];  // [lat, lng]
  areaM2: number;
}

interface LandForm {
  land_name: string;
  land_name_bn: string;
  crop_id: string;
  zone_id: string;   // auto-filled from GPS or manual input
  notes_bn: string;
}

type Tab = "map" | "digest" | "spray";

// ─── Constants ────────────────────────────────────────────────────────────────

const RISK = {
  red:    { fill: "#ef4444", stroke: "#991b1b", label: "সক্রিয় স্প্রে",    bg: "#fef2f2" },
  yellow: { fill: "#f59e0b", stroke: "#92400e", label: "মেয়াদ শেষ হচ্ছে", bg: "#fffbeb" },
  green:  { fill: "#22c55e", stroke: "#14532d", label: "নিরাপদ",            bg: "#f0fdf4" },
};

const CHEM_TYPES = [
  { value: "Fungicide",   label: "ছত্রাকনাশক (Fungicide)",  days: 14 },
  { value: "Insecticide", label: "কীটনাশক (Insecticide)",  days: 21 },
  { value: "Herbicide",   label: "আগাছানাশক (Herbicide)",   days: 30 },
  { value: "Fertilizer",  label: "সার (Fertilizer)",         days: 7  },
];

const CROPS = [
  { value: "rice_boro",     label: "বোরো ধান" },
  { value: "rice_aman",     label: "আমন ধান" },
  { value: "rice_brri51",   label: "BRRI-51 (জলসহিষ্ণু)" },
  { value: "rice_brri47",   label: "BRRI-47 (লবণসহিষ্ণু)" },
  { value: "rice_brri56",   label: "BRRI-56 (খরাসহিষ্ণু)" },
  { value: "jute",          label: "পাট" },
  { value: "maize",         label: "ভুট্টা" },
  { value: "mustard_tori7", label: "তোরি-৭ সরিষা" },
  { value: "bitter_gourd",  label: "করলা" },
];

// Module-level: survives StrictMode double-invoke
let leafletBootstrapped = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAreaM2(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const latR = (coords.reduce((s, c) => s + c[0], 0) / coords.length) * (Math.PI / 180);
  const mLat = 111320, mLng = 111320 * Math.cos(latR);
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += (coords[i][1] * mLng) * (coords[j][0] * mLat)
          - (coords[j][1] * mLng) * (coords[i][0] * mLat);
  }
  return Math.abs(area / 2);
}

const toBigha = (m2: number) => (m2 / 1338).toFixed(3);

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandRegistration({ farmerId }: { farmerId: string }) {
  const supabase = createClient();

  // ── UI state ─────────────────────────────────────────────────────
  const [tab, setTab]               = useState<Tab>("map");
  const [plots, setPlots]           = useState<LandPlot[]>([]);
  const [communitySpray, setCommunitySpray] = useState<CommunitySpray[]>([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [savingSpray, setSavingSpray] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const [mapReady, setMapReady]     = useState(false);
  const [, setLocResolved] = useState(false);

  // ── Farmer current position (GPS or manual) ──────────────────────
  const [farmerLat, setFarmerLat] = useState<string>("");
  const [farmerLng, setFarmerLng] = useState<string>("");

  // ── Draw + land form state ───────────────────────────────────────
  const [draw, setDraw] = useState<DrawState>({ active: false, coords: [], areaM2: 0 });
  const [landForm, setLandForm] = useState<LandForm>({
    land_name: "", land_name_bn: "", crop_id: "", zone_id: "", notes_bn: "",
  });
  const [sprayForm, setSprayForm] = useState<SprayForm>({
    land_id: "", chemical_name: "", chemical_name_bn: "",
    chemical_type: "Fungicide", active_ingredient: "",
    dose_per_bigha: "", harm_radius_m: 50,
    notes_bn: "", visible_to_neighbors: true,
  });
  const [selectedPlot, setSelectedPlot] = useState<LandPlot | null>(null);

  type LeafletMapLike = {
    remove: () => void;
    removeLayer: (layer: unknown) => void;
    flyTo: (...args: unknown[]) => void;
    getContainer: () => HTMLElement;
  };

  type LeafletLayerLike = {
    addTo: (map: unknown) => LeafletLayerLike;
    bindTooltip: (...args: unknown[]) => LeafletLayerLike;
    bindPopup: (...args: unknown[]) => LeafletLayerLike;
    on: (ev: string, handler: () => void) => LeafletLayerLike;
  };

  type LeafletGlobal = {
    Icon: {
      Default: {
        prototype: Record<string, unknown>;
        mergeOptions: (opts: Record<string, unknown>) => void;
      };
    };
    map: (...args: unknown[]) => LeafletMapLike & { on: (ev: string, handler: (e: unknown) => void) => void };
    tileLayer: (...args: unknown[]) => { addTo: (map: unknown) => void };
    circleMarker: (...args: unknown[]) => { addTo: (map: unknown) => unknown };
    polyline: (...args: unknown[]) => { addTo: (map: unknown) => unknown };
    polygon: (...args: unknown[]) => { addTo: (map: unknown) => unknown };
    geoJSON: (...args: unknown[]) => LeafletLayerLike;
    divIcon: (...args: unknown[]) => unknown;
    marker: (...args: unknown[]) => LeafletLayerLike;
    circle: (...args: unknown[]) => LeafletLayerLike;
  };

  function getLeaflet(): LeafletGlobal | null {
    const w = window as unknown as { L?: LeafletGlobal };
    return w.L ?? null;
  }


  // ── Leaflet refs ──────────────────────────────────────────────────
  const mapDivRef       = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<LeafletMapLike | null>(null);
  const polylineRef     = useRef<unknown>(null);
  const polygonRef      = useRef<unknown>(null);
  const markersRef      = useRef<unknown[]>([]);
  const layersRef       = useRef<unknown[]>([]);
  const sprayLayersRef  = useRef<unknown[]>([]);
  const myLocMarkerRef  = useRef<unknown>(null);
  const myLocCircleRef  = useRef<unknown>(null);
  const drawRef         = useRef<DrawState>({ active: false, coords: [], areaM2: 0 });

  useEffect(() => { drawRef.current = draw; }, [draw]);

  // ── Load Leaflet once ─────────────────────────────────────────────
  useEffect(() => {
    if (leafletBootstrapped) {
      if (getLeaflet()) setMapReady(true);
      return;
    }
    leafletBootstrapped = true;

    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src   = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  // ── Init / re-init map ───────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapDivRef.current) return;
    const L = getLeaflet();
    if (!L) return;

    if (mapRef.current) {
      try { mapRef.current.remove(); } catch {}
      mapRef.current = null;
    }

    // Fix Next.js icon path crash
    delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(mapDivRef.current, { center: [23.8103, 90.2700], zoom: 13 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19,
    }).addTo(map);

    // Click handler reads from drawRef — never stale
    map.on("click", (e: unknown) => {
      if (!drawRef.current.active) return;
      const L2 = getLeaflet();
      if (!L2) return;
      const latlng = (e as { latlng?: { lat: number; lng: number } })?.latlng;
      if (!latlng) return;
      const { lat, lng } = latlng;
      const newCoords: [number, number][] = [...drawRef.current.coords, [lat, lng]];

      const marker = L2.circleMarker([lat, lng], {
        radius: 5, color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 1, weight: 2,
      }).addTo(map);
      markersRef.current.push(marker);

      if (polylineRef.current) map.removeLayer(polylineRef.current);
      if (newCoords.length > 1)
        polylineRef.current = L2.polyline(newCoords, { color: "#f59e0b", weight: 2, dashArray: "6 4" }).addTo(map);

      if (polygonRef.current) map.removeLayer(polygonRef.current);
      if (newCoords.length >= 3)
        polygonRef.current = L2.polygon(newCoords, { color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 0.2, weight: 2, dashArray: "6 4" }).addTo(map);

      const next: DrawState = { active: true, coords: newCoords, areaM2: calcAreaM2(newCoords) };
      drawRef.current = next;
      setDraw(next);
    });

    mapRef.current = map;

    return () => {
      try { map.remove(); } catch {}
      mapRef.current = null;
      polylineRef.current = null;
      polygonRef.current  = null;
      markersRef.current  = [];
      layersRef.current   = [];
      sprayLayersRef.current = [];
      myLocMarkerRef.current = null;
      myLocCircleRef.current = null;
    };
  }, [mapReady, tab]);

  // ── Render own plot layers ───────────────────────────────────────
  useEffect(() => {
    const L = getLeaflet();
    const map = mapRef.current;
    if (!L || !map) return;
    layersRef.current.forEach(l => { try { map.removeLayer(l); } catch {} });
    layersRef.current = [];

    plots.forEach(plot => {
      if (!plot.boundary_geojson) return;
      try {
        const geo = typeof plot.boundary_geojson === "string"
          ? JSON.parse(plot.boundary_geojson) : plot.boundary_geojson;
        const cfg = RISK[plot.risk_level] ?? RISK.green;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = L!.geoJSON(geo as any, {
          style: { color: cfg.stroke, fillColor: cfg.fill, fillOpacity: 0.25, weight: 2.5 },
        })
          .bindTooltip(
            `<strong>${plot.land_name_bn || plot.land_name}</strong><br/>` +
            `${toBigha(plot.area_sqm ?? 0)} বিঘা` +
            (plot.zone_id ? `<br/><span style="color:#94a3b8">zone: ${plot.zone_id}</span>` : ""),
            { permanent: false, direction: "center" }
          )
          .addTo(mapRef.current);
        layer.on("click", () => setSelectedPlot(plot));
        layersRef.current.push(layer);
      } catch {}
    });
  }, [plots, mapReady]);

  // ── Render community spray layers (2km) ─────────────────────────
  useEffect(() => {
    const L = getLeaflet();
    const map = mapRef.current;
    if (!L || !map) return;
    sprayLayersRef.current.forEach(l => { try { map.removeLayer(l); } catch {} });
    sprayLayersRef.current = [];

    communitySpray.forEach(sp => {
      const color = sp.risk_level === "red" ? "#ef4444" : "#f59e0b";
      try {
        if (sp.boundary_geojson) {
          const geo = typeof sp.boundary_geojson === "string"
            ? JSON.parse(sp.boundary_geojson) : sp.boundary_geojson;
          const layer = L.geoJSON(geo, {
            style: { color, fillColor: color, fillOpacity: 0.30, weight: 2 },
          }).bindPopup(
            `<div style="font-size:13px;min-width:170px;font-family:sans-serif">` +
            `<strong>🧪 ${sp.chemical_name}</strong><br/>` +
            `জমি: <b>${sp.land_name}</b><br/>` +
            `ধরন: ${sp.chemical_type}<br/>` +
            `দূরত্ব: ${Math.round(sp.distance_m)} মি<br/>` +
            `⏱ ${sp.hours_remaining.toFixed(1)} ঘণ্টা বাকি` +
            `</div>`, { maxWidth: 210 }
          ).addTo(mapRef.current);
          sprayLayersRef.current.push(layer);
        }
        if (sp.buffer_geojson) {
          const buf = typeof sp.buffer_geojson === "string"
            ? JSON.parse(sp.buffer_geojson) : sp.buffer_geojson;
          const bufLayer = L.geoJSON(buf, {
            style: { color, fill: false, fillOpacity: 0, weight: 1.5, dashArray: "5 5", opacity: 0.55 },
          }).addTo(mapRef.current);
          sprayLayersRef.current.push(bufLayer);
        }
      } catch {}
    });
  }, [communitySpray, mapReady]);

  // ── Fetch own plots ──────────────────────────────────────────────
  const fetchPlots = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_farmer_lands", { p_farmer_id: farmerId });
      if (rpcErr) throw rpcErr;
      setPlots(data ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError("জমির তথ্য লোড হয়নি: " + msg);
    } finally { setLoading(false); }
  }, [farmerId]);

  useEffect(() => { fetchPlots(); }, [fetchPlots]);

  // ── Fetch community spray within 2km ────────────────────────────
  const fetchCommunitySpray = useCallback(async (lat: number, lng: number) => {
    try {
      const { data } = await supabase.rpc("get_community_spray_risk", {
        p_lat: lat, p_lng: lng, p_radius_km: 2.0,
      });
      setCommunitySpray(data ?? []);
    } catch { /* non-critical */ }
  }, []);

  // ── Resolve nearest zone_id from kb_zones ────────────────────────
  // Primary: call resolve_zone_from_point RPC (simple, no PostGIS JS syntax)
  // Fallback: try raw query (works only if Supabase supports <-> operator)
  const resolveZone = useCallback(async (lat: number, lng: number) => {
    // Primary — RPC (you need to add this tiny function to your SQL if not present)
    try {
      const { data } = await supabase.rpc("resolve_zone_from_point", { p_lat: lat, p_lng: lng });
      if (data) { setLandForm(f => ({ ...f, zone_id: data })); return; }
    } catch {}

    // Fallback — fetch all zones, compute Euclidean distance client-side
    // Uses center_lat / center_lng FLOAT columns (no PostGIS needed)
    // Only runs if resolve_zone_from_point RPC doesn't exist yet
    try {
      const { data: zones } = await supabase
        .from("kb_zones")
        .select("zone_id, center_lat, center_lng");
      if (!zones || zones.length === 0) return;

      let nearest = zones[0].zone_id;
      let minDist = Infinity;
      for (const z of zones) {
        const d = Math.hypot(lat - z.center_lat, lng - z.center_lng);
        if (d < minDist) { minDist = d; nearest = z.zone_id; }
      }
      setLandForm(f => ({ ...f, zone_id: nearest }));
    } catch { /* zone_id stays blank — dev can fill manually */ }
  }, []);

  // ── Wait for mapRef to be non-null (map tab must be active first) ─
  // The map useEffect only runs when tab==="map" AND mapDivRef is mounted.
  // GPS / manual confirm can fire from any tab, so we switch tab first,
  // then poll until the Leaflet instance is ready (max 3 seconds).
  const waitForMap = useCallback((): Promise<LeafletMapLike> => {
    return new Promise((resolve, reject) => {
      const cur = mapRef.current;
      if (cur) { resolve(cur); return; }
      let attempts = 0;
      const id = setInterval(() => {
        const m = mapRef.current;
        if (m) { clearInterval(id); resolve(m); return; }
        if (++attempts > 30) { clearInterval(id); reject(new Error("map not ready")); }
      }, 100);
    });
  }, []);

  // ── Core: go to location (shared by GPS + manual) ───────────────
  const goToLocation = useCallback(async (lat: number, lng: number) => {
    let L = getLeaflet();
    if (!L) return;

    // Switch to map tab first — this mounts the map div so the
    // init useEffect can create mapRef.current
    setTab("map");

    // Now wait until mapRef.current is populated
    let map: LeafletMapLike;
    try {
      map = await waitForMap();
    } catch {
      return; // timed out — give up silently
    }

    // Re-check L after async in case it changed
    L = getLeaflet();
    if (!L) return;

    // 1. Fly map
    map.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });

    // 2. Inject pulse animation once
    if (!document.getElementById("agro-pulse-kf")) {
      const s = document.createElement("style");
      s.id = "agro-pulse-kf";
      s.textContent = `
        @keyframes agroPulse {
          0%  { box-shadow: 0 0 0 0   rgba(59,130,246,.7); }
          70% { box-shadow: 0 0 0 16px rgba(59,130,246,0);  }
          100%{ box-shadow: 0 0 0 0   rgba(59,130,246,0);  }
        }
        @keyframes spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(s);
    }

    // 3. Pulsing "my location" marker
    if (myLocMarkerRef.current) { try { map.removeLayer(myLocMarkerRef.current); } catch {} }
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 0 rgba(59,130,246,.7);animation:agroPulse 1.8s infinite"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    myLocMarkerRef.current = L.marker([lat, lng], { icon })
      .bindTooltip(
        `<b>📍 আমার অবস্থান</b><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        { permanent: false, direction: "top" }
      )
      .addTo(map);

    // 4. 2km radius circle
    if (myLocCircleRef.current) { try { map.removeLayer(myLocCircleRef.current); } catch {} }
    myLocCircleRef.current = L.circle([lat, lng], {
      radius: 2000, color: "#3b82f6",
      fillColor: "#3b82f6", fillOpacity: 0.04,
      weight: 1.5, dashArray: "8 6",
    }).addTo(map);

    setLocResolved(true);

    // 5. Resolve zone_id
    await resolveZone(lat, lng);

    // 6. Community spray
    await fetchCommunitySpray(lat, lng);
  }, [waitForMap, resolveZone, fetchCommunitySpray]);

  // ── Live GPS ──────────────────────────────────────────────────────
  function handleLiveGPS() {
    if (!navigator.geolocation) { setError("এই ব্রাউজারে GPS সমর্থিত নয়।"); return; }
    setGpsLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setFarmerLat(lat.toFixed(6));
        setFarmerLng(lng.toFixed(6));
        await goToLocation(lat, lng);
        setGpsLoading(false);
      },
      (err: GeolocationPositionError) => { setError("GPS ব্যর্থ: " + err.message); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ── Manual confirm ────────────────────────────────────────────────
  async function handleManualConfirm() {
    const lat = parseFloat(farmerLat);
    const lng = parseFloat(farmerLng);
    if (isNaN(lat) || isNaN(lng) || lat < 20 || lat > 27 || lng < 88 || lng > 93) {
      setError("বাংলাদেশের বৈধ Lat (20–27) ও Lng (88–93) দিন।");
      return;
    }
    setError(null);
    await goToLocation(lat, lng);
  }

  // ── Draw controls ─────────────────────────────────────────────────
  function startDraw() {
    clearDraw();
    const next: DrawState = { active: true, coords: [], areaM2: 0 };
    drawRef.current = next; setDraw(next);
    if (mapRef.current) mapRef.current.getContainer().style.cursor = "crosshair";
  }

  function clearDraw() {
    markersRef.current.forEach(m => { try { mapRef.current?.removeLayer(m); } catch {} });
    markersRef.current = [];
    if (polylineRef.current) { try { mapRef.current?.removeLayer(polylineRef.current); } catch {} polylineRef.current = null; }
    if (polygonRef.current)  { try { mapRef.current?.removeLayer(polygonRef.current);  } catch {} polygonRef.current  = null; }
    const next: DrawState = { active: false, coords: [], areaM2: 0 };
    drawRef.current = next; setDraw(next);
    if (mapRef.current) mapRef.current.getContainer().style.cursor = "";
  }

  function undoPoint() {
    const L = getLeaflet();
    if (!L || drawRef.current.coords.length === 0) return;
    const last = markersRef.current.pop();
    if (last) { try { mapRef.current?.removeLayer(last); } catch {} }
    const newCoords = drawRef.current.coords.slice(0, -1);
    if (polylineRef.current) { try { mapRef.current?.removeLayer(polylineRef.current); } catch {} polylineRef.current = null; }
    if (polygonRef.current)  { try { mapRef.current?.removeLayer(polygonRef.current);  } catch {} polygonRef.current  = null; }
    if (newCoords.length > 1)  polylineRef.current = L.polyline(newCoords,  { color: "#f59e0b", weight: 2, dashArray: "6 4" }).addTo(mapRef.current ?? undefined);
    if (newCoords.length >= 3) polygonRef.current  = L.polygon(newCoords,   { color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 0.2, weight: 2, dashArray: "6 4" }).addTo(mapRef.current ?? undefined);
    const next: DrawState = { active: true, coords: newCoords, areaM2: calcAreaM2(newCoords) };
    drawRef.current = next; setDraw(next);
  }

  // ── Save land ─────────────────────────────────────────────────────
  async function saveLand() {
    if (draw.coords.length < 3) { setError("কমপক্ষে ৩টি বিন্দু দিয়ে জমি আঁকুন।"); return; }
    if (!landForm.land_name.trim()) { setError("জমির নাম দিন।"); return; }
    setSaving(true); setError(null);
    try {
      const ring = [...draw.coords, draw.coords[0]];
      const wkt  = `SRID=4326;POLYGON((${ring.map(([la, ln]) => `${ln} ${la}`).join(",")}))`;

      const { error: dbErr } = await supabase.from("farmer_lands").insert({
        farmer_id:    farmerId,
        land_name:    landForm.land_name.trim(),
        land_name_bn: landForm.land_name_bn.trim() || null,
        boundary:     wkt,
        crop_id:      landForm.crop_id  || null,
        zone_id:      landForm.zone_id  || null,  // ← GPS / manual resolved
        notes_bn:     landForm.notes_bn.trim() || null,
        is_active:    true,
      });
      if (dbErr) throw dbErr;

      setSuccess(`"${landForm.land_name}" সংরক্ষিত! zone_id → ${landForm.zone_id || "NULL"}`);
      setLandForm(f => ({ land_name: "", land_name_bn: "", crop_id: "", zone_id: f.zone_id, notes_bn: "" }));
      clearDraw();
      await fetchPlots();
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError("সংরক্ষণ ব্যর্থ: " + msg);
    } finally { setSaving(false); }
  }

  // ── Save spray ────────────────────────────────────────────────────
  async function saveSpray() {
    if (!sprayForm.land_id)              { setError("জমি বেছে নিন।"); return; }
    if (!sprayForm.chemical_name.trim()) { setError("রাসায়নিকের নাম দিন।"); return; }
    setSavingSpray(true); setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("log_spray_event", {
        p_farmer_id:            farmerId,
        p_land_id:              sprayForm.land_id,
        p_chemical_name:        sprayForm.chemical_name.trim(),
        p_chemical_name_bn:     sprayForm.chemical_name_bn.trim() || null,
        p_chemical_type:        sprayForm.chemical_type,
        p_active_ingredient:    sprayForm.active_ingredient.trim() || null,
        p_dose_per_bigha:       sprayForm.dose_per_bigha.trim() || null,
        p_harm_radius_m:        sprayForm.harm_radius_m,
        p_notes_bn:             sprayForm.notes_bn.trim() || null,
        p_visible_to_neighbors: sprayForm.visible_to_neighbors,
      });
      if (rpcErr) throw rpcErr;
      const days = CHEM_TYPES.find(c => c.value === sprayForm.chemical_type)?.days ?? 14;
      setSuccess(`স্প্রে নথিভুক্ত! ${days} দিন পর মেয়াদ শেষ।`);
      setSprayForm(f => ({ ...f, chemical_name: "", chemical_name_bn: "", active_ingredient: "", dose_per_bigha: "", notes_bn: "" }));
      await fetchPlots();
      setTab("digest");
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError("স্প্রে সংরক্ষণ ব্যর্থ: " + msg);
    } finally { setSavingSpray(false); }
  }

  // ── Delete plot ───────────────────────────────────────────────────
  async function deletePlot(land_id: string, name: string) {
    if (!confirm(`"${name}" মুছে দিতে চান?`)) return;
    const { error: dbErr } = await supabase
      .from("farmer_lands").update({ is_active: false })
      .eq("land_id", land_id).eq("farmer_id", farmerId);
    if (dbErr) { setError("মুছতে পারেনি: " + dbErr.message); return; }
    setPlots(p => p.filter(pl => pl.land_id !== land_id));
  }

  // ── Derived ──────────────────────────────────────────────────────
  const totalBigha   = plots.reduce((s, p) => s + (p.area_bigha ?? 0), 0);
  const activeSprays = plots.filter(p => p.spray_active && p.risk_level === "red").length;
  const riskPlots    = plots.filter(p => p.risk_level !== "green" && p.spray_active);

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* ── Tab bar ── */}
      <div style={S.tabBar}>
        {([
          ["map",    "✏️", "জমি আঁকুন"],
          ["digest", "📋", `ডাইজেস্ট${riskPlots.length > 0 ? ` (${riskPlots.length})` : ""}`],
          ["spray",  "🧪", "স্প্রে নথিভুক্ত"],
        ] as [Tab, string, string][]).map(([t, icon, label]) => (
          <button key={t}
            style={{ ...S.tabBtn, ...(tab === t ? S.tabBtnActive : {}) }}
            onClick={() => setTab(t)}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── Alerts ── */}
      {error   && <div style={S.alertErr}>{error}<button style={S.alertClose} onClick={() => setError(null)}>✕</button></div>}
      {success && <div style={S.alertOk}>{success}</div>}

      {/* ══════════════════ TAB: MAP ══════════════════ */}
      {tab === "map" && (
        <div style={S.mapLayout}>

          {/* Left: map */}
          <div style={S.mapPanel}>
            <div style={S.mapBar}>
              <span style={S.mapBarTitle}>
                {draw.active
                  ? (draw.coords.length < 3
                      ? `${draw.coords.length} বিন্দু — আরও ${3 - draw.coords.length}টি দরকার`
                      : `${draw.coords.length} বিন্দু ✓  ~${toBigha(draw.areaM2)} বিঘা`)
                  : "মানচিত্রে জমির সীমানা আঁকুন"}
              </span>
              <div style={S.mapBarTools}>
                {!draw.active ? (
                  <button style={S.btnAmber} onClick={startDraw}>✏️ আঁকা শুরু</button>
                ) : (
                  <>
                    <button style={S.btnGhost} onClick={undoPoint} disabled={draw.coords.length === 0}>↩</button>
                    <button style={S.btnRed}   onClick={clearDraw}>✕ বাতিল</button>
                  </>
                )}
              </div>
            </div>

            {draw.active && (
              <div style={S.drawHint}>ম্যাপে ক্লিক করে জমির কোণাগুলো চিহ্নিত করুন</div>
            )}

            <div ref={mapDivRef} style={S.mapDiv} />

            {draw.areaM2 > 0 && (
              <div style={S.areaBadge}>
                <span style={S.areaBig}>{toBigha(draw.areaM2)}</span>
                <span style={S.areaUnit}>বিঘা</span>
                <span style={S.areaSub}>{Math.round(draw.areaM2).toLocaleString()} m²</span>
              </div>
            )}

            <div style={S.legend}>
              {(Object.entries(RISK) as Array<[keyof typeof RISK, (typeof RISK)[keyof typeof RISK]]>).map(([k, v]) => (
                <div key={k} style={S.legendItem}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: v.fill }} />
                  <span>{v.label}</span>
                </div>
              ))}
              {communitySpray.length > 0 && (
                <div style={S.legendItem}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "#ef444490" }} />
                  <span>প্রতিবেশী ({communitySpray.length})</span>
                </div>
              )}
              <div style={S.legendItem}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
                <span>আমার অবস্থান · ২কিমি</span>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div style={S.formPanel}>

            {/* ── Location block ── */}
            <div style={S.locBlock}>
              <p style={S.locTitle}>📍 আপনার অবস্থান নির্ধারণ করুন</p>
              <p style={S.locSubtitle}>
                অবস্থান দিলে ম্যাপ সেদিকে যাবে, zone_id স্বয়ংক্রিয় হবে
                এবং ২ কিমির মধ্যে প্রতিবেশীদের সক্রিয় স্প্রে দেখাবে।
              </p>

              {/* Live GPS */}
              <button
                style={{ ...S.btnGPS, opacity: gpsLoading ? 0.65 : 1 }}
                disabled={gpsLoading}
                onClick={handleLiveGPS}>
                {gpsLoading
                  ? <><span style={S.spinInline} />  GPS খুঁজছে...</>
                  : "📡 লাইভ GPS ব্যবহার করুন"}
              </button>

              {/* Manual lat/lng */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={S.field}>
                  <label style={S.label}>Latitude</label>
                  <input style={S.input} type="number" step="0.000001"
                    placeholder="23.857"
                    value={farmerLat}
                    onChange={e => setFarmerLat(e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Longitude</label>
                  <input style={S.input} type="number" step="0.000001"
                    placeholder="90.270"
                    value={farmerLng}
                    onChange={e => setFarmerLng(e.target.value)} />
                </div>
              </div>

              <button style={S.btnConfirm} onClick={handleManualConfirm}>
                ✓ নিশ্চিত করুন ও ম্যাপে যান
              </button>

              {/* zone_id result */}
              {landForm.zone_id ? (
                <div style={S.zoneBadge}>
                  <span style={{ fontFamily: "monospace", color: "#3fb950", fontSize: 11 }}>zone_id</span>
                  <span style={S.zoneChip}>{landForm.zone_id}</span>
                  <span style={{ fontSize: 10, color: "#7d8590" }}>GPS থেকে স্বয়ংক্রিয়</span>
                </div>
              ) : (
                <div style={{ ...S.zoneBadge, borderColor: "#30363d" }}>
                  <span style={{ fontFamily: "monospace", color: "#7d8590", fontSize: 11 }}>zone_id</span>
                  <input
                    style={{ ...S.input, flex: 1, padding: "3px 8px", fontSize: 11 }}
                    placeholder="ম্যানুয়াল (dev)"
                    value={landForm.zone_id}
                    onChange={e => setLandForm(f => ({ ...f, zone_id: e.target.value }))} />
                </div>
              )}

              {communitySpray.length > 0 && (
                <div style={S.sprayAlert}>
                  ⚠️ ২ কিমির মধ্যে <strong>{communitySpray.length}টি</strong> সক্রিয় স্প্রে — ম্যাপে দেখুন
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid #21262d" }} />

            {/* ── Land details ── */}
            <p style={S.formTitle}>জমির তথ্য</p>

            <div style={S.areaBox}>
              <p style={S.areaBoxLabel}>আয়তন — PostgreSQL GENERATED AS</p>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  [draw.areaM2 > 0 ? toBigha(draw.areaM2) : "—", "বিঘা"],
                  [draw.areaM2 > 0 ? Math.round(draw.areaM2).toLocaleString() : "—", "m²"],
                ].map(([v, u], i) => (
                  <div key={i} style={S.areaCell}>
                    <span style={S.areaCellNum}>{v}</span>
                    <span style={S.areaCellUnit}>{u}</span>
                  </div>
                ))}
              </div>
            </div>

            {[
              { key: "land_name",    label: "জমির নাম (ইংরেজি) *", ph: "North Field" },
              { key: "land_name_bn", label: "জমির নাম (বাংলা)",    ph: "উত্তর মাঠ"  },
              { key: "notes_bn",     label: "নোট",                 ph: "মাটির অবস্থা..." },
            ].map(({ key, label, ph }) => (
              <div key={key} style={S.field}>
                <label style={S.label}>{label}</label>
                <input style={S.input} placeholder={ph}
                  value={landForm[key as keyof LandForm]}
                  onChange={e => setLandForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}

            <div style={S.field}>
              <label style={S.label}>ফসলের ধরন</label>
              <select style={S.input} value={landForm.crop_id}
                onChange={e => setLandForm(f => ({ ...f, crop_id: e.target.value }))}>
                <option value="">— নির্বাচন করুন —</option>
                {CROPS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* DB INSERT preview (dev) */}
            <div style={S.dbPreview}>
              <span style={{ fontSize: 10, color: "#7d8590" }}>INSERT preview</span>
              <code style={{ fontSize: 9, color: "#7d8590", display: "block", marginTop: 4, lineHeight: 1.8 }}>
                zone_id = <span style={{ color: landForm.zone_id ? "#3fb950" : "#ef4444" }}>
                  {landForm.zone_id || "NULL ← GPS বা ম্যানুয়াল দিন"}
                </span>{"\n"}
                boundary = POLYGON({draw.coords.length} pts){"\n"}
                area_sqm, area_bigha = GENERATED
              </code>
            </div>

            <button
              style={{ ...S.btnGreen, opacity: (draw.coords.length < 3 || !landForm.land_name || saving) ? 0.4 : 1 }}
              disabled={draw.coords.length < 3 || !landForm.land_name.trim() || saving}
              onClick={saveLand}>
              {saving ? "সংরক্ষণ হচ্ছে..." : "✓ জমি সংরক্ষণ করুন"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: DIGEST ══════════════════ */}
      {tab === "digest" && (
        <div style={S.digestWrap}>
          <div style={S.statsRow}>
            {[
              { label: "মোট জমি",       val: plots.length,          unit: "টি প্লট",  color: "#3b82f6" },
              { label: "মোট আয়তন",     val: totalBigha.toFixed(2), unit: "বিঘা",     color: "#8b5cf6" },
              { label: "সক্রিয় স্প্রে", val: activeSprays,          unit: "টি জমিতে", color: "#ef4444" },
            ].map((s, i) => (
              <div key={i} style={S.statCard}>
                <div style={{ ...S.statBar, background: s.color }} />
                <div style={{ ...S.statVal, color: s.color }}>{s.val}</div>
                <div style={S.statLabel}>{s.label}</div>
                <div style={S.statUnit}>{s.unit}</div>
              </div>
            ))}
          </div>

          {riskPlots.length > 0 && (
            <div style={S.warnBox}>
              <p style={S.warnTitle}>⚠️ আপনার সক্রিয় স্প্রে সতর্কতা</p>
              {riskPlots.map(p => (
                <div key={p.land_id} style={{ ...S.warnRow, borderLeftColor: RISK[p.risk_level].fill }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: RISK[p.risk_level].fill, display: "inline-block" }} />
                    <strong>{p.land_name_bn || p.land_name}</strong>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>{p.chemical_name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                    মেয়াদ: {p.spray_expires ? new Date(p.spray_expires).toLocaleDateString("bn-BD") : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {communitySpray.length > 0 && (
            <div style={{ ...S.warnBox, borderColor: "#1d4ed8", background: "#0f172a" }}>
              <p style={{ ...S.warnTitle, color: "#93c5fd" }}>🏘️ প্রতিবেশী স্প্রে — ২ কিমি ব্যাসার্ধ</p>
              {communitySpray.slice(0, 6).map(sp => (
                <div key={sp.spray_id} style={{ ...S.warnRow, borderLeftColor: sp.risk_level === "red" ? "#ef4444" : "#f59e0b" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span><strong>{sp.land_name}</strong> — {sp.chemical_name}</span>
                    <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>{Math.round(sp.distance_m)} মি</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    {sp.chemical_type} · {sp.hours_remaining.toFixed(0)} ঘণ্টা বাকি · ব্যাসার্ধ: {sp.harm_radius_m} মি
                  </div>
                </div>
              ))}
              {communitySpray.length > 6 && (
                <p style={{ fontSize: 11, color: "#7d8590", marginTop: 6 }}>
                  + আরও {communitySpray.length - 6}টি — ম্যাপ ট্যাবে দেখুন
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div style={S.loadingBox}><div style={S.spinner} /> লোড হচ্ছে...</div>
          ) : plots.length === 0 ? (
            <div style={S.emptyBox}>
              <span style={{ fontSize: 48 }}>🗺️</span>
              <p style={{ fontSize: 16, fontWeight: 700 }}>কোনো জমি নেই</p>
              <button style={S.btnGreen} onClick={() => setTab("map")}>＋ জমি যোগ করুন</button>
            </div>
          ) : (
            <div style={S.plotGrid}>
              {plots.map(plot => {
                const cfg = RISK[plot.risk_level] ?? RISK.green;
                return (
                  <div key={plot.land_id} style={S.plotCard}>
                    <div style={{ height: 4, background: cfg.fill }} />
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{plot.land_name_bn || plot.land_name}</div>
                          {plot.land_name_bn && <div style={{ fontSize: 11, color: "#9ca3af" }}>{plot.land_name}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={S.btnSmallAmber}
                            onClick={() => { setSprayForm(f => ({ ...f, land_id: plot.land_id })); setTab("spray"); }}>
                            🧪 স্প্রে
                          </button>
                          <button style={S.btnSmallRed} onClick={() => deletePlot(plot.land_id, plot.land_name)}>✕</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                        <div><div style={S.metaKey}>আয়তন</div><div style={S.metaVal}>{toBigha(plot.area_sqm ?? 0)} বিঘা</div></div>
                        <div><div style={S.metaKey}>zone</div><div style={S.metaVal}>{plot.zone_id ?? "—"}</div></div>
                        {plot.crop_id && <div><div style={S.metaKey}>ফসল</div><div style={S.metaVal}>{CROPS.find(c => c.value === plot.crop_id)?.label ?? plot.crop_id}</div></div>}
                      </div>
                      <span style={{ ...S.riskPill, background: cfg.bg, color: cfg.stroke, border: `1px solid ${cfg.fill}` }}>
                        {cfg.label}{plot.chemical_name ? ` — ${plot.chemical_name}` : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: SPRAY ══════════════════ */}
      {tab === "spray" && (
        <div style={S.sprayWrap}>
          <p style={S.formTitle}>স্প্রে নথিভুক্ত করুন</p>

          <div style={S.field}>
            <label style={S.label}>জমি *</label>
            <select style={S.input} value={sprayForm.land_id}
              onChange={e => setSprayForm(f => ({ ...f, land_id: e.target.value }))}>
              <option value="">— জমি বেছে নিন —</option>
              {plots.map(p => (
                <option key={p.land_id} value={p.land_id}>
                  {p.land_name_bn || p.land_name} ({toBigha(p.area_sqm ?? 0)} বিঘা)
                </option>
              ))}
            </select>
          </div>

          <div style={S.field}>
            <label style={S.label}>রাসায়নিকের ধরন *</label>
            <select style={S.input} value={sprayForm.chemical_type}
              onChange={e => setSprayForm(f => ({ ...f, chemical_type: e.target.value }))}>
              {CHEM_TYPES.map(c => <option key={c.value} value={c.value}>{c.label} — {c.days} দিন</option>)}
            </select>
          </div>

          {[
            { key: "chemical_name",     label: "নাম (ইংরেজি) *", ph: "Tricyclazole 75 WP" },
            { key: "chemical_name_bn",  label: "নাম (বাংলা)",    ph: "ট্রাইসাইক্লাজল"    },
            { key: "active_ingredient", label: "সক্রিয় উপাদান", ph: "Tricyclazole 75%"   },
            { key: "dose_per_bigha",    label: "মাত্রা / বিঘা",  ph: "১ গ্রাম / লিটার"  },
            { key: "notes_bn",          label: "নোট",            ph: "কারণ..."            },
          ].map(({ key, label, ph }) => (
            <div key={key} style={S.field}>
              <label style={S.label}>{label}</label>
              <input style={S.input} placeholder={ph}
                value={sprayForm[key as keyof Pick<SprayForm, 'chemical_name' | 'chemical_name_bn' | 'chemical_type' | 'active_ingredient' | 'dose_per_bigha' | 'notes_bn'>] as string}
                onChange={e => setSprayForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}

          <div style={S.field}>
            <label style={S.label}>ক্ষতির ব্যাসার্ধ (মিটার)</label>
            <input style={S.input} type="number" min={10} max={500}
              value={sprayForm.harm_radius_m}
              onChange={e => setSprayForm(f => ({ ...f, harm_radius_m: Number(e.target.value) }))} />
            <p style={{ fontSize: 10, color: "#7d8590", marginTop: 2 }}>
              এই ব্যাসার্ধে প্রতিবেশীদের ম্যাপে সতর্কতা দেখাবে
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input type="checkbox" id="vis_nb" checked={sprayForm.visible_to_neighbors}
              onChange={e => setSprayForm(f => ({ ...f, visible_to_neighbors: e.target.checked }))} />
            <label htmlFor="vis_nb" style={{ fontSize: 13, color: "#e6edf3", cursor: "pointer" }}>
              প্রতিবেশীদের ম্যাপে দেখাবে
            </label>
          </div>

          {sprayForm.chemical_type && (
            <div style={S.expiryBox}>
              ⏱️ মেয়াদ শেষ:&nbsp;
              <strong>
                {(() => {
                  const days = CHEM_TYPES.find(c => c.value === sprayForm.chemical_type)?.days ?? 14;
                  return new Date(Date.now() + days * 86400000)
                    .toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" });
                })()}
              </strong>
            </div>
          )}

          <button
            style={{ ...S.btnGreen, opacity: (!sprayForm.land_id || !sprayForm.chemical_name || savingSpray) ? 0.4 : 1 }}
            disabled={!sprayForm.land_id || !sprayForm.chemical_name.trim() || savingSpray}
            onClick={saveSpray}>
            {savingSpray ? "নথিভুক্ত হচ্ছে..." : "✓ স্প্রে নথিভুক্ত করুন"}
          </button>
        </div>
      )}

      {/* ── Plot detail overlay ── */}
      {selectedPlot && (
        <div style={S.overlay} onClick={() => setSelectedPlot(null)}>
          <div style={S.overlayCard} onClick={e => e.stopPropagation()}>
            <button style={S.overlayClose} onClick={() => setSelectedPlot(null)}>✕</button>
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              {selectedPlot.land_name_bn || selectedPlot.land_name}
            </p>
            {[
              ["land_id",    selectedPlot.land_id.slice(0, 18) + "…"],
              ["zone_id",    selectedPlot.zone_id ?? "—"],
              ["area_sqm",   (selectedPlot.area_sqm ?? 0).toFixed(2) + " m²"],
              ["area_bigha", toBigha(selectedPlot.area_sqm ?? 0) + " বিঘা"],
              ["crop_id",    selectedPlot.crop_id ?? "—"],
              ["risk_level", selectedPlot.risk_level],
              ["spray",      selectedPlot.chemical_name ?? "none"],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #21262d", fontSize: 12 }}>
                <span style={{ color: "#f59e0b", fontFamily: "monospace" }}>{k}</span>
                <span style={{ color: "#3fb950", fontFamily: "monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root:         { background: "#0d1117", color: "#e6edf3", fontFamily: "'Noto Sans Bengali', sans-serif", fontSize: 14, minHeight: 500, borderRadius: 12, overflow: "hidden" },
  tabBar:       { display: "flex", background: "#161b22", borderBottom: "1px solid #30363d" },
  tabBtn:       { flex: 1, padding: "12px 8px", background: "transparent", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: "transparent", color: "#7d8590", cursor: "pointer", fontSize: 12, fontFamily: "'Noto Sans Bengali', sans-serif", transition: "all .15s" },
  tabBtnActive: { color: "#e6edf3", borderBottomColor: "#3fb950", background: "#0d1117" },
  alertErr:     { background: "#2d1b1b", borderBottom: "1px solid #7f1d1d", color: "#fca5a5", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 },
  alertOk:      { background: "#1a2e1a", borderBottom: "1px solid #14532d", color: "#86efac", padding: "10px 20px", fontSize: 13 },
  alertClose:   { background: "none", border: "none", color: "#fca5a5", cursor: "pointer", flexShrink: 0 },

  mapLayout:  { display: "grid", gridTemplateColumns: "1fr 340px", minHeight: 580 },
  mapPanel:   { display: "flex", flexDirection: "column", position: "relative", borderRight: "1px solid #30363d" },
  mapBar:     { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#161b22", borderBottom: "1px solid #30363d", zIndex: 10, flexWrap: "wrap", gap: 6 },
  mapBarTitle:{ fontSize: 12, fontWeight: 600 },
  mapBarTools:{ display: "flex", gap: 6 },
  drawHint:   { position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.88)", color: "#f0883e", padding: "5px 14px", borderRadius: 20, fontSize: 11, zIndex: 20, whiteSpace: "nowrap", border: "1px solid #f0883e40", backdropFilter: "blur(4px)" },
  mapDiv:     { flex: 1, minHeight: 420, zIndex: 1 },
  areaBadge:  { position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.92)", border: "1px solid #3fb950", borderRadius: 24, padding: "6px 18px", display: "flex", alignItems: "baseline", gap: 6, zIndex: 20 },
  areaBig:    { fontSize: 20, fontWeight: 800, color: "#3fb950" },
  areaUnit:   { fontSize: 12, color: "#3fb950" },
  areaSub:    { fontSize: 10, color: "#7d8590" },
  legend:     { display: "flex", gap: 12, padding: "6px 14px", background: "#161b22", borderTop: "1px solid #30363d", fontSize: 10, color: "#7d8590", flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: 4 },

  formPanel:    { padding: 16, background: "#161b22", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, maxHeight: 640 },
  formTitle:    { fontSize: 13, fontWeight: 700, borderBottom: "1px solid #30363d", paddingBottom: 6, marginBottom: 2 },

  locBlock:     { background: "#0d1117", border: "1px solid #1d4ed8", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 },
  locTitle:     { fontSize: 13, fontWeight: 700, color: "#93c5fd" },
  locSubtitle:  { fontSize: 10, color: "#7d8590", lineHeight: 1.55 },
  btnGPS:       { background: "#1d4ed8", border: "none", borderRadius: 7, color: "#fff", padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans Bengali', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
  btnConfirm:   { background: "#1f2937", border: "1px solid #3b82f6", borderRadius: 7, color: "#93c5fd", padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans Bengali', sans-serif" },
  zoneBadge:    { background: "#0d1117", borderWidth: 1, borderStyle: "solid", borderColor: "#3fb950", borderRadius: 6, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11 },
  zoneChip:     { fontFamily: "monospace", fontWeight: 700, color: "#e6edf3", background: "#21262d", padding: "2px 8px", borderRadius: 4, fontSize: 12 },
  sprayAlert:   { background: "#1c1410", border: "1px solid #92400e", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#fbbf24" },
  spinInline:   { width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTop: "2px solid #fff", borderRadius: "50%", display: "inline-block", animation: "spin .8s linear infinite" },

  areaBox:      { background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 10 },
  areaBoxLabel: { fontSize: 10, color: "#7d8590", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: ".05em" },
  areaCell:     { flex: 1, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, padding: "7px 4px", textAlign: "center" as const },
  areaCellNum:  { display: "block", fontSize: 16, fontWeight: 800, color: "#3fb950" },
  areaCellUnit: { fontSize: 10, color: "#7d8590" },

  dbPreview:    { background: "#0d1117", border: "1px dashed #30363d", borderRadius: 6, padding: "8px 10px" },
  field:        { display: "flex", flexDirection: "column", gap: 4 },
  label:        { fontSize: 10, color: "#7d8590", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".04em" },
  input:        { background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3", padding: "8px 10px", fontSize: 12, fontFamily: "'Noto Sans Bengali', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" as const },

  digestWrap:   { padding: 18, display: "flex", flexDirection: "column", gap: 14 },
  statsRow:     { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 },
  statCard:     { background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" },
  statBar:      { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  statVal:      { fontSize: 26, fontWeight: 800, marginTop: 4 },
  statLabel:    { fontSize: 11, color: "#7d8590", marginTop: 2 },
  statUnit:     { fontSize: 10, color: "#7d8590" },
  warnBox:      { background: "#1c1410", border: "1px solid #92400e", borderRadius: 10, padding: 12 },
  warnTitle:    { fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 8 },
  warnRow:      { background: "#0d1117", borderLeftWidth: 3, borderLeftStyle: "solid" as const, borderRadius: "0 6px 6px 0", padding: "7px 10px", marginBottom: 5 },
  plotGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 10 },
  plotCard:     { background: "#161b22", border: "1px solid #30363d", borderRadius: 10, overflow: "hidden" },
  metaKey:      { fontSize: 10, color: "#7d8590", textTransform: "uppercase" as const, letterSpacing: ".04em" },
  metaVal:      { fontSize: 13, fontWeight: 600 },
  riskPill:     { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, display: "inline-block" },
  btnSmallAmber:{ padding: "4px 9px", borderRadius: 5, background: "#f0883e20", border: "1px solid #f0883e50", color: "#f0883e", cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans Bengali', sans-serif" },
  btnSmallRed:  { padding: "4px 9px", borderRadius: 5, background: "#ef444420", border: "1px solid #ef444450", color: "#ef4444", cursor: "pointer", fontSize: 11 },

  sprayWrap:    { padding: 18, display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 },
  expiryBox:    { background: "#1a2e1a", border: "1px solid #14532d", borderRadius: 8, padding: "9px 12px", display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#86efac" },

  loadingBox:   { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 40, color: "#7d8590", fontSize: 13 },
  spinner:      { width: 18, height: 18, border: "2px solid #30363d", borderTop: "2px solid #3fb950", borderRadius: "50%", animation: "spin .8s linear infinite" },
  emptyBox:     { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 24px", color: "#7d8590" },

  btnAmber:     { padding: "6px 12px", borderRadius: 6, background: "#f0883e", border: "none", color: "#1c1c1c", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'Noto Sans Bengali', sans-serif" },
  btnGhost:     { padding: "6px 12px", borderRadius: 6, background: "#21262d", border: "1px solid #30363d", color: "#e6edf3", cursor: "pointer", fontSize: 12, fontFamily: "'Noto Sans Bengali', sans-serif" },
  btnRed:       { padding: "6px 12px", borderRadius: 6, background: "#2d1b1b", border: "1px solid #7f1d1d", color: "#fca5a5", cursor: "pointer", fontSize: 12, fontFamily: "'Noto Sans Bengali', sans-serif" },
  btnGreen:     { padding: "11px 0", background: "#3fb950", border: "none", borderRadius: 8, color: "#0d1117", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Noto Sans Bengali', sans-serif" },

  overlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" },
  overlayCard:  { background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: 22, minWidth: 340, maxWidth: 460, position: "relative" },
  overlayClose: { position: "absolute", top: 10, right: 10, background: "none", border: "none", color: "#7d8590", cursor: "pointer", fontSize: 15 },
};
