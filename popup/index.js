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
  const $onboardCta = document.getElementById('onboard-cta');
  const $onboardDismiss = document.getElementById('onboard-dismiss');
  const $hotkeyLabel = document.getElementById('hotkey-label');
  const $refineNow = document.getElementById('refine-now');

  // Load settings and show hotkey
  chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
    const s = data[STORAGE_SETTINGS] || { mode: 'api' };
    if ($mode) $mode.value = s.mode || 'api';
    if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || getDefaultHotkey();
  });

  // Decide whether to show run-onboard button and banner
  chrome.storage.local.get(['onboarding_completed','onboardBannerDismissed'], (d) => {
    const onboarded = !!(d && d.onboarding_completed);
    const dismissed = !!(d && d.onboardBannerDismissed);
  if (onboarded && $runOnboard) $runOnboard.classList.add('hidden');
  if (!onboarded && !dismissed && $onboardBanner) $onboardBanner.classList.remove('hidden');
  });

  // Load profiles and render
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
      if ($mode) $mode.value = s.mode || 'api';
      if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || getDefaultHotkey();
    }
  });

  // Handlers
  $mode?.addEventListener('change', () => {
    chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
      const cur = data[STORAGE_SETTINGS] || {};
      cur.mode = $mode.value;
      chrome.storage.local.set({ [STORAGE_SETTINGS]: cur });
    });
  });

  $profile?.addEventListener('change', () => {
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const cur = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
      cur.activeProfileId = $profile.value || null;
      chrome.storage.sync.set({ [STORAGE_PROFILES]: cur });
    });
  });

  $openOptions?.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open('chrome://extensions/?options=' + chrome.runtime.id);
  });

  // Open options and start onboarding (opens options with ?onboard=1)
  async function openOptionsForOnboarding() {
    const url = chrome.runtime.getURL('options/index.html?onboard=1');
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        // also create a tab pointing to the onboarding URL to be safe
        chrome.tabs.create({ url, active: true });
      } else {
        window.open(url);
      }
    } catch (e) {
      try { window.open(url); } catch (_) {}
    }
    // Hide banner and persist dismissal
  if ($onboardBanner) $onboardBanner.classList.add('hidden');
    chrome.storage.local.set({ onboardBannerDismissed: true });
    try { window.close(); } catch(_) {}
  }

  $runOnboard?.addEventListener('click', openOptionsForOnboarding);
  $onboardCta?.addEventListener('click', openOptionsForOnboarding);

  // Dismiss button persists dismissal so banner won't reappear
  $onboardDismiss?.addEventListener('click', () => {
  try { if ($onboardBanner) $onboardBanner.classList.add('hidden'); } catch(_) {}
    chrome.storage.local.set({ onboardBannerDismissed: true });
  });

  $refineNow?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'PR_TRIGGER_REFINE' });
    } catch (_) {}
  });

  function renderProfiles(p) {
    if (!$profile) return;
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


