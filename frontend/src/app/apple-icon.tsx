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
          background: 'linear-gradient(160deg, #050813 0%, #090f2a 55%, #111827 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: 8
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 30% 20%, rgba(129,140,248,0.35), rgba(3,7,18,0.9) 58%)',
            borderRadius: 35,
            border: '2px solid rgba(147, 197, 253, 0.8)',
            boxShadow: '0 0 20px rgba(147, 197, 253, 0.4)',
            position: 'relative'
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 74,
              height: 52,
              borderRadius: 40,
              border: '9px solid #5eead4',
              borderTopColor: '#a5f3fc',
              borderRightColor: '#2dd4bf',
              transform: 'rotate(-28deg) translateX(-14px)',
              boxShadow: '0 0 12px rgba(45,212,191,0.35)'
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 74,
              height: 52,
              borderRadius: 40,
              border: '9px solid #93c5fd',
              borderTopColor: '#f0abfc',
              borderLeftColor: '#60a5fa',
              transform: 'rotate(28deg) translateX(14px)',
              boxShadow: '0 0 12px rgba(147,197,253,0.35)'
            }}
          />
        </div>
      </div>
    ),
    size
  )
}
