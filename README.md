promptiply (Chrome MV3)
===========================

Refine prompts inline on ChatGPT and Claude using profiles. Choose API mode (OpenAI/Anthropic), WebUI mode, or Local mode (Llama 3 running entirely in your browser).

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
- **API**: Uses your provider API key (stored locally). Requires internet connection and API keys.
- **WebUI**: Opens a temporary background tab to the provider site, sends a refinement instruction, reads output, and closes the tab. Requires internet connection and manual interaction on provider sites.
- **Local (Llama 3)**: Runs entirely in your browser using [web-llm](https://github.com/mlc-ai/web-llm) and Llama 3.1 8B Instruct model. Requires WebGPU support. The model is downloaded once and cached locally (~5GB initial download). After that, refinement works completely offline and privately - no data leaves your device.

Permissions
-----------
- Minimal: storage, tabs, scripting, commands, and specific host sites.

Privacy
-------
- No telemetry. API requests go only to the configured provider.
- **Local mode**: Complete privacy - the model runs entirely in your browser. No data is sent anywhere, everything stays on your device.

Notes
-----
- WebUI DOM may change; switch to API mode if it fails.
- Local mode requires WebGPU support (available in Chrome/Edge 113+). Initial model download may take several minutes depending on your connection speed. A progress bar will show download status.

Acknowledgments
---------------
Local mode is powered by [web-llm](https://github.com/mlc-ai/web-llm), a high-performance in-browser LLM inference engine by the MLC AI team. Thank you for making private, offline LLM inference possible in the browser! 



