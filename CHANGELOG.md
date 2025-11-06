# Changelog

## [Unreleased]

### Fixed
- **ChatGPT Initialization Issue**: Fixed extension causing ChatGPT to get stuck during page load
  - Added 500ms initialization delay to prevent interference with ChatGPT's critical startup requests
  - Implemented debouncing (200ms interval) for DOM update function to reduce overhead
  - Optimized MutationObserver to only watch childList changes (removed attribute observation)
  - Added depth limit (15 levels) and max children limit (50 per node) to deepQuerySelector to prevent excessive recursion
  - These changes prevent the extension from interfering with ChatGPT's `/ces/v1/projects/oai/settings` request and other initialization calls

### Added
- **Predefined Profiles System**: Three built-in profiles (Technical Writer, Dev Helper, Marketing Copy) with import functionality
- **Restore Defaults**: Remove imported predefined profiles with confirmation modal and 10-second undo
- **Profile Export/Import**: Export profiles to JSON with versioned envelope format (schemaVersion 1)
- **Multiple Import Methods**: Load profiles from URL, file upload, or pasted JSON
- **CORS Fallback**: When URL import fails due to CORS, clear error message suggests alternatives
- **Import Metadata Tracking**: Profiles marked with `importedFromPredefined`, `predefinedId`, and `importedAt` fields
- **Undo Functionality**: 10-second window to undo Restore Defaults operation
- **Persistent Predefined Profiles**: Predefined profiles stored in chrome.storage.local for customization
- **Schema Versioning**: Import envelope with `schemaVersion` field for future compatibility
- **Validation Functions**: `validatePredefinedArray()` and `parseImportEnvelope()` for data integrity
- **Accessibility Improvements**: ARIA labels, roles, and live regions for screen readers
- **Comprehensive Documentation**: NOTES.md with technical details, workflows, and troubleshooting

### Changed
- Predefined profiles now loaded from storage (with built-in fallback)
- Import process adds metadata for tracking and restore functionality
- Export format changed to versioned envelope (backward compatible with legacy imports)

### Fixed
- Options page buttons now functional (Save Settings, Run Onboarding, New Profile)
- Tab switching between General/Providers/Profiles now works correctly
- Event binding robust to DOM timing issues (4-tier strategy)
- Syntax errors and scope issues in index.js resolved

## [Previous Versions]

See git history for older changes.
