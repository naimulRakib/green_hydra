import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\s]+)/)?.[1] || "";
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\s]+)/)?.[1] || "";
const supabase = createClient(url, key);

const FARMER_ID = "265495c5-3095-4f20-95d5-95fa3ca9a6e7"; // farmer1@gmail.com
const PLOT_SAVAR = "da37c2c9-0dc9-4775-93b3-ca3955e20aa3"; // Savar Plot A
const PLOT_HEMAYETPUR = "e8b87d9d-0241-49c7-b01f-1f4185e43ea0"; // Hemayetpur Block

async function seed() {
  console.log("🌱 Seeding Farmer1 demo profiles, surveys, and institutional API keys...");

  // 1. Update Farmer Profile & Consent
  await supabase.from("farmers").update({
    data_sharing_consent: true,
    sms_consent: true,
    total_scans: 15,
    verified_scans: 8,
    trust_score: 0.88,
    badge_level: "Agronomist",
    updated_at: new Date().toISOString()
  }).eq("id", FARMER_ID);

  // 2. Setup Farm Profiles for both plots
  // Plot A (Savar Industrial Fringe - Abiotic & Heavy Metal hotspot)
  const profileSavar = {
    farmer_id: FARMER_ID,
    land_id: PLOT_SAVAR,
    soil_texture: "clay_loam",
    soil_drainage: "poor",
    soil_ph: "Acidic (5.2)",
    soil_organic: "low",
    soil_compaction: "very_hard",
    water_source: "canal_govt",
    water_color: "yellow_orange",
    water_odor: "chemical_sulfur",
    water_risk: "Contaminated",
    crop_stage: "tillering",
    fertilizer_pattern: "urea_excess",
    monoculture_years: "8_years",
    yield_trend: "decreasing_sharply",
    pest_level: "Low",
    pests_seen: ["none_major"],
    weekly_weather: "foggy_smoke",
    smoke_exposure: "daily_heavy",
    canal_contamination: "severe_effluent",
    neighbor_problem: "industrial_runoff",
    arsenic_risk: true,
    iron_risk: true,
    fish_kill: "yes_recent",
    scan_context: "Soil:ClayLoam,pH:5.2,Water:YellowOrange,Odor:Sulfur,Smoke:HeavyDaily,Canal:ChemicalWash,FishKill:Yes,Arsenic:High,TanneryPlume:Active",
    last_survey_week: 42,
    last_survey_year: 2026,
    updated_at: new Date().toISOString()
  };

  const { data: existingSavar } = await supabase.from("farm_profiles").select("id").eq("farmer_id", FARMER_ID).eq("land_id", PLOT_SAVAR).maybeSingle();
  if (existingSavar?.id) {
    await supabase.from("farm_profiles").update(profileSavar).eq("id", existingSavar.id);
  } else {
    await supabase.from("farm_profiles").insert(profileSavar);
  }

  // Plot B (Hemayetpur Block - Moderate exposure)
  const profileHemayetpur = {
    farmer_id: FARMER_ID,
    land_id: PLOT_HEMAYETPUR,
    soil_texture: "silt_loam",
    soil_drainage: "moderate",
    soil_ph: "Normal (6.4)",
    soil_organic: "medium",
    soil_compaction: "moderate",
    water_source: "deep_tubewell",
    water_color: "turbid",
    water_odor: "earthy",
    water_risk: "Watch",
    crop_stage: "flowering",
    fertilizer_pattern: "balanced_npk",
    monoculture_years: "3_years",
    yield_trend: "stable",
    pest_level: "Medium",
    pests_seen: ["fruit_fly", "aphid"],
    weekly_weather: "partly_cloudy",
    smoke_exposure: "moderate",
    canal_contamination: "moderate",
    neighbor_problem: "pesticide_drift",
    arsenic_risk: false,
    iron_risk: false,
    fish_kill: null,
    scan_context: "Soil:SiltLoam,pH:6.4,Water:Turbid,Pest:Medium,VegetableBlock:Active",
    last_survey_week: 42,
    last_survey_year: 2026,
    updated_at: new Date().toISOString()
  };

  const { data: existingHem } = await supabase.from("farm_profiles").select("id").eq("farmer_id", FARMER_ID).eq("land_id", PLOT_HEMAYETPUR).maybeSingle();
  if (existingHem?.id) {
    await supabase.from("farm_profiles").update(profileHemayetpur).eq("id", existingHem.id);
  } else {
    await supabase.from("farm_profiles").insert(profileHemayetpur);
  }

  // 3. Setup Weekly Surveys in `surveys` for Week 41 (Previous) and Week 42 (Current)
  const surveyWeeks = [
    { week: 41, submitted: "2026-10-11T10:30:00Z" },
    { week: 42, submitted: new Date().toISOString() }
  ];

  for (const sw of surveyWeeks) {
    // Plot A survey
    const { data: sA } = await supabase.from("surveys").select("id").eq("farmer_id", FARMER_ID).eq("land_id", PLOT_SAVAR).eq("week_number", sw.week).eq("year", 2026).maybeSingle();
    const surveyDataA = {
      farmer_id: FARMER_ID,
      land_id: PLOT_SAVAR,
      week_number: sw.week,
      year: 2026,
      answers: {
        crop_type: "rice",
        crop_stage: "tillering",
        crop_variety: "brri_28",
        soil_texture: "clay_loam",
        soil_color: "dark_gray",
        soil_drainage: "waterlogged",
        soil_compaction: "very_hard",
        algae_on_soil: "thick_blue_green",
        water_source: "canal_govt",
        water_color: "yellow_orange",
        water_odor: "metallic_sulfur",
        water_taste: "metallic",
        water_deposits: "oily_film",
        arsenic_test: "unsafe",
        fish_kill: "yes_recent",
        smoke_exposure: "daily_heavy",
        smoke_distance: "under_500m",
        smoke_source: ["brick_kiln", "tannery", "garment_boiler"],
        canal_pollution: "frequent_black_water",
        canal_distance: "under_100m",
        neighbor_spray: "yes_yesterday",
        pest_damage_level: "low",
        leaf_condition: "yellow_marginal_scorch",
        yellowing_pattern: "outer_leaf_tips"
      },
      soil_ph_risk: "Acidic",
      water_risk: "Contaminated",
      pest_level: "Low",
      env_stress: "Industrial_Plume_Severe",
      submitted_at: sw.submitted,
      updated_at: sw.submitted
    };
    if (sA?.id) {
      await supabase.from("surveys").update(surveyDataA).eq("id", sA.id);
    } else {
      await supabase.from("surveys").insert(surveyDataA);
    }

    // Plot B survey
    const { data: sB } = await supabase.from("surveys").select("id").eq("farmer_id", FARMER_ID).eq("land_id", PLOT_HEMAYETPUR).eq("week_number", sw.week).eq("year", 2026).maybeSingle();
    const surveyDataB = {
      farmer_id: FARMER_ID,
      land_id: PLOT_HEMAYETPUR,
      week_number: sw.week,
      year: 2026,
      answers: {
        crop_type: "vegetable_bitter_gourd",
        crop_stage: "flowering",
        soil_texture: "silt_loam",
        water_source: "deep_tubewell",
        water_color: "turbid",
        water_odor: "normal",
        smoke_exposure: "rarely",
        canal_pollution: "moderate",
        pest_damage_level: "medium",
        pests_seen: ["fruit_fly"]
      },
      soil_ph_risk: "Normal",
      water_risk: "Watch",
      pest_level: "Medium",
      env_stress: "Low",
      submitted_at: sw.submitted,
      updated_at: sw.submitted
    };
    if (sB?.id) {
      await supabase.from("surveys").update(surveyDataB).eq("id", sB.id);
    } else {
      await supabase.from("surveys").insert(surveyDataB);
    }
  }

  // 4. Heavy Metal Reports
  await supabase.from("heavy_metal_reports").delete().eq("farmer_id", FARMER_ID);

  await supabase.from("heavy_metal_reports").insert([
    {
      farmer_id: FARMER_ID,
      land_id: PLOT_SAVAR,
      metal_type: "Chromium (Cr), Lead (Pb), Cadmium (Cd)",
      confidence_score: 0.91,
      severity: "high",
      reported_via: "satellite",
      geom: "POINT(90.2559 23.8354)",
      notes: "ISRIC subsurface correlation + tannery discharge plume vector. Cr: 85 mg/kg, Pb: 110 mg/kg."
    },
    {
      farmer_id: FARMER_ID,
      land_id: PLOT_HEMAYETPUR,
      metal_type: "Chromium (Cr)",
      confidence_score: 0.72,
      severity: "moderate",
      reported_via: "satellite",
      geom: "POINT(90.2509 23.8334)",
      notes: "Sediment runoff from industrial tributary. Cr: 42 mg/kg."
    }
  ]);

  // 5. Update institutional API keys in `data_buyers`
  const buyers = [
    {
      org_name: "Department of Environment (DoE)",
      org_type: "Government",
      api_key: "GOVT-DOE-BD-2026-KEY-991",
      subscription_tier: "enterprise",
      can_access_risk_scores: true,
      can_access_loss_estimates: true,
      can_access_heavy_metals: true,
      can_access_raw_scans: true,
      licensed_districts: ["Dhaka", "Savar", "Gazipur", "Narayanganj"],
      is_active: true
    },
    {
      org_name: "Green Delta Insurance Ltd.",
      org_type: "Insurance",
      api_key: "INSUR-GREEN-DELTA-2026-KEY-442",
      subscription_tier: "premium",
      can_access_risk_scores: true,
      can_access_loss_estimates: true,
      can_access_heavy_metals: true,
      can_access_raw_scans: false,
      licensed_districts: ["Dhaka", "Savar", "Gazipur"],
      is_active: true
    },
    {
      org_name: "Bengal Agri Exports",
      org_type: "Export",
      api_key: "EXPORT-BENGAL-AGRI-2026-KEY-773",
      subscription_tier: "premium",
      can_access_risk_scores: true,
      can_access_loss_estimates: false,
      can_access_heavy_metals: true,
      can_access_raw_scans: false,
      licensed_districts: ["Dhaka", "Savar"],
      is_active: true
    },
    {
      org_name: "AgroResearch Foundation",
      org_type: "NGO",
      api_key: "NGO-AGRO-RESEARCH-2026-KEY-114",
      subscription_tier: "premium",
      can_access_risk_scores: true,
      can_access_loss_estimates: true,
      can_access_heavy_metals: false,
      can_access_raw_scans: true,
      licensed_districts: ["Dhaka", "Savar", "Gazipur", "Narayanganj", "Manikganj"],
      is_active: true
    }
  ];

  for (const b of buyers) {
    const { data: existing } = await supabase.from("data_buyers").select("id").eq("org_name", b.org_name).maybeSingle();
    if (existing?.id) {
      await supabase.from("data_buyers").update(b).eq("id", existing.id);
    } else {
      await supabase.from("data_buyers").insert(b);
    }
  }

  console.log("✅ Successfully seeded demo surveys, farm profiles, heavy metal reports, and institutional B2B API keys!");
}

seed().catch(console.error);
