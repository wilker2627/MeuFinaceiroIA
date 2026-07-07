import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MeuFinanceiro AI',
    short_name: 'MeuFinanceiro',
    description: 'App financeiro para registrar gastos e entradas manualmente',
    start_url: '/login',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#06b6d4',
    lang: 'pt-BR',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png'
      }
    ]
  }
}
