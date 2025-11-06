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
    let observedContainer = null;
    let containerRo = null;
    let updateScheduled = false;
    
    // Determine which positioning function to use based on site
    const positionFunc = SITE === 'chatgpt' ? positionFloatingUI_ChatGPT : positionFloatingUI_Claude;
    const containerSelector = SITE === 'chatgpt' ? '.ms-auto.flex.items-center.gap-1\\.5' : '.flex.gap-2\\.5.w-full.items-center';
    
    const scheduleUpdate = () => {
      if (!updateScheduled) {
        updateScheduled = true;
        requestAnimationFrame(() => {
          updateScheduled = false;
          update();
        });
      }
    };
    
    const update = () => {
      // For Claude, check if button still exists in container
      if (SITE === 'claude') {
        const container = document.querySelector('.flex.gap-2\\.5.w-full.items-center');
        const existingBtn = container?.querySelector('.pr-refine-btn');
        
        // If container exists but button doesn't, we need to recreate
        if (container && !existingBtn) {
          // Recreate floatUi if button was lost
          if (!floatUi) {
            floatUi = createFloatingRefineUI(() => tryRefine(adapter));
          }
        }
      } else {
        // For ChatGPT, just create if doesn't exist
        if (!floatUi) {
          floatUi = createFloatingRefineUI(() => tryRefine(adapter));
        }
      }
      
      positionFunc(floatUi);
      
      // Add listeners to the input element if not already added
      const inputEl = adapter.findInput();
      if (inputEl && inputEl !== observedInput) {
        observedInput = inputEl;
        
        // Listen for input events (typing, pasting, deleting, etc.)
        inputEl.addEventListener('input', scheduleUpdate);
        inputEl.addEventListener('change', scheduleUpdate);
        
        inputEl.addEventListener('paste', () => {
          // Multiple rapid updates for paste
          scheduleUpdate();
          requestAnimationFrame(() => scheduleUpdate());
          setTimeout(() => scheduleUpdate(), 10);
          setTimeout(() => scheduleUpdate(), 50);
          setTimeout(() => scheduleUpdate(), 100);
        });
        
        // Listen for key events with immediate updates
        inputEl.addEventListener('keyup', () => {
          scheduleUpdate();
          requestAnimationFrame(() => scheduleUpdate());
          setTimeout(() => scheduleUpdate(), 10);
        });
        inputEl.addEventListener('keydown', scheduleUpdate);
        
        // Listen for focus/blur to update position
        inputEl.addEventListener('focus', scheduleUpdate);
        inputEl.addEventListener('blur', scheduleUpdate);
      }
      
      // Also observe the container for resize changes
      const container = document.querySelector(containerSelector);
      if (container && container !== observedContainer) {
        observedContainer = container;
        if (containerRo) try { containerRo.disconnect(); } catch(_) {}
        try {
          containerRo = new ResizeObserver(() => scheduleUpdate());
          containerRo.observe(container);
          // Also observe the parent form
          const form = container.closest('form');
          if (form) containerRo.observe(form);
        } catch(_) {}
      }
    };

    // Initial attempt
    update();
    
    // Observe DOM changes to update position
    const mo = new MutationObserver(() => scheduleUpdate());
    mo.observe(document.documentElement, { subtree: true, childList: true });
    
    // Update on scroll and resize
    window.addEventListener('scroll', scheduleUpdate, true);
    window.addEventListener('resize', scheduleUpdate);
    
    // Also poll briefly during first seconds to catch late mounts
    let tries = 0;
    const iv = setInterval(() => { 
      tries++; 
      update(); 
      if (tries > 60) clearInterval(iv); 
    }, 250);
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

  // Escape key handler for overlay
  let overlayEscapeHandler = null;

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
    
    // Add Escape key listener
    if (overlayEscapeHandler) {
      document.removeEventListener('keydown', overlayEscapeHandler);
    }
    overlayEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        hideOverlay();
      }
    };
    document.addEventListener('keydown', overlayEscapeHandler);
  }

  function hideOverlay() {
    const el = document.querySelector('.pr-overlay');
    if (el) el.style.display = 'none';
    
    // Remove Escape key listener
    if (overlayEscapeHandler) {
      document.removeEventListener('keydown', overlayEscapeHandler);
      overlayEscapeHandler = null;
    }
  }
})();
// Animations
const prStyle = document.createElement('style');
prStyle.textContent = `
  @keyframes pr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  
  @keyframes pr-gentle-pulse {
    0%, 100% { 
      filter: brightness(1);
      box-shadow: 0 6px 18px rgba(0,0,0,0.3);
    }
    50% { 
      filter: brightness(1.03);
      box-shadow: 0 6px 20px rgba(124,58,237,0.2);
    }
  }
  
  @keyframes pr-gentle-pulse-positioned {
    0%, 100% { 
      filter: brightness(1);
      box-shadow: 0 6px 18px rgba(0,0,0,0.3);
      transform: translateY(-50%);
    }
    50% { 
      filter: brightness(1.03);
      box-shadow: 0 6px 20px rgba(124,58,237,0.2);
      transform: translateY(-50%);
    }
  }
  
  @keyframes pr-menu-fade-in {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-5px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  
  @keyframes pr-menu-fade-out {
    from {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
    to {
      opacity: 0;
      transform: scale(0.95) translateY(-5px);
    }
  }
  
  .pr-portal {
    position: fixed;
    inset: 10px; /* Creates safe zone - portal is 10px smaller than viewport */
    pointer-events: none;
    z-index: 10000;
  }
  
  .pr-portal > * {
    pointer-events: auto;
  }
  
  .pr-profile-menu {
    animation: pr-menu-fade-in 0.2s ease forwards;
    position: absolute; /* Relative to portal */
    background: #0b1220;
    border: 1px solid #1e293b;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    padding: 6px;
    min-width: 180px;
    max-width: 100%; /* Can't exceed portal width */
    max-height: 100%; /* Can't exceed portal height */
    overflow-y: auto;
    cursor: default;
  }
  
  /* Sticky title */
  .pr-profile-menu > div:first-child {
    position: sticky;
    top: 0;
    background: #0b1220;
    z-index: 1;
    cursor: default;
    user-select: none;
  }
  
  .pr-profile-menu.closing {
    animation: pr-menu-fade-out 0.2s ease forwards;
  }
  
  .pr-refine-btn {
    position: relative;
    overflow: visible;
    animation: pr-gentle-pulse 3s ease-in-out infinite;
    transform-origin: center center;
    transition: transform 0.15s ease, filter 0.2s ease, box-shadow 0.2s ease;
  }
  
  /* For ChatGPT, use positioned version of pulse animation */
  .ms-auto.flex.items-center.gap-1\\.5 > .pr-refine-btn {
    animation: pr-gentle-pulse-positioned 3s ease-in-out infinite;
  }
  
  /* CSS-only hover effects */
  .pr-refine-btn:hover {
    animation: none;
    filter: brightness(1.1);
    box-shadow: 0 4px 12px rgba(124,58,237,0.5);
  }
  
  /* For ChatGPT, maintain positioning on hover */
  .ms-auto.flex.items-center.gap-1\\.5 > .pr-refine-btn:hover {
    transform: translateY(-50%) !important;
    animation: none;
    filter: brightness(1.1);
    box-shadow: 0 4px 12px rgba(124,58,237,0.5);
  }
  
  /* CSS-only click animation using :active */
  .pr-refine-btn:active {
    transform: scale(0.92);
    transition: transform 0.1s ease;
  }
  
  /* For ChatGPT, combine positioning with active state */
  .ms-auto.flex.items-center.gap-1\\.5 > .pr-refine-btn:active {
    transform: translateY(-50%) scale(0.92) !important;
  }
  
  .pr-refine-btn::before {
    content: "";
    position: absolute;
    top: -4px;
    left: -4px;
    right: -4px;
    bottom: -4px;
    border-radius: 12px;
    border: 2px solid rgba(124, 58, 237, 0.4);
    opacity: 0;
    transition: opacity 0.3s ease, transform 0.3s ease;
    transform: scale(0.95);
    pointer-events: none;
    z-index: -1;
  }
  
  .pr-refine-btn:hover::before {
    opacity: 1;
    transform: scale(1);
  }
  
  .pr-refine-btn::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(124, 58, 237, 0.5) 0%, rgba(124, 58, 237, 0.15) 40%, transparent 60%);
    transform: translate(-50%, -50%) scale(0);
    transition: width 0.4s ease, height 0.4s ease, transform 0.4s ease, opacity 0.4s ease;
    opacity: 0;
    pointer-events: none;
    z-index: -2;
  }
  
  .pr-refine-btn:hover::after {
    width: 80px;
    height: 80px;
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.9;
  }
  
  /* CSS-only positioning for ChatGPT button */
  .ms-auto.flex.items-center.gap-1\\.5 {
    position: relative !important;
  }
  
  .ms-auto.flex.items-center.gap-1\\.5 > .pr-refine-btn {
    position: absolute !important;
    right: calc(100% + 6px) !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    white-space: nowrap;
    z-index: 1000 !important;
    pointer-events: auto !important;
  }
  
  /* CSS-only positioning for Claude button */
  .flex.gap-2\\.5.w-full.items-center > .pr-refine-btn {
    order: -1;
  }
`;
document.documentElement.appendChild(prStyle);


// Create floating button that positions next to microphone
function createFloatingRefineUI(onClick) {
  const btn = document.createElement('button');
  btn.className = 'pr-refine-btn';
  btn.textContent = 'Refine';
  btn.style.background = 'linear-gradient(135deg, #7c3aed, #06b6d4)';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.borderRadius = '10px';
  btn.style.padding = '6px 10px';
  btn.style.fontSize = '12px';
  btn.style.cursor = 'pointer';
  btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.3)';
  btn.style.transition = 'transform .2s ease, filter .2s ease, box-shadow .2s ease';
  btn.style.pointerEvents = 'auto';
  btn.style.overflow = 'visible';
  btn.style.transformOrigin = 'center center';
  // Hover and active states are handled by CSS :hover and :active pseudo-classes
  
  // Stop click event from propagating to prevent triggering parent handlers
  // Use capture phase to catch it early, but allow mousedown/mouseup to complete normally
  // CSS :active handles the visual animation automatically
  btn.addEventListener('click', (e) => { 
    e.stopPropagation();
    e.preventDefault();
    e.stopImmediatePropagation();
    onClick && onClick(); 
  }, true); // Capture phase to catch event early and prevent bubbling
  
  // Also handle touch events for mobile
  btn.addEventListener('touchend', (e) => {
    e.stopPropagation();
    e.preventDefault();
    e.stopImmediatePropagation();
    onClick && onClick();
  }, true);
  
  // Also stop propagation in bubble phase as backup
  btn.addEventListener('click', (e) => { 
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, false);
  
  // Right-click context menu for profile selection
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showProfileContextMenu(btn, e.clientX, e.clientY);
  }, true);
  
  return btn;
}

// Context menu for profile selection
let profileContextMenu = null;
let portalContainer = null;

// Create portal container once on page load
function getPortalContainer() {
  if (!portalContainer) {
    portalContainer = document.createElement('div');
    portalContainer.className = 'pr-portal';
    // Ensure portal styles are applied
    portalContainer.style.cssText = 'position: fixed; inset: 10px; pointer-events: none; z-index: 10000;';
    document.body.appendChild(portalContainer);
  }
  return portalContainer;
}

// Helper function to create profile options (DRY principle)
function createProfileOption(text, profileId, isActive, onClick) {
  const option = document.createElement('div');
  option.className = 'pr-profile-option';
  option.style.cssText = `
    padding: 8px 10px;
    font-size: 12px;
    color: #e5e7eb;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    ${isActive ? 'background: rgba(124,58,237,0.2); font-weight: 500;' : ''}
  `;
  
  const profileText = document.createElement('span');
  profileText.textContent = text;
  option.appendChild(profileText);
  
  if (isActive) {
    const checkmark = document.createElement('span');
    checkmark.textContent = '✓';
    checkmark.style.cssText = 'color: #7c3aed; font-weight: bold; font-size: 14px;';
    option.appendChild(checkmark);
  }
  
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    e.stopImmediatePropagation();
    onClick();
  });
  
  option.addEventListener('mouseenter', () => {
    if (!isActive) option.style.background = '#0f172a';
  });
  
  option.addEventListener('mouseleave', () => {
    if (!isActive) option.style.background = 'transparent';
  });
  
  return option;
}

function showProfileContextMenu(button, x, y) {
  if (profileContextMenu) {
    profileContextMenu.remove();
    profileContextMenu = null;
  }
  
  const portal = getPortalContainer();
  
  profileContextMenu = document.createElement('div');
  profileContextMenu.className = 'pr-profile-menu';
  
  // Build title
  const title = document.createElement('div');
  title.textContent = 'Select Profile';
  title.style.cssText = 'padding: 8px 10px; font-size: 11px; font-weight: 600; color: #94a3b8; border-bottom: 1px solid #1e293b; margin-bottom: 4px; cursor: default; user-select: none;';
  profileContextMenu.appendChild(title);
  
  // Prevent right-click on the menu
  profileContextMenu.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);
  
  // Append to portal
  portal.appendChild(profileContextMenu);
  
  chrome.storage.sync.get(['profiles'], (data) => {
    const profiles = data.profiles || { list: [], activeProfileId: null };
    const activeProfileId = profiles.activeProfileId;
    
    profileContextMenu.appendChild(createProfileOption(
      '(no profile)', null, activeProfileId === null,
      () => { updateActiveProfile(null); hideProfileContextMenu(); }
    ));
    
    profiles.list.forEach((profile) => {
      profileContextMenu.appendChild(createProfileOption(
        profile.name || profile.id, profile.id, profile.id === activeProfileId,
        () => { updateActiveProfile(profile.id); hideProfileContextMenu(); }
      ));
    });
    
    // Position within portal (coordinates are now relative to portal, not viewport)
    requestAnimationFrame(() => {
      if (!profileContextMenu) return;
      const portalRect = portal.getBoundingClientRect();
      const menuRect = profileContextMenu.getBoundingClientRect();
      
      // Convert viewport click coordinates to portal-relative coordinates
      let left = x - portalRect.left;
      let top = y - portalRect.top;
      
      // Clamp to ensure menu stays fully within portal bounds with 10px margin
      // left must be >= 10 (menu's left edge at least 10px from portal's left edge)
      // left + menuWidth must be <= portalWidth - 10 (menu's right edge at least 10px from portal's right edge)
      const margin = 10;
      const maxLeft = portalRect.width - menuRect.width - margin;
      const maxTop = portalRect.height - menuRect.height - margin;
      
      // Clamp values with 10px margin from all edges
      // If menu is too large, still maintain margin on left/top and let it overflow on right/bottom
      left = Math.max(margin, Math.min(left, Math.max(margin, maxLeft)));
      top = Math.max(margin, Math.min(top, Math.max(margin, maxTop)));
      
      // Apply position
      profileContextMenu.style.left = `${left}px`;
      profileContextMenu.style.top = `${top}px`;
    });
  });
  
  // Close handlers
  const closeMenu = (e) => {
    if (profileContextMenu && !profileContextMenu.contains(e.target) && e.target !== button) {
      hideProfileContextMenu();
      cleanup();
    }
  };
  
  const closeMenuOnEscape = (e) => {
    if (e.key === 'Escape' && profileContextMenu) {
      hideProfileContextMenu();
      cleanup();
    }
  };
  
  const cleanup = () => {
    document.removeEventListener('click', closeMenu, true);
    document.removeEventListener('contextmenu', closeMenu, true);
    document.removeEventListener('keydown', closeMenuOnEscape);
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeMenu, true);
    document.addEventListener('contextmenu', closeMenu, true);
    document.addEventListener('keydown', closeMenuOnEscape);
  }, 0);
}

function hideProfileContextMenu() {
  if (profileContextMenu) {
    // Add closing class to trigger CSS animation
    profileContextMenu.classList.add('closing');
    setTimeout(() => {
      if (profileContextMenu) {
        profileContextMenu.remove();
        profileContextMenu = null;
      }
    }, 200);
  }
}

function updateActiveProfile(profileId) {
  chrome.storage.sync.get(['profiles'], (data) => {
    const profiles = data.profiles || { list: [], activeProfileId: null };
    profiles.activeProfileId = profileId;
    chrome.storage.sync.set({ profiles }, () => {
      try {
        console.log('[promptiply] Active profile updated:', profileId);
      } catch(_) {}
    });
  });
}

function positionFloatingUI_ChatGPT(btn) {
  if (!btn) return;
  try {
    // Find the div with class "ms-auto flex items-center gap-1.5"
    const container = document.querySelector('.ms-auto.flex.items-center.gap-1\\.5');
    
    if (!container) {
      btn.style.display = 'none';
      return;
    }
    
    // Check if button is already in the container
    if (container.contains(btn)) {
      btn.style.display = '';
      return;
    }
    
    // Insert button into container - CSS will handle positioning
    container.insertBefore(btn, container.firstChild);
    btn.style.display = '';
    
    try {
      console.log('[promptiply] ChatGPT: Inserted button into container (CSS positioning)');
    } catch(_) {}
  } catch (err) {
    try { console.error('[promptiply] ChatGPT position error:', err); } catch(_) {}
  }
}

function positionFloatingUI_Claude(btn) {
  if (!btn) return;
  try {
    // Find the div with class "flex gap-2.5 w-full items-center"
    const container = document.querySelector('.flex.gap-2\\.5.w-full.items-center');
    
    if (!container) {
      btn.style.display = 'none';
      return;
    }
    
    // Check if button is already in container
    if (container.contains(btn)) {
      btn.style.display = '';
      return;
    }
    
    // Insert button into container - CSS will handle positioning
    container.insertBefore(btn, container.firstChild);
    btn.style.display = '';
    
    try {
      console.log('[promptiply] Claude: Inserted button into container', {
        containerClass: container.className,
        childCount: container.children.length
      });
    } catch(_) {}
  } catch (err) {
    try { console.error('[promptiply] Claude insert error:', err); } catch(_) {}
  }
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
