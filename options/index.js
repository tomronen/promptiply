// Clean, minimal onboarding script for Promptiply Options page

(function(){
  'use strict';

  const ERROR_KEY = 'promptiply_onboarding_error';
  const STORAGE_ONBOARDING = 'onboarding_completed';

  // Elements
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
  const $saveProvidersSettings = document.getElementById('save-providers-settings');

  const $profilesList = document.getElementById('profiles-list');
  const $newProfile = document.getElementById('new-profile');
  const $profileModal = document.getElementById('profile-modal');
  const $wizardBody = document.getElementById('wizard-body');
  const $wizardCancel = document.getElementById('wizard-cancel');
  const $wizardBack = document.getElementById('wizard-back');
  const $wizardNext = document.getElementById('wizard-next');
  const $wizardSave = document.getElementById('wizard-save');
  const $wizardSteps = Array.from(document.querySelectorAll('#profile-modal .step'));

  const $tabs = Array.from(document.querySelectorAll('.tab'));
  const $tabPanels = {
    general: document.getElementById('tab-general'),
    providers: document.getElementById('tab-providers'),
    profiles: document.getElementById('tab-profiles')
  };
  const $version = document.getElementById('version');

  // Onboarding elements
  const $onboardingModal = document.getElementById('onboarding-modal');
  const $onboardingBody = document.getElementById('onboarding-body');
  const $onboardingSkip = document.getElementById('onboarding-skip');
  const $onboardingBack = document.getElementById('onboarding-back');
  const $onboardingNext = document.getElementById('onboarding-next');
  const $onboardingFinish = document.getElementById('onboarding-finish');
  const $onboardingSteps = Array.from(document.querySelectorAll('#onboarding-modal .step'));
  const $runOnboarding = document.getElementById('run-onboarding');

  // State
  let isRecordingHotkey = false;
  let recordedHotkey = null;
  let wizardState = { step: 1, editingId: null, name: '', persona: '', tone: '', guidelines: [] };
  let onboardingState = { step: 1, selectedMode: 'api', selectedProvider: 'openai', apiKey: '', model: '', profileName: '', profilePersona: '', profileTone: '' };

  // Predefined profiles (example set) - can be extended
  const PREDEFINED_PROFILES = [
    { id: 'builtin_writer', name: 'Technical Writer', persona: 'Senior Technical Writer', tone: 'clear, concise', styleGuidelines: ['Use simple language','Prefer examples','No fluff'] },
    { id: 'builtin_dev', name: 'Dev Helper', persona: 'Senior Software Engineer', tone: 'concise, pragmatic', styleGuidelines: ['Show code samples','Explain with steps','Use bullet lists'] },
    { id: 'builtin_marketing', name: 'Marketing Copy', persona: 'Conversion-focused Marketer', tone: 'excited, persuasive', styleGuidelines: ['Short headlines','Call to action','A/B test variants'] }
  ];

  // Utilities
  function getDefaultHotkey() { const platform = navigator.platform.toLowerCase(); return platform.includes('mac') ? 'Ctrl+T' : 'Alt+T'; }
  function capitalize(s){ return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }
  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function normalizeHotkey(v){
    const t = (v||'').trim(); if(!t) return getDefaultHotkey();
    const parts = t.split('+').map(x=>x.trim()).filter(Boolean);
    const keyPart = parts.pop(); const mods = new Set(parts.map(p=>p.toLowerCase())); const order = [];
    if(mods.has('ctrl')||mods.has('control')) order.push('Ctrl');
    if(mods.has('alt')||mods.has('option')) order.push('Alt');
    if(mods.has('shift')) order.push('Shift');
    if(mods.has('meta')||mods.has('cmd')||mods.has('command')) order.push('Meta');
    const key = (keyPart||'R').length===1 ? keyPart.toUpperCase() : capitalize(keyPart);
    return [...order, key].join('+');
  }

  function formatKeyEvent(e){
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl'); if (e.altKey) parts.push('Alt'); if (e.shiftKey) parts.push('Shift'); if (e.metaKey) parts.push('Meta');
    let key = e.key; if(!key||key==='Unidentified') key = e.code?.replace(/^(Key|Digit)/,'')||'Unknown';
    const keyMap = {' ':'Space','Enter':'Enter','Escape':'Escape','Tab':'Tab','Backspace':'Backspace','Delete':'Delete'};
    if (keyMap[key]) key = keyMap[key]; else if (key.length===1) key = key.toUpperCase();
    parts.push(key); return parts.join('+');
  }

  // Tabs
  $tabs.forEach(t=>t.addEventListener('click', ()=>selectTab(t.dataset.tab)));
  function selectTab(name){ $tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===name)); Object.entries($tabPanels).forEach(([k,el])=>{ if(el){ el.classList.toggle('tab-panel-hidden', k!==name); } }); }

  // Provider disabling
  function updateProviderDisabled(){ if(!$mode||!$provider) return; const isWebUI = $mode.value==='webui'; const isLocal = $mode.value==='local'; const $providerField = $provider.closest('.field'); if($providerField) $providerField.classList.toggle('disabled', isWebUI||isLocal); }

  // Model selectors
  function setModelSelect(selectEl, customEl, value){ const opts = Array.from(selectEl.options).map(o=>o.value); if(value && opts.includes(value)){ selectEl.value = value; customEl.classList.add('custom-input-hidden'); customEl.value = ''; } else if(value){ selectEl.value = 'custom'; customEl.classList.remove('custom-input-hidden'); customEl.value = value; } else { selectEl.value = opts[0]; customEl.classList.add('custom-input-hidden'); customEl.value = ''; } }
  function getModelValue(selectEl, customEl){ return selectEl.value==='custom' ? (customEl.value.trim()||undefined) : selectEl.value; }

  // Load settings and profiles
  chrome.storage.local.get([STORAGE_SETTINGS], (data)=>{
    const s = data[STORAGE_SETTINGS]||{mode:'api'}; if($mode) $mode.value = s.mode||'api'; if($provider) $provider.value = s.provider||(s.openaiKey?'openai':(s.anthropicKey?'anthropic':'openai'));
    if($openaiKey) $openaiKey.value = s.openaiKey||''; if($openaiModelSelect && $openaiModelCustom) setModelSelect($openaiModelSelect,$openaiModelCustom,s.openaiModel||'gpt-5-nano');
    if($anthropicKey) $anthropicKey.value = s.anthropicKey||''; if($anthropicModelSelect && $anthropicModelCustom) setModelSelect($anthropicModelSelect,$anthropicModelCustom,s.anthropicModel||'claude-haiku-4-5');
    recordedHotkey = s.refineHotkey || getDefaultHotkey(); updateHotkeyDisplay(); updateProviderDisabled();
  });

  chrome.storage.sync.get([STORAGE_PROFILES], (data)=>{ const p = data[STORAGE_PROFILES]||{list:[],activeProfileId:null}; renderProfiles(p); });
  // Render built-in predefined profile list
  renderPredefinedProfiles();

  if($version && chrome.runtime?.getManifest){ const m = chrome.runtime.getManifest(); if(m?.version) $version.textContent = `v${m.version}`; }

  function saveSettings(){ const s = { mode: $mode.value, provider: $provider.value, openaiKey: $openaiKey.value.trim()||undefined, openaiModel: getModelValue($openaiModelSelect,$openaiModelCustom), anthropicKey: $anthropicKey.value.trim()||undefined, anthropicModel: getModelValue($anthropicModelSelect,$anthropicModelCustom), refineHotkey: normalizeHotkey(recordedHotkey||getDefaultHotkey()) }; chrome.storage.local.set({[STORAGE_SETTINGS]:s}); if(recordedHotkey){ recordedHotkey = s.refineHotkey; updateHotkeyDisplay(); } }
  if($saveSettings) $saveSettings.addEventListener('click', saveSettings); if($saveProvidersSettings) $saveProvidersSettings.addEventListener('click', saveSettings);
  if($mode) $mode.addEventListener('change', ()=>{ updateProviderDisabled(); chrome.storage.local.get([STORAGE_SETTINGS], (data)=>{ const cur = data[STORAGE_SETTINGS]||{}; cur.mode = $mode.value; chrome.storage.local.set({[STORAGE_SETTINGS]:cur}); }); });

  // Hotkey recording
  function updateHotkeyDisplay(){ if($refineHotkeyText) $refineHotkeyText.textContent = recordedHotkey||getDefaultHotkey(); }
  function startRecordingHotkey(){ if(isRecordingHotkey) return; isRecordingHotkey=true; if($refineHotkeyRecord) { $refineHotkeyRecord.textContent='Stop'; $refineHotkeyRecord.classList.add('primary'); } if($refineHotkeyRecording) $refineHotkeyRecording.classList.add('show'); if($refineHotkeyText) $refineHotkeyText.textContent='...'; if($refineHotkeyDisplay) $refineHotkeyDisplay.classList.add('recording');
    const keyDownHandler = (e)=>{ e.preventDefault(); e.stopPropagation(); if(['Control','Alt','Shift','Meta'].includes(e.key)) return; const combo = formatKeyEvent(e); recordedHotkey = normalizeHotkey(combo); updateHotkeyDisplay(); stopRecordingHotkey(); };
    const keyUpHandler = (e)=>{ if(e.key==='Escape') stopRecordingHotkey(); };
    window.addEventListener('keydown', keyDownHandler, true); window.addEventListener('keyup', keyUpHandler, true); window._hotkeyRecorder = {keyDownHandler,keyUpHandler};
  }
  function stopRecordingHotkey(){ if(!isRecordingHotkey) return; isRecordingHotkey=false; if($refineHotkeyRecord){ $refineHotkeyRecord.textContent='Change'; $refineHotkeyRecord.classList.remove('primary'); } if($refineHotkeyRecording) $refineHotkeyRecording.classList.remove('show'); if($refineHotkeyDisplay) $refineHotkeyDisplay.classList.remove('recording'); updateHotkeyDisplay(); if(window._hotkeyRecorder){ window.removeEventListener('keydown', window._hotkeyRecorder.keyDownHandler, true); window.removeEventListener('keyup', window._hotkeyRecorder.keyUpHandler, true); delete window._hotkeyRecorder; } }
  if($refineHotkeyRecord) $refineHotkeyRecord.addEventListener('click', ()=>{ if(isRecordingHotkey) stopRecordingHotkey(); else startRecordingHotkey(); });

  // Wizard rendering & lifecycle
  function renderProfiles(p){ if(!$profilesList) return; $profilesList.innerHTML = ''; if(!p.list.length){ const empty = document.createElement('div'); empty.className='empty'; empty.innerHTML = 'No profile, create new one? <br/><br/>'; const btn = document.createElement('button'); btn.className='primary'; btn.textContent='Create Profile'; btn.addEventListener('click', ()=>openWizard()); empty.appendChild(btn); $profilesList.appendChild(empty); return; } p.list.forEach(prof=>{ const card=document.createElement('div'); card.className='card'; const meta=document.createElement('div'); meta.className='meta'; const title=document.createElement('div'); title.textContent=prof.name; const line=document.createElement('div'); line.className='muted'; line.textContent=[prof.persona,prof.tone].filter(Boolean).join(' • '); const chips=document.createElement('div'); (prof.styleGuidelines||[]).slice(0,3).forEach(g=>{ const c=document.createElement('span'); c.className='chip'; c.textContent=g; chips.appendChild(c); }); meta.appendChild(title); meta.appendChild(line); meta.appendChild(chips); const actions=document.createElement('div'); const activate=document.createElement('button'); activate.textContent = p.activeProfileId===prof.id ? 'Active' : 'Set Active'; activate.addEventListener('click', ()=>{ const updated = {...p, activeProfileId: prof.id}; chrome.storage.sync.set({[STORAGE_PROFILES]: updated}, ()=>renderProfiles(updated)); }); const edit=document.createElement('button'); edit.textContent='Edit'; edit.addEventListener('click', ()=>openWizard(prof)); const del=document.createElement('button'); del.textContent='Delete'; del.addEventListener('click', ()=>{ const updated={...p, list: p.list.filter(x=>x.id!==prof.id)}; if(updated.activeProfileId===prof.id) updated.activeProfileId = updated.list[0]?.id||null; chrome.storage.sync.set({[STORAGE_PROFILES]: updated}, ()=>renderProfiles(updated)); }); actions.appendChild(activate); actions.appendChild(edit); actions.appendChild(del); card.appendChild(meta); card.appendChild(actions); $profilesList.appendChild(card); }); }

  // Render predefined profiles UI
  function renderPredefinedProfiles(){ const $pre = document.getElementById('predefined-list'); if(!$pre) return; $pre.innerHTML = ''; PREDEFINED_PROFILES.forEach(p=>{ const row = document.createElement('div'); row.className='card'; const meta = document.createElement('div'); meta.className='meta'; const title = document.createElement('div'); title.textContent = p.name; const line = document.createElement('div'); line.className='muted'; line.textContent = p.persona; meta.appendChild(title); meta.appendChild(line); const actions = document.createElement('div'); const useBtn = document.createElement('button'); useBtn.textContent = 'Use'; useBtn.addEventListener('click', ()=>importPredefinedProfile(p)); const importBtn = document.createElement('button'); importBtn.textContent = 'Import'; importBtn.addEventListener('click', ()=>importPredefinedProfile(p, { activate:false })); actions.appendChild(useBtn); actions.appendChild(importBtn); row.appendChild(meta); row.appendChild(actions); $pre.appendChild(row); });
    const importAll = document.getElementById('import-all-predefined'); if(importAll){ importAll.addEventListener('click', importAllPredefined); }
  }

  // Import a predefined profile into storage (avoid id conflicts)
  function importPredefinedProfile(pref, opts={ activate:true }){
    chrome.storage.sync.get([STORAGE_PROFILES], (data)=>{
      const cur = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
      // If already exists by name, just activate or return
      const exists = cur.list.find(x=>x.name===pref.name);
      if(exists){ if(opts.activate){ cur.activeProfileId = exists.id; chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, ()=>{ renderProfiles(cur); }); } return; }
      const id = `p_${Date.now()}_${Math.floor(Math.random()*9999)}`;
      const newP = { id, name: pref.name, persona: pref.persona, tone: pref.tone||'', styleGuidelines: pref.styleGuidelines||[], constraints: [], examples: [], domainTags: [] };
      cur.list.push(newP);
      if(opts.activate && !cur.activeProfileId) cur.activeProfileId = newP.id;
      chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, ()=>{ renderProfiles(cur); });
    });
  }

  function importAllPredefined(){ PREDEFINED_PROFILES.forEach(p=> importPredefinedProfile(p,{ activate:false })); }

  function openWizard(existing){ wizardState = { step:1, editingId: existing?.id||null, name: existing?.name||'', persona: existing?.persona||'', tone: existing?.tone||'', guidelines: existing?.styleGuidelines||[] }; try{ $onboardingModal?.classList.remove('modal-show'); } catch(_){} $profileModal?.classList.add('modal-show'); setWizardStep(1); }
  function closeWizard(){ $profileModal?.classList.remove('modal-show'); }

  function setWizardStep(step) {
    wizardState.step = Math.max(1, Math.min(3, step));
    $wizardSteps.forEach((s) =>
      s.classList.toggle("active", Number(s.dataset.step) === wizardState.step)
    );
    $wizardBack?.classList.toggle("tab-panel-hidden", wizardState.step === 1);
    $wizardNext?.classList.toggle("tab-panel-hidden", wizardState.step === 3);
    $wizardSave?.classList.toggle("wizard-save-hidden", wizardState.step !== 3);

    // Clear existing content
    $wizardBody.innerHTML = "";

    // Render content for current step
    if (wizardState.step === 1) {
      const nameField = document.createElement("div");
      nameField.className = "field";
      nameField.innerHTML =
        '<label>Name</label><input id="w-name" type="text" placeholder="e.g., Technical Tutor" />';
      $wizardBody.appendChild(nameField);

      const toneField = document.createElement("div");
      toneField.className = "field";
      toneField.innerHTML =
        '<label>Tone</label><input id="w-tone" type="text" placeholder="e.g., concise, friendly" />';
      $wizardBody.appendChild(toneField);

      const personaField = document.createElement("div");
      personaField.className = "field";
      personaField.innerHTML =
        '<label>Persona</label><input id="w-persona" type="text" placeholder="e.g., Senior AI Engineer" />';
      $wizardBody.appendChild(personaField);
    } else if (wizardState.step === 2) {
      const guidelinesField = document.createElement("div");
      guidelinesField.className = "field";
      guidelinesField.innerHTML =
        '<label>Style guidelines / constraints (one per line)</label><textarea id="w-guidelines"></textarea>';
      $wizardBody.appendChild(guidelinesField);
    } else {
      const nameField = document.createElement("div");
      nameField.className = "field";
      nameField.innerHTML =
        '<label>Name</label><input type="text" disabled />';
      $wizardBody.appendChild(nameField);

      const toneField = document.createElement("div");
      toneField.className = "field";
      toneField.innerHTML =
        '<label>Tone</label><input type="text" disabled />';
      $wizardBody.appendChild(toneField);
    }
  }

  // Wizard buttons
  $newProfile?.addEventListener('click', ()=>openWizard());
  $wizardCancel?.addEventListener('click', ()=>closeWizard());
  $wizardBack?.addEventListener('click', ()=>setWizardStep(wizardState.step-1));
  $wizardNext?.addEventListener('click', ()=>{
    // Validate and capture current inputs before moving forward
    if(wizardState.step===1){ const name = (document.getElementById('w-name')?.value||'').trim(); if(!name) { return; } wizardState.name = name; wizardState.persona = (document.getElementById('w-persona')?.value||'').trim(); wizardState.tone = (document.getElementById('w-tone')?.value||'').trim(); }
    else if(wizardState.step===2){ wizardState.guidelines = (document.getElementById('w-guidelines')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean); }
    setWizardStep(wizardState.step+1);
  });

  $wizardSave?.addEventListener('click', ()=>{
    chrome.storage.sync.get([STORAGE_PROFILES], (data)=>{
      const cur = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
      if(wizardState.editingId){ const idx = cur.list.findIndex(p=>p.id===wizardState.editingId); if(idx>=0){ cur.list[idx] = { ...cur.list[idx], name: wizardState.name, persona: wizardState.persona, tone: wizardState.tone, styleGuidelines: wizardState.guidelines }; } }
      else { const id = `p_${Date.now()}`; const prof = { id, name: wizardState.name, persona: wizardState.persona, tone: wizardState.tone, styleGuidelines: wizardState.guidelines || [], constraints: [], examples: [], domainTags: [] }; cur.list.push(prof); if(!cur.activeProfileId) cur.activeProfileId = id; }
      chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, ()=>{ renderProfiles(cur); closeWizard(); });
    });
  });

  // Onboarding (enhanced)
  function openOnboardingWizard(){ onboardingState = { step:1, selectedMode:'api', selectedProvider:'openai', apiKey:'', model:'', profileName:'', profilePersona:'', profileTone:'' }; $onboardingModal?.classList.add('modal-show'); setOnboardingStep(1); }
  function closeOnboardingWizard(){ $onboardingModal?.classList.remove('modal-show'); chrome.storage.local.set({ [STORAGE_ONBOARDING]: true }); }
  function setOnboardingStep(step){
    onboardingState.step = Math.max(1, Math.min(4, step));
    // refresh anchors in case script ran before DOM
    refreshOnboardingAnchors();
    try{
      $onboardingSteps.forEach(s=>s.classList.toggle('active', Number(s.dataset.step)===onboardingState.step));
      $onboardingBack?.classList.toggle('tab-panel-hidden', onboardingState.step===1);
      $onboardingNext?.classList.toggle('tab-panel-hidden', onboardingState.step===4);
      $onboardingFinish?.classList.toggle('wizard-save-hidden', onboardingState.step!==4);
    }catch(e){ /* ignore UI toggle failures */ }
    // Safely invoke renderers and log any exceptions
    try{
      if(onboardingState.step===1) safeRender('renderModesStep', renderModesStep);
      else if(onboardingState.step===2) safeRender('renderSetupStep', renderSetupStep);
      else if(onboardingState.step===3) safeRender('renderProfileStep', renderProfileStep);
      else safeRender('renderSuccessStep', renderSuccessStep);
    }catch(e){ logOnboardingError(e, 'setOnboardingStep', step); }
  }

  // Wrap setOnboardingStep in a safe wrapper to catch and persist render errors for debugging
  // safeRender helper wraps calls and records errors
  function safeRender(name, fn){
    try{
      // ensure onboarding body exists; create if missing
      if(!$onboardingBody){
        try{ $onboardingBody = document.getElementById('onboarding-body'); }
        catch(_){}
        if(!$onboardingBody){
          try{
            const modal = document.getElementById('onboarding-modal') || document.createElement('div');
            if(!modal.parentElement) document.body.appendChild(modal);
            const div = document.createElement('div'); div.id = 'onboarding-body'; modal.appendChild(div); $onboardingBody = div;
          }catch(_){ /* ignore fallback create failure */ }
        }
      }
      return fn();
    }catch(e){
      console.error('[promptiply] onboarding render failed', name, e);
      try{ logOnboardingError(e, name, onboardingState && onboardingState.step); }catch(_){ }
    }
  }

  function renderModesStep(){
    return safeRender('renderModesStep', function(){
      if(!$onboardingBody) return;
      $onboardingBody.innerHTML = `
    <div class="onboarding-section">
      <h3>Choose Your Refinement Mode</h3>
      <p>promptiply offers three ways to refine your prompts. Choose the one that fits your needs:</p>
    </div>
    <div class="mode-card ${onboardingState.selectedMode === 'api' ? 'selected' : ''}" data-mode="api">
      <h3>API Mode</h3>
      <p>Uses your OpenAI or Anthropic API key for fast, reliable refinement. Best for regular use.</p>
      <span class="mode-badge badge-easy">Recommended</span>
    </div>
    <div class="mode-card ${onboardingState.selectedMode === 'webui' ? 'selected' : ''}" data-mode="webui">
      <h3>WebUI Mode</h3>
      <p>Opens a background tab to ChatGPT or Claude, sends your prompt, and reads the response. No API key needed.</p>
      <span class="mode-badge badge-simple">Simple Setup</span>
    </div>
    <div class="mode-card ${onboardingState.selectedMode === 'local' ? 'selected' : ''}" data-mode="local">
      <h3>Local Mode (Llama 3)</h3>
      <p>Runs entirely in your browser using Llama 3.1 8B model. Completely private and offline after initial download (~5GB).</p>
      <span class="mode-badge badge-private">100% Private</span>
    </div>
  `;

    Array.from($onboardingBody.querySelectorAll('.mode-card')).forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        onboardingState.selectedMode = mode;
        Array.from($onboardingBody.querySelectorAll('.mode-card')).forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      card.addEventListener('keydown', (ev) => { if(ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); } });
    });
    });
  }

  function renderSetupStep(){
    return safeRender('renderSetupStep', function(){
      if(!$onboardingBody) return;
      if(onboardingState.selectedMode === 'api'){
      $onboardingBody.innerHTML = `
        <div class="onboarding-section">
          <h3>API Setup</h3>
          <p>To use API mode, you'll need an API key from your chosen provider. Don't worry - your API key is stored locally and never leaves your device.</p>
        </div>
        <div class="field">
          <label>Provider</label>
          <select id="ob-provider">
            <option value="openai" ${onboardingState.selectedProvider === 'openai' ? 'selected' : ''}>OpenAI (ChatGPT)</option>
            <option value="anthropic" ${onboardingState.selectedProvider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
          </select>
        </div>
  <div id="ob-openai-fields" class="${onboardingState.selectedProvider === 'openai' ? '' : 'hidden'}">
          <div class="field">
            <label>OpenAI API Key</label>
            <input id="ob-openai-key" type="password" placeholder="sk-..." value="${escapeHtml(onboardingState.apiKey)}" />
          </div>
          <div class="field">
            <label>Model</label>
            <select id="ob-openai-model">
              <option value="gpt-5-nano">gpt-5-nano</option>
              <option value="gpt-5-mini">gpt-5-mini</option>
              <option value="gpt-5">gpt-5</option>
            </select>
          </div>
        </div>
  <div id="ob-anthropic-fields" class="${onboardingState.selectedProvider === 'anthropic' ? '' : 'hidden'}">
          <div class="field">
            <label>Anthropic API Key</label>
            <input id="ob-anthropic-key" type="password" placeholder="sk-ant-..." value="${escapeHtml(onboardingState.apiKey)}" />
          </div>
          <div class="field">
            <label>Model</label>
            <select id="ob-anthropic-model">
              <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
              <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
            </select>
          </div>
        </div>
  <p class="muted muted-top-margin muted-small">You can skip this step and set up your API key later in Settings.</p>
      `;

      const $obProvider = document.getElementById('ob-provider');
      const $obOpenaiFields = document.getElementById('ob-openai-fields');
      const $obAnthropicFields = document.getElementById('ob-anthropic-fields');

      // Ensure the select reflects current state and only the chosen provider block is visible
      if($obProvider){
        $obProvider.value = onboardingState.selectedProvider || 'openai';
        $obOpenaiFields.classList.toggle('hidden', $obProvider.value !== 'openai');
        $obAnthropicFields.classList.toggle('hidden', $obProvider.value !== 'anthropic');

        $obProvider.addEventListener('change', () => {
          onboardingState.selectedProvider = $obProvider.value;
          $obOpenaiFields.classList.toggle('hidden', onboardingState.selectedProvider !== 'openai');
          $obAnthropicFields.classList.toggle('hidden', onboardingState.selectedProvider !== 'anthropic');
        });
        // Pre-select model options if onboardingState.model was set
        const $obOpenaiModel = document.getElementById('ob-openai-model');
        const $obAnthropicModel = document.getElementById('ob-anthropic-model');
        if($obOpenaiModel && onboardingState.model) { Array.from($obOpenaiModel.options).forEach(o=>o.selected = (o.value===onboardingState.model)); }
        if($obAnthropicModel && onboardingState.model) { Array.from($obAnthropicModel.options).forEach(o=>o.selected = (o.value===onboardingState.model)); }
  } else if (onboardingState.selectedMode === 'webui'){
      $onboardingBody.innerHTML = `
        <div class="onboarding-section">
          <h3>WebUI Mode Setup</h3>
          <p>WebUI mode doesn't require any API keys. It works by opening a background tab to ChatGPT or Claude, sending your refinement request, and reading the response.</p>
          <p>Make sure you're logged into ChatGPT or Claude in your browser. WebUI automation can be flaky; if you prefer reliability, use API or Local modes.</p>
          <div class="field">
            <label>Preferred provider</label>
            <select id="ob-webui-provider">
              <option value="openai" ${onboardingState.selectedProvider === 'openai' ? 'selected' : ''}>OpenAI (ChatGPT)</option>
              <option value="anthropic" ${onboardingState.selectedProvider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
            </select>
          </div>
          <p class="muted muted-top-margin muted-small">You can switch modes later in Settings.</p>
        </div>
      `;

      // Wire up the provider select for WebUI step
      const $obWebuiProvider = document.getElementById('ob-webui-provider');
      if ($obWebuiProvider) {
        $obWebuiProvider.value = onboardingState.selectedProvider || 'openai';
        $obWebuiProvider.addEventListener('change', () => {
          onboardingState.selectedProvider = $obWebuiProvider.value;
        });
      }
    }
    });
  }

  function renderProfileStep(){
    return safeRender('renderProfileStep', function(){ if(!$onboardingBody) return; $onboardingBody.innerHTML = `
    <div class="onboarding-section">
      <h3>Create Your First Profile</h3>
      <p>Profiles help tailor prompt refinements to your specific needs. You can create more profiles later.</p>
    </div>
    <div class="field">
      <label>Profile Name</label>
      <input id="ob-profile-name" type="text" placeholder="e.g., Technical Tutor" value="${escapeHtml(onboardingState.profileName)}" />
    </div>
    <div class="grid">
      <div class="field">
        <label>Persona (optional)</label>
        <input id="ob-profile-persona" type="text" placeholder="e.g., Senior AI Engineer" value="${escapeHtml(onboardingState.profilePersona)}" />
      </div>
      <div class="field">
        <label>Tone (optional)</label>
        <input id="ob-profile-tone" type="text" placeholder="e.g., concise, friendly" value="${escapeHtml(onboardingState.profileTone)}" />
      </div>
    </div>
  <p class="muted muted-top-margin muted-small">You can skip profile creation and use the default settings, or create a profile later in Settings.</p>
  `;
  const n = $onboardingBody.querySelector('#ob-profile-name'); const p = $onboardingBody.querySelector('#ob-profile-persona'); const t = $onboardingBody.querySelector('#ob-profile-tone'); if(n) n.addEventListener('input', ()=>onboardingState.profileName = n.value.trim()); if(p) p.addEventListener('input', ()=>onboardingState.profilePersona = p.value.trim()); if(t) t.addEventListener('input', ()=>onboardingState.profileTone = t.value.trim()); }); }

  function renderSuccessStep(){
    return safeRender('renderSuccessStep', function(){ if(!$onboardingBody) return; $onboardingBody.innerHTML = `
    <div class="onboarding-success">
      <img src="../icons/icon-48.png" alt="promptiply" class="icon-48" />
      <h3>You're All Set!</h3>
      <p>promptiply is ready to help you refine your prompts. Here's what you configured:</p>
      <div class="onboarding-summary">
        <div class="mb-12"><strong>Mode:</strong> ${onboardingState.selectedMode === 'api' ? 'API' : onboardingState.selectedMode === 'webui' ? 'WebUI' : 'Local (Llama 3)'}</div>
        ${onboardingState.selectedMode === 'api' && onboardingState.apiKey ? `<div class="mb-12"><strong>Provider:</strong> ${onboardingState.selectedProvider === 'openai' ? 'OpenAI' : 'Anthropic'}</div>` : ''}
        ${onboardingState.profileName ? `<div class="mb-12"><strong>Profile:</strong> ${escapeHtml(onboardingState.profileName)}</div>` : ''}
      </div>
      <p class="mt-24">Visit <strong>chat.openai.com</strong> or <strong>claude.ai</strong> and press <strong>Alt+T</strong> (or click the Refine button) to start refining your prompts!</p>
    </div>
  `; }); }

  function handleOnboardingNext(){
    if(onboardingState.step === 2 && onboardingState.selectedMode === 'api'){
      const $obProvider = document.getElementById('ob-provider');
      if($obProvider) onboardingState.selectedProvider = $obProvider.value;

      if(onboardingState.selectedProvider === 'openai'){
        const $obOpenaiKey = document.getElementById('ob-openai-key');
        const $obOpenaiModel = document.getElementById('ob-openai-model');
        if($obOpenaiKey) onboardingState.apiKey = $obOpenaiKey.value.trim();
        if($obOpenaiModel) onboardingState.model = $obOpenaiModel.value;
      } else {
        const $obAnthropicKey = document.getElementById('ob-anthropic-key');
        const $obAnthropicModel = document.getElementById('ob-anthropic-model');
        if($obAnthropicKey) onboardingState.apiKey = $obAnthropicKey.value.trim();
        if($obAnthropicModel) onboardingState.model = $obAnthropicModel.value;
      }
    } else if(onboardingState.step === 3){
      const $obProfileName = document.getElementById('ob-profile-name');
      const $obProfilePersona = document.getElementById('ob-profile-persona');
      const $obProfileTone = document.getElementById('ob-profile-tone');
      if($obProfileName) onboardingState.profileName = $obProfileName.value.trim();
      if($obProfilePersona) onboardingState.profilePersona = $obProfilePersona.value.trim();
      if($obProfileTone) onboardingState.profileTone = $obProfileTone.value.trim();
    }

    setOnboardingStep(onboardingState.step+1);
  }

  // Enhanced: prevent moving forward from step 1 without selecting a mode
  function handleOnboardingNextWrapper(){
    if(onboardingState.step===1){ if(!onboardingState.selectedMode){ // show temporary hint
        const hint = document.createElement('div'); hint.className='onboarding-hint'; hint.textContent = 'Please choose a mode to continue.'; const container = $onboardingBody.querySelector('.onboarding-section'); if(container){ const existing = container.querySelector('.onboarding-hint'); if(!existing) container.appendChild(hint); setTimeout(()=>{ try{ hint.remove(); }catch(_){} }, 2800); }
        return; } }
    handleOnboardingNext();
  }

  // Replace listener to use wrapper
  if($onboardingNext){ $onboardingNext.removeEventListener('click', handleOnboardingNext); $onboardingNext.addEventListener('click', handleOnboardingNextWrapper); }
  

  function finishOnboarding(){
    // Save settings
    chrome.storage.local.get([STORAGE_SETTINGS], (data)=>{
      const settings = data[STORAGE_SETTINGS] || {};
      settings.mode = onboardingState.selectedMode;
      if(onboardingState.selectedMode === 'api'){
        settings.provider = onboardingState.selectedProvider;
        if(onboardingState.apiKey){
          if(onboardingState.selectedProvider === 'openai'){
            settings.openaiKey = onboardingState.apiKey;
            settings.openaiModel = onboardingState.model || 'gpt-5-nano';
          } else {
            settings.anthropicKey = onboardingState.apiKey;
            settings.anthropicModel = onboardingState.model || 'claude-haiku-4-5';
          }
        }
      }
      chrome.storage.local.set({ [STORAGE_SETTINGS]: settings });
    });

    // Create profile if provided
    if(onboardingState.profileName){
      chrome.storage.sync.get([STORAGE_PROFILES], (data)=>{
        const profiles = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
        const profileId = `p_${Date.now()}`;
        const newProfile = { id: profileId, name: onboardingState.profileName, persona: onboardingState.profilePersona, tone: onboardingState.profileTone, styleGuidelines: [], constraints: [], examples: [], domainTags: [] };
        profiles.list.push(newProfile);
        if(!profiles.activeProfileId) profiles.activeProfileId = profileId;
        chrome.storage.sync.set({ [STORAGE_PROFILES]: profiles }, ()=>{ renderProfiles(profiles); });
      });
    }

    // Mark onboarding complete
    chrome.storage.local.set({ [STORAGE_ONBOARDING]: true });
    closeOnboardingWizard();
    // Reload to apply settings
    setTimeout(()=> location.reload(), 300);
  }

  // Auto-open onboarding on first load if not completed
  try{ chrome.storage.local.get([STORAGE_ONBOARDING], (data)=>{ if(!data[STORAGE_ONBOARDING]) setTimeout(()=>openOnboardingWizard(), 500); }); } catch(_){ }

  // Bind onboarding controls robustly (element may not exist at script run time)
  (function bindRunOnboarding(){
    function attach(){
      const btn = document.getElementById('run-onboarding');
      if(!btn) return false;
      // avoid attaching multiple times
      if(btn.dataset && btn.dataset.prOnboardingAttached) return true;
      const wrapper = function(){
        try{
          if(typeof openOnboardingWizard === 'function') return openOnboardingWizard();
          if(typeof window.startOnboarding === 'function') return window.startOnboarding();
          // fallback: show modal DOM and try to render first step if renderModesStep exists
          const m = document.getElementById('onboarding-modal'); if(m) m.classList.add('modal-show');
          if(typeof setOnboardingStep === 'function') return setOnboardingStep(1);
          if(typeof renderModesStep === 'function') return renderModesStep();
        }catch(e){ console.warn('[promptiply] run-onboarding wrapper failed', e); }
      };
      btn.addEventListener('click', wrapper);
      try{ if(btn.dataset) btn.dataset.prOnboardingAttached = '1'; }catch(_){ }
      return true;
    }
    // Try immediate attach
    if(attach()) return;
    // Try once DOM is ready
    document.addEventListener('DOMContentLoaded', ()=>{ try{ attach(); }catch(_){}});
    // As a last resort, watch for the element to appear
    try{
      const mo = new MutationObserver((mutations, obs) => { if(attach()){ obs.disconnect(); } });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      // stop observing after 5s to avoid leaks
      setTimeout(()=>mo.disconnect(), 5000);
    }catch(_){/* ignore */}
    // Also add a delegated document-level click handler so clicks work even if the element
    // wasn't present at script attachment time (avoids timing races and missed DOMContentLoaded)
    try{
      if(!document._prOnboardingDelegated){
        document.addEventListener('click', (ev)=>{
          try{
            const t = ev.target && ev.target.closest && ev.target.closest('#run-onboarding');
            if(t){
              // record that the Run Onboarding button was clicked (diagnostic)
              try{ chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ promptiply_onboarding_click: { timestamp: Date.now() } }); }catch(_){ try{ localStorage.setItem('promptiply_onboarding_click', JSON.stringify({ timestamp: Date.now() })); }catch(__){} }
              console.log('[promptiply] delegated click detected for run-onboarding');
              // call attach wrapper logic directly
              const wrapperCall = function(){
                try{
                  // Prefer canonical functions if present
                  if(typeof openOnboardingWizard === 'function') return openOnboardingWizard();
                  if(typeof window.startOnboarding === 'function') return window.startOnboarding();
                  // If the onboarding body exists but is empty, inject a small fallback wizard
                  const m = document.getElementById('onboarding-modal');
                  const obody = document.getElementById('onboarding-body');
                  if(m) m.classList.add('modal-show');
                  if(obody && (obody.innerHTML||'').trim().length===0){
                    // Minimal fallback wizard (3 steps)
                    let prStep = 1;
                    const renderPr = ()=>{
                      if(!obody) return;
                        $onboardingBody.innerHTML = `
                      <div class="onboarding-section">
                        <h3>Choose Your Refinement Mode</h3>
                        <p>promptiply offers three ways to refine your prompts. Choose the one that fits your needs:</p>
                      </div>
                      <div class="mode-card ${onboardingState.selectedMode === 'api' ? 'selected' : ''}" data-mode="api" tabindex="0">
                        <h3>API Mode</h3>
                        <p>Uses your OpenAI or Anthropic API key for fast, reliable refinement. Best for regular use.</p>
                        <span class="mode-badge badge-easy">Recommended</span>
                      </div>
                      <div class="mode-card ${onboardingState.selectedMode === 'webui' ? 'selected' : ''}" data-mode="webui" tabindex="0">
                        <h3>WebUI Mode</h3>
                        <p>Opens a background tab to ChatGPT or Claude, sends your prompt, and reads the response. No API key needed.</p>
                        <span class="mode-badge badge-simple">Simple Setup</span>
                      </div>
                      <div class="mode-card ${onboardingState.selectedMode === 'local' ? 'selected' : ''}" data-mode="local" tabindex="0">
                        <h3>Local Mode (Llama 3)</h3>
                        <p>Runs entirely in your browser using Llama 3.1 8B model. Completely private and offline after initial download (~5GB).</p>
                        <span class="mode-badge badge-private">100% Private</span>
                      </div>
                    `;
                }catch(e){ console.warn('[promptiply] delegated run-onboarding failed', e); }
              };
              wrapperCall();
            }
          }catch(_){/* ignore */}
        }, true);
        try{ document._prOnboardingDelegated = true; }catch(_){ }
      }
    }catch(_){/* ignore */}
  })();
  $onboardingSkip?.addEventListener('click', ()=>closeOnboardingWizard());
  $onboardingBack?.addEventListener('click', ()=>setOnboardingStep(onboardingState.step-1));
  // ensure the Next button uses the wrapper (validation) handler
  $onboardingNext?.addEventListener('click', handleOnboardingNextWrapper);
  $onboardingFinish?.addEventListener('click', finishOnboarding);

  // Start onboarding helper exposed for runtime messages
  function startOnboarding(){ try{ $profileModal?.classList.remove('modal-show'); } catch(_){} if($onboardingModal) { openOnboardingWizard(); } else { // fallback: reuse profile wizard
    // show profile modal as a fallback onboarding path
    openWizard(); } }
  try{ window.startOnboarding = startOnboarding; } catch(_){}
  // Expose onboarding helpers for debugging and console invocation
  try{ window.openOnboardingWizard = function(){ try{ return openOnboardingWizard(); }catch(e){ console.warn('openOnboardingWizard failed', e); } }; }catch(_){ }
  try{ window.setOnboardingStep = function(s){ try{ return setOnboardingStep(s); }catch(e){ console.warn('setOnboardingStep failed', e); } }; }catch(_){ }
  try{ window.getOnboardingState = function(){ try{ return onboardingState; }catch(_){ return null; } }; }catch(_){ }
  try{ chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{ if(msg && msg.type==='PR_START_ONBOARDING'){ startOnboarding(); sendResponse && sendResponse({ok:true}); } }); } catch(_){}

  // Draft helpers
  function saveOnboardingDraft(){ const draft = { wizardState, timestamp: Date.now() }; chrome.storage.local.set({ onboardingDraft: draft }); }
  function loadOnboardingDraft(cb){ chrome.storage.local.get(['onboardingDraft'], (data)=>{ const d = data.onboardingDraft; if(d && d.wizardState) cb(d.wizardState); else cb(null); }); }

  // Hotkey helper referenced earlier: implement formatKeyEvent now
  function formatKeyEvent(e){ const parts=[]; if(e.ctrlKey) parts.push('Ctrl'); if(e.altKey) parts.push('Alt'); if(e.shiftKey) parts.push('Shift'); if(e.metaKey) parts.push('Meta'); let key = e.key; if(!key||key==='Unidentified') key = e.code?.replace(/^(Key|Digit)/,'')||'Unknown'; const keyMap={' ':'Space','Enter':'Enter','Escape':'Escape','Tab':'Tab','Backspace':'Backspace','Delete':'Delete'}; if(keyMap[key]) key=keyMap[key]; else if(key.length===1) key=key.toUpperCase(); parts.push(key); return parts.join('+'); }

  // Diagnostic: detect duplicate IDs in the DOM and show a visible banner to help debugging duplicate UI
  try {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const idCount = {};
        Array.from(document.querySelectorAll('[id]')).forEach(el => {
          const id = el.id;
          if (!id) return;
          idCount[id] = (idCount[id] || 0) + 1;
        });
        const duplicates = Object.entries(idCount).filter(([k, v]) => v > 1);
        if (duplicates.length) {
          const banner = document.createElement('div');
          banner.className = 'debug-duplicate-banner';
          banner.textContent = `Duplicate DOM IDs detected: ${duplicates.map(d => d[0] + '(' + d[1] + ')').join(', ')}`;
          document.body.appendChild(banner);
          console.warn('[promptiply] duplicate DOM IDs', duplicates);
        }
      } catch (e) {
        console.warn('[promptiply] duplicate id check failed', e);
      }
    });
  } catch (e) {
    /* ignore */
  }

}

})();


