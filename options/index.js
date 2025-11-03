(function(){
  const STORAGE_SETTINGS = 'settings';
  const STORAGE_PROFILES = 'profiles';

  const $mode = document.getElementById('mode');
  const $openaiKey = document.getElementById('openai-key');
  const $openaiModelSelect = document.getElementById('openai-model-select');
  const $openaiModelCustom = document.getElementById('openai-model-custom');
  const $anthropicKey = document.getElementById('anthropic-key');
  const $anthropicModelSelect = document.getElementById('anthropic-model-select');
  const $anthropicModelCustom = document.getElementById('anthropic-model-custom');
  const $provider = document.getElementById('provider');
  const $refineHotkeyText = document.getElementById('refine-hotkey-text');
  const $refineHotkeyDisplay = document.getElementById('refine-hotkey-display');
  const $refineHotkeyRecord = document.getElementById('refine-hotkey-record');
  const $refineHotkeyRecording = document.getElementById('refine-hotkey-recording');
  const $saveSettings = document.getElementById('save-settings');
  let isRecordingHotkey = false;
  let recordedHotkey = null;
  const $saveProvidersSettings = document.getElementById('save-providers-settings');

  const $profilesList = document.getElementById('profiles-list');
  const $newProfile = document.getElementById('new-profile');
  const $modal = document.getElementById('profile-modal');
  const $wizardBody = document.getElementById('wizard-body');
  const $wizardCancel = document.getElementById('wizard-cancel');
  const $wizardBack = document.getElementById('wizard-back');
  const $wizardNext = document.getElementById('wizard-next');
  const $wizardSave = document.getElementById('wizard-save');
  const $wizardSteps = Array.from(document.querySelectorAll('.step'));
  let wizardState = { step: 1, editingId: null, name: '', persona: '', tone: '', guidelines: [] };
  // Onboarding state
  let isOnboarding = false;
  let onboardingSettingsSaved = false;
  const $tabs = Array.from(document.querySelectorAll('.tab'));
  const $tabPanels = {
    general: document.getElementById('tab-general'),
    providers: document.getElementById('tab-providers'),
    profiles: document.getElementById('tab-profiles')
  };
  const $version = document.getElementById('version');
  const $runOnboardOptions = document.getElementById('run-onboard-options');
  const $wizardProgress = document.getElementById('wizard-progress');
  const $analyticsOptin = document.getElementById('analytics-optin');
  const $analyticsView = document.getElementById('analytics-view');
  const $analyticsExport = document.getElementById('analytics-export');
  const $analyticsClear = document.getElementById('analytics-clear');
  const $analyticsList = document.getElementById('analytics-list');
  const $analyticsCount = document.getElementById('analytics-count');

  function getDefaultHotkey() {
    const platform = navigator.platform.toLowerCase();
    return platform.includes('mac') ? 'Ctrl+T' : 'Alt+T';
  }

  // Tabs behavior
  $tabs.forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  function selectTab(name){
    $tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    Object.entries($tabPanels).forEach(([k, el]) => { 
      if (el) {
        if (k === name) {
          el.classList.remove('tab-panel-hidden');
        } else {
          el.classList.add('tab-panel-hidden');
        }
      }
    });
  }

  function updateProviderDisabled() {
    const isWebUI = $mode.value === 'webui';
    const isLocal = $mode.value === 'local';
    const $providerField = $provider.closest('.field');
    if ($providerField) {
      $providerField.classList.toggle('disabled', isWebUI || isLocal);
    }
  }

  // Load settings
  chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
    const s = data[STORAGE_SETTINGS] || { mode: 'api' };
    $mode.value = s.mode || 'api';
    $provider.value = s.provider || (s.openaiKey ? 'openai' : (s.anthropicKey ? 'anthropic' : 'openai'));
    $openaiKey.value = s.openaiKey || '';
    setModelSelect($openaiModelSelect, $openaiModelCustom, s.openaiModel || 'gpt-5-nano');
    $anthropicKey.value = s.anthropicKey || '';
    setModelSelect($anthropicModelSelect, $anthropicModelCustom, s.anthropicModel || 'claude-haiku-4-5');
    recordedHotkey = s.refineHotkey || getDefaultHotkey();
    updateHotkeyDisplay();
    updateProviderDisabled();
    // Analytics opt-in default
    try { $analyticsOptin.checked = !!s.analyticsOptIn; } catch (_) {}
  });

  // If opened with ?onboard=1, start onboarding after init
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onboard')) {
      setTimeout(() => startOnboarding(), 200);
    }
  } catch (_) {}

  // Wire Run Onboarding button in options
  $runOnboardOptions?.addEventListener('click', () => startOnboarding());

  // Analytics helpers: append event and purge older than retentionDays
  const ANALYTICS_RETENTION_DAYS = 90;
  function appendAnalyticsEvent(ev) {
    try {
      chrome.storage.local.get(['analyticsEvents'], (d) => {
        const list = d.analyticsEvents || [];
        list.push(ev);
        // Purge older events
        const cutoff = Date.now() - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const pruned = list.filter(x => !x.ts || x.ts >= cutoff);
        chrome.storage.local.set({ analyticsEvents: pruned }, () => {
          updateAnalyticsCount();
        });
      });
    } catch (_) {}
  }

  function purgeAnalytics() {
    chrome.storage.local.set({ analyticsEvents: [] }, () => updateAnalyticsCount());
  }

  function updateAnalyticsCount() {
    chrome.storage.local.get(['analyticsEvents'], (d) => {
      const list = d.analyticsEvents || [];
      if ($analyticsCount) $analyticsCount.textContent = `${list.length} events`;
    });
  }

  // Wire debug buttons
  $analyticsView?.addEventListener('click', () => {
    chrome.storage.local.get(['analyticsEvents'], (d) => {
      const list = d.analyticsEvents || [];
      $analyticsList.style.display = 'block';
      $analyticsList.textContent = JSON.stringify(list, null, 2);
      updateAnalyticsCount();
    });
  });
  $analyticsExport?.addEventListener('click', () => {
    chrome.storage.local.get(['analyticsEvents'], (d) => {
      const list = d.analyticsEvents || [];
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'promptiply-analytics.json'; a.click();
      URL.revokeObjectURL(url);
    });
  });
  $analyticsClear?.addEventListener('click', () => {
    if (!confirm('Clear local analytics events?')) return;
    purgeAnalytics();
    $analyticsList.textContent = '';
    $analyticsList.style.display = 'none';
  });

  // Update initial count
  updateAnalyticsCount();

  // Purge old analytics events on load according to retention policy
  try {
    chrome.storage.local.get(['analyticsEvents'], (d) => {
      const list = d.analyticsEvents || [];
      const cutoff = Date.now() - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const pruned = list.filter(x => !x.ts || x.ts >= cutoff);
      if (pruned.length !== list.length) {
        chrome.storage.local.set({ analyticsEvents: pruned }, () => updateAnalyticsCount());
      }
    });
  } catch (_) {}

  // Load profiles
  chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
    const p = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
    renderProfiles(p);
  });

  // Set version from manifest
  if ($version && chrome.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    if (manifest?.version) {
      $version.textContent = `v${manifest.version}`;
    }
  }

  function saveSettings() {
    const s = {
      mode: $mode.value,
      provider: $provider.value,
      openaiKey: $openaiKey.value.trim() || undefined,
      openaiModel: getModelValue($openaiModelSelect, $openaiModelCustom),
      anthropicKey: $anthropicKey.value.trim() || undefined,
      anthropicModel: getModelValue($anthropicModelSelect, $anthropicModelCustom),
      refineHotkey: normalizeHotkey(recordedHotkey || getDefaultHotkey())
    };
    chrome.storage.local.set({ [STORAGE_SETTINGS]: s });
    if (recordedHotkey) {
      recordedHotkey = s.refineHotkey;
      updateHotkeyDisplay();
    }
  }

  $saveSettings.addEventListener('click', saveSettings);
  $saveProvidersSettings.addEventListener('click', saveSettings);

  // Persist analytics opt-in when toggled
  $analyticsOptin?.addEventListener('change', () => {
    chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
      const cur = data[STORAGE_SETTINGS] || {};
      cur.analyticsOptIn = !!$analyticsOptin.checked;
      chrome.storage.local.set({ [STORAGE_SETTINGS]: cur });
    });
  });

  $mode.addEventListener('change', () => {
    updateProviderDisabled();
    chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
      const cur = data[STORAGE_SETTINGS] || {};
      cur.mode = $mode.value;
      chrome.storage.local.set({ [STORAGE_SETTINGS]: cur });
    });
  });

  // Model select helpers
  function setModelSelect(selectEl, customEl, value) {
    const opts = Array.from(selectEl.options).map(o => o.value);
    if (value && opts.includes(value)) {
      selectEl.value = value;
      customEl.classList.add('custom-input-hidden');
      customEl.value = '';
    } else if (value) {
      selectEl.value = 'custom';
      customEl.classList.remove('custom-input-hidden');
      customEl.value = value;
    } else {
      selectEl.value = opts[0];
      customEl.classList.add('custom-input-hidden');
      customEl.value = '';
    }
  }

  function getModelValue(selectEl, customEl) {
    return selectEl.value === 'custom' ? (customEl.value.trim() || undefined) : selectEl.value;
  }

  $openaiModelSelect.addEventListener('change', () => {
    if ($openaiModelSelect.value === 'custom') {
      $openaiModelCustom.classList.remove('custom-input-hidden');
      $openaiModelCustom.focus();
    } else {
      $openaiModelCustom.classList.add('custom-input-hidden');
      $openaiModelCustom.value = '';
    }
  });

  $anthropicModelSelect.addEventListener('change', () => {
    if ($anthropicModelSelect.value === 'custom') {
      $anthropicModelCustom.classList.remove('custom-input-hidden');
      $anthropicModelCustom.focus();
    } else {
      $anthropicModelCustom.classList.add('custom-input-hidden');
      $anthropicModelCustom.value = '';
    }
  });

  function getDefaultHotkey() {
    const platform = navigator.platform.toLowerCase();
    return platform.includes('mac') ? 'Ctrl+T' : 'Alt+T';
  }

  function normalizeHotkey(v) {
    const t = (v || '').trim();
    if (!t) return getDefaultHotkey();
    // Normalize casing and order of modifiers
    const parts = t.split('+').map(x => x.trim()).filter(Boolean);
    const keyPart = parts.pop();
    const mods = new Set(parts.map(p => p.toLowerCase()));
    const order = [];
    if (mods.has('ctrl') || mods.has('control')) order.push('Ctrl');
    if (mods.has('alt') || mods.has('option')) order.push('Alt');
    if (mods.has('shift')) order.push('Shift');
    if (mods.has('meta') || mods.has('cmd') || mods.has('command')) order.push('Meta');
    const key = (keyPart || 'R').length === 1 ? keyPart.toUpperCase() : capitalize(keyPart);
    return [...order, key].join('+');
  }

  function capitalize(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1); }

  function updateHotkeyDisplay() {
    if ($refineHotkeyText) {
      $refineHotkeyText.textContent = recordedHotkey || getDefaultHotkey();
    }
  }

  function formatKeyEvent(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    
    let key = e.key;
    if (!key || key === 'Unidentified') {
      key = e.code?.replace(/^(Key|Digit)/, '') || 'Unknown';
    }
    
    // Normalize special keys
    const keyMap = {
      ' ': 'Space',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'Enter': 'Enter',
      'Escape': 'Escape',
      'Tab': 'Tab',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown'
    };
    
    if (keyMap[key]) {
      key = keyMap[key];
    } else if (key.length === 1) {
      key = key.toUpperCase();
    } else {
      key = key.replace(/^Key|^Digit/, '').replace(/([A-Z])/g, ' $1').trim();
    }
    
    parts.push(key);
    return parts.join('+');
  }

  function startRecordingHotkey() {
    if (isRecordingHotkey) return;
    isRecordingHotkey = true;
    $refineHotkeyRecord.textContent = 'Stop';
    $refineHotkeyRecord.classList.add('primary');
    $refineHotkeyRecording.classList.add('show');
    $refineHotkeyText.textContent = '...';
    $refineHotkeyDisplay.classList.add('recording');

    const keyDownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Ignore modifier keys alone
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return;
      }
      
      const combo = formatKeyEvent(e);
      recordedHotkey = normalizeHotkey(combo);
      updateHotkeyDisplay();
      stopRecordingHotkey();
    };

    const keyUpHandler = (e) => {
      // Stop recording on Escape
      if (e.key === 'Escape') {
        stopRecordingHotkey();
      }
    };

    window.addEventListener('keydown', keyDownHandler, true);
    window.addEventListener('keyup', keyUpHandler, true);
    
    // Store handlers for cleanup
    window._hotkeyRecorder = { keyDownHandler, keyUpHandler };
  }

  function stopRecordingHotkey() {
    if (!isRecordingHotkey) return;
    isRecordingHotkey = false;
    $refineHotkeyRecord.textContent = 'Change';
    $refineHotkeyRecord.classList.remove('primary');
    $refineHotkeyRecording.classList.remove('show');
    $refineHotkeyDisplay.classList.remove('recording');
    updateHotkeyDisplay();

    if (window._hotkeyRecorder) {
      window.removeEventListener('keydown', window._hotkeyRecorder.keyDownHandler, true);
      window.removeEventListener('keyup', window._hotkeyRecorder.keyUpHandler, true);
      delete window._hotkeyRecorder;
    }
  }

  $refineHotkeyRecord.addEventListener('click', () => {
    if (isRecordingHotkey) {
      stopRecordingHotkey();
    } else {
      startRecordingHotkey();
    }
  });

  // Wizard handlers
  $newProfile?.addEventListener('click', () => openWizard());
  $wizardCancel?.addEventListener('click', closeWizard);
  $wizardBack?.addEventListener('click', () => setWizardStep(wizardState.step - 1));
  $wizardNext?.addEventListener('click', () => {
    // Special handling for onboarding step 1: save selected mode & API keys into settings
    if (isOnboarding && wizardState.step === 1) {
      try {
        const obMode = document.getElementById('ob-mode').value;
        const obProvider = document.getElementById('ob-provider').value;
        const obOpenAIKey = (document.getElementById('ob-openai-key').value || '').trim();
        const obAnthropicKey = (document.getElementById('ob-anthropic-key').value || '').trim();
        // If user picked API mode but left the selected provider API key empty, warn and allow them to confirm
        if (obMode === 'api') {
          if (obProvider === 'openai' && !obOpenAIKey) {
            const ok = confirm('You selected API mode with OpenAI but did not provide an OpenAI API key. Without a key the API mode will not work. Continue anyway?');
            if (!ok) {
              // mark field as suggested invalid
              try { document.getElementById('field-ob-openai')?.classList.add('invalid'); document.getElementById('ob-openai-hint').textContent = 'OpenAI API key required to use API mode with OpenAI — or switch to WebUI/local.'; } catch(_) {}
              return;
            }
          }
          if (obProvider === 'anthropic' && !obAnthropicKey) {
            const ok = confirm('You selected API mode with Anthropic but did not provide an Anthropic API key. Without a key the API mode will not work. Continue anyway?');
            if (!ok) {
              try { document.getElementById('field-ob-anthropic')?.classList.add('invalid'); document.getElementById('ob-anthropic-hint').textContent = 'Anthropic API key required to use API mode with Anthropic — or switch to WebUI/local.'; } catch(_) {}
              return;
            }
          }
        }

        // Apply these to the real controls so saveSettings() will pick them up
        $mode.value = obMode;
        $provider.value = obProvider;
        $openaiKey.value = obOpenAIKey;
        $anthropicKey.value = obAnthropicKey;

        // Persist settings now
        saveSettings();
        onboardingSettingsSaved = true;
        // Save draft of onboarding choices
        saveOnboardingDraft();
      } catch (e) {
        console.error('[promptiply:options] onboarding next error:', e);
      }
      setWizardStep(wizardState.step + 1);
      return;
    }

    // Special handling for onboarding step 2: save profile basics (name/persona/tone)
    if (isOnboarding && wizardState.step === 2) {
      const name = (document.getElementById('w-name')?.value || '').trim();
      wizardState.name = name || wizardState.name || '';
      wizardState.persona = (document.getElementById('w-persona')?.value || '').trim();
      wizardState.tone = (document.getElementById('w-tone')?.value || '').trim();
      // Save draft
      saveOnboardingDraft();
      setWizardStep(wizardState.step + 1);
      return;
    }

    if (wizardState.step === 1) {
      const name = (document.getElementById('w-name').value || '').trim();
      if (!name) return;
      wizardState.name = name;
      wizardState.persona = (document.getElementById('w-persona').value || '').trim();
      wizardState.tone = (document.getElementById('w-tone').value || '').trim();
    } else if (wizardState.step === 2) {
      const guidelines = (document.getElementById('w-guidelines').value || '').split('\n').map(s=>s.trim()).filter(Boolean);
      wizardState.guidelines = guidelines;
    }
    setWizardStep(wizardState.step + 1);
  });
  $wizardSave?.addEventListener('click', () => {
  chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const cur = data[STORAGE_PROFILES] || { list: [], activeProfileId: null, siteOverrides: {} };
      if (wizardState.editingId) {
        const idx = cur.list.findIndex(p => p.id === wizardState.editingId);
        if (idx >= 0) {
          cur.list[idx] = { ...cur.list[idx], name: wizardState.name, persona: wizardState.persona, tone: wizardState.tone, styleGuidelines: wizardState.guidelines };
        }
      } else {
        const id = `p_${Date.now()}`;
        const prof = { id, name: wizardState.name || `Profile ${cur.list.length+1}`, persona: wizardState.persona, tone: wizardState.tone, styleGuidelines: wizardState.guidelines, constraints: [], examples: [], domainTags: [] };
        cur.list.push(prof);
        if (!cur.activeProfileId) cur.activeProfileId = id;
      }
      chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, () => {
        renderProfiles(cur);
        closeWizard();

        // If onboarding, mark as completed and ensure settings were saved
        if (isOnboarding) {
          // Ensure settings persisted
          if (!onboardingSettingsSaved) {
            saveSettings();
          }
          // Mark onboarded flag so we don't auto-open again
          chrome.storage.local.set({ onboarded: true }, () => {
            console.log('[promptiply:options] Onboarding complete');
            isOnboarding = false;
            onboardingSettingsSaved = false;
            // Remove ?onboard=1 from URL (nice-to-have)
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('onboard');
              history.replaceState({}, '', url.toString());
            } catch (_) {}
            // Remove onboarding draft
            chrome.storage.local.remove(['onboardingDraft']);
            // If analytics opted-in, record a local onboarding_complete event (uses appendAnalyticsEvent which purges old events)
            chrome.storage.local.get([STORAGE_SETTINGS], (d) => {
              const s = d[STORAGE_SETTINGS] || {};
              if (s.analyticsOptIn) {
                const ev = { event: 'onboarding_complete', ts: Date.now(), mode: s.mode, provider: s.provider };
                try { appendAnalyticsEvent(ev); } catch (_) {}
              }
            });
          });
        }
      });
    });
  });

  function renderProfiles(p) {
    $profilesList.innerHTML = '';
    if (!p.list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = 'No profile, create new one? <br/><br/>';
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = 'Create Profile';
      btn.addEventListener('click', () => openWizard());
      empty.appendChild(btn);
      $profilesList.appendChild(empty);
      return;
    }
    p.list.forEach((prof) => {
      const card = document.createElement('div');
      card.className = 'card';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('div');
      title.textContent = prof.name;
      const line = document.createElement('div');
      line.className = 'muted';
      line.textContent = [prof.persona, prof.tone].filter(Boolean).join(' • ');
      const chips = document.createElement('div');
      (prof.styleGuidelines || []).slice(0,3).forEach(g => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = g; chips.appendChild(c); });
      meta.appendChild(title); meta.appendChild(line); meta.appendChild(chips);
      const actions = document.createElement('div');
      const activate = document.createElement('button');
      activate.textContent = p.activeProfileId === prof.id ? 'Active' : 'Set Active';
      activate.addEventListener('click', () => {
        const updated = { ...p, activeProfileId: prof.id };
        chrome.storage.sync.set({ [STORAGE_PROFILES]: updated }, () => renderProfiles(updated));
      });
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openWizard(prof));
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        const updated = { ...p, list: p.list.filter(x => x.id !== prof.id) };
        if (updated.activeProfileId === prof.id) updated.activeProfileId = updated.list[0]?.id || null;
        chrome.storage.sync.set({ [STORAGE_PROFILES]: updated }, () => renderProfiles(updated));
      });
      actions.appendChild(activate); actions.appendChild(edit); actions.appendChild(del);
      card.appendChild(meta); card.appendChild(actions);
      $profilesList.appendChild(card);
    });
  }

  function openWizard(existing) {
    wizardState = { step: 1, editingId: existing?.id || null, name: existing?.name || '', persona: existing?.persona || '', tone: existing?.tone || '', guidelines: existing?.styleGuidelines || [] };
    $modal.classList.add('modal-show');
    setWizardStep(1);
  }
  function startOnboarding() {
    // Reuse wizard modal for onboarding
    isOnboarding = true;
    onboardingSettingsSaved = false;
    // Try to load draft
    loadOnboardingDraft((draftState) => {
      if (draftState) wizardState = { ...draftState };
      else wizardState = { step: 1, editingId: null, name: '', persona: '', tone: '', guidelines: [] };
      $modal.classList.add('modal-show');
      setWizardStep(wizardState.step || 1);
    });
  }
  // Expose so popup or other pages can call it via scripting if needed
  try { window.startOnboarding = startOnboarding; } catch (_) {}

  // Listen for runtime message to trigger onboarding (used by popup to reliably start it)
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        if (msg && msg.type === 'PR_START_ONBOARDING') {
          startOnboarding();
          sendResponse && sendResponse({ ok: true });
        }
      } catch (_) {}
    });
  } catch (_) {}

  // Draft save/load for onboarding so user can resume
  function saveOnboardingDraft() {
    if (!isOnboarding) return;
    const draft = { wizardState, timestamp: Date.now() };
    chrome.storage.local.set({ onboardingDraft: draft });
  }
  function loadOnboardingDraft(cb) {
    chrome.storage.local.get(['onboardingDraft'], (data) => {
      const d = data.onboardingDraft;
      if (d && d.wizardState) cb(d.wizardState);
      else cb(null);
    });
  }
  function closeWizard() {
    $modal.classList.remove('modal-show');
  }
  function setWizardStep(step) {
    wizardState.step = Math.max(1, Math.min(3, step));
    $wizardSteps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === wizardState.step));
    $wizardBack.classList.toggle('tab-panel-hidden', wizardState.step === 1);
    $wizardNext.classList.toggle('tab-panel-hidden', wizardState.step === 3);
    $wizardSave.classList.toggle('wizard-save-hidden', wizardState.step !== 3);
    // Update progress bar if present
    try {
      if ($wizardProgress) {
        const pct = Math.round((wizardState.step - 1) / (3 - 1) * 100);
        $wizardProgress.style.width = pct + '%';
      }
    } catch (_) {}
    // If onboarding, present different step contents: step1 = modes + optional keys, step2 = profile basics, step3 = review
    if (isOnboarding) {
      if (wizardState.step === 1) {
        $wizardBody.innerHTML = `
            <div class="field">
              <label>Choose mode</label>
              <select id="ob-mode">
                <option value="api">API (OpenAI/Anthropic)</option>
                <option value="webui">WebUI (use provider site)</option>
                <option value="local">Local (off-device)</option>
              </select>
            </div>
            <div class="field">
              <label>Provider (for API/WebUI)</label>
              <select id="ob-provider">
                <option value="openai">OpenAI (ChatGPT)</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </div>
            <div class="field" id="field-ob-openai"><label>OpenAI API Key</label><input id="ob-openai-key" type="password" placeholder="sk-..."/><div class="hint" id="ob-openai-hint">Optional for now — required to use OpenAI via API.</div></div>
            <div class="field" id="field-ob-anthropic"><label>Anthropic API Key</label><input id="ob-anthropic-key" type="password" placeholder="anthropic-..."/><div class="hint" id="ob-anthropic-hint">Optional for now — required to use Anthropic via API.</div></div>
            <div class="muted">This onboarding helps you pick a mode and optionally configure API keys. You can change these later in Settings.</div>
          `;
        // Prefill with existing values
        try {
          document.getElementById('ob-mode').value = $mode.value || 'api';
          document.getElementById('ob-provider').value = $provider.value || 'openai';
          document.getElementById('ob-openai-key').value = $openaiKey.value || '';
          document.getElementById('ob-anthropic-key').value = $anthropicKey.value || '';
          // Clear any previous validation state
          try { document.getElementById('field-ob-openai')?.classList.remove('invalid'); document.getElementById('ob-openai-hint').textContent = 'Optional for now — required to use OpenAI via API.'; } catch(_) {}
          try { document.getElementById('field-ob-anthropic')?.classList.remove('invalid'); document.getElementById('ob-anthropic-hint').textContent = 'Optional for now — required to use Anthropic via API.'; } catch(_) {}
          // Wire up draft saves
          ['ob-mode','ob-provider','ob-openai-key','ob-anthropic-key'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
              // store selected values to wizardState preview
              saveOnboardingDraft();
            });
          });
          // clear hints on input
          document.getElementById('ob-openai-key')?.addEventListener('input', () => { document.getElementById('field-ob-openai')?.classList.remove('invalid'); document.getElementById('ob-openai-hint').textContent = 'Optional for now — required to use OpenAI via API.'; });
          document.getElementById('ob-anthropic-key')?.addEventListener('input', () => { document.getElementById('field-ob-anthropic')?.classList.remove('invalid'); document.getElementById('ob-anthropic-hint').textContent = 'Optional for now — required to use Anthropic via API.'; });
        } catch (_) {}
        return;
      } else if (wizardState.step === 2) {
        $wizardBody.innerHTML = `
          <div class="grid">
            <div class="field"><label>Name</label><input id="w-name" type="text" placeholder="e.g., Technical Tutor" value="${escapeHtml(wizardState.name)}"/></div>
            <div class="field"><label>Tone</label><input id="w-tone" type="text" placeholder="e.g., concise, friendly" value="${escapeHtml(wizardState.tone)}"/></div>
          </div>
          <div class="field"><label>Persona</label><input id="w-persona" type="text" placeholder="e.g., Senior AI Engineer" value="${escapeHtml(wizardState.persona)}"/></div>
          <div class="field"><div class="hint">Name is optional but recommended — here are example profiles you can click to use.</div>
            <div class="example-chips">
              <div class="example-chip" data-name="Technical Tutor" data-persona="Senior AI Engineer" data-tone="concise">Technical Tutor</div>
              <div class="example-chip" data-name="Code Reviewer" data-persona="Senior Developer" data-tone="detailed">Code Reviewer</div>
              <div class="example-chip" data-name="Product Copywriter" data-persona="Marketing Lead" data-tone="friendly">Copywriter</div>
            </div>
          </div>
        `;
        // Wire up draft saves for profile fields
        try {
          ['w-name','w-tone','w-persona'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
              wizardState.name = (document.getElementById('w-name')?.value || '').trim();
              wizardState.tone = (document.getElementById('w-tone')?.value || '').trim();
              wizardState.persona = (document.getElementById('w-persona')?.value || '').trim();
              saveOnboardingDraft();
            });
          });
          // Wire example chips
          Array.from(document.querySelectorAll('.example-chip')).forEach(ch => {
            ch.addEventListener('click', () => {
              const n = ch.dataset.name || '';
              const p = ch.dataset.persona || '';
              const t = ch.dataset.tone || '';
              document.getElementById('w-name').value = n;
              document.getElementById('w-persona').value = p;
              document.getElementById('w-tone').value = t;
              wizardState.name = n; wizardState.persona = p; wizardState.tone = t;
              saveOnboardingDraft();
            });
          });
        } catch (_) {}
        return;
      } else {
        // Review step
        const mode = document.getElementById('ob-mode') ? document.getElementById('ob-mode').value : ($mode.value || 'api');
        const provider = document.getElementById('ob-provider') ? document.getElementById('ob-provider').value : ($provider.value || 'openai');
        $wizardBody.innerHTML = `
          <div>
            <div class="muted">Mode:</div>
            <div style="margin-bottom:12px;"><strong>${escapeHtml(mode)}</strong> — Provider: <strong>${escapeHtml(provider)}</strong></div>
            <div class="muted">Profile Preview:</div>
            <div style="margin-top:8px; padding:8px; background:var(--panel); border-radius:8px;">
              <div><strong>${escapeHtml(wizardState.name || 'My Profile')}</strong></div>
              <div class="muted">${escapeHtml([wizardState.persona, wizardState.tone].filter(Boolean).join(' • '))}</div>
              <div style="margin-top:8px;">${escapeHtml((wizardState.guidelines || []).join('\n'))}</div>
            </div>
            <div class="muted" style="margin-top:12px;">Click Save to create the profile and finish onboarding.</div>
          </div>
        `;
        return;
      }
    }

    // Default (non-onboarding) profile wizard rendering (existing behavior)
    if (wizardState.step === 1) {
      $wizardBody.innerHTML = `
        <div class="grid">
          <div class="field"><label>Name</label><input id="w-name" type="text" placeholder="e.g., Technical Tutor" value="${escapeHtml(wizardState.name)}"/></div>
          <div class="field"><label>Tone</label><input id="w-tone" type="text" placeholder="e.g., concise, friendly" value="${escapeHtml(wizardState.tone)}"/></div>
        </div>
        <div class="field"><label>Persona</label><input id="w-persona" type="text" placeholder="e.g., Senior AI Engineer" value="${escapeHtml(wizardState.persona)}"/></div>
      `;
    } else if (wizardState.step === 2) {
      $wizardBody.innerHTML = `
        <div class="field"><label>Style guidelines / constraints (one per line)</label><textarea id="w-guidelines">${escapeHtml((wizardState.guidelines || []).join('\n'))}</textarea></div>
      `;
    } else {
      $wizardBody.innerHTML = `
        <div class="grid">
          <div class="field"><label>Name</label><input type="text" value="${escapeHtml(wizardState.name)}" disabled/></div>
          <div class="field"><label>Tone</label><input type="text" value="${escapeHtml(wizardState.tone)}" disabled/></div>
        </div>
        <div class="field"><label>Persona</label><input type="text" value="${escapeHtml(wizardState.persona)}" disabled/></div>
        <div class="field"><label>Guidelines</label><textarea disabled>${escapeHtml((wizardState.guidelines || []).join('\n'))}</textarea></div>
      `;
    }
  }
  function escapeHtml(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
})();


