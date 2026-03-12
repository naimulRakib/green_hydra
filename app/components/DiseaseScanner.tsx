"use client";

import { useState } from "react";

interface Props {
  farmerId: string;
  plots: any[];
}

export default function DiseaseScanner({ farmerId, plots }: Props) {
  const [selectedLandId, setSelectedLandId] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resultSource, setResultSource] = useState<string>("");
  const [resultContext, setResultContext] = useState<any>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setError(null);
      setBlocked(false);
    }
  };

  const convertToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload  = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
    });

  const handleScan = async () => {
    if (!image || !selectedLandId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBlocked(false);

    try {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const base64Image = await convertToBase64(image);

            const response = await fetch("/api/diagnose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imageBase64: base64Image,
                farmerId,
                landId:  selectedLandId,
                lat:     latitude,
                lng:     longitude,
              }),
            });

            const data = await response.json();

            if (!data.success) {
              if (data.blocked) {
                setBlocked(true);
                setError(data.message);
              } else {
                setError(data.message || "স্ক্যান করতে সমস্যা হয়েছে।");
              }
            } else {
              setResult(data.diagnosis);
              setResultSource(data.source ?? "");
              setResultContext(data.context ?? null);
              setSavedImageUrl(data.image_url ?? null);
            }
          } catch (innerErr) {
            setError("সার্ভারের সাথে কানেক্ট করা যাচ্ছে না।");
          } finally {
            setLoading(false);
          }
        },
        () => {
          setError("আপনার লোকেশন পাওয়া যাচ্ছে না। ম্যাপের পারমিশন দিন।");
          setLoading(false);
        }
      );
    } catch (err) {
      setError("সার্ভারের সাথে কানেক্ট করা যাচ্ছে না।");
      setLoading(false);
    }
  };

  const selectedPlot = plots.find(p => p.land_id === selectedLandId);

  return (
    <div className="p-4 border rounded-xl shadow-sm bg-white max-w-md mx-auto space-y-4">
      <h2 className="text-xl font-bold text-green-700">🌿 স্মার্ট স্ক্যানার</h2>

      {/* Land selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          কোন জমির ছবি দিচ্ছেন?
        </label>
        <select
          value={selectedLandId}
          onChange={(e) => { setSelectedLandId(e.target.value); setResult(null); setError(null); setBlocked(false); }}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500 text-sm"
        >
          <option value="">-- জমি নির্বাচন করুন --</option>
          {plots.map((plot, i) => (
            <option key={plot.land_id ?? i} value={plot.land_id}>
              {plot.land_name_bn || plot.land_name || "অজানা জমি"}
              {plot.crop_id ? ` (${plot.crop_id})` : ""}
              {" — "}{Number(plot.area_bigha ?? 0).toFixed(2)} বিঘা
            </option>
          ))}
        </select>

        {/* Survey status badge */}
        {selectedPlot && (
          <p className={`mt-1 text-xs font-semibold ${selectedPlot.last_survey_days != null && selectedPlot.last_survey_days <= 7 ? "text-green-600" : "text-amber-600"}`}>
            {selectedPlot.last_survey_days != null && selectedPlot.last_survey_days <= 7
              ? "✓ এই সপ্তাহের সার্ভে সম্পন্ন"
              : "⚠ স্ক্যানের আগে এই সপ্তাহের সার্ভে করুন"}
          </p>
        )}
      </div>

      {/* Image picker */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageChange}
        disabled={!selectedLandId}
        className="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
          file:text-sm file:font-semibold file:bg-green-50 file:text-green-700
          hover:file:bg-green-100 disabled:opacity-50"
      />

      {previewUrl && (
        <img src={previewUrl} alt="Crop Preview" className="rounded-lg max-h-48 object-cover w-full" />
      )}

      {/* Scan button */}
      <button
        onClick={handleScan}
        disabled={!image || !selectedLandId || loading}
        className={`w-full py-2 px-4 rounded-md text-white font-bold transition-colors ${
          !image || !selectedLandId || loading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {loading ? "🔍 বিশ্লেষণ করা হচ্ছে..." : "স্ক্যান করুন"}
      </button>

      {/* Survey gate block */}
      {blocked && error && (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-md border border-amber-300 text-sm">
          📋 {error}
          <a href="?tab=survey" className="block mt-2 font-bold underline text-green-700">
            → এখনই সার্ভে করুন
          </a>
        </div>
      )}

      {/* Generic error */}
      {!blocked && error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-md border border-red-200 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Result card */}
      {result && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200 space-y-3">

          {/* Saved image thumbnail from Supabase Storage */}
          {savedImageUrl && (
            <img src={savedImageUrl} alt="Scanned crop" className="rounded-lg w-full max-h-36 object-cover mb-1" />
          )}

          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-lg text-gray-800">{result.final_diagnosis}</h3>
            <span className="text-xs text-gray-400 whitespace-nowrap">{resultSource}</span>
          </div>

          {/* Type + spray badge */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
              result.disease_type === "Abiotic"
                ? "bg-orange-200 text-orange-800"
                : "bg-blue-200 text-blue-800"
            }`}>
              {result.disease_type === "Abiotic" ? "⚗️ Abiotic" : "🦠 Biotic"}
            </span>
            {result.spray_suppressed && (
              <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-200 text-red-800">
                🛑 স্প্রে নিষেধ
              </span>
            )}
            <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700">
              আত্মবিশ্বাস: {Math.round((result.confidence ?? 0) * 100)}%
            </span>
          </div>

          {/* Context pills */}
          {resultContext && (
            <div className="flex flex-wrap gap-2 text-xs">
              {resultContext.is_in_plume && (
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">🏭 প্লাম সক্রিয়</span>
              )}
              {resultContext.neighbor_sprays > 0 && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                  🏘️ {resultContext.neighbor_sprays}টি প্রতিবেশী স্প্রে
                </span>
              )}
              {resultContext.rag_cases_used > 0 && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                  🔍 {resultContext.rag_cases_used}টি স্থানীয় কেস মিলেছে
                </span>
              )}
            </div>
          )}

          {/* Reasoning */}
          <div>
            <p className="text-sm font-semibold text-gray-700">যুক্তি:</p>
            {/* FIX: was result.reasoning — route returns reasoning_bn */}
            <p className="text-sm text-gray-600">{result.reasoning_bn}</p>
          </div>

          {/* Remedy */}
          <div className="bg-white rounded-lg p-3 border border-green-100">
            <p className="text-sm font-semibold text-gray-700 mb-1">করণীয়:</p>
            {/* FIX: was result.remedy — route returns remedy_bn */}
            <p className="text-sm text-gray-600">{result.remedy_bn}</p>
          </div>

          {/* Weather context */}
          {resultContext?.weather && (
            <p className="text-xs text-gray-400">🌤 {resultContext.weather}</p>
          )}
        </div>
      )}
    </div>
  );
}