promptiply (Chrome MV3)
===========================

Refine prompts inline on ChatGPT and Claude using profiles. Choose API mode (OpenAI/Anthropic) or WebUI mode.

Install (Developer Mode)
------------------------
1. Chrome → Extensions → Enable Developer Mode
2. Load Unpacked → select the `extension` folder

Usage
-----
- On chat.openai.com or claude.ai, a Refine button appears; or press Alt+R.
- Popup: switch profiles and mode.
- Options page: setup wizard (mode, provider, API keys/models), create profiles.

Modes
-----
- API: Uses your provider API key (stored locally).
- WebUI: Opens a temporary background tab to the provider site, sends a refinement instruction, reads output, and closes the tab.

Permissions
-----------
- Minimal: storage, tabs, scripting, commands, and specific host sites.

Privacy
-------
- No telemetry. API requests go only to the configured provider.

Notes
-----
- WebUI DOM may change; switch to API mode if it fails.


