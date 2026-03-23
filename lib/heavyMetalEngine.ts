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
