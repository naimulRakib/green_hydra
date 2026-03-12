import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-green-50 to-white">
      <div className="max-w-3xl text-center space-y-6">
        
        {/* Project Title */}
        <h1 className="text-5xl md:text-6xl font-extrabold text-green-800 tracking-tight">
          AgroSentinel
        </h1>
        
        {/* Subtitle / Mission Statement */}
        <p className="text-xl text-gray-600 leading-relaxed">
          পরিবেশগত দুর্যোগ (Abiotic Stress) এবং ফসলের রোগ (Biotic Disease) নির্ণয়ের সর্বাধুনিক এআই প্রযুক্তি।
        </p>
        
        {/* Call to Action Button */}
        <div className="pt-8">
          <Link 
            href="/signup" 
            className="inline-block bg-green-600 text-white px-8 py-4 rounded-full text-lg font-semibold shadow-lg hover:bg-green-700 hover:shadow-xl transition-all"
          >
            একাউন্ট তৈরি করুন (Get Started)
          </Link>
        </div>

      </div>
    </main>
  )
}