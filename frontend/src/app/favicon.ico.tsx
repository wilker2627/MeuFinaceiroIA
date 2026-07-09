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
          background: 'linear-gradient(145deg, #090f2a 0%, #111827 100%)',
          borderRadius: 6,
          border: '1px solid rgba(147, 197, 253, 0.8)',
          position: 'relative'
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 14,
            height: 9,
            borderRadius: 8,
            border: '2px solid #5eead4',
            borderTopColor: '#a5f3fc',
            borderRightColor: '#2dd4bf',
            transform: 'rotate(-28deg) translateX(-3px)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 14,
            height: 9,
            borderRadius: 8,
            border: '2px solid #93c5fd',
            borderTopColor: '#f0abfc',
            borderLeftColor: '#60a5fa',
            transform: 'rotate(28deg) translateX(3px)'
          }}
        />
      </div>
    ),
    size
  )
}
