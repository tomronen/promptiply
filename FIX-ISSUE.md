# Promptiply Issue Fix Guide

## Problem Summary

Your console shows:
```
[promptiply] Refinement failed: OpenAI API key not configured
```

This means the extension is configured to use **API mode with OpenAI**, but no API key is set.

## Quick Fix (Choose One)

### Option 1: Switch to WebUI Mode (Recommended - No API Key Needed)

This will use ChatGPT/Claude's web interface directly, no API costs!

**Steps:**
1. Open Chrome Developer Tools Console (F12)
2. Paste this code and press Enter:

```javascript
chrome.storage.local.get(['settings'], (data) => {
  const settings = data.settings || {};
  settings.mode = 'webui';
  chrome.storage.local.set({ settings }, () => {
    console.log('✓ Switched to WebUI mode!');
    console.log('Current settings:', settings);
    alert('Switched to WebUI mode! Reload this page and try the Refine button again.');
  });
});
```

3. Reload the ChatGPT/Claude page
4. Click the "Refine" button again

---

### Option 2: Add Your OpenAI API Key

If you have an OpenAI API key and want to use it:

**Steps:**
1. Get your API key from: https://platform.openai.com/api-keys
2. Open Chrome Developer Tools Console (F12)
3. Paste this code (replace `YOUR_API_KEY_HERE`):

```javascript
chrome.storage.local.get(['settings'], (data) => {
  const settings = data.settings || {};
  settings.mode = 'api';
  settings.provider = 'openai';
  settings.openaiKey = 'YOUR_API_KEY_HERE';  // ← Replace this
  settings.openaiModel = 'gpt-4o-mini';
  chrome.storage.local.set({ settings }, () => {
    console.log('✓ OpenAI API key saved!');
    alert('API key saved! Try the Refine button again.');
  });
});
```

---

### Option 3: Use Local Mode (Free, No API Key, Runs on Your GPU)

This downloads a small model and runs it locally using WebGPU.

**Steps:**
1. Open Chrome Developer Tools Console (F12)
2. Paste this code:

```javascript
chrome.storage.local.get(['settings'], (data) => {
  const settings = data.settings || {};
  settings.mode = 'local';
  chrome.storage.local.set({ settings }, () => {
    console.log('✓ Switched to Local mode!');
    alert('Switched to Local mode! First use will download the model (~1GB). Reload this page and try again.');
  });
});
```

3. Reload the ChatGPT/Claude page
4. Click "Refine" button (first time will take a while to download model)

---

## Check Current Settings

To see your current settings:

```javascript
chrome.storage.local.get(['settings'], (data) => {
  console.log('Current settings:', JSON.stringify(data.settings, null, 2));
});
```

---

## Why This Happened

The extension has 3 modes:
- **API**: Uses OpenAI/Anthropic API (needs API key, costs money)
- **WebUI**: Uses ChatGPT/Claude web interface (free if you have access)
- **Local**: Uses local model on your computer (free, needs WebGPU)

Your extension is currently in **API mode** but has no API key configured.

---

## WebUI Mode Issue: Prompt Not Being Copied

If you switch to WebUI mode and the prompt still isn't being copied to the new chat, this is likely because:

1. **ChatGPT/Claude UI changed** - The selectors in the code may be outdated
2. **Extension permissions** - The extension may not have proper access

### Debug WebUI Mode:

Open the background service worker console:
1. Go to `chrome://extensions`
2. Find "promptiply"
3. Click "service worker" link under "Inspect views"
4. You'll see detailed logs when you click Refine

Look for these log messages:
- `[promptiply:webui] Found input:` - Should find the input field
- `[promptiply:webui] Found send button:` - Should find the send button
- `[promptiply:webui] Text after insertion:` - Should show the inserted text

If any of these fail, the selectors need updating.

---

## Advanced Debug Tool

I've created a debug page for you at:
`/Users/ecirt/Source/promptiply/debug-settings.html`

To use it:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `/Users/ecirt/Source/promptiply`
5. Open the debug page by navigating to: `chrome-extension://YOUR_EXTENSION_ID/debug-settings.html`

(Find YOUR_EXTENSION_ID in chrome://extensions under the promptiply extension)

---

## Test the Fix

After applying any fix above:
1. Reload the ChatGPT or Claude page
2. Type a test prompt in the input box
3. Click the purple "Refine" button (or press Ctrl+T / Cmd+T)
4. You should see the refinement working!

---

## Still Having Issues?

Check the browser console for errors:
- Press F12 to open Developer Tools
- Go to the "Console" tab
- Look for `[promptiply]` messages
- Share the error messages for further debugging
