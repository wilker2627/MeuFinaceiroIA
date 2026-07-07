import { ImageResponse } from 'next/og'

export const size = {
  width: 180,
  height: 180
}

export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          background: 'linear-gradient(160deg, #061423 0%, #0f2a3f 45%, #06b6d4 100%)',
          color: '#dff8ff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: 8
        }}
      >
        {/* Icon Background */}
        <div
          style={{
            width: 140,
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(6, 182, 212, 0.2)',
            borderRadius: 35,
            border: '2px solid #06b6d4',
            position: 'relative'
          }}
        >
          {/* Inner circle with gradient */}
          <div
            style={{
              width: 100,
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
              borderRadius: 25,
              fontSize: 50,
              fontWeight: 900,
              color: '#0a0a0a',
              letterSpacing: -2
            }}
          >
            MF
          </div>
        </div>
      </div>
    ),
    size
  )
}
