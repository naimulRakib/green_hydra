"use client";
/**
 * AgroSentinel — Weekly Survey
 *
 * RPCs used (agrosentinel_weekly_survey_v2.sql):
 *   submit_weekly_survey(p_farmer_id, p_land_id, p_template_id, p_answers)
 *   get_latest_land_profile(p_farmer_id, p_land_id)
 *
 * Direct table reads:
 *   survey_templates   — fetch active templates + question_ids
 *   diagnostic_questions — fetch question text + options
 *   farmer_lands       — populate land selector
 *
 * Auth: Supabase JWT via createClient() — auth.uid() enforced server-side
 * Flow:
 *   1. Farmer picks land → sees all 5 template cards
 *   2. Picks a template → step-by-step question form
 *   3. Submit → trigger builds profile → show computed context string
 *   4. "সব সার্ভে দেখুন" → shows current week completion across templates
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "../utils/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestionOption {
  value: string;
  label_bn: string;
  signal?: string;
  inference_confidence?: number;
}

interface Question {
  question_id: string;
  question_text_bn: string;
  question_text_en: string;
  question_type: "single_select" | "multi_select";
  options: QuestionOption[];
}

interface Template {
  template_id: string;
  title_bn: string;
  description_bn: string;
  category: string;
  question_ids: string[];
}

interface LandPlot {
  land_id: string;
  land_name: string;
  land_name_bn: string | null;
  area_bigha: number;
}

interface SubmitResult {
  response_id: string;
  week_number: number;
  year: number;
  scan_context: string;
  submitted_at: string;
}

interface LandProfile {
  found: boolean;
  scan_context?: string;
  days_since_survey?: number;
  stale?: boolean;
  soil_texture?: string;
  soil_ph_status?: string;
  soil_drainage?: string;
  water_source?: string;
  current_growth_stage?: string;
  pest_pressure?: string;
  recent_smoke_exposure?: boolean;
  canal_contamination?: boolean;
  neighbor_same_problem?: boolean;
  last_updated?: string;
  last_survey_week?: number;
  message_bn?: string;
}

type ViewMode = "landing" | "survey" | "water_step" | "result" | "profile";

// ─── Category config ──────────────────────────────────────────────────────────

const CAT_CONFIG: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  soil: { emoji: "🌱", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  water: { emoji: "💧", color: "#2563eb", bg: "#eff6ff", border: "#93c5fd" },
  crop_stage: { emoji: "🌾", color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  pest: { emoji: "🐛", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  environment: { emoji: "🏭", color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
};

const STAGE_LABELS: Record<string, string> = {
  seedling: "বীজতলা",
  tillering: "কুশি",
  panicle_initiation: "থোড়",
  flowering: "ফুল",
  grain_filling: "দানা",
  mature: "পাকা",
};
const TEXTURE_LABELS: Record<string, string> = {
  clay: "এঁটেল", loam: "দোআঁশ", sandy_loam: "বেলে দোআঁশ", sandy: "বেলে",
};
const PH_COLOR: Record<string, string> = {
  Acidic: "#ef4444", Normal: "#22c55e", Alkaline: "#f59e0b", Unknown: "#9ca3af",
};

type LeafletMapLike = { remove: () => void; on: (ev: string, handler: (e: unknown) => void) => void };
type LeafletMarkerLike = { setLatLng: (latlng: [number, number]) => void };
type LeafletGlobal = {
  map: (...args: unknown[]) => LeafletMapLike;
  tileLayer: (...args: unknown[]) => { addTo: (map: unknown) => void };
  divIcon: (...args: unknown[]) => unknown;
  marker: (...args: unknown[]) => LeafletMarkerLike & { addTo: (map: unknown) => LeafletMarkerLike };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklySurvey({ farmerId }: { farmerId: string }) {
  const supabase = createClient();

  const [view, setView] = useState<ViewMode>("landing");
  const [lands, setLands] = useState<LandPlot[]>([]);
  const [selectedLand, setSelectedLand] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [step, setStep] = useState(0);       // current question index
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [profile, setProfile] = useState<LandProfile | null>(null);
  // Track which templates are already submitted this week
  const [completedThisWeek, setCompletedThisWeek] = useState<Set<string>>(new Set());

  // ─── Water source step state ────────────────────────────────────
  const [waterType, setWaterType] = useState<string>("");
  const [waterColor, setWaterColor] = useState<string>("");
  const [waterOdor, setWaterOdor] = useState(false);
  const [waterFishKill, setWaterFishKill] = useState(false);
  const [waterLat, setWaterLat] = useState<number | null>(null);
  const [waterLng, setWaterLng] = useState<number | null>(null);
  const [waterSubmitting, setWaterSubmitting] = useState(false);
  const waterMapRef = useRef<HTMLDivElement | null>(null);
  const waterLeaflet = useRef<LeafletMapLike | null>(null);
  const waterMarker = useRef<LeafletMarkerLike | null>(null);

  // ─── Fetch land list ────────────────────────────────────────────
  const fetchLands = useCallback(async () => {
    const { data } = await supabase.rpc("get_farmer_lands", { p_farmer_id: farmerId });
    const list = (data ?? []).map((p: { land_id: string; land_name: string; land_name_bn: string | null; area_bigha: number }) => ({
      land_id: p.land_id, land_name: p.land_name,
      land_name_bn: p.land_name_bn, area_bigha: p.area_bigha,
    }));
    setLands(list);
    if (list.length > 0 && !selectedLand) setSelectedLand(list[0].land_id);
  }, [farmerId]);

  // ─── Fetch active templates ─────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("survey_templates")
      .select("template_id, title_bn, description_bn, category, question_ids")
      .eq("is_active", true)
      .order("category");
    if (!err) setTemplates(data ?? []);
  }, []);

  // ─── Check which templates are already done this week ──────────
  const checkCompletion = useCallback(async (landId: string) => {
    if (!landId) return;
    const week = getISOWeek(new Date());
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from("survey_responses")
      .select("template_id")
      .eq("farmer_id", farmerId)
      .eq("land_id", landId)
      .eq("week_number", week)
      .eq("year", year);
    setCompletedThisWeek(new Set((data ?? []).map((r: { template_id: string }) => r.template_id)));
  }, [farmerId]);

  useEffect(() => {
    fetchLands();
    fetchTemplates();
  }, [fetchLands, fetchTemplates]);

  useEffect(() => {
    if (selectedLand) checkCompletion(selectedLand);
  }, [selectedLand, checkCompletion]);

  // ─── Start a template survey ────────────────────────────────────
  async function startSurvey(template: Template) {
    setLoading(true); setError(null); setAnswers({}); setStep(0);
    try {
      const { data, error: err } = await supabase
        .from("diagnostic_questions")
        .select("question_id, question_text_bn, question_text_en, question_type, options")
        .in("question_id", template.question_ids);
      if (err) throw err;

      // Sort to match template.question_ids order
      const sorted = template.question_ids
        .map(id => (data ?? []).find((q: { question_id: string; options?: unknown }) => q.question_id === id))
        .filter(Boolean)
        .map((q: { options?: unknown }) => ({
          ...q,
          ...q,
          options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
        }));
      setQuestions(sorted);
      setActiveTemplate(template);
      setView("survey");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("প্রশ্ন লোড হয়নি: " + msg);
    } finally {
      setLoading(false);
    }
  }

  // ─── Handle single/multi answer ────────────────────────────────
  function handleAnswer(qid: string, value: string, type: string) {
    if (type === "single_select") {
      setAnswers(a => ({ ...a, [qid]: value }));
    } else {
      // multi_select: toggle
      setAnswers(a => {
        const prev = (a[qid] as string[] | undefined) ?? [];
        if (value === "none") return { ...a, [qid]: ["none"] };
        const without = prev.filter(v => v !== "none");
        const next = without.includes(value)
          ? without.filter(v => v !== value)
          : [...without, value];
        return { ...a, [qid]: next };
      });
    }
  }

  function currentAnswered(): boolean {
    const q = questions[step];
    if (!q) return false;
    const ans = answers[q.question_id];
    if (q.question_type === "single_select") return !!ans;
    return Array.isArray(ans) && ans.length > 0;
  }

  // ─── Submit survey ──────────────────────────────────────────────
  async function submitSurvey() {
    if (!activeTemplate || !selectedLand) return;
    setSubmitting(true); setError(null);
    try {
      // Convert multi_select arrays to JSON arrays in answers object
      const finalAnswers: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(answers)) {
        finalAnswers[k] = Array.isArray(v) ? v : v;
      }

      const { data, error: rpcErr } = await supabase.rpc("submit_weekly_survey", {
        p_farmer_id: farmerId,
        p_land_id: selectedLand,
        p_template_id: activeTemplate.template_id,
        p_answers: finalAnswers,
      });
      if (rpcErr) throw rpcErr;

      setSubmitResult(data as SubmitResult);
      setCompletedThisWeek(prev => new Set([...prev, activeTemplate.template_id]));
      // Go to water step before showing result
      setWaterType(""); setWaterColor(""); setWaterOdor(false);
      setWaterFishKill(false); setWaterLat(null); setWaterLng(null);
      setView("water_step");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("জমা দেওয়া ব্যর্থ: " + msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Load land profile ──────────────────────────────────────────
  async function loadProfile() {
    if (!selectedLand) return;
    setLoading(true); setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_latest_land_profile", {
        p_farmer_id: farmerId,
        p_land_id: selectedLand,
      });
      if (rpcErr) throw rpcErr;
      setProfile(data as LandProfile);
      setView("profile");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("প্রোফাইল লোড হয়নি: " + msg);
    } finally {
      setLoading(false);
    }
  }

  const currentQ = questions[step];
  const doneCount = completedThisWeek.size;
  const totalCount = templates.length;

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <p style={S.headerTitle}>সাপ্তাহিক মাঠ সার্ভে</p>
          <p style={S.headerSub}>
            {getISOWeek(new Date())} নং সপ্তাহ, {new Date().getFullYear()}
            {doneCount > 0 && ` · ${doneCount}/${totalCount} সম্পন্ন`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "landing" && (
            <button style={S.btnBack}
              onClick={() => { setView("landing"); setActiveTemplate(null); setError(null); }}>
              ← ফিরে যান
            </button>
          )}
          <button style={S.btnProfile} onClick={loadProfile}>
            📊 প্রোফাইল
          </button>
        </div>
      </div>

      {error && (
        <div style={S.alertErr}>{error}
          <button style={S.alertClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Land selector (always visible) ── */}
      {lands.length > 0 && view !== "profile" && (
        <div style={S.landBar}>
          <span style={S.landBarLabel}>জমি:</span>
          <div style={S.landTabs}>
            {lands.map(l => (
              <button
                key={l.land_id}
                style={{ ...S.landTab, ...(selectedLand === l.land_id ? S.landTabActive : {}) }}
                onClick={() => { setSelectedLand(l.land_id); setView("landing"); }}
              >
                {l.land_name_bn || l.land_name}
                <span style={S.landTabArea}>{l.area_bigha?.toFixed(1)} বিঘা</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {lands.length === 0 && view !== "profile" && (
        <div style={S.noLand}>
          🗺️ আগে জমি নিবন্ধন করুন, তারপর সার্ভে করা যাবে।
        </div>
      )}

      {/* ════ VIEW: LANDING — template cards ════ */}
      {view === "landing" && lands.length > 0 && (
        <div style={S.landingWrap}>
          <p style={S.landingHint}>
            কোন বিষয়ে সার্ভে করতে চান? প্রতিটি সার্ভে স্বাধীনভাবে জমা দেওয়া যাবে।
          </p>

          <div style={S.templateGrid}>
            {templates.map(t => {
              const cfg = CAT_CONFIG[t.category] ?? CAT_CONFIG.soil;
              const done = completedThisWeek.has(t.template_id);
              return (
                <button
                  key={t.template_id}
                  style={{
                    ...S.templateCard,
                    borderColor: done ? cfg.border : "#e5e7eb",
                    background: done ? cfg.bg : "#fff",
                    opacity: loading ? 0.6 : 1,
                  }}
                  onClick={() => startSurvey(t)}
                  disabled={loading}
                >
                  <div style={S.templateTop}>
                    <span style={S.templateEmoji}>{cfg.emoji}</span>
                    {done && <span style={{ ...S.doneBadge, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>✓ সম্পন্ন</span>}
                  </div>
                  <p style={{ ...S.templateTitle, color: cfg.color }}>{t.title_bn}</p>
                  <p style={S.templateDesc}>{t.description_bn}</p>
                  <div style={S.templateMeta}>
                    {t.question_ids.length} টি প্রশ্ন
                    {done ? " · পুনরায় জমা দেওয়া যাবে" : ""}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Weekly progress bar */}
          {totalCount > 0 && (
            <div style={S.progressWrap}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={S.progressLabel}>এই সপ্তাহের অগ্রগতি</span>
                <span style={S.progressLabel}>{doneCount}/{totalCount}</span>
              </div>
              <div style={S.progressTrack}>
                <div style={{ ...S.progressFill, width: `${(doneCount / totalCount) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ VIEW: SURVEY — step-by-step questions ════ */}
      {view === "survey" && activeTemplate && currentQ && (
        <div style={S.surveyWrap}>

          {/* Progress bar */}
          <div style={S.surveyProgress}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={S.progressLabel}>{activeTemplate.title_bn}</span>
              <span style={S.progressLabel}>{step + 1} / {questions.length}</span>
            </div>
            <div style={S.progressTrack}>
              <div style={{ ...S.progressFill, width: `${((step + 1) / questions.length) * 100}%` }} />
            </div>
          </div>

          {/* Question */}
          <div style={S.questionCard}>
            <div style={S.questionNum}>প্রশ্ন {step + 1}</div>
            <p style={S.questionText}>{currentQ.question_text_bn}</p>
            {currentQ.question_type === "multi_select" && (
              <p style={S.multiHint}>একাধিক বেছে নিতে পারেন</p>
            )}

            <div style={S.optionList}>
              {currentQ.options.map((opt: QuestionOption) => {
                const ans = answers[currentQ.question_id];
                const selected = currentQ.question_type === "single_select"
                  ? ans === opt.value
                  : Array.isArray(ans) && ans.includes(opt.value);

                return (
                  <button
                    key={opt.value}
                    style={{ ...S.optionBtn, ...(selected ? S.optionBtnActive : {}) }}
                    onClick={() => handleAnswer(currentQ.question_id, opt.value, currentQ.question_type)}
                  >
                    <span style={{ ...S.optionDot, ...(selected ? S.optionDotActive : {}) }}>
                      {selected ? (currentQ.question_type === "multi_select" ? "✓" : "●") : "○"}
                    </span>
                    {opt.label_bn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div style={S.surveyNav}>
            <button
              style={{ ...S.btnNavBack, opacity: step === 0 ? 0.4 : 1 }}
              disabled={step === 0}
              onClick={() => setStep(s => s - 1)}
            >
              ← পূর্ববর্তী
            </button>

            {step < questions.length - 1 ? (
              <button
                style={{ ...S.btnNavNext, opacity: currentAnswered() ? 1 : 0.4 }}
                disabled={!currentAnswered()}
                onClick={() => setStep(s => s + 1)}
              >
                পরবর্তী →
              </button>
            ) : (
              <button
                style={{ ...S.btnSubmit, opacity: (currentAnswered() && !submitting) ? 1 : 0.4 }}
                disabled={!currentAnswered() || submitting}
                onClick={submitSurvey}
              >
                {submitting ? "জমা হচ্ছে..." : "✓ জমা দিন"}
              </button>
            )}
          </div>

          {/* Skip unanswered warning */}
          {!currentAnswered() && (
            <p style={S.skipHint}>একটি বিকল্প বেছে নিন তারপর পরবর্তীতে যান</p>
          )}
        </div>
      )}


      {/* ════ VIEW: WATER STEP — after survey submit, before result ════ */}
      {view === "water_step" && (
        <div style={S.surveyWrap}>
          {/* Header card */}
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 10, padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", margin: 0 }}>
              💧 পানির উৎস চিহ্নিত করুন
            </p>
            <p style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>
              আপনার এলাকার পানির মান সম্পর্কে কমিউনিটিকে জানান। এটি অন্য কৃষকদের সতর্ক রাখবে।
            </p>
          </div>

          {/* Water type */}
          <div style={S.questionCard}>
            <p style={S.questionNum}>ধাপ ১ — পানির উৎসের ধরন</p>
            <p style={S.questionText}>এই জমিতে সেচের পানি কোথা থেকে আসে?</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
              {[
                { value: "river", label: "🏞️ নদী" },
                { value: "canal", label: "〰️ খাল" },
                { value: "pond", label: "🔵 পুকুর" },
                { value: "beel", label: "🌿 বিল" },
                { value: "tubewell", label: "💧 নলকূপ" },
                { value: "reservoir", label: "🌊 জলাশয়" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setWaterType(opt.value)}
                  style={{
                    padding: "10px 6px",
                    borderRadius: 10,
                    borderWidth: "1.5px",
                    borderStyle: "solid",
                    borderColor: waterType === opt.value ? "#2563eb" : "#e5e7eb",
                    background: waterType === opt.value ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: waterType === opt.value ? 700 : 400,
                    color: waterType === opt.value ? "#1d4ed8" : "#374151",
                    fontFamily: "inherit",
                    textAlign: "center",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Map picker — shown when type is selected and not tubewell */}
          {waterType && waterType !== "tubewell" && (
            <div style={S.questionCard}>
              <p style={S.questionNum}>ধাপ ২ — ম্যাপে অবস্থান চিহ্নিত করুন</p>
              <p style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>
                নিচের ম্যাপে পানির উৎসের জায়গায়{" "}
                <strong style={{ color: "#2563eb" }}>একবার ট্যাপ করুন</strong>
              </p>
              <WaterMapPicker
                mapRef={waterMapRef}
                leafletRef={waterLeaflet}
                markerRef={waterMarker}
                onPick={(lat, lng) => { setWaterLat(lat); setWaterLng(lng); }}
              />
              {waterLat && waterLng && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: "#eff6ff", borderRadius: 8, fontSize: 11, color: "#2563eb" }}>
                  ✓ অবস্থান চিহ্নিত: {waterLat.toFixed(4)}, {waterLng.toFixed(4)}
                </div>
              )}
            </div>
          )}

          {/* Tubewell note */}
          {waterType === "tubewell" && (
            <div style={{ background: "#eff6ff", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1d4ed8" }}>
              💧 নলকূপের জন্য আপনার বর্তমান খামারের অবস্থান ব্যবহার করা হবে।
            </div>
          )}

          {/* Water color */}
          {waterType && (
            <div style={S.questionCard}>
              <p style={S.questionNum}>ধাপ {waterType === "tubewell" ? "২" : "৩"} — পানির বর্তমান অবস্থা</p>
              <p style={S.questionText}>এই পানির রঙ এখন কেমন?</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                {[
                  { value: "clear", label: "✅ স্বচ্ছ — স্বাভাবিক", danger: false },
                  { value: "normal_monsoon", label: "🟫 বর্ষার স্বাভাবিক ঘোলা", danger: false },
                  { value: "brown", label: "🟤 বাদামি — সন্দেহজনক", danger: false },
                  { value: "green", label: "🟢 সবুজ — শেওলা", danger: false },
                  { value: "black", label: "⚫ কালো — বিপজ্জনক", danger: true },
                  { value: "foamy", label: "🫧 ফেনাযুক্ত — রাসায়নিক", danger: true },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWaterColor(opt.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      borderWidth: "1.5px",
                      borderStyle: "solid",
                      borderColor: waterColor === opt.value
                        ? (opt.danger ? "#dc2626" : "#2563eb")
                        : "#e5e7eb",
                      background: waterColor === opt.value
                        ? (opt.danger ? "#fef2f2" : "#eff6ff")
                        : "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: waterColor === opt.value ? 700 : 400,
                      color: waterColor === opt.value
                        ? (opt.danger ? "#dc2626" : "#1d4ed8")
                        : "#374151",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Odor */}
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f9fafb", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "#374151" }}>পানিতে দুর্গন্ধ আছে?</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {["হ্যাঁ", "না"].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setWaterOdor(opt === "হ্যাঁ")}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 20,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: waterOdor === (opt === "হ্যাঁ") ? "#f59e0b" : "#e5e7eb",
                        background: waterOdor === (opt === "হ্যাঁ") ? "#fffbeb" : "#fff",
                        color: waterOdor === (opt === "হ্যাঁ") ? "#92400e" : "#374151",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "inherit",
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fish kill */}
              <div style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                background: waterFishKill ? "#fef2f2" : "#f9fafb",
                borderRadius: 8,
                borderWidth: waterFishKill ? 1 : 0,
                borderStyle: "solid",
                borderColor: "#fca5a5",
              }}>
                <span style={{ fontSize: 13, fontWeight: waterFishKill ? 700 : 400, color: waterFishKill ? "#dc2626" : "#374151" }}>
                  🐟 কাছে মরা মাছ দেখেছেন?
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {["হ্যাঁ", "না"].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setWaterFishKill(opt === "হ্যাঁ")}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 20,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: waterFishKill === (opt === "হ্যাঁ") ? "#dc2626" : "#e5e7eb",
                        background: waterFishKill === (opt === "হ্যাঁ") ? "#fef2f2" : "#fff",
                        color: waterFishKill === (opt === "হ্যাঁ") ? "#dc2626" : "#374151",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "inherit",
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fish kill warning */}
              {waterFishKill && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#fef2f2", borderRadius: 8, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                  ⚠️ মরা মাছের রিপোর্ট মারাত্মক দূষণের ইঙ্গিত। এই পানি ব্যবহার করবেন না।
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={{ ...S.btnOutline, flex: 1 }}
              onClick={() => setView("result")}
            >
              এখন না
            </button>
            <button
              disabled={!waterType || !waterColor || waterSubmitting}
              style={{
                ...S.btnGreen,
                flex: 1,
                opacity: (!waterType || !waterColor || waterSubmitting) ? 0.4 : 1,
                cursor: (!waterType || !waterColor) ? "not-allowed" : "pointer",
              }}
              onClick={async () => {
                if (!waterType || !waterColor) return;
                setWaterSubmitting(true);
                try {
                  await supabase.rpc("upsert_water_source", {
                    p_farmer_id: farmerId,
                    p_land_id: selectedLand,
                    p_lat: waterLat ?? 23.8103,
                    p_lng: waterLng ?? 90.4125,
                    p_type: waterType,
                    p_name_bn: null,
                    p_color: waterColor,
                    p_odor: waterOdor,
                    p_fish_kill: waterFishKill,
                  });
                } catch (e) {
                  console.error("[Water] upsert failed:", e);
                } finally {
                  setWaterSubmitting(false);
                  setView("result");
                }
              }}
            >
              {waterSubmitting ? "সংরক্ষণ হচ্ছে..." : "💧 রিপোর্ট করুন"}
            </button>
          </div>
        </div>
      )}

      {/* ════ VIEW: RESULT — after successful submit ════ */}
      {view === "result" && submitResult && (
        <div style={S.resultWrap}>
          <div style={S.resultIcon}>✅</div>
          <p style={S.resultTitle}>সার্ভে সফলভাবে জমা হয়েছে!</p>
          <p style={S.resultSub}>
            {submitResult.week_number} নং সপ্তাহ, {submitResult.year} ·
            {new Date(submitResult.submitted_at).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}
          </p>

          {/* Context string output */}
          {submitResult.scan_context && (
            <div style={S.contextBox}>
              <p style={S.contextLabel}>Scan Context String (AI-তে যাবে)</p>
              <p style={S.contextValue}>{submitResult.scan_context}</p>
              <p style={S.contextNote}>
                এই স্ট্রিং প্রতিটি স্ক্যান প্রম্পটে ইনজেক্ট হবে — Gemini মাটি, পানি, পোকা, পরিবেশের
                তথ্য জেনে আরও সঠিক রোগ নির্ণয় করবে।
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button style={S.btnGreen} onClick={() => setView("landing")}>
              আরেকটি সার্ভে করুন
            </button>
            <button style={S.btnOutline} onClick={loadProfile}>
              📊 প্রোফাইল দেখুন
            </button>
          </div>
        </div>
      )}

      {/* ════ VIEW: PROFILE — farmer_land_profile display ════ */}
      {view === "profile" && (
        <div style={S.profileWrap}>
          {loading ? (
            <div style={S.loadingBox}><div style={S.spinner} /> প্রোফাইল লোড হচ্ছে...</div>
          ) : !profile?.found ? (
            <div style={S.emptyBox}>
              <span style={{ fontSize: 40 }}>📋</span>
              <p style={{ fontWeight: 700 }}>কোনো প্রোফাইল নেই</p>
              <p style={{ fontSize: 13, color: "#9ca3af" }}>
                {profile?.message_bn ?? "এই জমির জন্য কোনো সার্ভে জমা দেওয়া হয়নি।"}
              </p>
              <button style={S.btnGreen} onClick={() => setView("landing")}>সার্ভে শুরু করুন</button>
            </div>
          ) : (
            <>
              {/* Staleness banner */}
              {profile.stale && (
                <div style={S.staleBanner}>
                  ⚠️ এই প্রোফাইল {profile.days_since_survey} দিন আগের। নতুন সার্ভে দিন।
                </div>
              )}

              {/* Context string for developer view */}
              {profile.scan_context && (
                <div style={S.contextBox}>
                  <p style={S.contextLabel}>Scan Context ({profile.days_since_survey ?? 0} দিন আগের)</p>
                  <p style={S.contextValue}>{profile.scan_context}</p>
                </div>
              )}

              {/* Profile cards */}
              <div style={S.profileGrid}>
                {([
                  {
                    icon: "🌱", title: "মাটি", items: [
                      ["গঠন", TEXTURE_LABELS[profile.soil_texture ?? ""] ?? profile.soil_texture ?? "—"],
                      ["pH", profile.soil_ph_status ?? "—"],
                      ["নিষ্কাশন", profile.soil_drainage ?? "—"],
                    ]
                  },
                  {
                    icon: "💧", title: "পানি", items: [
                      ["উৎস", profile.water_source ?? "—"],
                      ["আর্সেনিক ঝুঁকি", profile.water_source === "shallow_tubewell" ? "হ্যাঁ" : "না"],
                    ]
                  },
                  {
                    icon: "🌾", title: "ফসল", items: [
                      ["ধাপ", STAGE_LABELS[profile.current_growth_stage ?? ""] ?? profile.current_growth_stage ?? "—"],
                    ]
                  },
                  {
                    icon: "🐛", title: "পোকা", items: [
                      ["চাপ", profile.pest_pressure ?? "—"],
                    ]
                  },
                  {
                    icon: "🏭", title: "পরিবেশ", items: [
                      ["ধোঁয়া", profile.recent_smoke_exposure ? "আছে" : "নেই"],
                      ["খালে দূষণ", profile.canal_contamination ? "হ্যাঁ" : "না"],
                      ["প্রতিবেশী", profile.neighbor_same_problem ? "একই সমস্যা" : "আলাদা"],
                    ]
                  },
                ] as { icon: string; title: string; items: [string, string][] }[]).map(({ icon, title, items }) => (
                  <div key={title} style={S.profileCard}>
                    <p style={S.profileCardTitle}>{icon} {title}</p>
                    {items.map(([k, v]) => (
                      <div key={k} style={S.profileRow}>
                        <span style={S.profileKey}>{k}</span>
                        <span style={{
                          ...S.profileVal,
                          ...(k === "pH" ? { color: PH_COLOR[v] ?? "#374151" } : {}),
                        }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {profile.last_updated && (
                <p style={S.lastUpdated}>
                  সর্বশেষ আপডেট: {new Date(profile.last_updated).toLocaleString("bn-BD")}
                  {profile.last_survey_week && ` · সপ্তাহ ${profile.last_survey_week}`}
                </p>
              )}

              <button style={{ ...S.btnGreen, marginTop: 8 }} onClick={() => setView("landing")}>
                নতুন সার্ভে করুন
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ─── WaterMapPicker — inline Leaflet map for water source pinning ──────────────
interface WaterMapPickerProps {
  mapRef: React.RefObject<HTMLDivElement | null>;
  leafletRef: React.MutableRefObject<{ remove: () => void; on: (ev: string, handler: (e: unknown) => void) => void } | null>;
  markerRef: React.MutableRefObject<{ setLatLng: (latlng: [number, number]) => void } | null>;
  onPick: (lat: number, lng: number) => void;
}

function WaterMapPicker({ mapRef, leafletRef, markerRef, onPick }: WaterMapPickerProps) {
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    function init() {
      const L = (window as unknown as { L?: LeafletGlobal }).L;
      if (!L || !mapRef.current) return;

      // Try to get farmer GPS from localStorage (set during onboarding)
      let centerLat = 23.8103;
      let centerLng = 90.4125;
      try {
        const stored = localStorage.getItem("farmer_location");
        if (stored) {
          const loc = JSON.parse(stored);
          if (loc.lat && loc.lng) { centerLat = loc.lat; centerLng = loc.lng; }
        }
      } catch { }

      const map = L.map(mapRef.current, {
        center: [centerLat, centerLng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      const waterIcon = L.divIcon({
        html: `<div style="width:28px;height:28px;background:#2563eb;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(37,99,235,0.5)"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        className: "",
      });

      map.on("click", (e: unknown) => {
        const latlng = (e as { latlng?: { lat: number; lng: number } })?.latlng;
        if (!latlng) return;
        const { lat, lng } = latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: waterIcon }).addTo(map);
        }
        onPick(lat, lng);
      });

      leafletRef.current = map;
    }

    // Load Leaflet if not already on page
    if ((window as unknown as { L?: LeafletGlobal }).L) {
      init();
    } else {
      if (!document.querySelector("#leaflet-css-water")) {
        const link = document.createElement("link");
        link.id = "leaflet-css-water";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = init;
      document.head.appendChild(script);
    }

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: 200,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #e5e7eb",
      }}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const tmp = new Date(date.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: { background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb", fontFamily: "'Noto Sans Bengali', 'Hind Siliguri', sans-serif", fontSize: 14 },
  header: { background: "linear-gradient(135deg, #166534 0%, #15803d 100%)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-.3px" },
  headerSub: { fontSize: 12, color: "#bbf7d0", marginTop: 2 },
  alertErr: { background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#dc2626", padding: "10px 20px", display: "flex", justifyContent: "space-between", fontSize: 13 },
  alertClose: { background: "none", border: "none", color: "#dc2626", cursor: "pointer" },

  landBar: { display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" },
  landBarLabel: { fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0 },
  landTabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  landTab: { padding: "5px 12px", borderRadius: 20, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 },
  landTabActive: { background: "#166534", borderColor: "#166534", color: "#fff" },
  landTabArea: { fontSize: 10, opacity: 0.7 },
  noLand: { padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 },

  landingWrap: { padding: 20 },
  landingHint: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  templateGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 },
  templateCard: { background: "#fff", border: "2px solid", borderRadius: 12, padding: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all .15s", display: "flex", flexDirection: "column", gap: 4 },
  templateTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  templateEmoji: { fontSize: 24 },
  doneBadge: { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 },
  templateTitle: { fontSize: 14, fontWeight: 700, margin: 0 },
  templateDesc: { fontSize: 11, color: "#6b7280", margin: 0 },
  templateMeta: { fontSize: 10, color: "#9ca3af", marginTop: 4 },

  progressWrap: { marginTop: 20, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 },
  progressLabel: { fontSize: 12, color: "#6b7280" },
  progressTrack: { background: "#e5e7eb", borderRadius: 99, height: 8, overflow: "hidden" },
  progressFill: { background: "linear-gradient(90deg, #16a34a, #22c55e)", borderRadius: 99, height: "100%", transition: "width .3s ease" },

  surveyWrap: { padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  surveyProgress: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 14 },
  questionCard: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 },
  questionNum: { fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 },
  questionText: { fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6, lineHeight: 1.5 },
  multiHint: { fontSize: 11, color: "#9ca3af", marginBottom: 12 },
  optionList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 },
  optionBtn: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, borderWidth: "1.5px", borderStyle: "solid", borderColor: "#e5e7eb", background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 13, color: "#374151", transition: "all .12s", lineHeight: 1.5 },
  optionBtnActive: { borderColor: "#16a34a", background: "#f0fdf4", color: "#166534" },
  optionDot: { fontSize: 14, color: "#9ca3af", flexShrink: 0, marginTop: 1, fontWeight: 700 },
  optionDotActive: { color: "#16a34a" },

  surveyNav: { display: "flex", justifyContent: "space-between", gap: 10 },
  btnNavBack: { padding: "10px 20px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  btnNavNext: { padding: "10px 24px", borderRadius: 8, border: "none", background: "#166534", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  btnSubmit: { padding: "10px 24px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  skipHint: { fontSize: 11, color: "#f59e0b", textAlign: "center" },

  resultWrap: { padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" },
  resultIcon: { fontSize: 48 },
  resultTitle: { fontSize: 18, fontWeight: 800, color: "#166534" },
  resultSub: { fontSize: 12, color: "#6b7280" },
  contextBox: { background: "#0d1117", border: "1px solid #30363d", borderRadius: 10, padding: 14, width: "100%", maxWidth: 540, textAlign: "left" },
  contextLabel: { fontSize: 10, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 },
  contextValue: { fontFamily: "monospace", fontSize: 11, color: "#3fb950", wordBreak: "break-all", lineHeight: 1.7 },
  contextNote: { fontSize: 11, color: "#6b7280", marginTop: 8, lineHeight: 1.5 },

  profileWrap: { padding: 20 },
  staleBanner: { background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400e", marginBottom: 14 },
  profileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 14 },
  profileCard: { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" },
  profileCardTitle: { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 },
  profileRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12 },
  profileKey: { color: "#9ca3af" },
  profileVal: { fontWeight: 600, color: "#374151" },
  lastUpdated: { fontSize: 11, color: "#9ca3af", textAlign: "center" },

  loadingBox: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 40, color: "#6b7280", fontSize: 13 },
  spinner: { width: 18, height: 18, border: "2px solid #e5e7eb", borderTop: "2px solid #16a34a", borderRadius: "50%", animation: "spin .8s linear infinite" },
  emptyBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 24px", color: "#6b7280" },

  btnGreen: { padding: "10px 22px", background: "#166534", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnOutline: { padding: "10px 22px", background: "#fff", border: "1px solid #166534", borderRadius: 8, color: "#166534", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnBack: { padding: "6px 14px", background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 6, color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  btnProfile: { padding: "6px 14px", background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 6, color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
};