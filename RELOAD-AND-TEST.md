# How to Reload and Test the Fixed Extension

## Changes Made

I've updated the WebUI automation with new selectors for the latest ChatGPT and Claude interfaces:

### ChatGPT Input Selectors (Updated):
- `#prompt-textarea`
- `div[contenteditable="true"][data-id="root"]`
- `#composer-background textarea`
- `[data-testid="composer-input"]`
- And more fallbacks...

### ChatGPT Send Button Selectors (Updated):
- `button[data-testid="send-button"]`
- `button[data-testid="composer-send-button"]`
- `button[aria-label="Send message"]`
- And more fallbacks...

### Claude Input Selectors (Updated):
- `div.ProseMirror[contenteditable="true"]`
- `div[contenteditable="true"][placeholder*="Reply"]`
- `div[contenteditable="true"][data-placeholder]`
- And more fallbacks...

---

## Step 1: Reload the Extension

1. **Open Chrome Extensions Page:**
   - Go to: `chrome://extensions/`
   - OR click the puzzle icon → "Manage Extensions"

2. **Find "promptiply" extension**

3. **Click the Reload button** (circular arrow icon)
   - This will reload the extension with the new code

---

## Step 2: Verify WebUI Mode is Enabled

Open the console (F12) and run:

```javascript
chrome.storage.local.get(['settings'], (data) => {
  console.log('=== PROMPTIPLY SETTINGS ===');
  console.log('Mode:', data.settings?.mode);
  console.log('Provider:', data.settings?.provider);
  console.log('Full settings:', JSON.stringify(data.settings, null, 2));

  if (data.settings?.mode === 'webui') {
    console.log('✓ WebUI mode is ENABLED');
  } else {
    console.warn('✗ WebUI mode is NOT enabled. Current mode:', data.settings?.mode);
  }
});
```

If WebUI mode is NOT enabled, run this to enable it:

```javascript
chrome.storage.local.get(['settings'], (data) => {
  const settings = data.settings || {};
  settings.mode = 'webui';
  chrome.storage.local.set({ settings }, () => {
    console.log('✓ WebUI mode enabled!');
    alert('WebUI mode enabled! Reload the page and try again.');
  });
});
```

---

## Step 3: Test on ChatGPT

1. **Open ChatGPT:**
   - Go to: https://chatgpt.com/ or https://chat.openai.com/

2. **Look for the "Refine" button:**
   - Should appear at the bottom-right of the input box
   - Purple button with gradient background

3. **Type a test prompt:**
   ```
   Write a function to check if a number is prime
   ```

4. **Click the "Refine" button** (or press Ctrl+T / Cmd+T)

5. **Watch the console** (F12 → Console tab):
   - You should see `[promptiply]` log messages
   - A new tab will open briefly in the background
   - The refined prompt will appear in an overlay

6. **Look for these console messages:**
   ```
   [promptiply] Sending refinement request
   [promptiply:bg] Mode/provider/model {mode: 'webui', ...}
   [promptiply:bg] ChatGPT mode - keeping tab inactive until response completes
   [promptiply:webui] ChatGPT automation starting
   [promptiply:webui] Found ChatGPT input: DIV
   [promptiply:webui] Found ChatGPT send button: YES
   [promptiply:webui] Clicked ChatGPT send button
   [promptiply:webui] Found ChatGPT assistant message
   [promptiply:webui] ChatGPT response complete
   [promptiply] Refinement response {ok: true, ...}
   ```

---

## Step 4: Test on Claude

1. **Open Claude:**
   - Go to: https://claude.ai/

2. **Type a test prompt:**
   ```
   Explain quantum computing
   ```

3. **Click the "Refine" button**

4. **Watch the console for Claude-specific messages:**
   ```
   [promptiply:webui] Claude automation starting
   [promptiply:webui] Found input: ProseMirror
   [promptiply:webui] Text after insertion: ...
   [promptiply:webui] Found send button: ...
   [promptiply:webui] Clicked send button
   [promptiply:webui] Claude response complete
   ```

---

## Debugging: Service Worker Console

For detailed debugging, open the service worker console:

1. Go to `chrome://extensions/`
2. Find "promptiply"
3. Click **"service worker"** link (under "Inspect views")
4. This opens the background script console
5. Try the refine button again
6. You'll see detailed logs from the automation

Look for errors like:
- `NOT FOUND` - means selectors didn't match
- `timeout` - means the automation waited too long
- API errors - check your settings

---

## Common Issues & Fixes

### Issue 1: "Extension context invalidated"
**Fix:** Reload the extension at `chrome://extensions/`

### Issue 2: Button doesn't appear
**Fix:**
- Reload the ChatGPT/Claude page
- Check if content script is injected (look for `[promptiply]` in console)

### Issue 3: "NOT FOUND" in logs
**Fix:** The selectors may need updating. Run this in the ChatGPT/Claude console to find the input:

```javascript
// Find the input element
const inputs = [
  document.querySelector('#prompt-textarea'),
  document.querySelector('[contenteditable="true"]'),
  document.querySelector('textarea')
].filter(Boolean);

console.log('Found inputs:', inputs);
inputs.forEach(input => {
  console.log('Input:', input.tagName, input.id, input.className, input.getAttribute('data-testid'));
});
```

### Issue 4: New tab opens but prompt doesn't send
**Check:**
1. The input field selector is correct
2. The send button selector is correct
3. Check service worker console for detailed logs

---

## Expected Behavior

When you click "Refine":

1. ✓ Shows "Refining draft..." overlay
2. ✓ Opens new tab in background (you may see it flash)
3. ✓ Automatically types your prompt + refinement instruction
4. ✓ Automatically clicks send
5. ✓ Waits for response
6. ✓ Closes the tab
7. ✓ Shows refined prompt in an overlay
8. ✓ You can edit the refined prompt in the textarea
9. ✓ Click "Apply" to insert it into your current chat

---

## Still Having Issues?

1. **Check the service worker console** for detailed logs
2. **Share the console errors** - look for lines with `[promptiply]`
3. **Try each mode:**
   - WebUI mode (what we just fixed)
   - API mode (needs API key)
   - Local mode (downloads model, may be slow first time)

4. **Manual selector test:** On ChatGPT/Claude, open console and run:

```javascript
// Test if we can find the input
const input = document.querySelector('#prompt-textarea') ||
              document.querySelector('[contenteditable="true"]');
console.log('Input found:', input);

// Test if we can find send button
const sendBtn = document.querySelector('button[data-testid="send-button"]') ||
                document.querySelector('button[aria-label*="Send"]');
console.log('Send button found:', sendBtn);
```

If these return `null`, the selectors need further updates.

---

## Success Indicators

You'll know it's working when:
- ✅ Console shows `[promptiply:webui] ChatGPT/Claude automation starting`
- ✅ Console shows `Found ChatGPT input: DIV` (or similar)
- ✅ Console shows `Found send button: YES`
- ✅ Console shows `ChatGPT response complete`
- ✅ Overlay appears with refined prompt
- ✅ No error messages in console

Good luck! 🚀
