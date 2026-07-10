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
          overflow: 'hidden'
        }}
      >
        <svg width="24" height="24" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M146 70C137 62 125 57 111 57C92 57 77 69 77 85C77 99 88 107 111 113C134 118 145 126 145 140C145 156 130 168 110 168C96 168 84 163 74 154"
            stroke="#FACC15"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M111 42V184" stroke="#FACC15" strokeWidth="14" strokeLinecap="round" />
          <path d="M74 77C84 67 97 62 111 62" stroke="#FFF4BF" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size
  )
}
