(function(){
  const STORAGE_SETTINGS = 'settings';
  const STORAGE_PROFILES = 'profiles';

  const $mode = document.getElementById('mode');
  const $profile = document.getElementById('profile');
  const $openOptions = document.getElementById('open-options');
  const $hotkeyLabel = document.getElementById('hotkey-label');
  const $refineNow = document.getElementById('refine-now');

  chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
    const s = data[STORAGE_SETTINGS] || { mode: 'api' };
    $mode.value = s.mode || 'api';
    if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || 'Alt+R';
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
      if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || 'Alt+R';
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


