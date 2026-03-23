"use client";
/* eslint-disable react/no-unescaped-entities */

import React, { useState } from 'react';
import {
    ChevronLeft, ChevronRight, Leaf, Factory, Droplets,
    Database, Map, BrainCircuit, ShieldAlert, BadgeCheck,
    LineChart, Globe, Zap, Users, Shield, Microscope
} from 'lucide-react';

export default function AgroSentinelDeck() {
    const [currentSlide, setCurrentSlide] = useState(0);

    const nextSlide = () => setCurrentSlide((prev) => (prev === slides.length - 1 ? prev : prev + 1));
    const prevSlide = () => setCurrentSlide((prev) => (prev === 0 ? prev : prev - 1));

    const slides = [
        // Slide 1: Title
        <div key="slide-1" className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-fade-in">
            <div className="p-6 bg-green-500/20 rounded-full mb-4">
                <Leaf className="w-24 h-24 text-green-400" />
            </div>
            <h1 className="text-7xl font-extrabold tracking-tight text-white drop-shadow-lg">
                AGRI-HYDRA <span className="text-green-400">|</span> AgroSentinel
            </h1>
            <p className="text-4xl font-semibold text-gray-300 italic">"কৃষকের উকিল" (The Farmer's Advocate)</p>
            <div className="mt-12 p-6 bg-gray-800/80 rounded-2xl border border-gray-700 w-1/2">
                <h3 className="text-2xl font-bold text-green-400 mb-2">Team Green Hydra</h3>
                <p className="text-xl text-gray-300">Eco-Tech Hackathon 2026, BUET</p>
            </div>
        </div>,

        // Slide 2: The Silent Crisis
        <div key="slide-2" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-12 border-b-4 border-green-500 pb-4 inline-block w-fit">১. সমস্যার বিবরণ: নীরব সংকট</h2>
            <div className="grid grid-cols-2 gap-10 h-full">
                <div className="bg-gray-800/80 p-10 rounded-3xl border border-red-500/30 flex flex-col items-center text-center">
                    <Factory className="w-20 h-20 text-red-400 mb-6" />
                    <h3 className="text-3xl font-bold text-white mb-4">শিল্প দূষণ ও ভুল রোগ নির্ণয়</h3>
                    <p className="text-xl text-gray-300 leading-relaxed">
                        ট্যানারি, ডাইং ও ইটভাটার বিষাক্ত ধোঁয়ায় ফসলে <strong>Abiotic Stress</strong> তৈরি হয়। সাধারণ AI স্ক্যানার ও কৃষকরা একে ছত্রাকজনিত ব্লাস্ট রোগ ভেবে ভুল করে। ফলে ক্ষতিকর স্প্রে বাড়ে, অর্থ নষ্ট হয়।
                    </p>
                </div>
                <div className="bg-gray-800/80 p-10 rounded-3xl border border-orange-500/30 flex flex-col items-center text-center">
                    <ShieldAlert className="w-20 h-20 text-orange-400 mb-6" />
                    <h3 className="text-3xl font-bold text-white mb-4">ভারী ধাতু দূষণ: অদৃশ্য বিপদ</h3>
                    <p className="text-xl text-gray-300 leading-relaxed">
                        ক্রোমিয়াম, আর্সেনিক ও সীসা মাটি-পানিতে মিশে যাচ্ছে। খালি চোখে দেখা যায় না। প্রান্তিক কৃষকের কাছে Lab Test-এর সুযোগ নেই।
                    </p>
                </div>
            </div>
        </div>,

        // Slide 3: The Core Problem with Regular AI
        <div key="slide-3" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-12 border-b-4 border-green-500 pb-4 inline-block w-fit">মূল সমস্যা: শুধু Vision AI কেন ব্যর্থ?</h2>
            <div className="flex-1 flex items-center justify-center">
                <div className="grid grid-cols-3 gap-6 w-full">
                    {[
                        { icon: <Globe className="w-12 h-12 text-blue-400" />, title: "বায়ু প্রবাহ ও কারখানা", desc: "পার্শ্ববর্তী কারখানার Plume Cone" },
                        { icon: <Droplets className="w-12 h-12 text-cyan-400" />, title: "পানির উৎস", desc: "দূষিত খাল বা নদীর পানি" },
                        { icon: <Users className="w-12 h-12 text-green-400" />, title: "প্রতিবেশীর জমি", desc: "সক্রিয় কীটনাশকের প্রভাব" },
                        { icon: <Database className="w-12 h-12 text-yellow-400" />, title: "মাটির প্রোফাইল", desc: "pH এবং ভূগর্ভস্থ আর্সেনিক" },
                        { icon: <LineChart className="w-12 h-12 text-purple-400" />, title: "আবহাওয়া", desc: "সাপ্তাহিক পরিবেশ পরিবর্তন" }
                    ].map((item, i) => (
                        <div key={i} className="bg-gray-800/60 p-8 rounded-2xl flex flex-col items-center text-center border border-gray-700">
                            <div className="mb-4">{item.icon}</div>
                            <h4 className="text-2xl font-bold text-white mb-2">{item.title}</h4>
                            <p className="text-lg text-gray-400">{item.desc}</p>
                        </div>
                    ))}
                    <div className="bg-green-900/40 p-8 rounded-2xl flex flex-col items-center text-center border border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                        <BrainCircuit className="w-12 h-12 text-green-400 mb-4" />
                        <h4 className="text-2xl font-bold text-white mb-2">AgroSentinel</h4>
                        <p className="text-lg text-gray-300">সব ডেটা লেয়ার একসাথে বিশ্লেষণ করে চূড়ান্ত সিদ্ধান্ত নেয়!</p>
                    </div>
                </div>
            </div>
        </div>,

        // Slide 4: Our Solution Workflow
        <div key="slide-4" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-12 border-b-4 border-green-500 pb-4 inline-block w-fit">২. হাইব্রিড ডায়াগনস্টিক কার্যপ্রক্রিয়া</h2>
            <div className="flex flex-col space-y-6 flex-1 justify-center">
                {[
                    { step: "১", title: "Vision Gatekeeper", desc: "Gemini 3.1 Flash ছবি যাচাই করে। Irrelevant ছবি বাতিল।", color: "border-l-blue-500" },
                    { step: "২", title: "Environmental Data", desc: "GPS ও Weather Grid System থেকে ৭ দিনের ডেটা সংগ্রহ।", color: "border-l-cyan-500" },
                    { step: "৩", title: "Plume Engine (PostGIS)", desc: "১০ কিমির মধ্যে কারখানা ও Cumulative Exposure Hours গণনা।", color: "border-l-red-500" },
                    { step: "৪", title: "Survey & Neighbours", desc: "কৃষকের সার্ভে ডেটা ও প্রতিবেশীর স্প্রে হিস্ট্রি যাচাই।", color: "border-l-yellow-500" },
                    { step: "৫", title: "Community RAG", desc: "pgvector দিয়ে ৫ কিমির মধ্যে রোগের ইতিহাস Semantic Search।", color: "border-l-purple-500" },
                    { step: "৬", title: "Master Judge AI", desc: "DeepSeek R1 সব তথ্য বিশ্লেষণ করে Veto বা চূড়ান্ত সিদ্ধান্ত দেয়।", color: "border-l-green-500" }
                ].map((item, i) => (
                    <div key={i} className={`flex items-center bg-gray-800/50 p-5 rounded-r-2xl border-l-8 ${item.color} shadow-md`}>
                        <div className="text-4xl font-black text-gray-500 mr-8 w-12 text-center">{item.step}</div>
                        <div>
                            <h4 className="text-2xl font-bold text-white">{item.title}</h4>
                            <p className="text-xl text-gray-400 mt-1">{item.desc}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>,

        // Slide 5: Tech Stack
        <div key="slide-5" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-12 border-b-4 border-green-500 pb-4 inline-block w-fit">৩. সম্পূর্ণ প্রযুক্তি কাঠামো (Tech Stack)</h2>
            <div className="grid grid-cols-2 gap-8 h-full">
                <div className="bg-gray-800/80 rounded-3xl p-8 border border-gray-700">
                    <h3 className="text-3xl font-bold text-green-400 mb-6 flex items-center"><Database className="mr-3" /> Database & Backend</h3>
                    <ul className="space-y-4 text-2xl text-gray-300">
                        <li><strong className="text-white">Supabase PostgreSQL:</strong> 30+ tables, custom RPCs</li>
                        <li><strong className="text-white">PostGIS:</strong> Geography type, ST_DWithin, ST_Centroid</li>
                        <li><strong className="text-white">pgvector:</strong> Symptom embedding, Cosine distance search</li>
                        <li><strong className="text-white">Next.js App Router:</strong> Full-stack frontend & API</li>
                    </ul>
                </div>
                <div className="bg-gray-800/80 rounded-3xl p-8 border border-gray-700">
                    <h3 className="text-3xl font-bold text-blue-400 mb-6 flex items-center"><BrainCircuit className="mr-3" /> Multi-Model AI Pipeline</h3>
                    <ul className="space-y-4 text-2xl text-gray-300">
                        <li><strong className="text-white">Gemini 3.1 Flash:</strong> Vision gatekeeper & fallback</li>
                        <li><strong className="text-white">text-embedding-004:</strong> Vector generation</li>
                        <li><strong className="text-white">DeepSeek R1:</strong> Master Judge via OpenRouter</li>
                        <li><strong className="text-white">External APIs:</strong> ISRIC FAO SoilGrids, Open-Meteo</li>
                    </ul>
                </div>
            </div>
        </div>,

        // Slide 6: Heavy Metal Engine
        <div key="slide-6" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-8 border-b-4 border-green-500 pb-4 inline-block w-fit">৪. ভারী ধাতু সনাক্তকরণ (Lab-free 6 Layers)</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 flex-1">
                {[
                    { layer: "১", title: "জোন স্ট্যাটিক ডেটা", score: "২০", desc: "DoE & BAMWSP থেকে আর্সেনিক/ক্রোমিয়াম ডাটা" },
                    { layer: "২", title: "মাটির প্রোফাইল", score: "২০", desc: "কৃষকের জমির pH, পানির রং, Fish kill report" },
                    { layer: "৩", title: "স্ক্যান লগ প্রমাণ", score: "৩০", desc: "Plume score, abiotic score ও গত ৩টি স্ক্যান হিস্ট্রি" },
                    { layer: "৪", title: "সার্ভে প্রমাণ", score: "১৫", desc: "সাপ্তাহিক সার্ভে থেকে Environmental stress inference" },
                    { layer: "৫", title: "শিল্প নৈকট্য (PostGIS)", score: "১৫", desc: "ST_DWithin দিয়ে দূরত্বের উপর ভিত্তি করে স্কোরিং" },
                    { layer: "৬", title: "ISRIC FAO SoilGrids", score: "১০ (Bonus)", desc: "API থেকে Real soil pH ডাটা (Validated source)" }
                ].map((item, i) => (
                    <div key={i} className="bg-gray-800/80 p-6 rounded-2xl border border-gray-600 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-green-600 text-white font-bold py-1 px-4 rounded-bl-xl">
                            {item.score} Pt
                        </div>
                        <h4 className="text-2xl font-bold text-white mb-2 mt-4">স্তর {item.layer}: {item.title}</h4>
                        <p className="text-lg text-gray-400">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>,

        // Slide 7: B2B Data Marketplace
        <div key="slide-7" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-12 border-b-4 border-green-500 pb-4 inline-block w-fit">৬. ডেটা মার্কেটপ্লেস (B2B Model)</h2>
            <p className="text-3xl text-gray-300 mb-8 italic">"আমরা হলাম Waze of Crop Risk — কৃষক হলো Sensor Network"</p>
            <div className="grid grid-cols-2 gap-8 h-full">
                <div className="bg-gradient-to-br from-blue-900/50 to-gray-900 p-8 rounded-3xl border border-blue-500/30">
                    <Shield className="w-12 h-12 text-blue-400 mb-4" />
                    <h3 className="text-3xl font-bold text-white mb-2">১. বীমা কোম্পানি</h3>
                    <p className="text-xl text-gray-300">Fraud detection, risk verification. জমির risk score history ও plume exposure proof.</p>
                </div>
                <div className="bg-gradient-to-br from-green-900/50 to-gray-900 p-8 rounded-3xl border border-green-500/30">
                    <Map className="w-12 h-12 text-green-400 mb-4" />
                    <h3 className="text-3xl font-bold text-white mb-2">২. সরকার (DOE/DAE)</h3>
                    <p className="text-xl text-gray-300">কারখানার বিরুদ্ধে enforcement proof. Factory-wise damage map ও Heavy metal cluster.</p>
                </div>
                <div className="bg-gradient-to-br from-purple-900/50 to-gray-900 p-8 rounded-3xl border border-purple-500/30">
                    <BadgeCheck className="w-12 h-12 text-purple-400 mb-4" />
                    <h3 className="text-3xl font-bold text-white mb-2">৩. রপ্তানি কোম্পানি</h3>
                    <p className="text-xl text-gray-300">EU/USA বাজারের জন্য "Clean Zone Certification". ৮টি চেকলিস্ট মিলিয়ে certifiability score.</p>
                </div>
                <div className="bg-gradient-to-br from-orange-900/50 to-gray-900 p-8 rounded-3xl border border-orange-500/30">
                    <Microscope className="w-12 h-12 text-orange-400 mb-4" />
                    <h3 className="text-3xl font-bold text-white mb-2">৪. NGO ও গবেষক</h3>
                    <p className="text-xl text-gray-300">Ground-truth field data. Pollution vs crop yield correlation (Anonymized).</p>
                </div>
            </div>
        </div>,

        // Slide 8: Environmental & Social Impact
        <div key="slide-8" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-12 border-b-4 border-green-500 pb-4 inline-block w-fit">৭. পরিবেশ ও সামাজিক প্রভাব</h2>
            <div className="space-y-10 mt-8">
                <div className="flex items-start">
                    <Leaf className="w-16 h-16 text-green-500 mr-8 flex-shrink-0" />
                    <div>
                        <h3 className="text-3xl font-bold text-white mb-3">কীটনাশকের অপব্যবহার রোধ</h3>
                        <p className="text-2xl text-gray-300">AI যখন স্প্রে করতে নিষেধ করে, তখন প্রতিটি ক্ষেত্রে অন্তত ১-৩ বার অপ্রয়োজনীয় কীটনাশক স্প্রে বন্ধ হয়। মাটি ও পানির দূষণ কমে।</p>
                    </div>
                </div>
                <div className="flex items-start">
                    <Zap className="w-16 h-16 text-yellow-500 mr-8 flex-shrink-0" />
                    <div>
                        <h3 className="text-3xl font-bold text-white mb-3">অর্থনৈতিক সাশ্রয়</h3>
                        <p className="text-2xl text-gray-300">ভুল চিকিৎসায় এক বিঘা জমিতে কৃষকের ৩,০০০-৮,০০০ টাকা নষ্ট হয় — যা সম্পূর্ণ রোধ করা সম্ভব।</p>
                    </div>
                </div>
                <div className="flex items-start">
                    <ShieldAlert className="w-16 h-16 text-red-500 mr-8 flex-shrink-0" />
                    <div>
                        <h3 className="text-3xl font-bold text-white mb-3">Accountability Tool</h3>
                        <p className="text-2xl text-gray-300">কারখানার দূষণের বিরুদ্ধে কৃষকের হাতে concrete scientific data তুলে দেওয়া হয়। DOE-তে submit করার মতো evidence তৈরি হয়।</p>
                    </div>
                </div>
            </div>
        </div>,

        // Slide 9: Current MVP Status
        <div key="slide-9" className="flex flex-col h-full animate-fade-in">
            <h2 className="text-5xl font-bold text-white mb-10 border-b-4 border-green-500 pb-4 inline-block w-fit">৮. বর্তমান প্রোটোটাইপ (MVP) অবস্থা</h2>
            <div className="bg-gray-800/60 rounded-3xl p-10 border border-gray-700 h-full">
                <h3 className="text-3xl font-bold text-green-400 mb-8 flex items-center">
                    <BadgeCheck className="mr-4 w-10 h-10" /> সম্পূর্ণ কার্যকর ফিচারসমূহ (Locally Running)
                </h3>
                <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-2xl text-gray-300">
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> AI Scan Pipeline (৫-মডেল)</li>
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> Plume Engine (Exposure Hours)</li>
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> PostGIS Proximity Calculation</li>
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> Weekly Survey System</li>
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> Heavy Metal Engine (৬-Layer)</li>
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> Admin Data Export Panel</li>
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> Community RAG Alert System</li>
                    <li className="flex items-center"><span className="text-green-500 mr-3">✔</span> B2B REST API Endpoints</li>
                </div>
            </div>
        </div>,

        // Slide 10: Conclusion
        <div key="slide-10" className="flex flex-col items-center justify-center h-full text-center space-y-12 animate-fade-in">
            <Shield className="w-32 h-32 text-green-500" />
            <h2 className="text-6xl font-extrabold text-white leading-tight">
                AgroSentinel শুধু ফসলের রোগ নির্ণয় করে না।
            </h2>
            <p className="text-4xl text-gray-300 leading-relaxed max-w-5xl">
                এটি প্রমাণ করে — কোন কারখানার দূষণ কোন কৃষকের জমির কতটা ক্ষতি করেছে। <br /><br />
                এই প্রমাণ কৃষকের হাতে। এই প্রমাণ সরকারের হাতে। এই প্রমাণ বিচারকের সামনে।
            </p>
            <div className="mt-8 pt-8 border-t border-gray-700 w-2/3">
                <h3 className="text-3xl font-bold text-green-400">আমরা শুধু একটি অ্যাপ বানাইনি—</h3>
                <h3 className="text-4xl font-black text-white mt-4">আমরা "কৃষকের উকিল" তৈরি করেছি।</h3>
                <p className="text-xl text-gray-400 mt-8">ধন্যবাদ — Team Green Hydra | BUET</p>
            </div>
        </div>
    ];

    return (
        <div className="w-full max-w-[2560px] mx-auto aspect-[1.53] bg-slate-900 text-slate-50 font-sans relative overflow-hidden rounded-xl shadow-2xl border border-gray-800 flex flex-col">
            {/* Header / Progress bar */}
            <div className="h-2 w-full bg-gray-800 flex">
                <div
                    className="h-full bg-green-500 transition-all duration-500 ease-out"
                    style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                />
            </div>

            {/* Main Slide Content */}
            <div className="flex-1 p-16 md:p-24 relative z-10">
                {slides[currentSlide]}
            </div>

            {/* Navigation Controls */}
            <div className="absolute bottom-10 right-10 flex space-x-4 z-20">
                <button
                    onClick={prevSlide}
                    disabled={currentSlide === 0}
                    className="p-4 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-gray-600 shadow-lg"
                >
                    <ChevronLeft className="w-8 h-8 text-white" />
                </button>
                <button
                    onClick={nextSlide}
                    disabled={currentSlide === slides.length - 1}
                    className="p-4 rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.5)]"
                >
                    <ChevronRight className="w-8 h-8 text-white" />
                </button>
            </div>

            {/* Slide Counter */}
            <div className="absolute bottom-12 left-12 text-2xl font-bold text-gray-500 z-20">
                {currentSlide + 1} / {slides.length}
            </div>

            {/* Background ambient glow */}
            <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-green-900/20 blur-[150px] rounded-full z-0 pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[150px] rounded-full z-0 pointer-events-none" />
        </div>
    );
}
