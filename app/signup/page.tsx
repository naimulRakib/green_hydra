import { signup } from '../actions/auth'
import Link from 'next/link'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center p-4 bg-[#f7f9f5]">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">নতুন একাউন্ট</h1>
          <p className="text-sm text-gray-500 mt-1">AgroSentinel-এ স্বাগতম</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          <form action={signup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">ইমেইল</label>
              <input
                name="email" type="email" required
                placeholder="farmer@example.com"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 transition-all placeholder:text-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">ফোন নম্বর</label>
              <input
                name="phone" type="tel" required
                placeholder="017XXXXXXXX"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 transition-all placeholder:text-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">পাসওয়ার্ড</label>
              <input
                name="password" type="password" required
                placeholder="কমপক্ষে ৮ অক্ষর"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 transition-all placeholder:text-gray-300"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
            >
              নিবন্ধন করুন
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          আগে থেকে একাউন্ট আছে?{' '}
          <Link href="/login" className="text-green-600 font-semibold hover:underline">
            প্রবেশ করুন
          </Link>
        </p>

      </div>
    </div>
  )
} 
