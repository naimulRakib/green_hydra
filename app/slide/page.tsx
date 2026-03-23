'use client'

import React, { useState } from 'react';

export default function AgriHydraPitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      id: "intro",
      title: "Introduction",
      subtitle: "Team Green Hydra | Agri-Hydra",
      content: (
        <div className="space-y-6 text-gray-800">
          <div className="bg-green-50 p-6 rounded-xl border border-green-200">
            <h3 className="text-2xl font-bold text-green-800 mb-4">Agri-Hydra: কমিউনিটি ডেটা-ড্রাইভেন এগ্রি ওয়েলফেয়ার সিস্টেম</h3>
            <p className="text-lg leading-relaxed">
              আমরা <strong>Team Green Hydra</strong>। আমরা তৈরি করেছি <strong>Agri-Hydra</strong> — এটি কৃষকদের জন্য এআই-চালিত Biotic এবং Abiotic স্ট্রেস পার্থক্যকরণের মাধ্যমে পরিবেশ পর্যবেক্ষণ ও একটি সমন্বিত কৃষি কল্যাণ ব্যবস্থা।
            </p>
          </div>
          <div className="text-center mt-8">
            <p className="text-gray-500 italic">&quot;শুধু ফসলের রোগ নির্ণয় নয়, পুরো ইকোসিস্টেম রক্ষার একটি সায়েন্টিফিক উদ্যোগ।&quot;</p>
          </div>
        </div>
      )
    },
    {
      id: "problem",
      title: "1. Problem Statement",
      subtitle: "সমস্যা ও ভুক্তভোগী",
      content: (
        <div className="space-y-4 text-gray-800 text-sm sm:text-base">
          <p>
            <strong>দেশের সামগ্রিক দূষণ:</strong> বাংলাদেশে পুরো দেশব্যাপী দূষণের <strong>৬০% অবদান</strong> যায় কৃষি জমিতে অতিরিক্ত কীটনাশক এবং রাসায়নিক সারের ব্যবহারের কারণে। এটি একই সাথে মাটি, পানি, বায়ু দূষণ এবং পুরো প্রাণিবৈচিত্র্যকে ধ্বংস করছে। 
          </p>
          <p>
            <strong>মূল সংকট (Abiotic vs Biotic):</strong> সাভার ও কেরানীগঞ্জের মতো শিল্পাঞ্চলগুলোতে কারখানা থেকে নির্গত বিষাক্ত ধোঁয়া এবং রাসায়নিক বর্জ্যের কারণে ফসলে <strong>&apos;Abiotic Stress&apos;</strong> বা পরিবেশগত ক্ষতের সৃষ্টি হয়। কিন্তু সাধারণ AI স্ক্যানার বা আমাদের কৃষকরা এই রাসায়নিক ক্ষতকে ছত্রাক বা ফাঙ্গাল ব্লাস্টের মতো রোগ ভেবে ভুল করেন।
          </p>
          <div className="bg-red-50 p-4 rounded-lg border border-red-100">
            <p className="font-semibold text-red-800">আমাদের অনন্য এপ্রোচ:</p>
            <p className="mt-2">যেকোনো সাধারণ AI শুধু একটি ছবি দেখে সমাধান দেয়। কিন্তু Agri-Hydra কৃষকের ভৌগোলিক অবস্থান, আবহাওয়া, পরিবেশ, প্রতিবেশী কৃষকের কর্মকাণ্ড এবং ইন্ডাস্ট্রিয়াল জোন বিশ্লেষণ করে। এটি একটি <strong>Data-Driven Multi-Model Diagnostic Platform</strong>, যা biotic এবং abiotic-এর বেঞ্চমার্ক রেইজড সল্যুশনে বিশ্বাসী।</p>
          </div>
        </div>
      )
    },
    {
      id: "solution",
      title: "2. Proposed Solution",
      subtitle: "আমাদের হাইব্রিড ডায়াগনস্টিক সমাধান",
      content: (
        <div className="space-y-5 text-gray-800">
          <p><strong>Meet Agri-Hydra:</strong> এটি শুধু গাছের পাতা দেখেই রোগের বিচার করে না, বরং পুরো পরিবেশকে বিশ্লেষণ করে।</p>
          <ul className="list-disc pl-5 space-y-3">
            <li><strong>হোলিস্টিক বিশ্লেষণ:</strong> ছবি আপলোডের পর সিস্টেমটি জমির সঠিক GPS লোকেশন, আশেপাশের কারখানা, বাতাসের দিক, এবং কৃষকের সাপ্তাহিক সার্ভে ডেটা মিলিয়ে দেখে।</li>
            <li><strong>প্রতিবেশী ডেটা:</strong> প্রতিবেশীর জমিতে কীটনাশক স্প্রে বা রাসায়নিক সার অ্যাক্টিভ কিনা তা দেখা হয়।</li>
            <li><strong>মাস্টার জজ AI (Veto Power):</strong> যদি দেখা যায় ফসলটি বিষাক্ত ধোঁয়ার (Toxic Plume) ভেতরে আছে, তখন আমাদের &apos;মাস্টার জাজ এআই&apos; সাধারণ রোগ নির্ণয় বাতিল করে দেয় (Veto)। এটি নির্ভুলভাবে রাসায়নিক ক্ষত শনাক্ত করে এবং কৃষককে ক্ষতিকর স্প্রে করতে কড়াভাবে নিষেধ করে।</li>
          </ul>
          <p className="bg-blue-50 p-4 rounded-lg text-blue-800 font-medium">লক্ষ্য: ভুল ফসল চাষ এড়ানো, দূষণের প্রভাব আঙুল দিয়ে দেখানো, অযথা কীটনাশকের অর্থ অপচয় রোধ, এবং যেকোনো ভাইরাল রোগের অফলাইন Zone-wise মেসেজিং ব্রডকাস্ট করা।</p>
        </div>
      )
    },
    {
      id: "tech-integration",
      title: "3. AI / Modern Tech Integration",
      subtitle: "অত্যাধুনিক মাল্টি-মডেল আর্কিটেকচার",
      content: (
        <div className="space-y-4 text-gray-800 text-sm">
          <p>আমাদের টেক-স্ট্যাক &apos;মাল্টি-মডেল এআই&apos; (Multi-model AI) নির্ভর। </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>মডেল ডিস্ট্রিবিউশন:</strong> গেটকিপিং এবং ভিশন টাস্কের জন্য <strong>Gemini 3.1 Flash</strong>, এবং &apos;মাস্টার জজ&apos; ডিসিশন মেকিংয়ের জন্য OpenRouter-এর মাধ্যমে <strong>DeepSeek</strong> ব্যবহার করছি।</li>
            <li><strong>অ্যান্টি-হ্যালুসিনেশন (Anti-Hallucination):</strong> AI-এর ভুল তথ্য দেওয়া বন্ধ করতে আমরা তৈরি করেছি একটি <strong>Man-made Researched Database</strong>। Semantic Vector Search এবং pgvector ব্যবহার করে Scan Log Cache থেকে পূর্বের রেজাল্ট মিলি-সেকেন্ডে বের করে আনি।</li>
            <li><strong>এনভায়রনমেন্ট ও ওয়েদার গ্রিড:</strong> Weather API দিয়ে গত ৭ দিনের ডেটা ফেচ করে &apos;Climate-related crop sustainability&apos; বিশ্লেষণ করা হয়।</li>
            <li><strong>স্প্যাশিয়াল ইন্টেলিজেন্স:</strong> ম্যাপে Spray Marking এবং Polluted Water Source Detection-এর মাধ্যমে ক্ষতির আসল কারণ (মাটি/পানি/বাতাস) নির্ণয়।</li>
            <li><strong>ভবিষ্যৎ পরিকল্পনা:</strong> প্রত্যন্ত অঞ্চলে ইন্টারনেট ছাড়াই সেবা দিতে <strong>CNN (Convolutional Neural Network)</strong> ইন্টিগ্রেশন।</li>
          </ul>
        </div>
      )
    },
    {
      id: "tech-stack",
      title: "Tech Stack",
      subtitle: "প্রযুক্তি স্তূপ একনজরে",
      content: (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse rounded-lg overflow-hidden shadow-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-3 border-b font-semibold">স্তর</th>
                <th className="px-4 py-3 border-b font-semibold">প্রযুক্তি</th>
              </tr>
            </thead>
            <tbody className="bg-white text-gray-800">
              <tr className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">ফ্রন্টএন্ড</td><td className="px-4 py-3">Next.js + Tailwind CSS</td></tr>
              <tr className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">ডেটাবেজ</td><td className="px-4 py-3">Supabase (PostgreSQL + PostGIS + pgvector)</td></tr>
              <tr className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">ভিশন AI</td><td className="px-4 py-3">Qwen2.5-VL / Llama-3.2-Vision (OpenRouter)</td></tr>
              <tr className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">রোগ নির্ণয় AI</td><td className="px-4 py-3">DeepSeek R1 (OpenRouter)</td></tr>
              <tr className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium text-purple-700">ফাইনাল বস</td><td className="px-4 py-3 font-bold text-purple-700">Gemini 3.1 Flash</td></tr>
              <tr className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">এম্বেডিং</td><td className="px-4 py-3">Google text-embedding-004</td></tr>
              <tr><td className="px-4 py-3 font-medium">স্টোরেজ</td><td className="px-4 py-3">Supabase Storage</td></tr>
            </tbody>
          </table>
        </div>
      )
    },
    {
      id: "features",
      title: "4. Features & Applicability",
      subtitle: "১০টি মূল ফিচার",
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-800">
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">১. AI ফসল স্ক্যান:</span> ছবি তুললেই রোগ নির্ণয় ও বন্ধুসুলভ প্রতিকার।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">২. লাইভ খামার মানচিত্র:</span> জমি, দূষণ ধোঁয়া, প্রতিবেশী স্প্রে ও দূষিত স্পট একসাথে।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">৩. শিল্প দূষণ পর্যবেক্ষণ:</span> কারখানার বিষাক্ত ধোঁয়া জমিতে আসলে সতর্কতা।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">৪. প্রতিবেশী স্প্রে ঝুঁকি:</span> কাছের জমিতে স্প্রে চললে দূরত্ব ও সময় জানায়।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">৫. সাপ্তাহিক জমি সার্ভে:</span> মাটি, পানি ও ধোঁয়ার তথ্য দিয়ে AI-কে প্রস্তুত করে।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">৬. ক্যাশ সিস্টেম:</span> আগে দেখা একই রোগের উত্তর তাৎক্ষণিক দেয়।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">৭. কমিউনিটি RAG কেস:</span> ৫ কিমির মধ্যে যাচাইকৃত স্থানীয় রোগ কেস নির্ণয়।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">৮. জমি নিবন্ধন:</span> মানচিত্রে এঁকে জমির সীমানা, ফসল ও স্প্রে রেকর্ড।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">৯. আবহাওয়া একীভূতকরণ:</span> রিয়েল-টাইম ডেটা দিয়ে ব্লাস্ট ঝুঁকি হিসাব।</div>
          <div className="bg-white p-3 rounded shadow-sm border border-gray-100"><span className="font-bold text-green-600">১০. ব্যাজ সিস্টেম:</span> নিয়মিত সার্ভে ও স্ক্যানে পয়েন্ট ও ব্যাজ অর্জন।</div>
        </div>
      )
    },
    {
      id: "business",
      title: "5 & 6. Market & Business Model",
      subtitle: "মার্কেট সাইজ এবং রেভিনিউ মডেল (B2B2C, Freemium)",
      content: (
        <div className="space-y-4 text-gray-800">
          <p><strong>মার্কেট:</strong> দ্রুত শিল্পায়নের কারণে বিশ্বজুড়ে লক্ষ লক্ষ কৃষক এই সংকটের সম্মুখীন, যা আমাদের জন্য একটি বিশাল মার্কেট। </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Freemium & B2B2C:</strong> কৃষকদের জন্য বেসিক ডায়াগনস্টিক অ্যাপটি সম্পূর্ণ ফ্রি, যার সাবসিডি দেবে এনজিও বা কৃষি সম্প্রসারণ অধিদপ্তর।</li>
            <li><strong>রেভিনিউ স্ট্রিম:</strong> আমাদের আয়ের মূল উৎস হবে <strong>&apos;প্রিমিয়াম অ্যানালিটিক্স ড্যাশবোর্ড&apos;</strong>। এটি সরকারি সংস্থা, নীতিনির্ধারক ও পরিবেশবাদী সংস্থাগুলোর কাছে সাবস্ক্রিপশন মডেলে বিক্রি হবে (রিয়েল-টাইমে শিল্প দূষণের ইমপ্যাক্ট হিটম্যাপ এবং মহামারী সতর্কতা)।</li>
            <li className="text-orange-700 font-semibold"><strong>ফেয়ার প্রাইসিং ভিশন:</strong> কৃষিতথ্য দিয়ে সিস্টেমকে প্রসিদ্ধ করে, উৎপাদিত পণ্যের পরিমাণ ও ব্যয়ভার নিকাশ করে কৃষকের দ্রব্যমূল্যের ন্যায্যতা ফিরিয়ে আনার মাধ্যমে মধ্যস্থতাকারীর (Middlemen) পদস্খলন করার ইচ্ছে আমাদের রয়েছে।</li>
          </ul>
        </div>
      )
    },
    {
      id: "impact",
      title: "7. Environmental and Social Impact",
      subtitle: "পরিবেশ ও সামাজিক প্রভাব",
      content: (
        <div className="flex flex-col md:flex-row gap-6 text-gray-800 items-center h-full">
          <div className="flex-1 space-y-4">
            <div className="bg-green-50 p-5 rounded-xl border border-green-200">
              <h4 className="font-bold text-green-800 text-lg mb-2">পরিবেশগত প্রভাব</h4>
              <p>Agri-Hydra আমাদের মাটি এবং পানিতে বিষাক্ত ছত্রাকনাশক ও কীটনাশক মেশানো সরাসরি প্রতিরোধ করে। এটি কৃষিকে ইকো-ফ্রেন্ডলি করে তোলে।</p>
            </div>
            <div className="bg-blue-50 p-5 rounded-xl border border-blue-200">
              <h4 className="font-bold text-blue-800 text-lg mb-2">সামাজিক প্রভাব</h4>
              <p>এটি প্রান্তিক কৃষকদের কষ্টার্জিত অর্থ বাঁচায় এবং কারখানার দূষণের বিরুদ্ধে জবাবদিহি করার জন্য তাদের হাতে একটি কংক্রিট, বিজ্ঞানভিত্তিক ডেটা তুলে দেয়।</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "roadmap",
      title: "8. Prototype Stage & Roadmap",
      subtitle: "বর্তমান অবস্থা ও ভবিষ্যৎ",
      content: (
        <div className="space-y-4 text-sm text-gray-800">
          <p><strong>বর্তমান অবস্থা (MVP):</strong> মূল পাইপলাইন কাজ করছে (ছবি আপলোড, AI নির্ণয়, মানচিত্র, সার্ভে)। বর্তমানে ডেভেলপার লোকালহোস্টে টেস্ট করছেন।</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 border-t-4 border-t-blue-500">
              <h4 className="font-bold mb-2">Phase 1 — Build (এখন)</h4>
              <ul className="space-y-1">
                <li>✅ ডেটাবেজ ও API সম্পন্ন</li>
                <li>✅ AI পাইপলাইন চালু</li>
                <li>✅ মানচিত্র ও সার্ভে তৈরি</li>
                <li>🔄 বাগ ফিক্স চলছে</li>
              </ul>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 border-t-4 border-t-yellow-500">
              <h4 className="font-bold mb-2">Phase 2 — Test (পরবর্তী)</h4>
              <ul className="space-y-1">
                <li>৫-১০ জন কৃষক দিয়ে পাইলট টেস্ট</li>
                <li>২-৩টি উপজেলায় ফিল্ড ট্রায়াল</li>
                <li>কৃষি বিশেষজ্ঞ দিয়ে AI যাচাই</li>
                <li>মোবাইল অ্যাপ (PWA) রূপান্তর</li>
              </ul>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 border-t-4 border-t-green-500">
              <h4 className="font-bold mb-2">Phase 3 — Scale (ভবিষ্যৎ)</h4>
              <ul className="space-y-1">
                <li>সারা বাংলাদেশে বিস্তার</li>
                <li>অ্যাডমিন প্যানেল (কৃষি অফিসার)</li>
                <li>অফলাইন মোড (CNN)</li>
                <li>সরকারি কৃষি বিভাগের সংযোগ</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "outro",
      title: "Thank You",
      subtitle: "Agri-Hydra",
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-green-700">
            &quot;Agri-Hydra শুধু ফসলের রোগ নির্ণয় করছে না; আমরা আমাদের পুরো ইকোসিস্টেমকে রক্ষা করছি।&quot;
          </h2>
          <p className="text-xl font-medium text-gray-600 mt-4">
            ধন্যবাদ সবাইকে।
          </p>
          <div className="mt-8 px-6 py-2 bg-green-600 text-white rounded-full font-semibold shadow-md">
            Team Green Hydra
          </div>
        </div>
      )
    }
  ];

  const nextSlide = () => setCurrentSlide((prev) => (prev === slides.length - 1 ? prev : prev + 1));
  const prevSlide = () => setCurrentSlide((prev) => (prev === 0 ? prev : prev - 1));

  return (
    <div className="max-w-4xl mx-auto my-8 bg-gray-50 border border-gray-200 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[600px] font-sans">
      
      {/* Header */}
      <div className="bg-green-700 text-white px-6 py-4 flex justify-between items-center shadow-md z-10">
        <div>
          <h1 className="text-xl font-bold">{slides[currentSlide].title}</h1>
          <p className="text-green-200 text-sm font-medium">{slides[currentSlide].subtitle}</p>
        </div>
        <div className="bg-green-800 px-3 py-1 rounded-full text-sm font-semibold">
          {currentSlide + 1} / {slides.length}
        </div>
      </div>

      {/* Slide Content Area */}
      <div className="flex-1 p-6 sm:p-10 overflow-y-auto bg-white relative">
        <div className="animate-fade-in transition-opacity duration-300">
          {slides[currentSlide].content}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="bg-gray-100 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
        <button
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
            currentSlide === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-200 shadow-sm border border-gray-300'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          পূর্ববর্তী
        </button>

        <div className="flex gap-1.5 hidden sm:flex">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                idx === currentSlide ? 'bg-green-600 scale-125' : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
            currentSlide === slides.length - 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 shadow-md'
          }`}
        >
          পরবর্তী
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}} />
    </div>
  );
}