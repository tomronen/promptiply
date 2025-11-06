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
  const $tabs = Array.from(document.querySelectorAll('.tab'));
  const $tabPanels = {
    general: document.getElementById('tab-general'),
    providers: document.getElementById('tab-providers'),
    profiles: document.getElementById('tab-profiles')
  };
  const $version = document.getElementById('version');

  function getDefaultHotkey() {
    const platform = navigator.platform.toLowerCase();
    return platform.includes('mac') ? 'Ctrl+T' : 'Alt+T';
  }

  // Tabs behavior
  let currentTab = 'general';
  const tabOrder = ['general', 'providers', 'profiles'];
  
  $tabs.forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  
  function selectTab(name){
    if (name === currentTab) return;
    
    const currentIndex = tabOrder.indexOf(currentTab);
    const newIndex = tabOrder.indexOf(name);
    const direction = newIndex > currentIndex ? 'right' : 'left';
    
    // Get current and new panels
    const currentPanel = $tabPanels[currentTab];
    const newPanel = $tabPanels[name];
    
    if (currentPanel && newPanel) {
      // Slide out current panel
      currentPanel.classList.remove('slide-in-from-left', 'slide-in-from-right');
      currentPanel.classList.add(direction === 'right' ? 'slide-out-to-left' : 'slide-out-to-right');
      
      // After slide-out completes, hide current and show new
      setTimeout(() => {
        currentPanel.classList.add('tab-panel-hidden');
        currentPanel.classList.remove('slide-out-to-left', 'slide-out-to-right');
        
        // Show new panel with slide-in animation
        newPanel.classList.remove('tab-panel-hidden');
        newPanel.classList.add(direction === 'right' ? 'slide-in-from-right' : 'slide-in-from-left');
        
        // Clean up animation classes after slide-in completes
        setTimeout(() => {
          newPanel.classList.remove('slide-in-from-left', 'slide-in-from-right');
        }, 150);
      }, 150);
    }
    
    // Update tab buttons
    $tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    currentTab = name;
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
  });

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
        const prof = { id, name: wizardState.name, persona: wizardState.persona, tone: wizardState.tone, styleGuidelines: wizardState.guidelines, constraints: [], examples: [], domainTags: [] };
        cur.list.push(prof);
        if (!cur.activeProfileId) cur.activeProfileId = id;
      }
      chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, () => { renderProfiles(cur); closeWizard(); });
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
  function closeWizard() {
    $modal.classList.remove('modal-show');
  }
  function setWizardStep(step) {
    wizardState.step = Math.max(1, Math.min(3, step));
    $wizardSteps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === wizardState.step));
    $wizardBack.classList.toggle('tab-panel-hidden', wizardState.step === 1);
    $wizardNext.classList.toggle('tab-panel-hidden', wizardState.step === 3);
    $wizardSave.classList.toggle('wizard-save-hidden', wizardState.step !== 3);
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


