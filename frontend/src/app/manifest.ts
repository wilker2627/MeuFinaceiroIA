import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MeuFinanceiro AI',
    short_name: 'MeuFinanceiro',
    description: 'Seu assistente de finanças pessoais com IA',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0a0a0a',
    theme_color: '#06b6d4',
    prefer_related_applications: false,
    lang: 'pt-BR',
    categories: ['finance', 'productivity'],
    screenshots: [
      {
        src: '/icon?v=20260709r1',
        sizes: '512x512',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Dashboard do MeuFinanceiro'
      },
      {
        src: '/icon?v=20260709r1',
        sizes: '192x192',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Dashboard do MeuFinanceiro'
      }
    ],
    icons: [
      {
        src: '/icon?v=20260709r1',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/apple-icon?v=20260709r1',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/apple-icon?v=20260709r1',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/apple-icon?v=20260709r1',
        sizes: '152x152',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  }
}
