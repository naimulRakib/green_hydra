import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { createClient } from './utils/supabase/server'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AgroSentinel | GreenHydra',
  description: 'AI-driven ecosystem analyzer for farmers in Bangladesh',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // সার্ভার সাইড থেকে ইউজারের লগইন স্ট্যাটাস চেক করা হচ্ছে
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html lang="bn">
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased flex flex-col min-h-screen`}>
        
        {/* --- Top Navigation Bar --- */}
        <header className="bg-white shadow-sm border-b border-green-100 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            
            {/* Logo / App Name */}
            <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-105">
              <span className="text-2xl font-extrabold text-green-700 tracking-tight">AgroSentinel</span>
            </Link>

            {/* Navigation Links based on Auth State */}
            <nav className="flex items-center gap-3 sm:gap-4">
              {user ? (
                <>
                  <Link 
                    href="/dashboard" 
                    className="text-sm font-semibold text-gray-700 hover:text-green-600 transition-colors"
                  >
                    ড্যাশবোর্ড
                  </Link>
                  {/* আপনি চাইলে পরবর্তীতে এখানে একটি লগআউট বাটন যোগ করতে পারেন */}
                </>
              ) : (
                <>
                  <Link 
                    href="/login" 
                    className="hidden sm:block text-sm font-semibold text-gray-600 hover:text-green-600 transition-colors"
                  >
                    প্রবেশ করুন
                  </Link>
                  <Link 
                    href="/signup" 
                    className="text-sm font-bold bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm hover:shadow transition-all"
                  >
                    একাউন্ট তৈরি
                  </Link>
                </>
              )}
            </nav>

          </div>
        </header>

        {/* --- Main Content Area --- */}
        <main className="flex-grow">
          {children}
        </main>

        {/* --- Footer Area --- */}
        <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
          <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500 font-medium">
            © {new Date().getFullYear()} AgroSentinel (GreenHydra Project). BUET CSE.
          </div>
        </footer>

      </body>
    </html>
  )
}