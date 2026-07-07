import { ImageResponse } from 'next/og'

export const size = {
  width: 32,
  height: 32
}

export const contentType = 'image/png'

export default function Favicon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
          borderRadius: 6,
          color: '#0a0a0a',
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: -1
        }}
      >
        MF
      </div>
    ),
    size
  )
}
