export interface ISRICSoilData {
  ph_h2o: number | null
  soil_organic_carbon: number | null
  clay_content: number | null
  data_source: 'isric_soilgrids' | 'fallback'
}

/**
 * Fetches real soil data from the official ISRIC SoilGrids REST API.
 * This API is public and does not require an API key for basic bounding box queries,
 * but rate limits apply.
 *
 * @param lat Latitude of the land plot
 * @param lng Longitude of the land plot
 * @returns ISRICSoilData object containing pH, Carbon, and Clay estimates
 */
export async function fetchISRICSoilData(
  lat: number,
  lng: number
): Promise<ISRICSoilData> {
  const fallback: ISRICSoilData = {
    ph_h2o: null,
    soil_organic_carbon: null,
    clay_content: null,
    data_source: 'fallback',
  }

  try {
    // SoilGrids REST API endpoint for properties at a specific point
    // We request phh2o (pH), soc (Soil Organic Carbon), and clay
    // We look at depth 0-5cm (surface level) primarily.
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng}&lat=${lat}&property=phh2o&property=soc&property=clay&depth=0-5cm&value=mean`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      // 5 second timeout so we don't block the AI scan flow
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      console.error(`[ISRIC API] Failed to fetch soil data: ${response.statusText}`)
      return fallback
    }

    const data: unknown = await response.json()

    // Parse the SoilGrids response structure
    // Properties are arrays. We want the 'mean' value for the 0-5cm depth.
    let ph: number | null = null
    let soc: number | null = null
    let clay: number | null = null

    function isRecord(v: unknown): v is Record<string, unknown> {
      return typeof v === 'object' && v !== null
    }

    function getLayerMean(layers: unknown[], name: string): number | null {
      const layer = layers.find((l) => isRecord(l) && l['name'] === name)
      if (!layer || !isRecord(layer)) return null

      const depths = layer['depths']
      if (!Array.isArray(depths) || depths.length === 0 || !isRecord(depths[0])) return null

      const values = (depths[0] as Record<string, unknown>)['values']
      if (!isRecord(values)) return null

      const mean = values['mean']
      return typeof mean === 'number' ? mean : null
    }

    let layers: unknown[] | null = null
    if (isRecord(data)) {
      const properties = data['properties']
      if (isRecord(properties)) {
        const layersVal = properties['layers']
        if (Array.isArray(layersVal)) layers = layersVal as unknown[]
      }
    }

    if (layers) {
      // pH values in SoilGrids are multiplied by 10 (e.g., 65 means pH 6.5)
      const rawPh = getLayerMean(layers, 'phh2o')
      if (rawPh !== null) ph = rawPh / 10.0

      // SOC in dg/kg
      soc = getLayerMean(layers, 'soc')

      // Clay in g/kg
      clay = getLayerMean(layers, 'clay')
    }

    return {
      ph_h2o: ph,
      soil_organic_carbon: soc,
      clay_content: clay,
      data_source: (ph || soc || clay) ? 'isric_soilgrids' : 'fallback'
    }

  } catch (error) {
    console.error('[ISRIC API] Network exception or timeout fetching soil:', error)
    return fallback
  }
}

/**
 * Computes a risk modifier (0-10) based on soil pH.
 * Lower pH increases heavy metal mobility (higher risk).
 * Higher pH decreases mobility (lower risk).
 *
 * @param ph_h2o pH value from ISRIC SoilGrids
 * @returns Risk modifier points (0-10)
 */
export function computePhRiskModifier(ph_h2o: number | null): number {
  if (ph_h2o === null) return 0

  // pH < 5.0: Very acidic, high metal mobility
  if (ph_h2o < 5.0) return 10
  // pH 5.0-5.5: Acidic
  if (ph_h2o < 5.5) return 7
  // pH 5.5-6.0: Slightly acidic
  if (ph_h2o < 6.0) return 4
  // pH 6.0-7.0: Neutral, low mobility
  if (ph_h2o < 7.0) return 2
  // pH 7.0-7.5: Slightly alkaline
  if (ph_h2o < 7.5) return 1
  // pH >= 7.5: Alkaline, metals less mobile but may precipitate
  return 3
}

/**
 * Returns a Bangla explanation of metal mobility based on pH.
 *
 * @param ph_h2o pH value from ISRIC SoilGrids
 * @returns Human-readable explanation in Bangla
 */
export function getMetalMobilityExplanation(ph_h2o: number | null): string {
  if (ph_h2o === null) {
    return 'মাটির pH ডেটা পাওয়া যায়নি।'
  }

  if (ph_h2o < 5.0) {
    return `ISRIC pH ${ph_h2o.toFixed(1)}: অত্যন্ত অম্লীয় মাটি — ভারী ধাতু সহজে দ্রবীভূত হয় এবং শস্যে প্রবেশ করতে পারে।`
  }
  if (ph_h2o < 5.5) {
    return `ISRIC pH ${ph_h2o.toFixed(1)}: অম্লীয় মাটি — ভারী ধাতুর গতিশীলতা বেশি।`
  }
  if (ph_h2o < 6.0) {
    return `ISRIC pH ${ph_h2o.toFixed(1)}: হালকা অম্লীয় — ধাতু গতিশীলতা মাঝারি।`
  }
  if (ph_h2o < 7.0) {
    return `ISRIC pH ${ph_h2o.toFixed(1)}: নিরপেক্ষ মাটি — ভারী ধাতু কম গতিশীল।`
  }
  if (ph_h2o < 7.5) {
    return `ISRIC pH ${ph_h2o.toFixed(1)}: হালকা ক্ষারীয় — ধাতু সাধারণত স্থির থাকে।`
  }
  return `ISRIC pH ${ph_h2o.toFixed(1)}: ক্ষারীয় মাটি — ধাতু অধঃক্ষেপিত হতে পারে তবে আর্সেনিক ঝুঁকি বাড়তে পারে।`
}
