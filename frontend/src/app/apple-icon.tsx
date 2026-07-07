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
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
          background: 'linear-gradient(155deg, #06273a 0%, #0b3a5c 52%, #0f7a5b 100%)',
          color: '#ecfeff',
          fontSize: 66,
          fontWeight: 800,
          letterSpacing: -2
        }}
      >
        MF
      </div>
    ),
    size
  )
}
