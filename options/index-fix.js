(function () {
  if (typeof window === 'undefined') return;
  if (window.__options_fallback_loaded) return;
  window.__options_fallback_loaded = true;

  // Diagnostic init: record that the fallback has initialized
  try{ chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ promptiply_options_init: { loaded: 'index-fix.js', timestamp: Date.now() } }); }catch(_){ try{ localStorage.setItem('promptiply_options_init', JSON.stringify({ loaded: 'index-fix.js', timestamp: Date.now() })); }catch(__){} }

  // Defensive no-op stubs: if the main options script is truncated or missing
  // these functions, provide safe fallbacks so calls from the broken script
  // don't throw and prevent the fallback from working.
  if (typeof window.renderPredefinedProfiles !== 'function') {
    window.renderPredefinedProfiles = function () {
      console.info('Options fallback: renderPredefinedProfiles noop');
    };
  }
  if (typeof window.renderProfiles !== 'function') {
    // Basic fallback renderer: put a minimal message into #profiles-list
    window.renderProfiles = function (p) {
      try {
        const container = document.getElementById('profiles-list');
        if (!container) return;
        container.innerHTML = '';
        const list = (p && p.list) || [];
        if (!list.length) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.innerHTML = 'No profiles available (fallback)';
          container.appendChild(empty);
          return;
        }
        list.forEach(pr => {
          const el = document.createElement('div'); el.className = 'card'; el.textContent = pr.name || pr.id || 'Profile'; container.appendChild(el);
        });
      } catch (e) { console.warn('Options fallback: renderProfiles failed', e); }
    };
  }

  // Fallback onboarding helpers — provide a minimal wizard UI when main script is absent
  if (typeof window.openOnboardingWizard !== 'function') {
    window._fallbackOnboardingState = { step: 1, selectedMode: 'api', selectedProvider: 'openai', apiKey: '', model: '', profileName: '', profilePersona: '', profileTone: '' };
    window.openOnboardingWizard = function () {
      try {
        let modal = document.getElementById('onboarding-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'onboarding-modal';
          modal.className = 'modal modal-show';
          document.body.appendChild(modal);
        }
        // If the page already provides an onboarding layout (e.g. an element
        // with id 'onboarding-body' at document level), populate that element
        // so the fallback integrates with the original DOM. Otherwise, fill
        // the modal element itself (or create content if modal is empty).
        const globalBody = document.getElementById('onboarding-body');
        const modalBody = modal.querySelector('#onboarding-body');
        const targetBody = globalBody || modalBody;
        const contentHtml = `
            <div class="onboarding-box">
              <h3>Welcome to promptiply!</h3>
              <div id="onboarding-content" class="onboarding-content"></div>
              <div class="onboarding-actions">
                <button id="onboarding-skip" class="btn">Skip</button>
                <button id="onboarding-back" class="btn">Back</button>
                <button id="onboarding-next" class="btn primary">Next</button>
              </div>
            </div>
          `;
        if (targetBody) {
          targetBody.innerHTML = contentHtml;
        } else if (!modal.innerHTML.trim()) {
          modal.innerHTML = contentHtml;
        }
        modal.classList.add('modal-show');
        renderFallbackOnboardingStep();
        // Wire buttons (both fallback-created and any canonical buttons present)
        setTimeout(()=>{
          const ids = ['onboarding-skip','onboarding-back','onboarding-next','onboarding-finish'];
          ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'onboarding-skip') el.addEventListener('click', closeOnboardingWizard);
            else if (id === 'onboarding-back') el.addEventListener('click', ()=> setFallbackOnboardingStep(window._fallbackOnboardingState.step - 1));
            else if (id === 'onboarding-next') el.addEventListener('click', ()=> { if(window._fallbackOnboardingState.step<4) setFallbackOnboardingStep(window._fallbackOnboardingState.step + 1); else finishFallbackOnboarding(); });
            else if (id === 'onboarding-finish') el.addEventListener('click', finishFallbackOnboarding);
          });
        }, 20);
      } catch (e) { console.warn('Options fallback: openOnboardingWizard failed', e); }
    };

    window.closeOnboardingWizard = function () { try { const m=document.getElementById('onboarding-modal'); if(m){ m.classList.remove('modal-show'); } } catch(e){} };

    function setFallbackOnboardingStep(n){ window._fallbackOnboardingState.step = Math.max(1, Math.min(4, n)); renderFallbackOnboardingStep(); }
    function renderFallbackOnboardingStep(){
      try{
        const st = window._fallbackOnboardingState;
        const target = document.getElementById('onboarding-content'); if(!target) return;
        if(st.step===1){ target.innerHTML = `<p>Select mode:</p><div><label><input type="radio" name="ob-mode" value="api" ${st.selectedMode==='api'?'checked':''}/> API</label> <label><input type="radio" name="ob-mode" value="webui" ${st.selectedMode==='webui'?'checked':''}/> WebUI</label> <label><input type="radio" name="ob-mode" value="local" ${st.selectedMode==='local'?'checked':''}/> Local</label></div>`;
          Array.from(target.querySelectorAll('input[name="ob-mode"]')).forEach(el=>el.addEventListener('change', (e)=>{ st.selectedMode = e.target.value; }));
        } else if(st.step===2){ target.innerHTML = `<p>Provider and API key (optional):</p><div><select id="ob-provider-select"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select><div><input id="ob-api-key" placeholder="API key (optional)" /></div></div>`; const sel=target.querySelector('#ob-provider-select'); if(sel) sel.value=st.selectedProvider; sel?.addEventListener('change', (e)=> st.selectedProvider = e.target.value); const key=target.querySelector('#ob-api-key'); key?.addEventListener('input', (e)=> st.apiKey = e.target.value);
        } else if(st.step===3){ target.innerHTML = `<p>Create a profile (optional):</p><div><input id="ob-profile-name" placeholder="Profile name" value="${st.profileName||''}" /></div>`; const p=target.querySelector('#ob-profile-name'); p?.addEventListener('input', (e)=> st.profileName = e.target.value);
        } else { target.innerHTML = `<p>You're all set! Click Finish to store settings and close.</p>`; }
      }catch(e){console.warn('Options fallback: renderFallbackOnboardingStep failed', e);} }

    function finishFallbackOnboarding(){
      try{
        // Persist a simple onboarding flag and any chosen settings
        const st = window._fallbackOnboardingState;
        try{ chrome.storage.local.set({ onboarding_completed: true, settings: { mode: st.selectedMode, provider: st.selectedProvider, openaiKey: st.apiKey } }); } catch(e) { console.info('Options fallback: could not persist settings', e); }
        closeOnboardingWizard();
        console.info('Options fallback: onboarding finished');
      } catch(e){ console.warn('finishFallbackOnboarding failed', e); }
    }
  }

  function q(sel) { return document.querySelector(sel); }
  function qAll(sel) { return Array.from(document.querySelectorAll(sel)); }

  function collectSettingsFromForm(form) {
    const settings = {};
    if (!form) return settings;
    const inputs = qAll('#settings-form input, #settings-form select, #settings-form textarea');
    // Fallback: if no settings-form, grab inputs in the page
    const allInputs = inputs.length ? inputs : qAll('input[name],select[name],textarea[name]');
    allInputs.forEach((el) => {
      if (!el.name) return;
      try {
        if (el.type === 'checkbox') settings[el.name] = !!el.checked;
        else if (el.type === 'radio') {
          if (el.checked) settings[el.name] = el.value;
        } else settings[el.name] = el.value;
      } catch (e) {
        // ignore
      }
    });
    return settings;
  }

  function applySettingsToForm(form, settings = {}) {
    if (!form) return;
    const inputs = qAll('#settings-form input, #settings-form select, #settings-form textarea');
    const allInputs = inputs.length ? inputs : qAll('input[name],select[name],textarea[name]');
    allInputs.forEach((el) => {
      if (!el.name || !(el.name in settings)) return;
      try {
        if (el.type === 'checkbox') el.checked = !!settings[el.name];
        else if (el.type === 'radio') el.checked = (el.value === settings[el.name]);
        else el.value = settings[el.name];
      } catch (e) {
        // ignore
      }
    });
  }

  function saveSettingsHandler(form) {
    try {
      const settings = collectSettingsFromForm(form);
      chrome.storage && chrome.storage.local && chrome.storage.local.set({ settings }, () => {
        console.info('Options fallback: settings saved');
        const s = q('#options-status') || q('.options-status');
        if (s) { s.textContent = 'Saved'; setTimeout(()=> s.textContent = '', 1200); }
      });
    } catch (err) {
      console.error('Options fallback: save failed', err);
    }
  }

  function restoreSettingsHandler(form) {
    try {
      if (!chrome.storage || !chrome.storage.local) {
        console.warn('Options fallback: chrome.storage not available');
        return;
      }
      chrome.storage.local.get(['settings'], (res) => {
        const settings = res && res.settings ? res.settings : {};
        applySettingsToForm(form, settings);
        console.info('Options fallback: settings restored', settings);
      });
    } catch (err) {
      console.error('Options fallback: restore failed', err);
    }
  }

  function wireImportControls() {
    try {
      const fileInput = q('#predefined-file');
      const fileChoose = q('#predefined-file-choose');
      const urlInput = q('#predefined-url');
      const urlLoad = q('#predefined-url-load');
      const pasteBtn = q('#predefined-paste-json');

      if (fileChoose && fileInput) {
        fileChoose.addEventListener('click', (e) => {
          e.preventDefault();
          try { fileInput.click(); } catch (err) { console.error('file click failed', err); }
        });
      }

      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = function () {
            try {
              const json = JSON.parse(reader.result);
              if (chrome && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.get(['profiles'], (cur) => {
                  const list = (json && Array.isArray(json)) ? json : (json && json.list ? json.list : []);
                  const out = { list };
                  chrome.storage.sync.set({ profiles: out }, () => {
                    console.info('Options fallback: profiles imported from file');
                    const s = q('#import-status');
                    if (s) { s.textContent = 'Imported'; setTimeout(()=> s.textContent = '', 1200); }
                  });
                });
              } else {
                console.warn('Options fallback: chrome.storage.sync not available');
              }
            } catch (err) {
              console.error('Options fallback: invalid JSON file', err);
            }
          };
          reader.readAsText(f);
        });
      }

      if (urlLoad && urlInput) {
        urlLoad.addEventListener('click', async (e) => {
          e.preventDefault();
          const url = (urlInput.value || '').trim();
          if (!url) { console.warn('Options fallback: no URL provided'); return; }
          try {
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
            const json = await resp.json();
            if (chrome && chrome.storage && chrome.storage.sync) {
              const list = (json && Array.isArray(json)) ? json : (json && json.list ? json.list : []);
              chrome.storage.sync.set({ profiles: { list } }, () => {
                console.info('Options fallback: profiles imported from URL');
                const s = q('#import-status');
                if (s) { s.textContent = 'Imported'; setTimeout(()=> s.textContent = '', 1200); }
              });
            }
          } catch (err) {
            console.error('Options fallback: URL load failed', err);
          }
        });
      }

      if (pasteBtn) {
        pasteBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
            const text = await (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.resolve(''));
            const json = JSON.parse(text);
            if (chrome && chrome.storage && chrome.storage.sync) {
              const list = (json && Array.isArray(json)) ? json : (json && json.list ? json.list : []);
              chrome.storage.sync.set({ profiles: { list } }, () => {
                console.info('Options fallback: profiles imported from clipboard');
                const s = q('#import-status');
                if (s) { s.textContent = 'Imported'; setTimeout(()=> s.textContent = '', 1200); }
              });
            }
          } catch (err) {
            console.error('Options fallback: paste/import failed', err);
          }
        });
      }
    } catch (err) {
      console.error('Options fallback: wireImportControls error', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const form = q('#settings-form') || document.querySelector('form');
      const saveBtn = q('#save-settings') || q('button[data-action="save-settings"]') || q('button[type="submit"]');
      const resetBtn = q('#reset-settings') || q('button[data-action="reset-settings"]');

      if (saveBtn) {
        saveBtn.addEventListener('click', (e) => { e.preventDefault(); saveSettingsHandler(form); });
      } else if (form) {
        form.addEventListener('submit', (e) => { e.preventDefault(); saveSettingsHandler(form); });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', (e) => { e.preventDefault(); restoreSettingsHandler(form); });
      }

      restoreSettingsHandler(form);
      wireImportControls();
      // Wire Run Onboarding fallback
      try {
        const runBtn = q('#run-onboarding') || q('[data-action="run-onboarding"]');
        if (runBtn) {
          runBtn.addEventListener('click', (e) => {
            e.preventDefault();
            try {
              if (typeof window.startOnboarding === 'function') { window.startOnboarding(); console.info('Options fallback: startOnboarding invoked'); }
              else if (typeof window.openWizard === 'function') { window.openWizard(); console.info('Options fallback: openWizard invoked'); }
              else {
                // As a last resort, toggle onboarding modal
                const ob = document.getElementById('onboarding-modal'); if (ob) { ob.classList.add('modal-show'); console.info('Options fallback: onboarding modal shown'); }
              }
            } catch (err) { console.warn('Options fallback: run-onboarding handler failed', err); }
          });
        }
      } catch (err) { console.warn('Options fallback: wire run-onboarding failed', err); }
      console.info('Options fallback initialized');
    } catch (err) {
      console.error('Options fallback init error', err);
    }
  }, { once: true });

  // Ensure onboarding content is populated whenever the onboarding modal is shown
  function ensureOnboardingPopulated() {
    try {
      const globalBody = document.getElementById('onboarding-body');
      const modal = document.getElementById('onboarding-modal');
      const target = globalBody || (modal && modal.querySelector('#onboarding-body')) || null;
      if (!target) return;
      // If target is empty (or contains only whitespace), render fallback step
      if (!target.innerHTML.trim()) {
        // populate with same contentHtml used by openOnboardingWizard
        const contentHtml = `
            <div class="onboarding-box">
              <h3>Welcome to promptiply!</h3>
              <div id="onboarding-content" class="onboarding-content"></div>
              <div class="onboarding-actions">
                <button id="onboarding-skip" class="btn">Skip</button>
                <button id="onboarding-back" class="btn">Back</button>
                <button id="onboarding-next" class="btn primary">Next</button>
              </div>
            </div>
          `;
        target.innerHTML = contentHtml;
        renderFallbackOnboardingStep();
        // wire canonical buttons if present
        ['onboarding-skip','onboarding-back','onboarding-next','onboarding-finish'].forEach(id=>{
          const el = document.getElementById(id);
          if(!el) return;
          if(id==='onboarding-skip') el.addEventListener('click', closeOnboardingWizard);
          else if(id==='onboarding-back') el.addEventListener('click', ()=> setFallbackOnboardingStep(window._fallbackOnboardingState.step - 1));
          else if(id==='onboarding-next') el.addEventListener('click', ()=> { if(window._fallbackOnboardingState.step<4) setFallbackOnboardingStep(window._fallbackOnboardingState.step + 1); else finishFallbackOnboarding(); });
          else if(id==='onboarding-finish') el.addEventListener('click', finishFallbackOnboarding);
        });
      }
    } catch (e) { console.warn('Options fallback: ensureOnboardingPopulated failed', e); }
  }

  try {
    const modalEl = document.getElementById('onboarding-modal');
    if (modalEl) {
      const obs = new MutationObserver((mutations)=>{
        for(const m of mutations){
          if (m.type==='attributes' && m.attributeName==='class'){
            if (modalEl.classList.contains('modal-show')) ensureOnboardingPopulated();
          }
        }
      });
      obs.observe(modalEl, { attributes: true, attributeFilter: ['class'] });
    }
    // also ensure immediately if modal already visible
    setTimeout(()=> ensureOnboardingPopulated(), 40);
  } catch(e){ /* ignore */ }

})();
