/**
 * Controlled Test Runner for Demo Accuracy
 *
 * This script runs 5 controlled test scenarios and validates the results
 * against expected outcomes. Use this to demonstrate 100% rule-based accuracy.
 */

interface TestScenario {
  id: string;
  name: string;
  landId: string;
  imageDescription: string; // What kind of image to use
  expectedOutcome: {
    primaryCause: 'biotic' | 'abiotic' | 'metal';
    spraySuppressed: boolean;
    metalScoreAbove?: number;
    tokensUsed?: number;
    compoundStress?: boolean;
  };
}

interface TestResult {
  scenario: TestScenario;
  actual: {
    scanId: string;
    primaryCause: string;
    spraySuppressed: boolean;
    metalScore: number;
    tokensUsed: number;
    compoundStress: boolean;
    bioticScore: number;
    abioticScore: number;
    overridesApplied: string[];
    confidenceScore: number;
  };
  passed: boolean;
  matchDetails: string[];
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'TEST_1',
    name: 'Pure Biotic',
    landId: 'TEST_BIOTIC_001',
    imageDescription: 'Rice leaf with clear blast disease symptoms',
    expectedOutcome: {
      primaryCause: 'biotic',
      spraySuppressed: false,
    }
  },
  {
    id: 'TEST_2',
    name: 'Pure Abiotic',
    landId: 'TEST_ABIOTIC_001',
    imageDescription: 'Polluted leaf from high contamination area',
    expectedOutcome: {
      primaryCause: 'abiotic',
      spraySuppressed: true,
    }
  },
  {
    id: 'TEST_3',
    name: 'Heavy Metal Zone',
    landId: 'TEST_METAL_001',
    imageDescription: 'Leaf with chlorosis/necrosis patterns',
    expectedOutcome: {
      primaryCause: 'metal',
      spraySuppressed: false,
      metalScoreAbove: 0.20,
    }
  },
  {
    id: 'TEST_4',
    name: 'Early Exit (High Abiotic)',
    landId: 'TEST_EARLY_EXIT_001',
    imageDescription: 'Any leaf image (LLM should be skipped)',
    expectedOutcome: {
      primaryCause: 'abiotic',
      spraySuppressed: true,
      tokensUsed: 0,
    }
  },
  {
    id: 'TEST_5',
    name: 'Compound Stress',
    landId: 'TEST_COMPOUND_001',
    imageDescription: 'Leaf with mixed biotic + abiotic symptoms',
    expectedOutcome: {
      primaryCause: 'biotic', // or 'abiotic' depending on balance
      spraySuppressed: false, // May vary based on threshold
      compoundStress: true,
    }
  }
];

/**
 * Validates test results against expected outcomes
 */
function validateTestResult(scenario: TestScenario, actual: any): TestResult {
  const matchDetails: string[] = [];
  let passed = true;

  // Check primary cause
  if (scenario.expectedOutcome.primaryCause === actual.primaryCause) {
    matchDetails.push(`✅ Primary cause: ${actual.primaryCause}`);
  } else {
    matchDetails.push(`❌ Primary cause: expected ${scenario.expectedOutcome.primaryCause}, got ${actual.primaryCause}`);
    passed = false;
  }

  // Check spray suppressed
  if (scenario.expectedOutcome.spraySuppressed === actual.spraySuppressed) {
    matchDetails.push(`✅ Spray suppressed: ${actual.spraySuppressed}`);
  } else {
    matchDetails.push(`❌ Spray suppressed: expected ${scenario.expectedOutcome.spraySuppressed}, got ${actual.spraySuppressed}`);
    passed = false;
  }

  // Check metal score (if applicable)
  if (scenario.expectedOutcome.metalScoreAbove !== undefined) {
    if (actual.metalScore > scenario.expectedOutcome.metalScoreAbove) {
      matchDetails.push(`✅ Metal score: ${actual.metalScore} > ${scenario.expectedOutcome.metalScoreAbove}`);
    } else {
      matchDetails.push(`❌ Metal score: ${actual.metalScore} not above ${scenario.expectedOutcome.metalScoreAbove}`);
      passed = false;
    }
  }

  // Check tokens used (if applicable)
  if (scenario.expectedOutcome.tokensUsed !== undefined) {
    if (actual.tokensUsed === scenario.expectedOutcome.tokensUsed) {
      matchDetails.push(`✅ Tokens used: ${actual.tokensUsed} (LLM skipped)`);
    } else {
      matchDetails.push(`❌ Tokens used: expected ${scenario.expectedOutcome.tokensUsed}, got ${actual.tokensUsed}`);
      passed = false;
    }
  }

  // Check compound stress (if applicable)
  if (scenario.expectedOutcome.compoundStress !== undefined) {
    if (actual.compoundStress === scenario.expectedOutcome.compoundStress) {
      matchDetails.push(`✅ Compound stress: ${actual.compoundStress}`);
    } else {
      matchDetails.push(`❌ Compound stress: expected ${scenario.expectedOutcome.compoundStress}, got ${actual.compoundStress}`);
      passed = false;
    }
  }

  return {
    scenario,
    actual,
    passed,
    matchDetails
  };
}

/**
 * Formats test results as a markdown table
 */
function formatResultsTable(results: TestResult[]): string {
  let table = `# Controlled Test Results\n\n`;
  table += `**Test Date:** ${new Date().toISOString().split('T')[0]}\n\n`;

  table += `| Scenario | Expected | Actual | Result |\n`;
  table += `|----------|----------|--------|--------|\n`;

  for (const result of results) {
    const expected = `${result.scenario.expectedOutcome.primaryCause} primary, spray=${result.scenario.expectedOutcome.spraySuppressed ? 'NO' : 'YES'}`;
    const actual = `${result.actual.primaryCause} primary, spray=${result.actual.spraySuppressed ? 'NO' : 'YES'}`;
    const status = result.passed ? '✅ PASS' : '❌ FAIL';

    table += `| ${result.scenario.name} | ${expected} | ${actual} | ${status} |\n`;
  }

  // Add summary
  const passCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const accuracy = (passCount / totalCount * 100).toFixed(0);

  table += `\n**Rule-based accuracy: ${passCount}/${totalCount} = ${accuracy}%**\n\n`;

  // Add detailed results
  table += `## Detailed Results\n\n`;
  for (const result of results) {
    table += `### ${result.scenario.id}: ${result.scenario.name}\n\n`;
    table += `**Land ID:** \`${result.scenario.landId}\`\n`;
    table += `**Scan ID:** \`${result.actual.scanId}\`\n\n`;
    table += `**Scores:**\n`;
    table += `- Biotic: ${result.actual.bioticScore.toFixed(2)}\n`;
    table += `- Abiotic: ${result.actual.abioticScore.toFixed(2)}\n`;
    table += `- Metal: ${result.actual.metalScore.toFixed(2)}\n\n`;
    table += `**Validation:**\n`;
    result.matchDetails.forEach(detail => {
      table += `- ${detail}\n`;
    });
    table += `\n**Overrides:** ${result.actual.overridesApplied.join(', ') || 'None'}\n`;
    table += `**Tokens used:** ${result.actual.tokensUsed}\n`;
    table += `**Confidence:** ${result.actual.confidenceScore.toFixed(2)}\n\n`;
    table += `---\n\n`;
  }

  return table;
}

/**
 * Generates a decision trail for a single scan (for slide)
 */
function generateDecisionTrail(result: TestResult): string {
  let trail = `# Decision Trail: ${result.scenario.name}\n\n`;
  trail += `**Scan ID:** \`${result.actual.scanId}\`\n\n`;
  trail += `## Input Signals Detected\n\n`;
  trail += `\`\`\`\n`;
  trail += `Biotic Score:  ${result.actual.bioticScore.toFixed(2)}\n`;
  trail += `Abiotic Score: ${result.actual.abioticScore.toFixed(2)}\n`;
  trail += `Metal Score:   ${result.actual.metalScore.toFixed(2)}\n`;
  trail += `\`\`\`\n\n`;

  trail += `## Hard Override Decision\n\n`;
  if (result.actual.overridesApplied.length > 0) {
    trail += `**Overrides Applied:**\n`;
    result.actual.overridesApplied.forEach(override => {
      trail += `- \`${override}\`\n`;
    });
  } else {
    trail += `*No hard overrides triggered*\n`;
  }

  trail += `\n## Final Output\n\n`;
  trail += `- **Primary Cause:** ${result.actual.primaryCause}\n`;
  trail += `- **Spray Suppressed:** ${result.actual.spraySuppressed}\n`;
  trail += `- **Compound Stress:** ${result.actual.compoundStress}\n`;
  trail += `- **Confidence:** ${result.actual.confidenceScore.toFixed(2)}\n`;
  trail += `- **Tokens Used:** ${result.actual.tokensUsed}${result.actual.tokensUsed === 0 ? ' (LLM skipped)' : ''}\n\n`;
  trail += `> *Every decision logged. Fully auditable.*\n`;

  return trail;
}

/**
 * Instructions for manual testing
 */
function printTestInstructions() {
  console.log('\n========================================');
  console.log('CONTROLLED TEST RUNNER');
  console.log('========================================\n');
  console.log('To run the controlled tests:\n');
  console.log('1. First, run the SQL setup:');
  console.log('   psql $DATABASE_URL < setup_controlled_tests.sql\n');
  console.log('2. For each test scenario, use your app to scan a leaf image:');
  console.log('   - Select the corresponding test farm (land_id)');
  console.log('   - Upload an appropriate test image');
  console.log('   - Record the scan ID\n');
  console.log('3. After all 5 tests, run this query to validate results:');
  console.log('   Query 7 from get_demo_statistics.sql\n');
  console.log('TEST SCENARIOS:\n');

  TEST_SCENARIOS.forEach((scenario, index) => {
    console.log(`${index + 1}. ${scenario.name}`);
    console.log(`   Land ID: ${scenario.landId}`);
    console.log(`   Image: ${scenario.imageDescription}`);
    console.log(`   Expected: ${JSON.stringify(scenario.expectedOutcome, null, 2)}`);
    console.log('');
  });

  console.log('========================================\n');
}

// If running directly from command line
if (require.main === module) {
  printTestInstructions();
}

export {
  TEST_SCENARIOS,
  validateTestResult,
  formatResultsTable,
  generateDecisionTrail
};
export type { TestScenario, TestResult };
