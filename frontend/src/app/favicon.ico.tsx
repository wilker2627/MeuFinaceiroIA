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
          background: 'linear-gradient(145deg, #101b34 0%, #070f22 100%)',
          borderRadius: 6,
          border: '1px solid rgba(125, 211, 252, 0.85)',
          color: '#FACC15',
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1,
          textShadow: '0 3px 8px rgba(250, 204, 21, 0.45), 0 0 3px rgba(255, 247, 208, 0.8)'
        }}
      >
        $
      </div>
    ),
    size
  )
}
