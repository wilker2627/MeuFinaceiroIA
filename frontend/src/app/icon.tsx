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
          background: 'linear-gradient(160deg, #061423 0%, #0f2a3f 45%, #0f5138 100%)',
          color: '#dff8ff',
          fontSize: 132,
          fontWeight: 800,
          letterSpacing: -4
        }}
      >
        MF
      </div>
    ),
    size
  )
}
