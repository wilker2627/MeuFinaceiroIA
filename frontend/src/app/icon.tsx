import { ImageResponse } from 'next/og'

export const size = {
  width: 512,
  height: 512
}

export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #020617 0%, #040b24 55%, #0b1027 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 88,
            border: '8px solid rgba(147, 197, 253, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 25% 20%, rgba(99,102,241,0.35), rgba(2,6,23,0.9) 58%)',
            boxShadow: '0 0 48px rgba(99, 102, 241, 0.32)'
          }}
        >
          <div
            style={{
              width: 250,
              height: 170,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: 145,
                height: 98,
                borderRadius: 72,
                border: '16px solid #5eead4',
                borderTopColor: '#a5f3fc',
                borderRightColor: '#2dd4bf',
                transform: 'rotate(-28deg) translateX(-26px)',
                boxShadow: '0 0 20px rgba(45,212,191,0.4)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: 145,
                height: 98,
                borderRadius: 72,
                border: '16px solid #93c5fd',
                borderTopColor: '#f0abfc',
                borderLeftColor: '#60a5fa',
                transform: 'rotate(28deg) translateX(26px)',
                boxShadow: '0 0 20px rgba(147,197,253,0.35)'
              }}
            />
          </div>
        </div>
      </div>
    ),
    size
  )
}
