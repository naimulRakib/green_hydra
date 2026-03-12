import { login } from '../actions/auth'
import Link from 'next/link'

export default async function LoginPage({
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">স্বাগতম ফিরে!</h1>
          <p className="text-sm text-gray-500 mt-1">আপনার একাউন্টে প্রবেশ করুন</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          <form action={login} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">ইমেইল</label>
              <input
                name="email" type="email" required
                placeholder="farmer@example.com"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 transition-all placeholder:text-gray-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">পাসওয়ার্ড</label>
              <input
                name="password" type="password" required
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 transition-all placeholder:text-gray-300"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
            >
              প্রবেশ করুন
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          একাউন্ট নেই?{' '}
          <Link href="/signup" className="text-green-600 font-semibold hover:underline">
            নতুন একাউন্ট তৈরি করুন
          </Link>
        </p>

      </div>
    </div>
  )
}
