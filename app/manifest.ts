import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AgroSentinel',
    short_name: 'AgroSentinel',
    description: 'AI-driven ecosystem analyzer for farmers in Bangladesh',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f9f5',
    theme_color: '#16a34a',
    icons: [
      {
        src: '/icons/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icons/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  }
}
