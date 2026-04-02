/**
 * Wind Direction & Plume Calculation Validator
 *
 * This TypeScript function validates the corrected wind direction algorithm.
 * Use it to test edge cases and verify the SQL fix is working correctly.
 */

interface PlumeTestCase {
  name: string;
  factoryLat: number;
  factoryLng: number;
  farmLat: number;
  farmLng: number;
  windFromDeg: number;
  plumeConeAngle: number;
  maxPlumeKm: number;
  expectedInPlume: boolean;
  description: string;
}

/**
 * Calculates the distance between two coordinates using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates bearing from point 1 to point 2 using forward azimuth
 */
function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const x = Math.sin(dLng) * Math.cos(lat2Rad);
  const y =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  let bearing = Math.atan2(x, y) * (180 / Math.PI);
  return (bearing + 360) % 360; // Normalize to 0-360
}

/**
 * CORRECTED: Determines if the farm is within the smoke plume of a factory
 */
function isInPlume(
  factoryLat: number,
  factoryLng: number,
  farmLat: number,
  farmLng: number,
  windFromDeg: number,
  plumeConeAngle: number,
  maxPlumeKm: number
): {
  inPlume: boolean;
  windToDeg: number;
  bearingToFarm: number;
  angleDiff: number;
  distance: number;
  halfCone: number;
} {
  // 1. Calculate actual distance
  const distance = calculateDistance(factoryLat, factoryLng, farmLat, farmLng);

  // 2. Wind direction (where smoke GOES)
  const windToDeg = (windFromDeg + 180) % 360;

  // 3. Bearing from factory to farm
  const bearingToFarm = calculateBearing(factoryLat, factoryLng, farmLat, farmLng);

  // 4. Angular difference (shortest arc)
  let angleDiff = Math.abs(windToDeg - bearingToFarm);
  if (angleDiff > 180) {
    angleDiff = 360 - angleDiff;
  }

  // 5. Check if farm is in plume
  const halfCone = plumeConeAngle / 2;
  const withinCone = angleDiff <= halfCone;
  const withinRange = distance <= maxPlumeKm;
  const inPlume = withinCone && withinRange;

  return {
    inPlume,
    windToDeg,
    bearingToFarm,
    angleDiff,
    distance,
    halfCone,
  };
}

/**
 * Test cases to validate the fix
 */
const testCases: PlumeTestCase[] = [
  {
    name: "Bug Case - Keraniganj/Hazaribagh",
    factoryLat: 23.7940,    // Hazaribagh Tannery (example)
    factoryLng: 90.4152,
    farmLat: 23.8050,       // Keraniganj farm (NE of factory)
    farmLng: 90.4262,
    windFromDeg: 45,        // Wind FROM NE (blows toward SW)
    plumeConeAngle: 60,
    maxPlumeKm: 5.0,
    expectedInPlume: false, // Wind blows AWAY from farm
    description: "Factory WSW of farm, wind blows SW → smoke goes away from farm"
  },
  {
    name: "Direct Hit",
    factoryLat: 23.7940,
    factoryLng: 90.4152,
    farmLat: 23.8050,
    farmLng: 90.4262,
    windFromDeg: 225,       // Wind FROM SW (blows toward NE)
    plumeConeAngle: 60,
    maxPlumeKm: 5.0,
    expectedInPlume: true,  // Wind blows TOWARD farm
    description: "Wind blows directly toward farm"
  },
  {
    name: "Perpendicular Wind",
    factoryLat: 23.7940,
    factoryLng: 90.4152,
    farmLat: 23.8050,
    farmLng: 90.4262,
    windFromDeg: 315,       // Wind FROM NW (blows toward SE)
    plumeConeAngle: 60,
    maxPlumeKm: 5.0,
    expectedInPlume: false, // Wind blows perpendicular to farm
    description: "Wind blows perpendicular, outside cone"
  },
  {
    name: "Too Far Away",
    factoryLat: 23.7940,
    factoryLng: 90.4152,
    farmLat: 23.8550,       // Much farther farm
    farmLng: 90.4762,
    windFromDeg: 225,       // Wind toward farm
    plumeConeAngle: 60,
    maxPlumeKm: 5.0,
    expectedInPlume: false, // Beyond max range
    description: "Within wind cone but too far away"
  },
  {
    name: "Edge of Cone",
    factoryLat: 23.7940,
    factoryLng: 90.4152,
    farmLat: 23.8050,
    farmLng: 90.4262,
    windFromDeg: 195,       // Wind at edge of 60° cone
    plumeConeAngle: 60,
    maxPlumeKm: 5.0,
    expectedInPlume: true,  // Just within cone
    description: "Farm at edge of plume cone"
  }
];

/**
 * Run all test cases
 */
function runPlumeTests(): void {
  console.log("🧪 Testing Corrected Plume Algorithm\n");
  console.log("=" + "=".repeat(80));

  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    const result = isInPlume(
      testCase.factoryLat,
      testCase.factoryLng,
      testCase.farmLat,
      testCase.farmLng,
      testCase.windFromDeg,
      testCase.plumeConeAngle,
      testCase.maxPlumeKm
    );

    const success = result.inPlume === testCase.expectedInPlume;
    const status = success ? "✅ PASS" : "❌ FAIL";

    if (success) passed++;
    else failed++;

    console.log(`\n${index + 1}. ${testCase.name} ${status}`);
    console.log(`   ${testCase.description}`);
    console.log(`   Expected: ${testCase.expectedInPlume}, Got: ${result.inPlume}`);
    console.log(`   Wind: ${testCase.windFromDeg}° → ${result.windToDeg}°`);
    console.log(`   Bearing to farm: ${result.bearingToFarm.toFixed(1)}°`);
    console.log(`   Angle diff: ${result.angleDiff.toFixed(1)}° (threshold: ${result.halfCone}°)`);
    console.log(`   Distance: ${result.distance.toFixed(2)} km (max: ${testCase.maxPlumeKm} km)`);

    if (!success) {
      console.log(`   🐛 ANALYSIS: Should be ${testCase.expectedInPlume ? 'IN' : 'OUT OF'} plume`);
    }
  });

  console.log("\n" + "=" + "=".repeat(80));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All tests passed! The algorithm is working correctly.");
  } else {
    console.log("⚠️  Some tests failed. Review the logic.");
  }
}

/**
 * Test a specific scenario (your bug case)
 */
function testSpecificBug(): void {
  console.log("\n🔍 Testing Your Specific Bug Case:");
  console.log("-" + "-".repeat(40));

  const result = isInPlume(
    23.7940,  // Factory lat (Hazaribagh area)
    90.4152,  // Factory lng
    23.8050,  // Farm lat (Keraniganj area)
    90.4262,  // Farm lng
    45,       // Wind from NE (45°), blows toward SW (225°)
    60,       // 60° plume cone
    5.0       // 5km max range
  );

  console.log(`Factory→Farm bearing: ${result.bearingToFarm.toFixed(1)}° (NE)`);
  console.log(`Wind blows toward: ${result.windToDeg.toFixed(1)}° (SW)`);
  console.log(`Angle difference: ${result.angleDiff.toFixed(1)}° (threshold: ${result.halfCone}°)`);
  console.log(`Distance: ${result.distance.toFixed(2)} km`);
  console.log(`Result: Farm is ${result.inPlume ? 'IN' : 'NOT IN'} plume`);
  console.log(`Expected: Farm should be NOT IN plume (wind blows away)`);
  console.log(`Status: ${result.inPlume === false ? '✅ CORRECT' : '❌ STILL BUGGY'}`);
}

// Export for use in your frontend/tests
export {
  isInPlume,
  runPlumeTests,
  testSpecificBug,
};
export type { PlumeTestCase };

// Run tests immediately if this file is executed directly
if (typeof window === 'undefined' && require.main === module) {
  runPlumeTests();
  testSpecificBug();
}