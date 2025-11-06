(function(){
  const STORAGE_SETTINGS = 'settings';
  const STORAGE_PROFILES = 'profiles';

  function getDefaultHotkey() {
    const platform = navigator.platform.toLowerCase();
    return platform.includes('mac') ? 'Ctrl+T' : 'Alt+T';
  }

  // Convert native select to custom dropdown
  function createCustomDropdown(selectElement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';
    
    const button = document.createElement('div');
    button.className = 'custom-dropdown-button';
    const buttonText = document.createElement('span');
    buttonText.textContent = selectElement.options[selectElement.selectedIndex]?.textContent || '';
    button.appendChild(buttonText);
    
    const options = document.createElement('div');
    options.className = 'custom-dropdown-options';
    
    const updateOptions = () => {
      options.innerHTML = '';
      Array.from(selectElement.options).forEach((option, index) => {
        const optionEl = document.createElement('div');
        optionEl.className = 'custom-dropdown-option';
        if (option.selected) optionEl.classList.add('selected');
        optionEl.textContent = option.textContent;
        optionEl.dataset.value = option.value;
        optionEl.addEventListener('click', () => {
          selectElement.value = option.value;
          buttonText.textContent = option.textContent;
          options.classList.remove('open');
          button.classList.remove('open');
          options.querySelectorAll('.custom-dropdown-option').forEach(opt => opt.classList.remove('selected'));
          optionEl.classList.add('selected');
          selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        });
        options.appendChild(optionEl);
      });
    };
    
    updateOptions();
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = options.classList.toggle('open');
      button.classList.toggle('open', isOpen);
    });
    
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        options.classList.remove('open');
        button.classList.remove('open');
      }
    });
    
    wrapper.appendChild(button);
    wrapper.appendChild(options);
    selectElement.parentNode.replaceChild(wrapper, selectElement);
    wrapper.appendChild(selectElement);
    selectElement.style.display = 'none';
    
    const updateButton = () => {
      const selectedOption = selectElement.options[selectElement.selectedIndex];
      if (selectedOption) {
        buttonText.textContent = selectedOption.textContent;
        options.querySelectorAll('.custom-dropdown-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.value === selectElement.value);
        });
      }
    };
    
    selectElement.addEventListener('change', updateButton);
    
    return { wrapper, updateButton, updateOptions };
  }

  const $mode = document.getElementById('mode');
  const $profile = document.getElementById('profile');
  const $openOptions = document.getElementById('open-options');
  const $hotkeyLabel = document.getElementById('hotkey-label');
  const $refineNow = document.getElementById('refine-now');

  let modeDropdown, profileDropdown;

  chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
    const s = data[STORAGE_SETTINGS] || { mode: 'api' };
    $mode.value = s.mode || 'api';
    if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || getDefaultHotkey();
  });

  chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
    const p = data[STORAGE_PROFILES] || { list: [], activeProfileId: null };
    renderProfiles(p);
  });

  // Initialize custom dropdowns after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDropdowns);
  } else {
    initDropdowns();
  }

  function initDropdowns() {
    if ($mode && !modeDropdown) {
      modeDropdown = createCustomDropdown($mode);
    }
    if ($profile && !profileDropdown) {
      profileDropdown = createCustomDropdown($profile);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[STORAGE_PROFILES]) {
      renderProfiles(changes[STORAGE_PROFILES].newValue || { list: [], activeProfileId: null });
      if (profileDropdown) profileDropdown.updateButton();
    }
    if (area === 'local' && changes[STORAGE_SETTINGS]) {
      const s = changes[STORAGE_SETTINGS].newValue || { mode: 'api' };
      $mode.value = s.mode || 'api';
      if ($hotkeyLabel) $hotkeyLabel.textContent = s.refineHotkey || getDefaultHotkey();
      if (modeDropdown) modeDropdown.updateButton();
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
    
    // Recreate dropdown if it exists
    if (profileDropdown) {
      profileDropdown.updateOptions();
      profileDropdown.updateButton();
    }
  }
})();
