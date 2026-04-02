import { http, HttpResponse } from 'msw'

export const openMeteoHandlers = [
  http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
    const url = new URL(request.url)
    const lat = url.searchParams.get('latitude')
    const lng = url.searchParams.get('longitude')

    return HttpResponse.json({
      latitude: parseFloat(lat || '23.8'),
      longitude: parseFloat(lng || '90.4'),
      current: {
        time: '2024-03-01T10:00',
        temperature_2m: 28.5,
        relative_humidity_2m: 75,
        precipitation: 0,
        cloud_cover: 40,
        wind_speed_10m: 12.5,
        wind_direction_10m: 45, // NE wind
      },
      hourly: {
        time: Array.from({ length: 168 }, (_, i) => `2024-03-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
        temperature_2m: Array(168).fill(28.5),
        wind_speed_10m: Array(168).fill(12.5),
        wind_direction_10m: Array(168).fill(45),
      },
      daily: {
        time: ['2024-03-01', '2024-03-02', '2024-03-03', '2024-03-04', '2024-03-05', '2024-03-06', '2024-03-07'],
        temperature_2m_max: [32, 31, 30, 31, 32, 33, 32],
        temperature_2m_min: [24, 23, 23, 24, 24, 25, 24],
        precipitation_sum: [0, 5, 0, 2, 0, 0, 3],
        wind_speed_10m_max: [15, 18, 14, 16, 15, 17, 16],
      }
    })
  })
]
