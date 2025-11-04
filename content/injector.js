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
  wrapper.className = 'pr-btn-mounted js-btn-mounted';
  // layout controlled via CSS class (no inline style)
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
  wrapper.className = 'pr-btn-mounted js-btn-mounted';
  // layout controlled via CSS class
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
    if (el && !el.classList.contains('pr-hidden')) {
      // Update the overlay with progress
      const body = (el.shadowRoot || el).querySelector('.pr-body');
      if (body && progress) {
        renderProgress(body, progress);
      }
    }
  }
  
  function renderProgress(container, progress) {
  container.innerHTML = '';

  const statusText = document.createElement('div');
  statusText.className = 'pr-status-text';
  statusText.textContent = progress.message || 'Loading...';
  container.appendChild(statusText);
    
    // Progress bar container (SVG-based to avoid inline style updates)
  const progressContainer = document.createElement('div');
  progressContainer.className = 'pr-progress-container';
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 8');
  svg.setAttribute('class', 'pr-progress-svg');
  const bg = document.createElementNS(svgNS, 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0'); bg.setAttribute('width', '100'); bg.setAttribute('height', '8'); bg.setAttribute('fill', 'rgba(255,255,255,0.03)');
  const fg = document.createElementNS(svgNS, 'rect');
  fg.setAttribute('x', '0'); fg.setAttribute('y', '0'); fg.setAttribute('width', String(Math.min(100, Math.max(0, progress.progress || 0)))); fg.setAttribute('height', '8'); fg.setAttribute('class', 'pr-progress-fill'); fg.setAttribute('fill', '#7c3aed');
  svg.appendChild(bg);
  svg.appendChild(fg);
  progressContainer.appendChild(svg);
  container.appendChild(progressContainer);
    
    // Progress percentage text
    if (progress.progress !== undefined && progress.progress > 0) {
  const percentText = document.createElement('div');
  percentText.className = 'pr-percent-text';
  percentText.textContent = `${Math.round(progress.progress)}%`;
  container.appendChild(percentText);
    }
    
  // Stage indicator
    if (progress.stage) {
      const stageText = document.createElement('div');
      stageText.className = 'pr-stage-text';
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
        if (floatUi) floatUi.classList.add('pr-pos-hidden');
        try { console.debug('[promptiply] Chat input not found yet; will retry'); } catch(_) {}
        return;
      }
      if (!floatUi) floatUi = createFloatingRefineUI(() => tryRefine(adapter));
  positionFloatingUI(floatUi, inputEl);
  floatUi.classList.remove('pr-pos-hidden');
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
      const shadow = el.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2147483647; }
          .pr-card { background: rgba(11,18,32,0.95); color: #e5e7eb; border-radius: 12px; padding: 18px; min-width: 320px; max-width: 640px; box-shadow: 0 12px 36px rgba(0,0,0,0.6); }
          .pr-header { font-weight:700; margin-bottom:8px; }
          .pr-body { margin-bottom:12px; }
          .pr-actions { display:flex; gap:8px; justify-content:flex-end; }
          .pr-hidden { display:none !important; }
          .pr-status-text { margin-bottom:12px; font-size:14px; color:var(--pr-text, #e5e7eb); }
          .pr-progress-container { width:100%; height:8px; background: rgba(255,255,255,0.03); border-radius:4px; overflow:hidden; border:1px solid rgba(255,255,255,0.03); }
          .pr-progress-bar { height:100%; border-radius:4px; background: linear-gradient(90deg, #7c3aed, #06b6d4); transition: width 0.3s ease; }
          .pr-percent-text { margin-top:8px; font-size:12px; color:rgba(255,255,255,0.7); text-align:center; }
          .pr-stage-text { margin-top:4px; font-size:11px; color:rgba(255,255,255,0.6); text-align:center; text-transform:capitalize; }
          .pr-error-msg { color:#ef4444; margin-bottom:8px; font-size:13px; }
          .pr-draft { width:100%; min-height:120px; font-family: monospace; }
          .pr-spinner { width:24px; height:24px; display:inline-block; }
        </style>
        <div class="pr-card">
          <div class="pr-header">promptiply</div>
          <div class="pr-body"></div>
          <div class="pr-actions"></div>
        </div>
      `;
      document.body.appendChild(el);
    }
    const shadow = el.shadowRoot || el;
      // Prefer elements inside the overlay's shadow root when present
      const sr = el.shadowRoot || null;
      const body = sr ? sr.querySelector('.pr-body') : el.querySelector('.pr-body');
      const actions = sr ? sr.querySelector('.pr-actions') : el.querySelector('.pr-actions');
  if (actions) actions.innerHTML = '';

    if (opts.status === 'working') {
      // Check if we have progress info (for local mode)
      if (currentProgress) {
        renderProgress(body, currentProgress);
      } else {
  body.textContent = 'Refining draft...';
  // SVG spinner using SMIL animation to avoid CSS keyframes
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'pr-spinner');
  svg.setAttribute('viewBox', '0 0 50 50');
  const circle = document.createElementNS(svgNS, 'circle');
  circle.setAttribute('cx', '25');
  circle.setAttribute('cy', '25');
  circle.setAttribute('r', '20');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', '#7c3aed');
  circle.setAttribute('stroke-width', '4');
  circle.setAttribute('stroke-linecap', 'round');
  const anim = document.createElementNS(svgNS, 'animateTransform');
  anim.setAttribute('attributeType', 'xml');
  anim.setAttribute('attributeName', 'transform');
  anim.setAttribute('type', 'rotate');
  anim.setAttribute('from', '0 25 25');
  anim.setAttribute('to', '360 25 25');
  anim.setAttribute('dur', '1s');
  anim.setAttribute('repeatCount', 'indefinite');
  circle.appendChild(anim);
  svg.appendChild(circle);
  if (body) body.appendChild(svg);
      }
      const cancel = document.createElement('button');
      cancel.textContent = 'Close';
      cancel.addEventListener('click', hideOverlay);
      actions.appendChild(cancel);
    } else if (opts.status === 'draft') {
      body.innerHTML = '';
      if (opts.error) {
        const errMsg = document.createElement('div');
          errMsg.className = 'pr-error-msg';
          errMsg.textContent = opts.error;
          if (body) body.appendChild(errMsg);
      }
  const ta = document.createElement('textarea');
  ta.className = 'pr-draft';
  ta.value = opts.refined || '';
  if (body) body.appendChild(ta);
      const applyBtn = document.createElement('button');
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        const v = ta.value;
        opts.onApply && opts.onApply(v);
        hideOverlay();
      });
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', hideOverlay);
      if (actions) {
        actions.appendChild(applyBtn);
        actions.appendChild(cancel);
      }
  }
    // show overlay (host element is an element with shadow styles)
    el.classList.remove('pr-hidden');
  }

    // Hide overlay helper
    function hideOverlay() {
      try {
        const el = document.querySelector('.pr-overlay');
        if (!el) return;
        // hide and clear progress
        el.classList.add('pr-hidden');
        currentProgress = null;
        // remove element after a short delay to avoid interrupting events
        setTimeout(() => { try { el.remove(); } catch(_) {} }, 120);
      } catch (e) { try { console.warn('[promptiply] hideOverlay failed', e); } catch(_) {} }
    }

})();

// Floating UI (Shadow DOM) to avoid interfering with site React trees
function createFloatingRefineUI(onClick) {
  const host = document.createElement('div');
  host.className = 'pr-float-host pr-pos-hidden';
  // no inline styles on host; positioning handled via shadow styles based on host class
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; display: none; pointer-events: none; }
    :host(.pr-pos-hidden) { display: none !important; }
    :host(.pr-pos-br) { position: fixed; right: 16px; bottom: 16px; display: block; }
    :host(.pr-pos-tr) { position: fixed; right: 16px; top: 16px; display: block; }
    :host(.pr-pos-bl) { position: fixed; left: 16px; bottom: 16px; display: block; }
    :host(.pr-pos-tl) { position: fixed; left: 16px; top: 16px; display: block; }
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
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rightHalf = centerX > window.innerWidth / 2;
    const bottomHalf = centerY > window.innerHeight / 2;
    host.classList.remove('pr-pos-br', 'pr-pos-tr', 'pr-pos-bl', 'pr-pos-tl', 'pr-pos-hidden');
    if (rightHalf && bottomHalf) host.classList.add('pr-pos-br');
    else if (rightHalf && !bottomHalf) host.classList.add('pr-pos-tr');
    else if (!rightHalf && bottomHalf) host.classList.add('pr-pos-bl');
    else host.classList.add('pr-pos-tl');
    try { console.debug('[promptiply] Positioning refine button rect', rect); } catch(_) {}
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
