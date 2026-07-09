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
          background: 'linear-gradient(160deg, #101b34 0%, #070f22 58%, #030712 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 88,
            border: '8px solid rgba(125, 211, 252, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 28% 18%, rgba(196,181,253,0.35), rgba(7,12,24,0.92) 58%)',
            boxShadow: '0 0 48px rgba(125, 211, 252, 0.32)'
          }}
        >
          <div
            style={{
              width: 230,
              height: 230,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FACC15',
              fontSize: 210,
              fontWeight: 900,
              lineHeight: 1,
              textShadow: '0 10px 28px rgba(250, 204, 21, 0.4), 0 0 6px rgba(255, 247, 208, 0.8)'
            }}
          >
            $
          </div>
        </div>
      </div>
    ),
    size
  )
}
