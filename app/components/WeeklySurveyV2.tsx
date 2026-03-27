"use client";
/**
 * AgroSentinel — Weekly Survey V2 (Complete Redesign)
 * 
 * New clean architecture:
 *   - Single survey per land per week (auto-merge answers)
 *   - Questions from survey_questions table
 *   - RPC: submit_survey, get_farm_profile, get_survey_questions, check_survey_status
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "../utils/supabase/client";
import WaterSourceReportStep from "./WaterSourceReportStep";
import type { WaterColor, WaterSourceType } from "@/app/types/water";

// ─── Types ────────────────────────────────────────────────────────
interface QuestionOption {
  value: string;
  label_bn: string;
  label_en?: string;
}

interface Question {
  key: string;
  category: string;
  question_bn: string;
  question_en?: string;
  type: "single" | "multi";
  options: QuestionOption[];
}

interface LandPlot {
  land_id: string;
  land_name: string;
  land_name_bn: string | null;
  area_bigha: number;
}

interface Profile {
  found: boolean;
  scan_context?: string;
  days_since_survey?: number;
  stale?: boolean;
  soil?: { texture?: string; drainage?: string; ph?: string; organic?: string };
  water?: { source?: string; color?: string; odor?: string; risk?: string };
  crop?: { stage?: string; fertilizer?: string; monoculture?: string; yield_trend?: string };
  environment?: { pest_level?: string; pests_seen?: string[]; weather?: string; smoke?: boolean };
  last_updated?: string;
  message_bn?: string;
}

// ─── Category Config ──────────────────────────────────────────────
const CATEGORIES = [
  { key: "soil", name_bn: "মাটি", emoji: "🌱", color: "#d97706", bg: "#fffbeb" },
  { key: "water", name_bn: "পানি", emoji: "💧", color: "#2563eb", bg: "#eff6ff" },
  { key: "crop", name_bn: "ফসল", emoji: "🌾", color: "#16a34a", bg: "#f0fdf4" },
  { key: "pest", name_bn: "পোকা", emoji: "🐛", color: "#dc2626", bg: "#fef2f2" },
  { key: "environment", name_bn: "পরিবেশ", emoji: "🏭", color: "#7c3aed", bg: "#f5f3ff" },
];

const RISK_COLORS: Record<string, string> = {
  Normal: "#22c55e", Acidic: "#ef4444", Alkaline: "#f59e0b",
  Clear: "#22c55e", Iron: "#f59e0b", Chemical: "#ef4444", Contaminated: "#dc2626",
  Low: "#22c55e", Medium: "#f59e0b", High: "#ef4444",
  None: "#22c55e",
};

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ─── Component ────────────────────────────────────────────────────
interface WeeklySurveyV2Props {
  farmerId: string;
  farmerLat?: number | null;
  farmerLng?: number | null;
}

export default function WeeklySurveyV2({ farmerId, farmerLat = null, farmerLng = null }: WeeklySurveyV2Props) {
  const supabase = createClient();

  // State
  const [lands, setLands] = useState<LandPlot[]>([]);
  const [selectedLand, setSelectedLand] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryStep, setCategoryStep] = useState(0);
  
  const [, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showWaterStep, setShowWaterStep] = useState(false);
  const [surveyStatus, setSurveyStatus] = useState<
    | {
        has_survey?: boolean;
        answered_questions?: number;
        risks?: {
          soil_ph?: string;
          water?: string;
          pest?: string;
          environment?: string;
          [k: string]: unknown;
        };
        [k: string]: unknown;
      }
    | null
  >(null);

  function mapSurveySourceToWaterType(raw: string | undefined): WaterSourceType | null {
    switch (raw) {
      case "deep_tubewell":
      case "shallow_tubewell":
      case "submersible":
        return "tubewell";
      case "canal_govt":
      case "canal_private":
        return "canal";
      case "river":
        return "river";
      case "pond":
        return "pond";
      case "rain_only":
        return "other";
      default:
        return null;
    }
  }

  function mapSurveyColorToWaterColor(raw: string | undefined): WaterColor | null {
    switch (raw) {
      case "clear":
        return "clear";
      case "slightly_turbid":
        return "normal_monsoon";
      case "yellow_orange":
      case "rust_red":
      case "dark_brown":
        return "brown";
      case "green_algae":
        return "green";
      case "black":
        return "black";
      default:
        return null;
    }
  }

  // ─── Fetch lands ────────────────────────────────────────────────
  const fetchLands = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("get_farmer_lands", { p_farmer_id: farmerId });
      const list = (data ?? []).map((p: { land_id: string; land_name: string; land_name_bn: string | null; area_bigha: number }) => ({
        land_id: p.land_id,
        land_name: p.land_name,
        land_name_bn: p.land_name_bn,
        area_bigha: p.area_bigha,
      }));
      setLands(list);
      if (list.length > 0 && !selectedLand) setSelectedLand(list[0].land_id);
    } catch (e) {
      console.error("Failed to fetch lands:", e);
    }
  }, [farmerId, supabase, selectedLand]);

  // ─── Fetch questions ────────────────────────────────────────────
  const fetchQuestions = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.rpc("get_survey_questions");
      if (err) throw err;
      setQuestions(data ?? []);
    } catch (e) {
      console.error("Failed to fetch questions:", e);
    }
  }, [supabase]);

  // ─── Check survey status for this week ──────────────────────────
  const checkStatus = useCallback(async (landId: string) => {
    if (!landId) return;
    try {
      const { data } = await supabase.rpc("check_survey_status", {
        p_farmer_id: farmerId,
        p_land_id: landId,
      });
      setSurveyStatus(data);
      
      // Load existing answers from database if survey exists this week
      if (data?.has_survey) {
        const week = getISOWeek(new Date());
        const year = new Date().getFullYear();
        const { data: surveyData } = await supabase
          .from("surveys")
          .select("answers")
          .eq("farmer_id", farmerId)
          .eq("land_id", landId)
          .eq("week_number", week)
          .eq("year", year)
          .single();
        
        if (surveyData?.answers) {
          setAnswers(surveyData.answers);
        }
      }
    } catch (e) {
      console.error("Failed to check status:", e);
    }
  }, [farmerId, supabase]);

  // ─── Load profile ───────────────────────────────────────────────
  const loadProfile = async () => {
    if (!selectedLand) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc("get_farm_profile", {
        p_farmer_id: farmerId,
        p_land_id: selectedLand,
      });
      if (err) throw err;
      setProfile(data as Profile);
      setShowProfile(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("প্রোফাইল লোড হয়নি: " + msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    fetchLands();
    fetchQuestions();
  }, [fetchLands, fetchQuestions]);

  useEffect(() => {
    if (selectedLand) {
      checkStatus(selectedLand);
    }
  }, [selectedLand, checkStatus]);

  // ─── Answer handlers ────────────────────────────────────────────
  function handleAnswer(key: string, value: string, type: string) {
    if (type === "single") {
      setAnswers(a => {
        const updated = { ...a, [key]: value };
        return updated;
      });
    } else {
      // Multi-select: toggle
      setAnswers(a => {
        const prev = (a[key] as string[] | undefined) ?? [];
        let newVal: string[];
        if (value === "none") {
          newVal = ["none"];
        } else {
          const without = prev.filter(v => v !== "none");
          newVal = without.includes(value)
            ? without.filter(v => v !== value)
            : [...without, value];
        }
        const updated = { ...a, [key]: newVal };
        return updated;
      });
    }
  }

  // ─── Start category survey ──────────────────────────────────────
  function startCategory(cat: string) {
    setActiveCategory(cat);
    setCategoryStep(0);
    setError(null);
    setSuccess(null);
  }

  // ─── Submit answers ─────────────────────────────────────────────
  async function submitAnswers() {
    if (!selectedLand || Object.keys(answers).length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc("submit_survey", {
        p_farmer_id: farmerId,
        p_land_id: selectedLand,
        p_answers: answers,
      });
      if (err) throw err;
      
      setSuccess(`সার্ভে সফলভাবে জমা হয়েছে! সপ্তাহ ${data.week_number}`);
      setActiveCategory(null);
      const waterSource = typeof answers["water_source"] === "string" ? answers["water_source"] : undefined;
      const shouldAskWaterSource = !!waterSource && !["deep_tubewell", "shallow_tubewell", "submersible"].includes(waterSource);
      setShowWaterStep(shouldAskWaterSource);
      
      checkStatus(selectedLand);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("জমা ব্যর্থ: " + msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Get questions for active category ──────────────────────────
  const categoryQuestions = questions.filter(q => q.category === activeCategory);
  const currentQ = categoryQuestions[categoryStep];
  const progress = categoryQuestions.length > 0 
    ? ((categoryStep + 1) / categoryQuestions.length) * 100 
    : 0;

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <p style={S.headerTitle}>📋 সাপ্তাহিক মাঠ সার্ভে</p>
          <p style={S.headerSub}>
            {getISOWeek(new Date())} নং সপ্তাহ, {new Date().getFullYear()}
            {surveyStatus?.has_survey && ` · ${surveyStatus.answered_questions} টি প্রশ্নের উত্তর দেওয়া হয়েছে`}
          </p>
        </div>
        <button style={S.btnProfile} onClick={loadProfile}>
          📊 প্রোফাইল
        </button>
      </div>

      {/* Error/Success */}
      {error && <div style={S.alertErr}>{error}</div>}
      {success && <div style={S.alertSuccess}>{success}</div>}

      {/* Land selector */}
      {lands.length > 0 && !activeCategory && !showProfile && !showWaterStep && (
        <div style={S.landBar}>
          <span style={S.landLabel}>জমি নির্বাচন:</span>
          <div style={S.landTabs}>
            {lands.map(l => (
              <button
                key={l.land_id}
                style={{ ...S.landTab, ...(selectedLand === l.land_id ? S.landTabActive : {}) }}
                onClick={() => setSelectedLand(l.land_id)}
              >
                {l.land_name_bn || l.land_name}
                <span style={S.landArea}>{l.area_bigha?.toFixed(1)} বিঘা</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Profile View */}
      {showProfile && profile && (
        <div style={S.profileView}>
          <div style={S.profileHeader}>
            <h3 style={S.profileTitle}>জমির প্রোফাইল</h3>
            <button style={S.btnClose} onClick={() => setShowProfile(false)}>✕</button>
          </div>
          
          {!profile.found ? (
            <p style={S.noData}>{profile.message_bn}</p>
          ) : (
            <>
              {profile.stale && (
                <div style={S.staleAlert}>
                  ⚠️ {profile.days_since_survey} দিন আগে সার্ভে হয়েছে। নতুন সার্ভে দিন।
                </div>
              )}
              
              <div style={S.profileGrid}>
                <ProfileCard title="মাটি" emoji="🌱" data={profile.soil} />
                <ProfileCard title="পানি" emoji="💧" data={profile.water} />
                <ProfileCard title="ফসল" emoji="🌾" data={profile.crop} />
                <ProfileCard title="পরিবেশ" emoji="🏭" data={profile.environment} />
              </div>

              <div style={S.contextBox}>
                <p style={S.contextLabel}>AI স্ক্যান কনটেক্সট:</p>
                <code style={S.contextCode}>{profile.scan_context}</code>
              </div>
            </>
          )}
        </div>
      )}

      {/* Category Selection (Landing) */}
      {!activeCategory && !showProfile && !showWaterStep && (
        <div style={S.categoryGrid}>
          {CATEGORIES.map(cat => {
            const answeredCount = questions
              .filter(q => q.category === cat.key)
              .filter(q => answers[q.key] !== undefined).length;
            const totalCount = questions.filter(q => q.category === cat.key).length;
            const isLoading = totalCount === 0;
            
            return (
              <button
                key={cat.key}
                style={{ ...S.categoryCard, background: cat.bg, borderColor: cat.color }}
                onClick={() => startCategory(cat.key)}
              >
                <span style={S.catEmoji}>{cat.emoji}</span>
                <span style={{ ...S.catName, color: cat.color }}>{cat.name_bn}</span>
                <span style={S.catCount}>{isLoading ? "লোড হচ্ছে..." : `${answeredCount}/${totalCount}`}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Survey Questions */}
      {activeCategory && currentQ && !showWaterStep && (
        <div style={S.surveyCard}>
          <div style={S.surveyHeader}>
            <button style={S.btnBack} onClick={() => setActiveCategory(null)}>← ফিরে যান</button>
            <span style={S.catBadge}>
              {CATEGORIES.find(c => c.key === activeCategory)?.emoji}{" "}
              {CATEGORIES.find(c => c.key === activeCategory)?.name_bn}
            </span>
          </div>

          {/* Progress */}
          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${progress}%` }} />
          </div>
          <p style={S.progressText}>{categoryStep + 1} / {categoryQuestions.length}</p>

          {/* Question */}
          <div style={S.questionBox}>
            <p style={S.questionText}>{currentQ.question_bn}</p>
            
            <div style={S.optionsGrid}>
              {(currentQ.options || []).map((opt: QuestionOption) => {
                const currentAns = answers[currentQ.key];
                const selected = currentQ.type === "single"
                  ? currentAns === opt.value
                  : Array.isArray(currentAns) && currentAns.includes(opt.value);
                
                return (
                  <button
                    key={opt.value}
                    style={{ ...S.optionBtn, ...(selected ? S.optionBtnActive : {}) }}
                    onClick={() => handleAnswer(currentQ.key, opt.value, currentQ.type)}
                  >
                    <span style={S.optionDot}>{selected ? "●" : "○"}</span>
                    <span>{opt.label_bn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div style={S.navRow}>
            <button
              style={S.btnNav}
              disabled={categoryStep === 0}
              onClick={() => setCategoryStep(s => s - 1)}
            >
              ← আগে
            </button>
            
            {categoryStep < categoryQuestions.length - 1 ? (
              <button
                style={S.btnNavNext}
                disabled={answers[currentQ.key] === undefined}
                onClick={() => setCategoryStep(s => s + 1)}
              >
                পরবর্তী →
              </button>
            ) : (
              <button
                style={S.btnSubmit}
                disabled={submitting}
                onClick={submitAnswers}
              >
                {submitting ? "জমা হচ্ছে..." : "✓ জমা দিন"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Submit All Button (if any answers) */}
      {!activeCategory && !showProfile && !showWaterStep && Object.keys(answers).length > 0 && (
        <div style={S.submitSection}>
          <p style={S.submitInfo}>
            {Object.keys(answers).length} টি প্রশ্নের উত্তর দেওয়া হয়েছে
          </p>
          <button
            style={S.btnSubmitAll}
            disabled={submitting}
            onClick={submitAnswers}
          >
            {submitting ? "জমা হচ্ছে..." : "✓ সব উত্তর জমা দিন"}
          </button>
        </div>
      )}

      {/* Risk Summary (if survey done this week) */}
      {surveyStatus?.has_survey && !activeCategory && !showProfile && !showWaterStep && (
        <div style={S.riskSummary}>
          <p style={S.riskTitle}>এই সপ্তাহের ঝুঁকি সারাংশ:</p>
          <div style={S.riskGrid}>
            <RiskBadge label="মাটি pH" value={surveyStatus.risks?.soil_ph} />
            <RiskBadge label="পানি" value={surveyStatus.risks?.water} />
            <RiskBadge label="পোকা" value={surveyStatus.risks?.pest} />
            <RiskBadge label="পরিবেশ" value={surveyStatus.risks?.environment} />
          </div>
        </div>
      )}

      {showWaterStep && selectedLand && farmerLat != null && farmerLng != null && (
        <div style={S.waterStepWrap}>
          <WaterSourceReportStep
            landId={selectedLand}
            farmerLat={farmerLat}
            farmerLng={farmerLng}
            initialType={mapSurveySourceToWaterType(typeof answers["water_source"] === "string" ? answers["water_source"] : undefined)}
            initialColor={mapSurveyColorToWaterColor(typeof answers["water_color"] === "string" ? answers["water_color"] : undefined)}
            initialOdor={typeof answers["water_odor"] === "string" && answers["water_odor"] !== "none"}
            onComplete={() => {
              setShowWaterStep(false);
              setSuccess("পানির উৎস সফলভাবে যোগ হয়েছে — কমিউনিটি ওভারভিউতে দেখা যাবে।");
            }}
            onSkip={() => {
              setShowWaterStep(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────
function ProfileCard({ title, emoji, data }: { title: string; emoji: string; data?: Record<string, unknown> }) {
  if (!data) return null;
  return (
    <div style={S.profileCard}>
      <p style={S.profileCardTitle}>{emoji} {title}</p>
      {Object.entries(data).map(([k, v]) => (
        <p key={k} style={S.profileRow}>
          <span style={S.profileKey}>{k}:</span>
          <span style={S.profileVal}>{String(v ?? "-")}</span>
        </p>
      ))}
    </div>
  );
}

function RiskBadge({ label, value }: { label: string; value?: string }) {
  const color = RISK_COLORS[value || ""] || "#9ca3af";
  return (
    <div style={S.riskBadge}>
      <span style={S.riskLabel}>{label}</span>
      <span style={{ ...S.riskValue, background: color }}>{value || "-"}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Noto Sans Bengali', sans-serif",
    background: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid #e5e7eb",
  },
  header: {
    background: "linear-gradient(135deg, #166534 0%, #15803d 100%)",
    color: "#fff",
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: 700, margin: 0 },
  headerSub: { fontSize: 13, opacity: 0.9, margin: "4px 0 0" },
  btnProfile: {
    padding: "8px 16px",
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
  },
  
  alertErr: {
    margin: 16,
    padding: 12,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    color: "#dc2626",
    fontSize: 13,
  },
  alertSuccess: {
    margin: 16,
    padding: 12,
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    color: "#166534",
    fontSize: 13,
  },
  
  landBar: { padding: "12px 16px", borderBottom: "1px solid #e5e7eb" },
  landLabel: { fontSize: 13, color: "#6b7280", marginRight: 12 },
  landTabs: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  landTab: {
    padding: "6px 12px",
    borderRadius: 20,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  landTabActive: { background: "#166534", borderColor: "#166534", color: "#fff" },
  landArea: { fontSize: 11, opacity: 0.7 },
  
  categoryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    padding: 16,
  },
  categoryCard: {
    padding: 16,
    borderRadius: 12,
    border: "2px solid",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    transition: "transform 0.15s",
  },
  catEmoji: { fontSize: 28 },
  catName: { fontSize: 14, fontWeight: 600 },
  catCount: { fontSize: 12, color: "#6b7280" },
  
  surveyCard: { padding: 16 },
  surveyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  btnBack: {
    padding: "6px 12px",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  catBadge: {
    padding: "4px 12px",
    background: "#f3f4f6",
    borderRadius: 20,
    fontSize: 13,
  },
  
  progressBar: {
    height: 6,
    background: "#e5e7eb",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#16a34a",
    transition: "width 0.3s",
  },
  progressText: { fontSize: 12, color: "#6b7280", textAlign: "center", margin: "8px 0" },
  
  questionBox: {
    background: "#f9fafb",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  questionText: { fontSize: 16, fontWeight: 500, marginBottom: 16, lineHeight: 1.5 },
  optionsGrid: { display: "flex", flexDirection: "column", gap: 10 },
  optionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 10,
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    textAlign: "left",
    transition: "all 0.15s",
  },
  optionBtnActive: { borderColor: "#16a34a", background: "#f0fdf4", color: "#166534" },
  optionDot: { fontSize: 16, color: "#16a34a" },
  
  navRow: { display: "flex", justifyContent: "space-between", gap: 12 },
  btnNav: {
    padding: "10px 20px",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
  },
  btnNavNext: {
    padding: "10px 24px",
    background: "#166534",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnSubmit: {
    padding: "10px 24px",
    background: "#16a34a",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  
  submitSection: {
    padding: 16,
    borderTop: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  submitInfo: { fontSize: 13, color: "#6b7280" },
  btnSubmitAll: {
    padding: "12px 28px",
    background: "#166534",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  
  riskSummary: {
    margin: 16,
    padding: 16,
    background: "#f9fafb",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
  },
  riskTitle: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  riskGrid: { display: "flex", flexWrap: "wrap", gap: 10 },
  riskBadge: { display: "flex", alignItems: "center", gap: 6 },
  riskLabel: { fontSize: 12, color: "#6b7280" },
  riskValue: {
    padding: "2px 8px",
    borderRadius: 4,
    color: "#fff",
    fontSize: 11,
    fontWeight: 600,
  },
  
  profileView: { padding: 16 },
  profileHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  profileTitle: { fontSize: 18, fontWeight: 600, margin: 0 },
  btnClose: {
    padding: "4px 10px",
    background: "#f3f4f6",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 16,
  },
  noData: { color: "#6b7280", fontStyle: "italic" },
  staleAlert: {
    padding: 12,
    background: "#fffbeb",
    border: "1px solid #fcd34d",
    borderRadius: 8,
    color: "#92400e",
    fontSize: 13,
    marginBottom: 16,
  },
  profileGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  profileCard: {
    background: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    border: "1px solid #e5e7eb",
  },
  profileCardTitle: { fontSize: 14, fontWeight: 600, marginBottom: 8 },
  profileRow: { fontSize: 12, margin: "4px 0", display: "flex", justifyContent: "space-between" },
  profileKey: { color: "#6b7280" },
  profileVal: { fontWeight: 500 },
  contextBox: {
    background: "#1f2937",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  contextLabel: { fontSize: 12, color: "#9ca3af", marginBottom: 6 },
  contextCode: {
    fontSize: 11,
    color: "#10b981",
    wordBreak: "break-all",
    fontFamily: "monospace",
  },
  waterStepWrap: {
    padding: 16,
    borderTop: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
};
