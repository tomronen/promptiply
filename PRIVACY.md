# Privacy Policy for promptiply

**Last Updated:** November 12, 2025

## Overview

promptiply is a Chrome browser extension that refines prompts inline on ChatGPT and Claude using customizable profiles. We are committed to protecting your privacy and being transparent about how we handle your data.

## Data Collection and Storage

### What We Store Locally

All data is stored **locally on your device** using Chrome's storage API:

- **User Settings**: Your preferred mode (API/WebUI/Local), provider selection, and keyboard shortcuts
- **API Keys**: When using API mode, your OpenAI or Anthropic API keys are stored locally on your device
- **User Profiles**: Custom refinement profiles including persona, tone, style guidelines, and topic preferences
- **Topic Evolution Data**: Automatic tracking of topics you work with to improve profile refinement suggestions
- **Usage Statistics**: Basic usage counts for profile evolution (number of refinements)
- **Last Prompt**: A truncated version (up to 200 characters) of your last refined prompt for profile learning

### What We Do NOT Collect

- **No Telemetry**: We do not collect any usage analytics, crash reports, or diagnostic data
- **No Browsing History**: We do not track your browsing activity outside of ChatGPT and Claude pages
- **No Personal Information**: We do not collect names, email addresses, or any personally identifiable information
- **No Server Storage**: We do not store any of your data on our servers

## Data Transmission

### API Mode

When you use **API mode** with your own OpenAI or Anthropic API keys:

- Your prompts and refinement requests are sent **directly** to the selected provider (OpenAI or Anthropic)
- Communication goes **directly from your browser to the provider's API**
- We do not intercept, store, or have access to this communication
- Your API keys never leave your device and are only used to authenticate your requests to the provider

### WebUI Mode

When you use **WebUI mode**:

- The extension opens a temporary background tab to ChatGPT or Claude
- Your prompt is entered automatically via DOM manipulation
- The response is read from the page and the tab is closed
- All communication happens through the provider's standard web interface
- No data is sent to any third-party servers

### Local Mode

When you use **Local mode** (Llama 3):

- Everything runs **entirely in your browser** using WebGPU
- The AI model (~5GB) is downloaded once from Hugging Face and cached locally
- After initial download, **no internet connection is required**
- **No data ever leaves your device** - complete privacy
- All inference happens locally on your computer

## Third-Party Services

### AI Providers

Depending on your chosen mode, you interact with:

- **OpenAI** (API or WebUI mode with ChatGPT): Subject to [OpenAI's Privacy Policy](https://openai.com/policies/privacy-policy)
- **Anthropic** (API or WebUI mode with Claude): Subject to [Anthropic's Privacy Policy](https://www.anthropic.com/privacy)

We recommend reviewing these providers' privacy policies as your prompts and responses are processed by their services.

### Model Downloads (Local Mode)

When using Local mode, the Llama 3.1 8B model is downloaded from:

- **Hugging Face CDN**: Used to download the AI model for local inference
- After the initial download, the model is cached locally and no further downloads are needed

## Permissions Explanation

Our extension requires the following Chrome permissions:

- **storage**: To save your settings, profiles, and API keys locally on your device
- **scripting**: To inject the refinement UI into ChatGPT and Claude pages
- **activeTab**: To interact with the current tab when you trigger refinement
- **commands**: To enable keyboard shortcuts (e.g., Alt+T for refine)
- **offscreen**: To run the local AI model in a background context (Local mode only)

### Host Permissions

We request access to specific domains:

- **chat.openai.com, chatgpt.com, claude.ai**: To inject our refinement interface
- **api.openai.com, api.anthropic.com**: For direct API communication (API mode only)
- **huggingface.co and CDN domains**: To download the AI model for Local mode
- **esm.sh, cdn.skypack.dev**: For loading the web-llm library in Local mode

## Data Security

- **Local Storage**: All user data is stored using Chrome's secure storage API
- **API Keys**: Stored locally and transmitted only to the respective provider using HTTPS
- **No Backend**: We do not operate any servers that store or process your data
- **Open Source**: Our code is open source and can be audited on GitHub

## Data Retention and Deletion

- **Local Data**: All data persists only in your browser's local storage
- **Complete Removal**: Uninstalling the extension removes all associated data from your device
- **Manual Deletion**: You can clear profiles, settings, and evolution data anytime through the extension options page

## Children's Privacy

promptiply is not directed at children under the age of 13. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with information, please contact us.

## Changes to This Privacy Policy

We may update this privacy policy from time to time. The "Last Updated" date at the top of this policy indicates when it was last revised. We encourage you to review this policy periodically.

## Your Choices

You have full control over your data:

- **Mode Selection**: Choose between API, WebUI, or Local mode based on your privacy preferences
- **Profile Management**: Create, edit, or delete profiles at any time
- **Data Export**: Export your profiles for backup or transfer
- **Complete Deletion**: Uninstall the extension to remove all data

## Contact

If you have questions or concerns about this privacy policy or our data practices, please:

- Open an issue on our [GitHub repository](https://github.com/Promptiply/promptiply-chrome)
- Review our [README](README.md) for more information about features and usage

## Open Source

promptiply is open source software. You can review our complete source code, including all data handling practices, on GitHub: https://github.com/Promptiply/promptiply-chrome

---

**Summary**: We do not collect, store, or transmit your personal data to our servers. All data stays on your device. When you use external AI providers (OpenAI, Anthropic), their privacy policies apply to that communication.
