# Quick Start - Test the Options Page

## 1. Load the Extension

```bash
# In Chrome browser:
1. Open chrome://extensions/
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this directory: /path/to/promptiply
5. Extension should now be loaded
```

## 2. Open Options Page

**Method A:** From Extensions page
- Click "Details" on the promptiply extension
- Scroll down and click "Extension options"

**Method B:** From extension icon
- Right-click the promptiply icon in Chrome toolbar
- Select "Options"

## 3. Quick Functional Test

Open the browser DevTools Console (F12 → Console tab) and run:

```javascript
// Quick smoke test - paste this entire block
console.log('Testing Options page...');

// Test 1: Save Settings
document.getElementById('save-settings')?.click();

// Test 2: Run Onboarding
setTimeout(() => {
  document.getElementById('run-onboarding')?.click();
  setTimeout(() => {
    // Close modal
    document.getElementById('onboarding-skip')?.click();
  }, 500);
}, 500);

// Test 3: Switch to Providers tab
setTimeout(() => {
  document.querySelector('.tab[data-tab="providers"]')?.click();
}, 1500);

// Test 4: Switch to Profiles tab
setTimeout(() => {
  document.querySelector('.tab[data-tab="profiles"]')?.click();
}, 2000);

// Test 5: New Profile
setTimeout(() => {
  document.getElementById('new-profile')?.click();
  setTimeout(() => {
    // Close modal
    document.getElementById('wizard-cancel')?.click();
  }, 500);
}, 2500);

setTimeout(() => {
  console.log('Tests complete! Check console logs above.');
}, 3500);
```

## 4. Expected Results

You should see in the console:

```
Testing Options page...
[promptiply] saveSettings called
[promptiply] Settings saved
[promptiply] openOnboardingWizard called
[promptiply] selectTab -> providers
[promptiply] selectTab -> profiles
[promptiply] openWizard called
Tests complete! Check console logs above.
```

You should also see:
- Toast notifications appearing in bottom-right corner
- Modals opening and closing
- Tab panels switching

## 5. Manual Interactive Test

Try clicking each button and tab manually:

### Buttons to Test:
- [ ] "Save Settings" button (General tab)
- [ ] "Run Onboarding Wizard" button (General tab)
- [ ] "Save Settings" button (Providers tab)
- [ ] "New Profile" button (Profiles tab)

### Tabs to Test:
- [ ] Click "General" tab
- [ ] Click "Providers" tab  
- [ ] Click "Profiles" tab

Each action should:
1. Show a console log message
2. Show a toast notification (for button clicks)
3. Perform the expected action

## 6. Verify Settings Persist

```javascript
// Check saved settings
chrome.storage.local.get(['settings'], (data) => {
  console.log('Current settings:', data.settings);
});
```

## 7. Troubleshooting

If something doesn't work:

1. **Check Console for Errors**
   ```javascript
   // Look for these messages
   [promptiply] Options script loaded
   [promptiply] attachCoreListeners: attempting to bind core UI
   ```

2. **Verify Elements Exist**
   ```javascript
   console.log('Buttons:', {
     saveSettings: document.getElementById('save-settings'),
     runOnboarding: document.getElementById('run-onboarding'),
     newProfile: document.getElementById('new-profile')
   });
   ```

3. **Check Event Listeners**
   ```javascript
   // Look for "bound" messages in console
   [promptiply] attachCoreListeners: bound run-onboarding
   [promptiply] attachCoreListeners: bound save-settings
   ```

4. **Try Reload**
   - Reload the extension: `chrome://extensions/` → click reload icon
   - Reload the Options page: F5 or Ctrl+R

## Need More Help?

See the full testing guide: `TESTING.md`
See the solution explanation: `SOLUTION.md`
