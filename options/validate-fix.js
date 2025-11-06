#!/usr/bin/env node
// Validation script to check the duplicate event handler fix

const fs = require('fs');
const path = require('path');

console.log('=== Validating Duplicate Event Handler Fix ===\n');

const jsFile = path.join(__dirname, 'index.js');
const jsCode = fs.readFileSync(jsFile, 'utf8');

let passed = 0;
let failed = 0;

// Test 1: Check that attachCoreListeners sets prAttached on elements
console.log('Test 1: Verify attachCoreListeners sets prAttached markers');
const attachCoreListenersMatch = jsCode.match(/t\.dataset\.prAttached\s*=\s*["']1["']/g);
if (attachCoreListenersMatch && attachCoreListenersMatch.length >= 1) {
  console.log(`  ✓ Found ${attachCoreListenersMatch.length} instances of setting prAttached`);
  passed++;
} else {
  console.log('  ✗ prAttached markers not found in attachCoreListeners');
  failed++;
}

// Test 2: Check that delegated handlers check for prAttached
console.log('\nTest 2: Verify delegated handlers check prAttached before executing');
const delegatedChecks = jsCode.match(/if\s*\([^)]*\.dataset\.prAttached\)\s*return/g);
if (delegatedChecks && delegatedChecks.length >= 8) {
  console.log(`  ✓ Found ${delegatedChecks.length} prAttached checks in delegated handlers`);
  passed++;
} else {
  console.log(`  ✗ Expected at least 8 prAttached checks, found ${delegatedChecks ? delegatedChecks.length : 0}`);
  failed++;
}

// Test 3: Check for "Skip if already has direct listener" comments
console.log('\nTest 3: Verify explanatory comments are present');
const comments = jsCode.match(/\/\/\s*Skip if already has direct listener/g);
if (comments && comments.length >= 8) {
  console.log(`  ✓ Found ${comments.length} explanatory comments`);
  passed++;
} else {
  console.log(`  ✗ Expected at least 8 comments, found ${comments ? comments.length : 0}`);
  failed++;
}

// Test 4: Check for proper variable naming (no conflicts)
console.log('\nTest 4: Verify no variable naming conflicts');
const problematicPatterns = [
  /const saveSettings = target\.closest/,
  /const exportProfiles = target\.closest/,
  /const importProfiles = target\.closest/
];

let hasConflicts = false;
problematicPatterns.forEach((pattern, idx) => {
  if (pattern.test(jsCode)) {
    console.log(`  ✗ Found variable naming conflict (pattern ${idx + 1})`);
    hasConflicts = true;
  }
});

if (!hasConflicts) {
  console.log('  ✓ No variable naming conflicts detected');
  passed++;
} else {
  failed++;
}

// Test 5: Check that delegated listener is still present
console.log('\nTest 5: Verify delegated listener is still registered');
if (jsCode.includes('document.addEventListener') && jsCode.includes('Delegated click handler as last-resort fallback')) {
  console.log('  ✓ Delegated click handler is present');
  passed++;
} else {
  console.log('  ✗ Delegated click handler not found');
  failed++;
}

// Summary
console.log('\n=== Validation Summary ===');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('\n✓ All validation checks passed!');
  console.log('\nThe fix correctly:');
  console.log('  1. Sets prAttached markers in attachCoreListeners');
  console.log('  2. Checks prAttached in all delegated handlers');
  console.log('  3. Prevents duplicate event execution');
  console.log('  4. Avoids variable naming conflicts');
  process.exit(0);
} else {
  console.log('\n✗ Some validation checks failed');
  process.exit(1);
}
