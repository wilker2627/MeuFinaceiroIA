import type { Metadata, Viewport } from "next";
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Geist, Geist_Mono } from "next/font/google";
import SplashScreen from '@/components/SplashScreen'
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MeuFinanceiro AI",
  description: "Seu assistente de finanças pessoais com IA",
  keywords: ['finanças', 'gastos', 'orçamento', 'IA', 'controle financeiro'],
  manifest: '/manifest.webmanifest',
  formatDetection: {
    telephone: false,
    email: false
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MeuFinanceiro AI',
    startupImage: '/apple-splash.png'
  },
  icons: {
    icon: [
      { url: '/icon?v=20260708r2', type: 'image/png' },
      { url: '/favicon.ico?v=20260708r2', type: 'image/x-icon' }
    ],
    apple: [
      { url: '/apple-icon?v=20260708r2', sizes: '180x180', type: 'image/png' },
      { url: '/apple-icon?v=20260708r2', sizes: '192x192', type: 'image/png' },
      { url: '/apple-icon?v=20260708r2', sizes: '152x152', type: 'image/png' }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: '#06b6d4',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <SplashScreen />
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
