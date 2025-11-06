# Fix for Duplicate Event Handler Issue

## Problem Summary

The Promptiply options page had two failing tests:
1. ✗ Onboarding modal did NOT open
2. ✗ Providers tab switch (panel not visible)

## Root Cause

The code had **both** direct event listeners AND delegated event listeners firing for the same elements:

1. **Direct listeners** in `attachCoreListeners()` (lines 1439-1706):
   - Attached directly to specific elements (buttons, tabs)
   - Marked elements with `dataset.prAttached = "1"`

2. **Delegated listeners** on document level (lines 1720-1832):
   - Listened to all clicks at document level
   - Intended as "last-resort fallback" for dynamically added elements
   - **BUT** were also firing for elements with direct listeners

### The Double-Fire Problem

When a button or tab was clicked:
1. **First execution**: Direct listener fires → opens modal / shows tab panel ✓
2. **Second execution**: Delegated listener fires → toggles modal closed / hides tab panel again ✗

This created the illusion that nothing happened, when in reality both actions occurred in sequence.

## Solution Applied

Added checks in all delegated handlers to **skip execution** when an element already has a direct listener attached:

```javascript
const tab = target.closest(".tab");
if (tab && tab.dataset && tab.dataset.tab) {
  // Skip if already has direct listener
  if (tab.dataset.prAttached) return;  // ← NEW CHECK
  console.log("[promptiply] delegated tab click ->", tab.dataset.tab);
  selectTab(tab.dataset.tab);
  return;
}
```

This pattern was applied to ALL delegated handlers:
- Tab switching
- run-onboarding button
- save-settings button
- save-providers-settings button
- new-profile button
- restore-defaults button
- export-profiles button
- import-profiles button

### Variable Naming Fixes

Also fixed variable naming conflicts where local variables shadowed function names:
- `const saveSettings` → `const saveSettingsBtn`
- `const saveProvidersSettings` → `const saveProvidersSettingsBtn`
- `const exportProfiles` → `const exportProfilesBtn`
- `const importProfiles` → `const importProfilesBtn`

## Changes Made

**File**: `/home/runner/work/promptiply/promptiply/options/index.js`

- Lines 1730-1731: Added prAttached check for tab switching
- Lines 1739-1740: Added prAttached check for run-onboarding
- Lines 1752-1753: Added prAttached check for save-settings (renamed variable)
- Lines 1765-1766: Added prAttached check for save-providers-settings (renamed variable)
- Lines 1778-1779: Added prAttached check for new-profile
- Lines 1791-1792: Added prAttached check for restore-defaults
- Lines 1804-1805: Added prAttached check for export-profiles (renamed variable)
- Lines 1817-1818: Added prAttached check for import-profiles (renamed variable)

## Validation

Created and ran validation script (`validate-fix.js`) that confirms:
- ✓ attachCoreListeners sets prAttached markers (5 instances found)
- ✓ Delegated handlers check prAttached before executing (8 checks found)
- ✓ Explanatory comments are present (8 comments)
- ✓ No variable naming conflicts
- ✓ Delegated listener is still registered

## Expected Behavior After Fix

When testing with the test-console.js script, both previously failing tests should now pass:
- ✓ Onboarding modal opens (and stays open)
- ✓ Providers tab switch (panel becomes and stays visible)

## Technical Notes

The fix maintains the dual-handler architecture:
- **Direct listeners**: Handle elements present at page load (primary handlers)
- **Delegated listeners**: Handle dynamically added elements (true fallback)

This approach provides robustness while eliminating the duplicate execution issue.
