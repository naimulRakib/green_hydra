/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'datasets');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

// 1. Water Quality Monitoring Dataset
const waterData = [
  "date,location,zone_type,ph,ec_us_cm,do_mg_l,chromium_mg_l,lead_mg_l,risk_level"
];
for (let i = 1; i <= 30; i++) {
  const date = new Date(2026, 9, i).toISOString().split('T')[0];
  
  // Savar (High Risk - Tannery zone)
  waterData.push(`${date},Savar-Hemayetpur,Industrial,${(5.5 + Math.random()).toFixed(2)},${(1500 + Math.random()*500).toFixed(0)},${(2.5 + Math.random()).toFixed(2)},${(1.2 + Math.random()*0.5).toFixed(3)},${(0.5 + Math.random()*0.2).toFixed(3)},Critical`);
  
  // Keraniganj (Moderate Risk)
  waterData.push(`${date},Keraniganj-Hasnabad,Peri-urban,${(6.5 + Math.random()*0.5).toFixed(2)},${(800 + Math.random()*300).toFixed(0)},${(4.5 + Math.random()).toFixed(2)},${(0.3 + Math.random()*0.2).toFixed(3)},${(0.1 + Math.random()*0.1).toFixed(3)},Moderate`);
  
  // Sonargaon (Low Risk)
  waterData.push(`${date},Narayanganj-Sonargaon,Rural,${(7.0 + Math.random()*0.4).toFixed(2)},${(400 + Math.random()*150).toFixed(0)},${(6.0 + Math.random()).toFixed(2)},0.012,0.005,Low`);
}
fs.writeFileSync(path.join(outDir, 'water_quality_monitoring.csv'), waterData.join('\n'));


// 2. Satellite NDVI & Heavy Metal Prior Dataset
const ndviData = [
  "plot_id,coordinates,crop_type,capture_date,ndvi_mean,evi_mean,soil_ph_isric,arsenic_zone_risk,predicted_heavy_metal_risk"
];
const plots = [
  { id: "P-101", coord: "23.8354,90.2559", crop: "Boro Rice", As: "High", Metal: "Critical" },
  { id: "P-102", coord: "23.8360,90.2562", crop: "Bitter Gourd", As: "High", Metal: "Critical" },
  { id: "P-103", coord: "23.6811,90.4132", crop: "Jute", As: "Medium", Metal: "Moderate" },
  { id: "P-104", coord: "23.6521,90.6012", crop: "Aman Rice", As: "Low", Metal: "Low" }
];
for (let i = 1; i <= 10; i++) { // 10 weeks of satellite passes
  const date = new Date(2026, 7, i * 7).toISOString().split('T')[0];
  plots.forEach(p => {
    // Degrade NDVI if risk is high
    let baseNdvi = p.crop.includes("Rice") ? 0.75 : 0.65;
    if (p.Metal === "Critical") baseNdvi -= (0.2 + Math.random()*0.1);
    if (p.Metal === "Moderate") baseNdvi -= (0.1 + Math.random()*0.05);
    
    const ndvi = (baseNdvi + (Math.random()*0.05)).toFixed(3);
    const evi = (baseNdvi * 1.1).toFixed(3);
    const ph = (p.Metal === "Critical" ? 5.8 : 6.8) + (Math.random()*0.4 - 0.2);
    
    ndviData.push(`${p.id},"${p.coord}",${p.crop},${date},${ndvi},${evi},${ph.toFixed(2)},${p.As},${p.Metal}`);
  });
}
fs.writeFileSync(path.join(outDir, 'satellite_ndvi_spatial.csv'), ndviData.join('\n'));


// 3. AI Disease Diagnostics Dataset
const aiData = [
  "scan_id,timestamp,location,crop_type,ai_model,detected_stress_type,disease_name,confidence_score,spray_suppressed,rag_cases_matched,verified_by_agronomist"
];
for (let i = 1; i <= 50; i++) {
  const isPollution = Math.random() > 0.6;
  const stress = isPollution ? "Abiotic_Pollution" : (Math.random() > 0.5 ? "Biotic_Fungal" : "Biotic_Pest");
  const disease = stress === "Abiotic_Pollution" ? "Heavy Metal Toxicity" : (stress === "Biotic_Fungal" ? "Blast Disease" : "Stem Borer");
  const conf = (0.85 + Math.random() * 0.14).toFixed(3);
  const suppress = isPollution ? "TRUE" : "FALSE";
  
  aiData.push(`SCAN-${2000+i},2026-09-${(i%30)+1}T10:15:00Z,Savar,Boro Rice,gemini-3.1-flash-lite,${stress},${disease},${conf},${suppress},${Math.floor(Math.random()*5)},TRUE`);
}
fs.writeFileSync(path.join(outDir, 'ai_disease_diagnostics.csv'), aiData.join('\n'));

console.log("Datasets generated successfully in 'datasets' folder.");
