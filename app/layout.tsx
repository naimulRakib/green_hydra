import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { createClient } from './utils/supabase/server'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'

const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' })

export const viewport: Viewport = {
  themeColor: '#0f291e',
}

export const metadata: Metadata = {
  title: 'AgroSentinel | Govt. of Bangladesh',
  description: 'Integrated agro-environmental monitoring for disease and pollution detection in Bangladesh',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans flex flex-col min-h-screen bg-neutral-50 text-neutral-900 antialiased selection:bg-emerald-900 selection:text-white`}>
        <ServiceWorkerRegister />

        {/* ── Top Bar — Govt Branding ─────────────── */}
        <div className="bg-emerald-950 text-emerald-50/80 text-[11px] py-1.5 text-center tracking-widest font-medium uppercase border-b border-emerald-900/50 shadow-sm">
          <span className="opacity-90">People&apos;s Republic of Bangladesh</span>
          <span className="mx-3 opacity-40">|</span>
          <span className="opacity-90">Agricultural & Environmental Monitoring</span>
        </div>

        {/* ── Main Header ───────────────────────────────── */}
        <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-center justify-between h-16">
              
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group outline-none">
                <div className="w-9 h-9 rounded-full bg-emerald-900 flex items-center justify-center shadow-inner ring-1 ring-emerald-950/10 group-hover:bg-emerald-800 transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-[17px] text-neutral-900 tracking-tight leading-tight group-hover:text-emerald-900 transition-colors">AgroSentinel</span>
                  <span className="text-[10px] text-neutral-500 font-semibold tracking-wider uppercase">Govt. Monitoring Portal</span>
                </div>
              </Link>

              {/* Nav */}
              <nav className="flex items-center gap-4">
                {user ? (
                  <>
                    <Link href="/dashboard" className="text-sm font-semibold text-emerald-900 hover:text-emerald-700 transition-colors">
                      Dashboard
                    </Link>
                    <div className="w-px h-4 bg-neutral-300"></div>
                    <form action="/api/auth/signout" method="POST">
                      <button type="submit" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer">
                        Sign Out
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors px-2 py-1">
                      Log In
                    </Link>
                    <Link href="/signup" className="text-sm font-semibold bg-emerald-900 text-white px-5 py-2 rounded-md hover:bg-emerald-800 transition-all shadow-sm ring-1 ring-inset ring-emerald-900/10">
                      Register Portal
                    </Link>
                  </>
                )}
              </nav>
            </div>
          </div>
        </header>

        {/* ── Page Content ──────────────────────────────── */}
        <main className="flex-1 w-full">
          {children}
        </main>

        {/* ── Footer ────────────────────────────────────── */}
        <footer className="bg-white border-t border-neutral-200 mt-auto">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Left col */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-900/10 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-emerald-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  </div>
                  <span className="font-bold text-sm text-neutral-900 tracking-tight">AgroSentinel</span>
                </div>
                <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
                  Advanced agro-environmental monitoring system for detecting crop disease and industrial pollution in peri-urban agricultural zones. An initiative for a resilient agricultural future.
                </p>
              </div>
              
              {/* Right col */}
              <div className="md:text-right space-y-1 text-xs text-neutral-500">
                <p className="font-medium text-neutral-800">NSYSS 2026 Research Project</p>
                <p>Dept. of Computer Science & Engineering, BUET</p>
                <p className="pt-2">© {new Date().getFullYear()} GreenHydra Research Group. All rights reserved.</p>
              </div>
            </div>
            
            <div className="mt-12 pt-6 border-t border-neutral-100 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-neutral-400 uppercase tracking-widest font-medium">
              <span>Classified as Research Prototype</span>
              <span>For Demonstration Purposes Only</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
