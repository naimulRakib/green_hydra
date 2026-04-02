import { http, HttpResponse } from 'msw'

export const isricHandlers = [
  http.get('https://rest.isric.org/soilgrids/v2.0/properties/query', ({ request }) => {
    const url = new URL(request.url)
    const lat = parseFloat(url.searchParams.get('lat') || '23.8')
    const lng = parseFloat(url.searchParams.get('lon') || '90.4')

    // Simulate acidic soil for Dhaka region (typical for Bangladesh)
    return HttpResponse.json({
      type: 'PropertyCollection',
      properties: {
        layers: [
          {
            name: 'phh2o',
            unit_measure: {
              d_factor: 10,
              mapped_units: 'pH * 10'
            },
            depths: [{
              label: '0-5cm',
              range: {
                top_depth: 0,
                bottom_depth: 5,
                unit_depth: 'cm'
              },
              values: {
                mean: 58, // pH 5.8 (acidic - increases heavy metal risk)
                uncertainty: 5
              }
            }]
          },
          {
            name: 'soc',
            unit_measure: {
              d_factor: 10,
              mapped_units: 'g/kg * 10'
            },
            depths: [{
              label: '0-5cm',
              values: {
                mean: 120, // 12.0 g/kg organic carbon
              }
            }]
          },
          {
            name: 'clay',
            unit_measure: {
              d_factor: 10,
              mapped_units: '% * 10'
            },
            depths: [{
              label: '0-5cm',
              values: {
                mean: 250, // 25% clay content
              }
            }]
          }
        ]
      },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat]
      }
    })
  })
]
