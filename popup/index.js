(function(){
  const STORAGE_SETTINGS = 'settings';
  const STORAGE_PROFILES = 'profiles';

  function getDefaultHotkey() {
    const platform = navigator.platform.toLowerCase();
    return platform.includes('mac') ? 'Ctrl+T' : 'Alt+T';
  }

  const $mode = document.getElementById('mode');
  const $profile = document.getElementById('profile');
  const $openOptions = document.getElementById('open-options');
  const $runOnboard = document.getElementById('run-onboard');
  const $onboardBanner = document.getElementById('onboard-banner');
  const $onboardCTA = document.getElementById('onboard-cta');
  const $onboardDismiss = document.getElementById('onboard-dismiss');
  const $hotkeyLabel = document.getElementById('hotkey-label');
  const $refineNow = document.getElementById('refine-now');

  chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
    const s = data[STORAGE_SETTINGS] || { mode: 'api' };
    $mode.value = s.mode || 'api';
    if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || getDefaultHotkey();
  });

  // Hide run-onboard if already onboarded
  chrome.storage.local.get(['onboarded','onboardBannerDismissed'], (d) => {
    const onboarded = !!(d && d.onboarded);
    const dismissed = !!(d && d.onboardBannerDismissed);
    if (onboarded && $runOnboard) $runOnboard.style.display = 'none';
    // Show banner if not onboarded and not dismissed
    if (!onboarded && !dismissed && $onboardBanner) {
      $onboardBanner.style.display = 'block';
    }
  });

  chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
    const p = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
    renderProfiles(p);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[STORAGE_PROFILES]) {
      renderProfiles(changes[STORAGE_PROFILES].newValue || { list: [], activeProfileId: null });
    }
    if (area === 'local' && changes[STORAGE_SETTINGS]) {
      const s = changes[STORAGE_SETTINGS].newValue || { mode: 'api' };
      $mode.value = s.mode || 'api';
      if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || getDefaultHotkey();
    }
  });

  $mode.addEventListener('change', () => {
    chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
      const cur = data[STORAGE_SETTINGS] || {};
      cur.mode = $mode.value;
      chrome.storage.local.set({ [STORAGE_SETTINGS]: cur });
    });
  });

  $profile.addEventListener('change', () => {
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const cur = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
      cur.activeProfileId = $profile.value || null;
      chrome.storage.sync.set({ [STORAGE_PROFILES]: cur });
    });
  });

  $openOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open('chrome://extensions/?options=' + chrome.runtime.id);
  });

  $runOnboard?.addEventListener('click', async () => {
    const onboardUrl = chrome.runtime.getURL('options/index.html?onboard=1');
    try {
      // Try to find an existing options tab for this extension
      const tabs = await chrome.tabs.query({});
      const existing = tabs.find(t => t.url && (t.url === onboardUrl || t.url.includes('options/index.html')));
      // Helper that triggers startOnboarding when tab is fully loaded
      const triggerStartOnboardingInTab = (tabId) => {
        try {
          chrome.tabs.get(tabId, (t) => {
            if (!t) return;
            if (t.status === 'complete') {
              try { chrome.scripting.executeScript({ target: { tabId }, func: () => { try { if (window.startOnboarding) window.startOnboarding(); } catch(_) {} } }); } catch(_) {}
            } else {
              const handler = (updatedTabId, changeInfo) => {
                if (updatedTabId !== tabId) return;
                if (changeInfo.status === 'complete') {
                  try { chrome.scripting.executeScript({ target: { tabId }, func: () => { try { if (window.startOnboarding) window.startOnboarding(); } catch(_) {} } }); } catch(_) {}
                  try { chrome.tabs.onUpdated.removeListener(handler); } catch(_) {}
                }
              };
              chrome.tabs.onUpdated.addListener(handler);
            }
          });
        } catch (_) {}
      };

      if (existing && existing.id) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.windows.update(existing.windowId, { focused: true }).catch(()=>{});
        triggerStartOnboardingInTab(existing.id);
        try { chrome.runtime.sendMessage({ type: 'PR_START_ONBOARDING' }); } catch(_) {}
      } else {
        const created = await chrome.tabs.create({ url: onboardUrl });
        const tabId = created?.id;
        if (tabId) triggerStartOnboardingInTab(tabId);
        try { chrome.runtime.sendMessage({ type: 'PR_START_ONBOARDING' }); } catch(_) {}
      }
    } catch (e) {
      // fallback
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    }
    // close popup to avoid stray open popup UI
    try { window.close(); } catch(_) {}
  });

  // Banner CTA opens onboarding
  $onboardCTA?.addEventListener('click', async () => {
    const onboardUrl = chrome.runtime.getURL('options/index.html?onboard=1');
    try {
      const tabs = await chrome.tabs.query({});
      const existing = tabs.find(t => t.url && (t.url === onboardUrl || t.url.includes('options/index.html')));
      // reuse helper from above
      const triggerStartOnboardingInTab = (tabId) => {
        try {
          chrome.tabs.get(tabId, (t) => {
            if (!t) return;
            if (t.status === 'complete') {
              try { chrome.scripting.executeScript({ target: { tabId }, func: () => { try { if (window.startOnboarding) window.startOnboarding(); } catch(_) {} } }); } catch(_) {}
            } else {
              const handler = (updatedTabId, changeInfo) => {
                if (updatedTabId !== tabId) return;
                if (changeInfo.status === 'complete') {
                  try { chrome.scripting.executeScript({ target: { tabId }, func: () => { try { if (window.startOnboarding) window.startOnboarding(); } catch(_) {} } }); } catch(_) {}
                  try { chrome.tabs.onUpdated.removeListener(handler); } catch(_) {}
                }
              };
              chrome.tabs.onUpdated.addListener(handler);
            }
          });
        } catch (_) {}
      };

      if (existing && existing.id) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.windows.update(existing.windowId, { focused: true }).catch(()=>{});
        triggerStartOnboardingInTab(existing.id);
        try { chrome.runtime.sendMessage({ type: 'PR_START_ONBOARDING' }); } catch(_) {}
      } else {
        const created = await chrome.tabs.create({ url: onboardUrl });
        const tabId = created?.id;
        if (tabId) triggerStartOnboardingInTab(tabId);
        try { chrome.runtime.sendMessage({ type: 'PR_START_ONBOARDING' }); } catch(_) {}
      }
    } catch (e) {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    }
    // Optionally hide banner after clicking and persist dismissal
    try { $onboardBanner.style.display = 'none'; } catch(_) {}
    chrome.storage.local.set({ onboardBannerDismissed: true });
    try { window.close(); } catch(_) {}
  });

  // Dismiss button persists dismissal so banner won't reappear
  $onboardDismiss?.addEventListener('click', () => {
    try { $onboardBanner.style.display = 'none'; } catch(_) {}
    chrome.storage.local.set({ onboardBannerDismissed: true });
  });

  $refineNow?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'PR_TRIGGER_REFINE' });
    } catch (_) {}
  });

  function renderProfiles(p) {
    $profile.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '(no profile)';
    $profile.appendChild(optNone);
    p.list.forEach((prof) => {
      const o = document.createElement('option');
      o.value = prof.id;
      o.textContent = prof.name || prof.id;
      $profile.appendChild(o);
    });
    if (p.activeProfileId) $profile.value = p.activeProfileId;
  }
})();


