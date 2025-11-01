// Detect site and mount inline refine UI + hotkey scaffolding

importScripts = undefined; // silence some bundlers; MV3 will load as plain JS

// Move adapters and helpers above IIFE to avoid TDZ errors
const ChatGPTAdapter = {
  findInput() {
    // Try several stable selectors ChatGPT uses across variants, searching deeply (piercing shadow roots)
  const candidates = [
      '#prompt-textarea.ProseMirror[contenteditable="true"]',
      '#prompt-textarea[contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]',
      '[data-testid="composer"] [contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][data-placeholder*="message"]',
      'form textarea',
      'textarea'
    ];
    for (const sel of candidates) {
      const el = deepQuerySelector(sel);
      if (el) return el;
    }
    // Fallback: any contenteditable textbox-like element on page
    const ce = deepQuerySelector('[contenteditable="true"]');
    return ce || null;
  },
  insertButton(btn) {
    const input = this.findInput();
    if (!input || (input.closest && input.closest('.pr-btn-mounted'))) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'pr-btn-mounted';
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'flex-end';
    wrapper.appendChild(btn);
    if (input.parentElement) input.parentElement.appendChild(wrapper);
  },
  readInput() {
    const input = this.findInput();
    if (!input) return '';
    if ('value' in input) return input.value;
    // contenteditable
    let text = (input.innerText || input.textContent || '').trim();
    if (!text && input.id === 'prompt-textarea') {
      try {
        text = Array.from(input.querySelectorAll('p, div')).map(n => n.innerText || n.textContent || '').join('\n').trim();
      } catch(_) {}
    }
    return text;
  },
  writeInput(text) {
    const input = this.findInput();
    if (!input) return;
    if ('value' in input) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // contenteditable path
    input.focus();
    // Replace content safely
    const range = document.createRange();
    range.selectNodeContents(input);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand('insertText', false, text); } catch(_) { input.textContent = text; }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
};

const ClaudeAdapter = {
  findInput() {
    // Claude uses a contenteditable div
    return document.querySelector('[contenteditable="true"]');
  },
  insertButton(btn) {
    const input = this.findInput();
    if (!input || (input.closest && input.closest('.pr-btn-mounted'))) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'pr-btn-mounted';
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'flex-end';
    wrapper.appendChild(btn);
    if (input.parentElement) input.parentElement.appendChild(wrapper);
  },
  readInput() {
    const el = this.findInput();
    return el ? (el.innerText || '') : '';
  },
  writeInput(text) {
    const el = this.findInput();
    if (!el) return;
    el.innerText = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
};

function matchesHotkey(e, combo) {
  if (!combo) return false;
  const parts = combo.split('+').map(x => x.trim());
  const keyPart = parts.pop();
  const want = new Set(parts.map(p => p.toLowerCase()));
  const hasCtrl = e.ctrlKey || e.key === 'Control';
  const hasAlt = e.altKey || e.key === 'Alt';
  const hasShift = e.shiftKey || e.key === 'Shift';
  const hasMeta = e.metaKey || e.key === 'Meta';
  const needCtrl = want.has('ctrl') || want.has('control');
  const needAlt = want.has('alt') || want.has('option');
  const needShift = want.has('shift');
  const needMeta = want.has('meta') || want.has('cmd') || want.has('command');
  if (needCtrl !== hasCtrl) return false;
  if (needAlt !== hasAlt) return false;
  if (needShift !== hasShift) return false;
  if (needMeta !== hasMeta) return false;
  const key = (keyPart || '').toLowerCase();
  const pressed = (e.key || '').toLowerCase();
  const normalize = (k) => ({ 'arrowup':'arrowup','arrowdown':'arrowdown','arrowleft':'arrowleft','arrowright':'arrowright','enter':'enter','escape':'escape','esc':'escape',' ': ' ' }[k] || k);
  return normalize(pressed) === normalize(key);
}

(function () {
  const SITE = detectSite();
  if (!SITE) return;

  const adapter = getSiteAdapter(SITE);
  if (!adapter) {
    try { console.warn('[promptiply] No site adapter found for', SITE); } catch(_) {}
    return;
  }

  // Observe input area and inject button
  initInjection(adapter);

  // Register hotkey from settings (platform-aware default)
  function getDefaultHotkey() {
    const platform = navigator.platform.toLowerCase();
    return platform.includes('mac') ? 'Ctrl+T' : 'Alt+T';
  }
  let refineHotkey = getDefaultHotkey();
  chrome.storage.local.get(['settings'], (data) => {
    const s = data.settings || {};
    refineHotkey = s.refineHotkey || getDefaultHotkey();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      const s = changes.settings.newValue || {};
      refineHotkey = s.refineHotkey || getDefaultHotkey();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (matchesHotkey(e, refineHotkey)) {
      e.preventDefault();
      e.stopPropagation();
      try { console.log('[promptiply] Refine hotkey pressed:', refineHotkey); } catch(_) {}
      tryRefine(adapter);
    }
  });

  // Listen for background command trigger
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'PR_TRIGGER_REFINE') {
      tryRefine(adapter);
    }
    
    // Listen for progress updates from local mode
    if (msg && msg.type === 'PR_PROGRESS_UPDATE') {
      updateProgress(msg.payload);
    }
  });
  
  let currentProgress = null;
  
  function updateProgress(progress) {
    currentProgress = progress;
    const el = document.querySelector('.pr-overlay');
    if (el && el.style.display !== 'none') {
      // Update the overlay with progress
      const body = el.querySelector('.pr-body');
      if (body && progress) {
        renderProgress(body, progress);
      }
    }
  }
  
  function renderProgress(container, progress) {
    container.innerHTML = '';
    
    const statusText = document.createElement('div');
    statusText.style.marginBottom = '12px';
    statusText.style.fontSize = '14px';
    statusText.style.color = 'var(--pr-text)';
    statusText.textContent = progress.message || 'Loading...';
    container.appendChild(statusText);
    
    // Progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.style.width = '100%';
    progressContainer.style.height = '8px';
    progressContainer.style.backgroundColor = 'var(--pr-bg)';
    progressContainer.style.borderRadius = '4px';
    progressContainer.style.overflow = 'hidden';
    progressContainer.style.border = '1px solid var(--pr-border)';
    
    // Progress bar fill
    const progressBar = document.createElement('div');
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = 'linear-gradient(90deg, var(--pr-accent), var(--pr-accent2))';
    progressBar.style.background = 'linear-gradient(90deg, #7c3aed, #06b6d4)';
    progressBar.style.transition = 'width 0.3s ease';
    progressBar.style.width = `${Math.min(100, Math.max(0, progress.progress || 0))}%`;
    progressBar.style.borderRadius = '4px';
    
    progressContainer.appendChild(progressBar);
    container.appendChild(progressContainer);
    
    // Progress percentage text
    if (progress.progress !== undefined && progress.progress > 0) {
      const percentText = document.createElement('div');
      percentText.style.marginTop = '8px';
      percentText.style.fontSize = '12px';
      percentText.style.color = 'var(--pr-muted)';
      percentText.style.textAlign = 'center';
      percentText.textContent = `${Math.round(progress.progress)}%`;
      container.appendChild(percentText);
    }
    
    // Stage indicator
    if (progress.stage) {
      const stageText = document.createElement('div');
      stageText.style.marginTop = '4px';
      stageText.style.fontSize = '11px';
      stageText.style.color = 'var(--pr-muted)';
      stageText.style.textAlign = 'center';
      stageText.style.textTransform = 'capitalize';
      stageText.textContent = progress.stage === 'downloading' ? 'Downloading model files...' :
                             progress.stage === 'initializing' ? 'Initializing model...' :
                             progress.stage === 'compiling' ? 'Compiling model...' :
                             progress.stage === 'ready' ? 'Model ready' :
                             progress.stage === 'error' ? 'Error occurred' : '';
      container.appendChild(stageText);
    }
  }

  function detectSite() {
    const h = location.hostname;
    if (h.includes('chat.openai.com') || h.includes('chatgpt.com')) return 'chatgpt';
    if (h.includes('claude.ai')) return 'claude';
    return null;
  }

  function getSiteAdapter(site) {
    if (site === 'chatgpt') return ChatGPTAdapter;
    if (site === 'claude') return ClaudeAdapter;
    return null;
  }

  function initInjection(adapter) {
    let floatUi = null;
    let observedInput = null;
    let ro = null;
    const update = () => {
      const inputEl = adapter.findInput();
      if (!inputEl) {
        if (floatUi) floatUi.style.display = 'none';
        try { console.debug('[promptiply] Chat input not found yet; will retry'); } catch(_) {}
        return;
      }
      if (!floatUi) floatUi = createFloatingRefineUI(() => tryRefine(adapter));
      positionFloatingUI(floatUi, inputEl);
      floatUi.style.display = 'block';
      if (observedInput !== inputEl) {
        observedInput = inputEl;
        if (ro) try { ro.disconnect(); } catch(_) {}
        try {
          ro = new ResizeObserver(() => positionFloatingUI(floatUi, inputEl));
          ro.observe(inputEl);
        } catch(_) {}
      }
    };

    // Initial attempt + observe
    update();
    const mo = new MutationObserver(() => update());
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    // Also poll briefly during first seconds to catch late mounts
    let tries = 0;
    const iv = setInterval(() => { tries++; update(); if (tries > 60) clearInterval(iv); }, 250);
  }

  async function tryRefine(adapter) {
    const raw = adapter.readInput();
    if (!raw || !raw.trim()) {
      try { console.warn('[promptiply] Refine hotkey used but no prompt detected (empty input).'); } catch(_) {}
      return;
    }
    try { console.log('[promptiply] Sending refinement request', { len: raw.length, preview: raw.slice(0,100) }); } catch(_) {}

    // Reset progress for new refinement
    currentProgress = null;
    
    showOverlay({ status: 'working', original: raw });

    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      console.error('[promptiply] Extension context invalidated');
      currentProgress = null;
      hideOverlay();
      showOverlay({ 
        status: 'draft', 
        refined: raw, 
        error: 'Extension context invalidated. Please reload the page.',
        onApply: () => adapter.writeInput(raw) 
      });
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'PR_REFINEMENT_REQUEST', payload: { prompt: raw } }, (res) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || 'Extension context invalidated';
          if (errMsg.includes('Extension context invalidated')) {
            console.warn('[promptiply] Extension context invalidated - please reload the page');
          } else {
            console.error('[promptiply] Extension error:', errMsg);
          }
          currentProgress = null;
          hideOverlay();
          showOverlay({ 
            status: 'draft', 
            refined: raw, 
            error: 'Extension context invalidated. Please reload the page.',
            onApply: () => adapter.writeInput(raw) 
          });
          return;
        }
        try { console.log('[promptiply] Refinement response', res && { ok: res.ok, status: res.status, err: res.error, refinedLen: (res?.refined||'').length }); } catch(_) {}
        // Clear progress when refinement completes
        currentProgress = null;
        hideOverlay();
        if (!res || !res.ok) {
          const refined = raw; // fallback
          const errorMsg = res?.err || res?.error || 'Unknown error occurred';
          console.error('[promptiply] Refinement failed:', errorMsg);
          showOverlay({ status: 'draft', refined, error: errorMsg, onApply: () => adapter.writeInput(refined) });
          return;
        }
        if (res.status === 'ok') {
          const refined = res.refined || raw;
          showOverlay({ status: 'draft', refined, onApply: () => adapter.writeInput(refined) });
        } else if (res.status === 'not_implemented') {
          const refined = `[REFINED DRAFT]\n${raw}`;
          showOverlay({ status: 'draft', refined, onApply: () => adapter.writeInput(refined) });
        } else {
          const refined = raw;
          showOverlay({ status: 'draft', refined, onApply: () => adapter.writeInput(refined) });
        }
      });
    } catch (e) {
      const errMsg = String(e && e.message || e);
      if (errMsg.includes('Extension context invalidated')) {
        console.warn('[promptiply] Extension context invalidated - please reload the page');
      } else {
        console.error('[promptiply] sendMessage error:', e);
      }
      currentProgress = null;
      hideOverlay();
      showOverlay({ 
        status: 'draft', 
        refined: raw, 
        error: 'Extension context invalidated. Please reload the page.',
        onApply: () => adapter.writeInput(raw) 
      });
    }
  }

  // Minimal overlay for scaffolding
  function showOverlay(opts) {
    let el = document.querySelector('.pr-overlay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pr-overlay';
      el.innerHTML = `
        <div class="pr-card">
          <div class="pr-header">promptiply</div>
          <div class="pr-body"></div>
          <div class="pr-actions"></div>
        </div>
      `;
      document.body.appendChild(el);
    }
    const body = el.querySelector('.pr-body');
    const actions = el.querySelector('.pr-actions');
    actions.innerHTML = '';

    if (opts.status === 'working') {
      // Check if we have progress info (for local mode)
      if (currentProgress) {
        renderProgress(body, currentProgress);
      } else {
        body.textContent = 'Refining draft...';
        const spinner = document.createElement('div');
        spinner.style.width = '24px';
        spinner.style.height = '24px';
        spinner.style.border = '3px solid rgba(255,255,255,0.15)';
        spinner.style.borderTopColor = '#7c3aed';
        spinner.style.borderRadius = '999px';
        spinner.style.marginTop = '8px';
        spinner.style.animation = 'pr-spin 1s linear infinite';
        body.appendChild(spinner);
      }
      const cancel = document.createElement('button');
      cancel.textContent = 'Close';
      cancel.addEventListener('click', hideOverlay);
      actions.appendChild(cancel);
    } else if (opts.status === 'draft') {
      body.innerHTML = '';
      if (opts.error) {
        const errMsg = document.createElement('div');
        errMsg.style.color = '#ef4444';
        errMsg.style.marginBottom = '8px';
        errMsg.style.fontSize = '13px';
        errMsg.textContent = opts.error;
        body.appendChild(errMsg);
      }
      const ta = document.createElement('textarea');
      ta.className = 'pr-draft';
      ta.value = opts.refined || '';
      body.appendChild(ta);
      const apply = document.createElement('button');
      apply.textContent = 'Apply';
      apply.addEventListener('click', () => {
        const v = ta.value;
        opts.onApply && opts.onApply(v);
        hideOverlay();
      });
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', hideOverlay);
      actions.appendChild(apply);
      actions.appendChild(cancel);
    }
    el.style.display = 'block';
  }

  function hideOverlay() {
    const el = document.querySelector('.pr-overlay');
    if (el) el.style.display = 'none';
  }
})();
// Animations
const prStyle = document.createElement('style');
prStyle.textContent = `@keyframes pr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.documentElement.appendChild(prStyle);


// Floating UI (Shadow DOM) to avoid interfering with site React trees
function createFloatingRefineUI(onClick) {
  const host = document.createElement('div');
  host.className = 'pr-float-host';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483646';
  host.style.top = '0px';
  host.style.left = '0px';
  host.style.pointerEvents = 'none';
  host.style.display = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .wrap { pointer-events: auto; }
    .btn { background: linear-gradient(135deg, #7c3aed, #06b6d4); color:#fff; border:none; border-radius: 10px; padding:6px 10px; font-size:12px; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,0.3); transition:transform .15s ease, filter .15s ease; }
    .btn:hover { filter: brightness(1.06); }
    .btn:active { transform: translateY(1px); }
  `;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Refine';
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick && onClick(); });
  wrap.appendChild(btn);
  shadow.appendChild(style);
  shadow.appendChild(wrap);
  document.documentElement.appendChild(host);
  return host;
}

function positionFloatingUI(host, inputEl) {
  if (!host || !inputEl) return;
  try {
    const target = document.activeElement && document.activeElement.isSameNode(inputEl) ? document.activeElement : inputEl;
    const rect = target.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 64, Math.max(0, rect.right - 64));
    const y = Math.min(window.innerHeight - 36, Math.max(0, rect.bottom - 36));
    host.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    try { console.debug('[promptiply] Positioning refine button at', { x, y, rect }); } catch(_) {}
  } catch (_) {}
}

// Deep query that traverses open shadow roots
function deepQuerySelector(selector, root = document) {
  const seen = new Set();
  function walk(node) {
    if (!node || seen.has(node)) return null;
    seen.add(node);
    try {
      const found = node.querySelector?.(selector);
      if (found) return found;
    } catch (_) {}
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const sr = child.shadowRoot;
      if (sr) {
        const f = walk(sr);
        if (f) return f;
      }
      const f2 = walk(child);
      if (f2) return f2;
    }
    return null;
  }
  return walk(root);
}
