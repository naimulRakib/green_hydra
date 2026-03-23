export const SCAN_CONTEXT_KEYS = [
  "Soil",
  "Drain",
  "pH",
  "OM",
  "Water",
  "WaterSrc",
  "Stage",
  "Fert",
  "Pest",
  "Env",
  "Mono",
  "Yield",
  "Neighbor",
] as const;

export type ScanContextKey = (typeof SCAN_CONTEXT_KEYS)[number];
export type ScanContextMap = Record<ScanContextKey, string>;

function makeDefaultMap(): ScanContextMap {
  return SCAN_CONTEXT_KEYS.reduce((acc, k) => {
    acc[k] = "Unknown";
    return acc;
  }, {} as ScanContextMap);
}

export function parseScanContextString(input: string | null | undefined): Partial<ScanContextMap> {
  if (!input) return {};
  const out: Partial<ScanContextMap> = {};

  // Format: "Soil:loam,Drain:drains_6hrs,pH:Alkaline,..."
  for (const chunk of input.split(",")) {
    const part = chunk.trim();
    if (!part) continue;
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx) as ScanContextKey;
    if (!SCAN_CONTEXT_KEYS.includes(key)) continue;
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    out[key] = value;
  }

  return out;
}

export function buildScanContextString(map: Partial<ScanContextMap>): string {
  const base = makeDefaultMap();
  for (const key of SCAN_CONTEXT_KEYS) {
    const v = map[key];
    if (typeof v === "string" && v.trim()) base[key] = v.trim();
  }
  return SCAN_CONTEXT_KEYS.map((k) => `${k}:${base[k]}`).join(",");
}

function allowedKeysForTemplateId(templateId: string): ScanContextKey[] {
  // Hard allow-list to prevent unrelated templates from overwriting previous values.
  // We also support heuristics for future template versions.
  const t = templateId.toLowerCase();

  if (t.startsWith("soil_") || t.includes("soil")) return ["Soil", "Drain", "pH", "OM", "Fert", "Mono", "Yield"];
  if (t.startsWith("water_") || t.includes("water")) return ["Water", "WaterSrc"];
  if (t.startsWith("crop_stage_") || t.includes("crop_stage") || t.includes("stage")) return ["Stage"];
  if (t.startsWith("pest_") || t.includes("pest")) return ["Pest", "Env"];
  if (t.startsWith("environment_") || t.includes("environment")) return ["Env", "Neighbor"];

  return [];
}

export type SurveyScanRow = {
  template_id: string;
  scan_context_string: string | null;
  submitted_at?: string | null;
};

export function mergeWeeklyScanContexts(rows: SurveyScanRow[]): string {
  const merged = makeDefaultMap();
  if (!rows?.length) return buildScanContextString(merged);

  // Use latest submission per template within the week.
  const latestByTemplate = new Map<string, SurveyScanRow>();
  for (const r of rows) {
    const prev = latestByTemplate.get(r.template_id);
    const rt = r.submitted_at ? new Date(r.submitted_at).getTime() : 0;
    const pt = prev?.submitted_at ? new Date(prev.submitted_at).getTime() : 0;
    if (!prev || rt >= pt) latestByTemplate.set(r.template_id, r);
  }

  // Apply in a stable order so collisions are deterministic.
  const stable = [...latestByTemplate.values()].sort((a, b) => {
    const aa = a.template_id.toLowerCase();
    const bb = b.template_id.toLowerCase();
    const rank = (x: string) => {
      if (x.includes("soil")) return 10;
      if (x.includes("water")) return 20;
      if (x.includes("crop_stage") || x.includes("stage")) return 30;
      if (x.includes("pest")) return 40;
      if (x.includes("environment")) return 50;
      return 99;
    };
    const ra = rank(aa);
    const rb = rank(bb);
    if (ra !== rb) return ra - rb;
    return aa.localeCompare(bb);
  });

  for (const r of stable) {
    const parsed = parseScanContextString(r.scan_context_string);
    const allowed = allowedKeysForTemplateId(r.template_id);
    for (const k of allowed) {
      const v = parsed[k];
      // Only "Unknown" is treated as missing; values like "None" are meaningful.
      if (typeof v === "string" && v.trim() && v.trim() !== "Unknown") merged[k] = v.trim();
    }
  }

  return buildScanContextString(merged);
}

