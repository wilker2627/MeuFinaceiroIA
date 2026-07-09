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
          background: 'linear-gradient(160deg, #101b34 0%, #070f22 58%, #030712 100%)',
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
            background: 'radial-gradient(circle at 30% 20%, rgba(196,181,253,0.35), rgba(3,7,18,0.9) 58%)',
            borderRadius: 35,
            border: '2px solid rgba(125, 211, 252, 0.85)',
            boxShadow: '0 0 20px rgba(125, 211, 252, 0.35)',
            color: '#FACC15',
            fontSize: 110,
            fontWeight: 900,
            lineHeight: 1,
            textShadow: '0 8px 18px rgba(250, 204, 21, 0.42), 0 0 5px rgba(255, 247, 208, 0.85)'
          }}
        >
          $
        </div>
      </div>
    ),
    size
  )
}
