import { ImageResponse } from 'next/og'

export const size = {
  width: 2732,
  height: 2732
}

export const contentType = 'image/png'

export default function AppleSplash() {
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
          background: 'linear-gradient(160deg, #061423 0%, #0f2a3f 45%, #06b6d4 100%)',
          color: '#dff8ff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Animated background elements */}
        <div
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%)',
            borderRadius: '50%',
            top: -200,
            left: -200,
            opacity: 0.6
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 400,
            height: 400,
            background: 'radial-gradient(circle, rgba(15, 42, 63, 0.5) 0%, transparent 70%)',
            borderRadius: '50%',
            bottom: -150,
            right: -150,
            opacity: 0.4
          }}
        />

        {/* Main content */}
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
          {/* Icon */}
          <div
            style={{\n              width: 280,\n              height: 280,\n              display: 'flex',\n              alignItems: 'center',\n              justifyContent: 'center',\n              background: 'rgba(6, 182, 212, 0.2)',\n              borderRadius: 70,\n              border: '4px solid #06b6d4',\n              marginBottom: 60,\n              boxShadow: '0 20px 40px rgba(6, 182, 212, 0.2)'\n            }}\n          >\n            <div\n              style={{\n                width: 200,\n                height: 200,\n                display: 'flex',\n                alignItems: 'center',\n                justifyContent: 'center',\n                background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',\n                borderRadius: 50,\n                fontSize: 100,\n                fontWeight: 900,\n                color: '#0a0a0a',\n                letterSpacing: -4\n              }}\n            >\n              MF\n            </div>\n          </div>\n\n          {/* App name */}\n          <div\n            style={{\n              fontSize: 56,\n              fontWeight: 800,\n              color: '#dff8ff',\n              marginBottom: 20,\n              letterSpacing: 2\n            }}\n          >\n            MeuFinanceiro\n          </div>\n\n          {/* Tagline */}\n          <div\n            style={{\n              fontSize: 28,\n              color: '#b0e0e6',\n              marginBottom: 80,\n              letterSpacing: 1\n            }}\n          >\n            Seu Assistente Financeiro\n          </div>\n\n          {/* Loading indicator */}\n          <div\n            style={{\n              display: 'flex',\n              gap: 12,\n              justifyContent: 'center',\n              marginTop: 40\n            }}\n          >\n            {[...Array(3)].map((_, i) => (\n              <div\n                key={i}\n                style={{\n                  width: 12,\n                  height: 12,\n                  borderRadius: '50%',\n                  background: '#06b6d4',\n                  opacity: 0.6 + i * 0.15\n                }}\n              />\n            ))}\n          </div>\n        </div>\n      </div>\n    ),\n    size\n  )\n}
