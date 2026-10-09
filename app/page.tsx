import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* ── Hero Section ──────────────────────────────── */}
      <section className="relative bg-emerald-950 overflow-hidden pt-24 pb-32">
        {/* Subtle grid pattern for technical/gov feel */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none" 
          style={{ 
            backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
        
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-900/40 border border-emerald-400/20 text-emerald-100 text-[11px] font-bold tracking-widest uppercase mb-8 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            NSYSS 2026 — Official System
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-6 max-w-3xl">
            Integrated Agro-Environmental <br className="hidden md:block" />
            <span className="text-emerald-300">Monitoring Network</span>
          </h1>
          
          <p className="text-lg md:text-xl text-emerald-50/80 max-w-2xl leading-relaxed mb-10 font-medium">
            AgroSentinel detects crop diseases and industrial pollution in peri-urban agricultural zones of Bangladesh using multi-modal remote sensing, GIS mapping, and machine learning diagnostics.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/signup" className="inline-flex justify-center items-center px-8 py-3.5 bg-white text-emerald-950 font-bold text-sm rounded hover:bg-neutral-100 transition-colors shadow-lg">
              Initialize Portal Access
            </Link>
            <Link href="/login" className="inline-flex justify-center items-center px-8 py-3.5 bg-transparent border border-emerald-100/30 text-white font-semibold text-sm rounded hover:bg-emerald-900/50 transition-colors">
              Secure Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── Key Stats Bar ─────────────────────────────── */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-neutral-200 border-x border-neutral-200">
            {[
              { value: '3', label: 'Disease Categories Detected' },
              { value: '94.2%', label: 'Diagnostic Accuracy' },
              { value: '27', label: 'Industrial Hotspots Mapped' },
              { value: '50+', label: 'Validated Field Cases' },
            ].map((stat, idx) => (
              <div key={idx} className="p-8 flex flex-col justify-center text-center">
                <div className="text-3xl lg:text-4xl font-extrabold text-emerald-950 tracking-tight mb-2">{stat.value}</div>
                <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ─────────────────────────────── */}
      <section className="py-24 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-16 max-w-2xl">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest mb-3 border-b-2 border-emerald-700 inline-block pb-1">Core Capabilities</div>
            <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">
              Comprehensive Surveillance Parameters
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
                  </svg>
                ),
                title: 'Biotic Disease Detection',
                desc: 'Identifies fungal, bacterial, viral, and pest-induced crop stresses using image analysis and environmental context. Covers 30+ disease types across 12 major crops.'
              },
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>
                  </svg>
                ),
                title: 'Pollution & Abiotic Stress',
                desc: 'Detects heavy metal contamination (Cr, Pb, As) from tannery and garment effluents. Maps pollution plumes using wind data and NDVI suppression patterns.'
              },
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>
                  </svg>
                ),
                title: 'GIS Spatial Mapping',
                desc: 'Satellite-derived NDWI and turbidity indices overlaid with industrial zone boundaries. Visualizes contamination spread across land parcels in real time.'
              },
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>
                  </svg>
                ),
                title: 'Weekly Field Surveys',
                desc: 'Structured survey methodology capturing soil pH, water quality, pest levels, and environmental stressors. Data feeds the diagnostic model as prior context.'
              },
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/><path d="M12 10v4"/>
                  </svg>
                ),
                title: 'Water Quality Alerts',
                desc: 'Crowdsourced and satellite-verified water source monitoring. Generates risk alerts for irrigation canals, ponds, and rivers near agricultural plots.'
              },
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
                  </svg>
                ),
                title: 'Risk Prediction & Reports',
                desc: 'Crop loss estimates and risk scores derived from multi-source data fusion. Exportable reports for submission to DAE, DOE, and other government bodies.'
              },
            ].map((feat) => (
              <div key={feat.title} className="bg-white p-8 border border-neutral-200 rounded-sm shadow-sm hover:shadow-md transition-shadow group">
                <div className="w-12 h-12 bg-neutral-50 border border-neutral-100 rounded-lg flex items-center justify-center text-emerald-900 mb-6 group-hover:bg-emerald-900 group-hover:text-white transition-colors">
                  {feat.icon}
                </div>
                <h3 className="text-[17px] font-bold text-neutral-900 mb-3 tracking-tight">{feat.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed font-medium">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Research Methodology ──────────────────────── */}
      <section className="bg-white py-24 border-y border-neutral-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row gap-12 lg:gap-24">
            <div className="md:w-1/3">
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest mb-3 border-b-2 border-emerald-700 inline-block pb-1">Framework</div>
              <h2 className="text-3xl font-bold text-neutral-900 tracking-tight leading-tight">
                Research & Analytical Methodology
              </h2>
              <p className="mt-4 text-neutral-600 text-sm leading-relaxed font-medium">
                Our approach combines on-ground reality with high-altitude satellite reconnaissance, creating an immutable ledger of environmental data.
              </p>
            </div>
            
            <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-10">
              <div className="border-l-2 border-neutral-100 pl-6">
                <h3 className="font-bold text-[15px] mb-3 text-neutral-900 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-700 rounded-full"></span>
                  Study Area
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed font-medium">
                  Savar–Hemayetpur corridor, Dhaka, Bangladesh — a peri-urban zone adjacent to the Savar EPZ and Hazaribagh tannery relocation site. Characterized by high industrial effluent load and mixed smallholder agriculture.
                </p>
              </div>
              <div className="border-l-2 border-neutral-100 pl-6">
                <h3 className="font-bold text-[15px] mb-3 text-neutral-900 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-700 rounded-full"></span>
                  Validation
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed font-medium">
                  Ground-truth validation conducted with agronomist-verified scan logs. Benchmark tested across 100+ simulated cases spanning biotic disease, heavy metal toxicity, and compound stress scenarios.
                </p>
              </div>
              <div className="border-l-2 border-neutral-100 pl-6 sm:col-span-2">
                <h3 className="font-bold text-[15px] mb-3 text-neutral-900 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-700 rounded-full"></span>
                  Data Sources
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-neutral-600 font-medium font-mono text-[13px]">
                  <div className="flex items-center gap-2"><span className="text-emerald-500">▶</span> Sentinel-2 NDVI / NDWI</div>
                  <div className="flex items-center gap-2"><span className="text-emerald-500">▶</span> Open-Meteo Atmos Data</div>
                  <div className="flex items-center gap-2"><span className="text-emerald-500">▶</span> DoE Industrial Boundaries</div>
                  <div className="flex items-center gap-2"><span className="text-emerald-500">▶</span> Primary Field Surveys (N=50+)</div>
                  <div className="flex items-center gap-2"><span className="text-emerald-500">▶</span> Gemini Vision API Model</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Section ───────────────────────────────── */}
      <section className="bg-emerald-950 py-24 text-center border-t border-emerald-900">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white mb-6 tracking-tight">Access the Monitoring Dashboard</h2>
          <p className="text-emerald-50/80 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Authorized personnel and registered agricultural workers may access the portal to view live pollution maps, submit field observations, and generate diagnostic reports.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/signup" className="px-8 py-3.5 bg-white text-emerald-950 font-bold text-sm rounded shadow-lg hover:bg-neutral-100 transition-all">
              Initialize Account
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}