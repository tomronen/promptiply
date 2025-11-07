// Clean, properly structured options script for Promptiply
(function () {
  "use strict";

  const ERROR_KEY = "promptiply_onboarding_error";
  const STORAGE_ONBOARDING = "onboarding_completed";
  const STORAGE_SETTINGS = "settings";
  const STORAGE_PROFILES = "profiles";
  const STORAGE_PREDEFINED = "predefined_profiles";
  const SCHEMA_VERSION = 1;

  const EVOLUTION_TOPIC_LIMIT = 10;

  const DEFAULT_PROFILE_STATE = Object.freeze({
    list: [],
    activeProfileId: null,
  });

  function createEmptyEvolution() {
    return {
      topics: [],
      lastUpdated: null,
      usageCount: 0,
      lastPrompt: "",
    };
  }

  function normalizeEvolution(evolution) {
    if (!evolution || typeof evolution !== "object") {
      return createEmptyEvolution();
    }

    const rawTopics = Array.isArray(evolution.topics) ? evolution.topics : [];
    const now = new Date().toISOString();
    
    // Migrate from old string format to new object format
    const topics = rawTopics.map((topic) => {
      // If it's already an object, normalize it
      if (topic && typeof topic === "object") {
        return {
          name: String(topic.name || topic).trim(),
          count: typeof topic.count === "number" && Number.isFinite(topic.count) && topic.count > 0 ? topic.count : 1,
          lastUsed: typeof topic.lastUsed === "string" ? topic.lastUsed : (topic.lastUsed || now),
        };
      }
      // If it's a string (old format), convert to object
      const name = String(topic || "").trim();
      if (!name) return null;
      return {
        name,
        count: 1,
        lastUsed: now,
      };
    }).filter(Boolean).slice(0, EVOLUTION_TOPIC_LIMIT);

    return {
      topics,
      lastUpdated: typeof evolution.lastUpdated === "string" ? evolution.lastUpdated : null,
      usageCount:
        typeof evolution.usageCount === "number" && Number.isFinite(evolution.usageCount)
          ? evolution.usageCount
          : 0,
      lastPrompt: typeof evolution.lastPrompt === "string" ? evolution.lastPrompt : "",
    };
  }

  function normalizeProfileObject(profile) {
    if (!profile || typeof profile !== "object") return null;
    return {
      ...profile,
      evolving_profile: normalizeEvolution(profile.evolving_profile),
    };
  }

  function normalizeProfilesState(raw) {
    const base = raw && typeof raw === "object" ? { ...DEFAULT_PROFILE_STATE, ...raw } : { ...DEFAULT_PROFILE_STATE };
    base.list = Array.isArray(base.list)
      ? base.list
          .map(normalizeProfileObject)
          .filter(Boolean)
      : [];
    return base;
  }

  function parseTopicsInput(value) {
    return (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, EVOLUTION_TOPIC_LIMIT);
  }

  function buildEvolutionFromWizard(previous) {
    const prev = previous ? normalizeEvolution(previous) : createEmptyEvolution();
    const topicNames = wizardState.evolvingTopics.slice(0, EVOLUTION_TOPIC_LIMIT);
    
    // Convert user input (strings) to topic objects
    // Match existing topics by name to preserve count and lastUsed
    const normalizeTopicName = (name) => String(name || "").trim().toLowerCase();
    const existingTopicsMap = new Map();
    prev.topics.forEach((topic) => {
      const key = normalizeTopicName(typeof topic === "string" ? topic : topic.name);
      if (topic && typeof topic === "object") {
        existingTopicsMap.set(key, topic);
      } else {
        existingTopicsMap.set(key, { name: String(topic).trim(), count: 1, lastUsed: new Date().toISOString() });
      }
    });

    const now = new Date().toISOString();
    const topicObjects = topicNames.map((topicName) => {
      const key = normalizeTopicName(topicName);
      if (existingTopicsMap.has(key)) {
        // Preserve existing topic's count and lastUsed
        return existingTopicsMap.get(key);
      }
      // New topic: create object with count 1
      return {
        name: String(topicName).trim(),
        count: 1,
        lastUsed: now,
      };
    });

    // Check if topics changed
    const prevTopicNames = prev.topics.map((t) => 
      normalizeTopicName(typeof t === "string" ? t : t.name)
    );
    const newTopicNames = topicObjects.map((t) => normalizeTopicName(t.name));
    const changedTopics =
      topicObjects.length !== prev.topics.length ||
      newTopicNames.some((name, idx) => name !== prevTopicNames[idx]);

    const next = {
      ...prev,
      topics: topicObjects,
    };
    if (changedTopics) {
      next.lastUpdated = now;
    }
    return next;
  }

  // State
  let isRecordingHotkey = false;
  let recordedHotkey = null;
  let deletedProfilesUndo = null; // For undo functionality
  let undoTimeout = null;
  let wizardState = {
    step: 1,
    editingId: null,
    name: "",
    persona: "",
    tone: "",
    guidelines: [],
    evolvingTopics: [],
    evolvingLastPrompt: "",
  };
  let onboardingState = {
    step: 1,
    selectedMode: "webui",
    selectedProvider: "openai",
    apiKey: "",
    model: "",
    profileName: "",
    profilePersona: "",
    profileTone: "",
  };

  // Predefined profiles (loaded from storage or defaults)
  let PREDEFINED_PROFILES = [
    {
      id: "builtin_writer",
      name: "Technical Writer",
      persona: "Senior Technical Writer",
      tone: "clear, concise",
      styleGuidelines: ["Use simple language", "Prefer examples", "No fluff"],
    },
    {
      id: "builtin_dev",
      name: "Dev Helper",
      persona: "Senior Software Engineer",
      tone: "concise, pragmatic",
      styleGuidelines: ["Show code samples", "Explain with steps", "Use bullet lists"],
    },
    {
      id: "builtin_marketing",
      name: "Marketing Copy",
      persona: "Conversion-focused Marketer",
      tone: "excited, persuasive",
      styleGuidelines: ["Short headlines", "Call to action", "A/B test variants"],
    },
  ];

  // Utilities
  function getDefaultHotkey() {
    const platform = navigator.platform.toLowerCase();
    return platform.includes("mac") ? "Ctrl+T" : "Alt+T";
  }

  // Tabs behavior
  let currentTab = 'general';
  const tabOrder = ['general', 'providers', 'profiles'];
  
  function selectTab(name){
    if (name === currentTab) return;
    
    const currentIndex = tabOrder.indexOf(currentTab);
    const newIndex = tabOrder.indexOf(name);
    const direction = newIndex > currentIndex ? 'right' : 'left';
    
    // Get current and new panels
    const currentPanel = document.getElementById(`tab-${currentTab}`);
    const newPanel = document.getElementById(`tab-${name}`);
    
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
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    currentTab = name;
  }

  function capitalize(s) {
    return (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeHotkey(v) {
    const t = (v || "").trim();
    if (!t) return getDefaultHotkey();
    const parts = t.split("+").map((x) => x.trim()).filter(Boolean);
    const keyPart = parts.pop();
    const mods = new Set(parts.map((p) => p.toLowerCase()));
    const order = [];
    if (mods.has("ctrl") || mods.has("control")) order.push("Ctrl");
    if (mods.has("alt") || mods.has("option")) order.push("Alt");
    if (mods.has("shift")) order.push("Shift");
    if (mods.has("meta") || mods.has("cmd") || mods.has("command")) order.push("Meta");
    const key = (keyPart || "R").length === 1 ? keyPart.toUpperCase() : capitalize(keyPart);
    return [...order, key].join("+");
  }

  function formatKeyEvent(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : capitalize(e.key));
    return parts.join("+");
  }

  // Predefined profiles validation and persistence
  function validatePredefinedArray(arr) {
    if (!Array.isArray(arr)) return false;
    return arr.every(p => 
      p && 
      typeof p === 'object' &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      p.id.length > 0 &&
      p.name.length > 0
    );
  }

  function loadPredefinedProfiles(callback) {
    chrome.storage.local.get([STORAGE_PREDEFINED], (data) => {
      if (data[STORAGE_PREDEFINED] && validatePredefinedArray(data[STORAGE_PREDEFINED])) {
        PREDEFINED_PROFILES = data[STORAGE_PREDEFINED];
        console.log('[promptiply] Loaded predefined profiles from storage');
      } else {
        // Use built-in defaults
        console.log('[promptiply] Using built-in predefined profiles');
        savePredefinedProfiles();
      }
      if (callback) callback();
    });
  }

  function savePredefinedProfiles() {
    chrome.storage.local.set({ [STORAGE_PREDEFINED]: PREDEFINED_PROFILES }, () => {
      console.log('[promptiply] Saved predefined profiles to storage');
    });
  }

  // Import/Export envelope with versioning
  function createExportEnvelope(profiles) {
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      profiles: profiles
    };
  }

  function parseImportEnvelope(data) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Handle versioned envelope
      if (parsed.schemaVersion !== undefined) {
        if (parsed.schemaVersion !== SCHEMA_VERSION) {
          throw new Error(`Unsupported schema version: ${parsed.schemaVersion}. Expected ${SCHEMA_VERSION}.`);
        }
        if (!Array.isArray(parsed.profiles)) {
          throw new Error('Invalid envelope: profiles must be an array');
        }
        return parsed.profiles;
      }
      
      // Legacy format: array directly
      if (Array.isArray(parsed)) {
        return parsed;
      }
      
      throw new Error('Invalid import format');
    } catch (e) {
      throw new Error(`Failed to parse import data: ${e.message}`);
    }
  }

  // Toast helper
  function ensureToastContainer() {
    let c = document.getElementById("pr-toast-container");
    if (!c) {
      c = document.createElement("div");
      c.id = "pr-toast-container";
      c.className = "toast-container";
      document.body.appendChild(c);
    }
    return c;
  }

  function showToast(msg, timeout = 1800) {
    try {
      const c = ensureToastContainer();
      const el = document.createElement("div");
      el.textContent = msg;
      el.className = "toast-message";
      c.appendChild(el);
      setTimeout(() => {
        try {
          el.remove();
        } catch (_) {}
      }, timeout);
    } catch (_) {}
  }

  // Initialize tab listeners
  document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  });

  // Settings functions
  function updateProviderDisabled() {
    const mode = document.getElementById("mode");
    const provider = document.getElementById("provider");
    if (!mode || !provider) return;
    const isWebUI = mode.value === "webui";
    const isLocal = mode.value === "local";
    const providerField = provider.closest(".field");
    if (providerField) providerField.classList.toggle("disabled", isWebUI || isLocal);
  }

  function setModelSelect(selectEl, customEl, value) {
    if (!selectEl || !customEl) return;
    const opts = Array.from(selectEl.options).map((o) => o.value);
    if (value && opts.includes(value)) {
      selectEl.value = value;
      customEl.classList.add("custom-input-hidden");
      customEl.value = "";
    } else if (value) {
      selectEl.value = "custom";
      customEl.classList.remove("custom-input-hidden");
      customEl.value = value;
    }
  }

  function getModelValue(selectEl, customEl) {
    if (!selectEl || !customEl) return undefined;
    return selectEl.value === "custom" ? customEl.value.trim() || undefined : selectEl.value;
  }

  function saveSettings() {
    console.log("[promptiply] saveSettings called");
    try {
      const mode = document.getElementById("mode");
      const provider = document.getElementById("provider");
      const openaiKey = document.getElementById("openai-key");
      const openaiModelSelect = document.getElementById("openai-model-select");
      const openaiModelCustom = document.getElementById("openai-model-custom");
      const anthropicKey = document.getElementById("anthropic-key");
      const anthropicModelSelect = document.getElementById("anthropic-model-select");
      const anthropicModelCustom = document.getElementById("anthropic-model-custom");

      const s = {
        mode: mode ? mode.value : "webui",
        provider: provider ? provider.value : "openai",
        openaiKey: openaiKey ? openaiKey.value.trim() || undefined : undefined,
        openaiModel: getModelValue(openaiModelSelect, openaiModelCustom),
        anthropicKey: anthropicKey ? anthropicKey.value.trim() || undefined : undefined,
        anthropicModel: getModelValue(anthropicModelSelect, anthropicModelCustom),
        refineHotkey: normalizeHotkey(recordedHotkey || getDefaultHotkey()),
      };

      chrome.storage.local.set({ [STORAGE_SETTINGS]: s }, () => {
        console.log("[promptiply] Settings saved");
        updateHotkeyDisplay();
        showToast("Settings saved");
      });
    } catch (e) {
      console.error("[promptiply] saveSettings error:", e);
    }
  }

  // Hotkey recording
  function updateHotkeyDisplay() {
    const refineHotkeyText = document.getElementById("refine-hotkey-text");
    if (refineHotkeyText) {
      refineHotkeyText.textContent = recordedHotkey || getDefaultHotkey();
    }
  }

  function startRecordingHotkey() {
    if (isRecordingHotkey) return;
    isRecordingHotkey = true;

    const refineHotkeyRecord = document.getElementById("refine-hotkey-record");
    const refineHotkeyRecording = document.getElementById("refine-hotkey-recording");
    const refineHotkeyText = document.getElementById("refine-hotkey-text");
    const refineHotkeyDisplay = document.getElementById("refine-hotkey-display");

    if (refineHotkeyRecord) {
      refineHotkeyRecord.textContent = "Stop";
      refineHotkeyRecord.classList.add("primary");
    }
    if (refineHotkeyRecording) refineHotkeyRecording.classList.add("show");
    if (refineHotkeyText) refineHotkeyText.textContent = "...";
    if (refineHotkeyDisplay) refineHotkeyDisplay.classList.add("recording");

    const keyDownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
      const combo = formatKeyEvent(e);
      recordedHotkey = normalizeHotkey(combo);
      updateHotkeyDisplay();
      stopRecordingHotkey();
    };

    const keyUpHandler = (e) => {
      if (e.key === "Escape") stopRecordingHotkey();
    };

    window.addEventListener("keydown", keyDownHandler, true);
    window.addEventListener("keyup", keyUpHandler, true);
    window._hotkeyRecorder = { keyDownHandler, keyUpHandler };
  }

  function stopRecordingHotkey() {
    if (!isRecordingHotkey) return;
    isRecordingHotkey = false;

    const refineHotkeyRecord = document.getElementById("refine-hotkey-record");
    const refineHotkeyRecording = document.getElementById("refine-hotkey-recording");
    const refineHotkeyDisplay = document.getElementById("refine-hotkey-display");

    if (refineHotkeyRecord) {
      refineHotkeyRecord.textContent = "Change";
      refineHotkeyRecord.classList.remove("primary");
    }
    if (refineHotkeyRecording) refineHotkeyRecording.classList.remove("show");
    if (refineHotkeyDisplay) refineHotkeyDisplay.classList.remove("recording");
    updateHotkeyDisplay();

    if (window._hotkeyRecorder) {
      window.removeEventListener("keydown", window._hotkeyRecorder.keyDownHandler, true);
      window.removeEventListener("keyup", window._hotkeyRecorder.keyUpHandler, true);
      delete window._hotkeyRecorder;
    }
  }

  // Profile wizard
  function openWizard(existing) {
    console.log("[promptiply] openWizard called");
    wizardState = {
      step: 1,
      editingId: existing?.id || null,
      name: existing?.name || "",
      persona: existing?.persona || "",
      tone: existing?.tone || "",
      guidelines: existing?.styleGuidelines || [],
      evolvingTopics: [],
      evolvingLastPrompt: "",
    };

    const existingEvolution = normalizeEvolution(existing?.evolving_profile);
    // Extract topic names from objects for wizard UI
    wizardState.evolvingTopics = (existingEvolution.topics || []).map((topic) => 
      typeof topic === "string" ? topic : (topic.name || "")
    ).filter(Boolean);
    wizardState.evolvingLastPrompt = existingEvolution.lastPrompt || "";

    const profileModal = document.getElementById("profile-modal");
    const onboardingModal = document.getElementById("onboarding-modal");
    try {
      onboardingModal?.classList.remove("modal-show");
    } catch (_) {}
    profileModal?.classList.add("modal-show");
    setWizardStep(1);
  }

  function closeWizard() {
    const profileModal = document.getElementById("profile-modal");
    profileModal?.classList.remove("modal-show");
  }

  function setWizardStep(step) {
    wizardState.step = Math.max(1, Math.min(3, step));

    const wizardSteps = document.querySelectorAll("#profile-modal .step");
    const wizardBack = document.getElementById("wizard-back");
    const wizardNext = document.getElementById("wizard-next");
    const wizardSave = document.getElementById("wizard-save");
    const wizardBody = document.getElementById("wizard-body");

    wizardSteps.forEach((s) => s.classList.toggle("active", Number(s.dataset.step) === wizardState.step));
    wizardBack?.classList.toggle("tab-panel-hidden", wizardState.step === 1);
    wizardNext?.classList.toggle("tab-panel-hidden", wizardState.step === 3);
    wizardSave?.classList.toggle("wizard-save-hidden", wizardState.step !== 3);

    if (!wizardBody) return;
    wizardBody.innerHTML = "";

    if (wizardState.step === 1) {
      wizardBody.innerHTML = `
        <div class="field">
          <label>Name</label>
          <input id="w-name" type="text" placeholder="e.g., Technical Tutor" value="${escapeHtml(wizardState.name)}" />
        </div>
        <div class="field">
          <label>Tone</label>
          <input id="w-tone" type="text" placeholder="e.g., concise, friendly" value="${escapeHtml(wizardState.tone)}" />
        </div>
        <div class="field">
          <label>Persona</label>
          <input id="w-persona" type="text" placeholder="e.g., Senior AI Engineer" value="${escapeHtml(wizardState.persona)}" />
        </div>
      `;
    } else if (wizardState.step === 2) {
      wizardBody.innerHTML = `
        <div class="field">
          <label>Style guidelines / constraints (one per line)</label>
          <textarea id="w-guidelines">${escapeHtml(wizardState.guidelines.join("\n"))}</textarea>
        </div>
        <div class="field">
          <label>Evolving focus topics (comma separated)</label>
          <input id="w-evolving-topics" type="text" placeholder="e.g., C/C++, Police Investigations" value="${escapeHtml(wizardState.evolvingTopics.join(", "))}" />
          <div class="hint">Maximum of ${EVOLUTION_TOPIC_LIMIT} topics allowed.</div>
        </div>
        ${wizardState.evolvingLastPrompt ? `
          <div class="field">
            <label>Last prompt signal (read-only)</label>
            <textarea class="textarea-compact" disabled>${escapeHtml(wizardState.evolvingLastPrompt)}</textarea>
          </div>
        ` : ''}
      `;
    } else {
      wizardBody.innerHTML = `
        <div class="field">
          <label>Name</label>
          <input type="text" value="${escapeHtml(wizardState.name)}" disabled />
        </div>
        <div class="field">
          <label>Tone</label>
          <input type="text" value="${escapeHtml(wizardState.tone)}" disabled />
        </div>
        <div class="field">
          <label>Persona</label>
          <input type="text" value="${escapeHtml(wizardState.persona)}" disabled />
        </div>
        <div class="field">
          <label>Focus topics</label>
          <input type="text" value="${escapeHtml(wizardState.evolvingTopics.join(", "))}" disabled />
        </div>
      `;
    }
  }

  // Onboarding wizard
  function openOnboardingWizard() {
    console.log("[promptiply] openOnboardingWizard called");
    onboardingState = {
      step: 1,
      selectedMode: "webui",
      selectedProvider: "openai",
      apiKey: "",
      model: "",
      profileName: "",
      profilePersona: "",
      profileTone: "",
    };

    const onboardingModal = document.getElementById("onboarding-modal");
    onboardingModal?.classList.add("modal-show");
    setOnboardingStep(1);
    showToast("Onboarding opened");
  }

  function closeOnboardingWizard() {
    const onboardingModal = document.getElementById("onboarding-modal");
    onboardingModal?.classList.remove("modal-show");
    chrome.storage.local.set({ [STORAGE_ONBOARDING]: true });
  }

  function setOnboardingStep(step) {
    onboardingState.step = Math.max(1, Math.min(4, step));

    const onboardingSteps = document.querySelectorAll("#onboarding-modal .step");
    const onboardingBack = document.getElementById("onboarding-back");
    const onboardingNext = document.getElementById("onboarding-next");
    const onboardingFinish = document.getElementById("onboarding-finish");

    onboardingSteps.forEach((s) => s.classList.toggle("active", Number(s.dataset.step) === onboardingState.step));
    onboardingBack?.classList.toggle("tab-panel-hidden", onboardingState.step === 1);
    onboardingNext?.classList.toggle("tab-panel-hidden", onboardingState.step === 4);
    onboardingFinish?.classList.toggle("wizard-save-hidden", onboardingState.step !== 4);

    if (onboardingState.step === 1) renderModesStep();
    else if (onboardingState.step === 2) renderSetupStep();
    else if (onboardingState.step === 3) renderProfileStep();
    else renderSuccessStep();
  }

  function renderModesStep() {
    const onboardingBody = document.getElementById("onboarding-body");
    if (!onboardingBody) return;

    onboardingBody.innerHTML = `
      <div class="onboarding-section">
        <h3>Choose Your Refinement Mode</h3>
        <p>promptiply offers three ways to refine your prompts. Choose the one that fits your needs:</p>
      </div>
      <div class="mode-card ${onboardingState.selectedMode === "api" ? "selected" : ""}" data-mode="api" tabindex="0">
        <h3>API Mode</h3>
        <p>Uses your OpenAI or Anthropic API key for fast, reliable refinement. Best for regular use.</p>
        <span class="mode-badge badge-easy">Recommended</span>
      </div>
      <div class="mode-card ${onboardingState.selectedMode === "webui" ? "selected" : ""}" data-mode="webui" tabindex="0">
        <h3>WebUI Mode</h3>
        <p>Opens a background tab to ChatGPT or Claude, sends your prompt, and reads the response. No API key needed.</p>
        <span class="mode-badge badge-simple">Simple Setup</span>
      </div>
      <div class="mode-card ${onboardingState.selectedMode === "local" ? "selected" : ""}" data-mode="local" tabindex="0">
        <h3>Local Mode (Llama 3)</h3>
        <p>Runs entirely in your browser using Llama 3.1 8B model. Completely private and offline after initial download (~5GB).</p>
        <span class="mode-badge badge-private">100% Private</span>
      </div>
    `;

    onboardingBody.querySelectorAll(".mode-card").forEach((card) => {
      card.addEventListener("click", () => {
        onboardingState.selectedMode = card.dataset.mode;
        onboardingBody.querySelectorAll(".mode-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
      });
    });
  }

  function renderSetupStep() {
    const onboardingBody = document.getElementById("onboarding-body");
    if (!onboardingBody) return;

    if (onboardingState.selectedMode === "api") {
      onboardingBody.innerHTML = `
        <div class="onboarding-section">
          <h3>API Setup</h3>
          <p>To use API mode, you'll need an API key from your chosen provider. Your API key is stored locally and never leaves your device.</p>
        </div>
        <div class="field">
          <label>Provider</label>
          <select id="ob-provider">
            <option value="openai" ${onboardingState.selectedProvider === "openai" ? "selected" : ""}>OpenAI (ChatGPT)</option>
            <option value="anthropic" ${onboardingState.selectedProvider === "anthropic" ? "selected" : ""}>Anthropic (Claude)</option>
          </select>
        </div>
        <div id="ob-provider-fields">
          ${onboardingState.selectedProvider === "openai" ? `
            <div class="field">
              <label>OpenAI API Key</label>
              <input id="ob-api-key" type="password" placeholder="sk-..." value="${escapeHtml(onboardingState.apiKey)}" />
            </div>
            <div class="field">
              <label>Model</label>
              <select id="ob-model">
                <option value="gpt-5-nano">gpt-5-nano</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-5">gpt-5</option>
              </select>
            </div>
          ` : `
            <div class="field">
              <label>Anthropic API Key</label>
              <input id="ob-api-key" type="password" placeholder="sk-ant-..." value="${escapeHtml(onboardingState.apiKey)}" />
            </div>
            <div class="field">
              <label>Model</label>
              <select id="ob-model">
                <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
              </select>
            </div>
          `}
        </div>
        <p class="muted muted-top-margin muted-small">You can skip this step and set up your API key later in Settings.</p>
      `;

      const obProvider = document.getElementById("ob-provider");
      if (obProvider) {
        obProvider.addEventListener("change", () => {
          onboardingState.selectedProvider = obProvider.value;
          // Re-render to show only the selected provider's fields
          renderSetupStep();
        });
      }
    } else if (onboardingState.selectedMode === "webui") {
      onboardingBody.innerHTML = `
        <div class="onboarding-section">
          <h3>WebUI Mode Setup</h3>
          <p>WebUI mode doesn't require any API keys. The extension will automatically detect which AI provider to use based on the website you're on:</p>
          <ul class="onboarding-list">
            <li><strong>ChatGPT</strong> (chat.openai.com or chatgpt.com) → Uses OpenAI</li>
            <li><strong>Claude</strong> (claude.ai) → Uses Anthropic</li>
          </ul>
          <p class="muted muted-top-margin">Make sure you're logged into ChatGPT or Claude in your browser before using the extension.</p>
        </div>
      `;
    } else {
      onboardingBody.innerHTML = `
        <div class="onboarding-section">
          <h3>Local Mode Setup</h3>
          <p>Local mode runs entirely in your browser. The first time you use it, Llama 3.1 8B will be downloaded (~5GB).</p>
        </div>
      `;
    }
  }

  function renderProfileStep() {
    const onboardingBody = document.getElementById("onboarding-body");
    if (!onboardingBody) return;

    onboardingBody.innerHTML = `
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
      <p class="muted muted-top-margin muted-small">You can skip profile creation and use the default settings.</p>
    `;
  }

  function renderSuccessStep() {
    const onboardingBody = document.getElementById("onboarding-body");
    if (!onboardingBody) return;

    onboardingBody.innerHTML = `
      <div class="onboarding-success">
        <img src="../icons/icon-48.png" alt="promptiply" class="icon-48" />
        <h3>You're All Set!</h3>
        <p>promptiply is ready to help you refine your prompts. Here's what you configured:</p>
        <div class="onboarding-summary">
          <div class="mb-12"><strong>Mode:</strong> ${
            onboardingState.selectedMode === "api" ? "API" :
            onboardingState.selectedMode === "webui" ? "WebUI" : "Local (Llama 3)"
          }</div>
          ${onboardingState.selectedMode === "api" && onboardingState.apiKey ?
            `<div class="mb-12"><strong>Provider:</strong> ${onboardingState.selectedProvider === "openai" ? "OpenAI" : "Anthropic"}</div>` : ""}
          ${onboardingState.profileName ?
            `<div class="mb-12"><strong>Profile:</strong> ${escapeHtml(onboardingState.profileName)}</div>` : ""}
        </div>
        <p class="mt-24">Visit <strong>chat.openai.com</strong> or <strong>claude.ai</strong> and press <strong>Alt+T</strong> to start refining your prompts!</p>
      </div>
    `;
  }

  function handleOnboardingNext() {
    if (onboardingState.step === 2 && onboardingState.selectedMode === "api") {
      const obProvider = document.getElementById("ob-provider");
      if (obProvider) onboardingState.selectedProvider = obProvider.value;

      // Use unified field IDs
      const obApiKey = document.getElementById("ob-api-key");
      const obModel = document.getElementById("ob-model");
      if (obApiKey) onboardingState.apiKey = obApiKey.value.trim();
      if (obModel) onboardingState.model = obModel.value;
    } else if (onboardingState.step === 3) {
      const obProfileName = document.getElementById("ob-profile-name");
      const obProfilePersona = document.getElementById("ob-profile-persona");
      const obProfileTone = document.getElementById("ob-profile-tone");
      if (obProfileName) onboardingState.profileName = obProfileName.value.trim();
      if (obProfilePersona) onboardingState.profilePersona = obProfilePersona.value.trim();
      if (obProfileTone) onboardingState.profileTone = obProfileTone.value.trim();
    }

    setOnboardingStep(onboardingState.step + 1);
  }

  function finishOnboarding() {
    // Save settings
    chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
      const settings = data[STORAGE_SETTINGS] || {};
      settings.mode = onboardingState.selectedMode;
      if (onboardingState.selectedMode === "api") {
        settings.provider = onboardingState.selectedProvider;
        if (onboardingState.apiKey) {
          if (onboardingState.selectedProvider === "openai") {
            settings.openaiKey = onboardingState.apiKey;
            settings.openaiModel = onboardingState.model || "gpt-5-nano";
          } else {
            settings.anthropicKey = onboardingState.apiKey;
            settings.anthropicModel = onboardingState.model || "claude-haiku-4-5";
          }
        }
      }
      chrome.storage.local.set({ [STORAGE_SETTINGS]: settings });
    });

    // Create profile if provided
    if (onboardingState.profileName) {
      chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
        const profiles = normalizeProfilesState(data[STORAGE_PROFILES]);
        const profileId = `p_${Date.now()}`;
        const newProfile = {
          id: profileId,
          name: onboardingState.profileName,
          persona: onboardingState.profilePersona,
          tone: onboardingState.profileTone,
          styleGuidelines: [],
          constraints: [],
          examples: [],
          domainTags: [],
          evolving_profile: createEmptyEvolution(),
        };
        profiles.list.push(newProfile);
        if (!profiles.activeProfileId) profiles.activeProfileId = profileId;
        chrome.storage.sync.set({ [STORAGE_PROFILES]: profiles });
      });
    }

    chrome.storage.local.set({ [STORAGE_ONBOARDING]: true });
    closeOnboardingWizard();
    setTimeout(() => location.reload(), 300);
  }

  // Profile rendering
  function renderProfiles(p) {
    const state = normalizeProfilesState(p);
    const profilesList = document.getElementById("profiles-list");
    if (!profilesList) return;

    profilesList.innerHTML = "";
    if (!state.list.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = "No profile, create new one? <br/><br/>";
      const btn = document.createElement("button");
      btn.className = "primary";
      btn.textContent = "Create Profile";
      btn.addEventListener("click", () => openWizard());
      empty.appendChild(btn);
      profilesList.appendChild(empty);
      renderEvolvingEditor(state);
      return;
    }

    state.list.forEach((prof) => {
      const card = document.createElement("div");
      card.className = "card";
      if (state.activeProfileId === prof.id) {
        card.classList.add("card-active");
      }
      const meta = document.createElement("div");
      meta.className = "meta";
      const title = document.createElement("div");
      title.textContent = prof.name;
      const line = document.createElement("div");
      line.className = "muted";
      line.textContent = [prof.persona, prof.tone].filter(Boolean).join(" • ");
      const chips = document.createElement("div");
      (prof.styleGuidelines || []).slice(0, 3).forEach((g) => {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = g;
        chips.appendChild(c);
      });
      const evolution = normalizeEvolution(prof.evolving_profile);
      meta.appendChild(title);
      meta.appendChild(line);
      meta.appendChild(chips);
      if (evolution.topics.length > 0) {
        const evoRow = document.createElement("div");
        evoRow.className = "muted muted-small";
        // Extract topic names from objects
        const topicNames = evolution.topics.map((topic) => 
          typeof topic === "string" ? topic : (topic.name || "")
        ).filter(Boolean);
        const topicsText = topicNames.slice(0, 3).join(", ");
        const pieces = [];
        if (topicsText) pieces.push(`Focus: ${topicsText}`);
        if (topicNames.length > 3) {
          pieces.push(`${topicNames.length - 3} more`);
        }
        evoRow.textContent = pieces.join(" • ");
        meta.appendChild(evoRow);
      }
      const actions = document.createElement("div");
      const activate = document.createElement("button");
      activate.textContent = state.activeProfileId === prof.id ? "Active" : "Set Active";
      activate.disabled = state.activeProfileId === prof.id;
      activate.addEventListener("click", () => {
        const updated = { ...state, list: state.list.slice(), activeProfileId: prof.id };
        chrome.storage.sync.set({ [STORAGE_PROFILES]: updated }, () => renderProfiles(updated));
      });
      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.addEventListener("click", () => openWizard(prof));
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const updated = {
          ...state,
          list: state.list.filter((x) => x.id !== prof.id),
        };
        if (updated.activeProfileId === prof.id) updated.activeProfileId = updated.list[0]?.id || null;
        chrome.storage.sync.set({ [STORAGE_PROFILES]: updated }, () => renderProfiles(updated));
      });
      actions.appendChild(activate);
      actions.appendChild(edit);
      actions.appendChild(del);
      card.appendChild(meta);
      card.appendChild(actions);
      profilesList.appendChild(card);
    });

    renderEvolvingEditor(state);
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return "Awaiting first manual update";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return `Updated: ${isoString}`;
    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return "Updated just now";
    if (diff < hour) return `Updated ${Math.round(diff / minute)} min ago`;
    if (diff < day) return `Updated ${Math.round(diff / hour)} hr ago`;
    const days = Math.round(diff / day);
    return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
  }

  function buildEvolutionStatus(evolution) {
    const usage = evolution.usageCount || 0;
    const parts = [`Auto refinements captured: ${usage}`];
    if (evolution.lastPrompt) {
      parts.push("Latest prompt stored");
    }
    parts.push("Manual edits override until next refinement");
    return parts.join(" • ");
  }

  function renderEvolvingEditor(state) {
    const editor = document.getElementById("evolving-editor");
    if (!editor) return;
    const active = state.list.find((p) => p.id === state.activeProfileId) || state.list[0] || null;

    if (!active) {
      editor.classList.add("tab-panel-hidden");
      editor.dataset.profileId = "";
      return;
    }

    editor.classList.remove("tab-panel-hidden");
    editor.dataset.profileId = active.id;

    const evo = normalizeEvolution(active.evolving_profile);
    const nameEl = document.getElementById("evolving-active-name");
    if (nameEl) {
      nameEl.textContent = `${active.name || "Untitled"}${active.persona ? ` • ${active.persona}` : ""}`;
    }
    const lastUpdatedEl = document.getElementById("evolving-last-updated");
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = formatRelativeTime(evo.lastUpdated);
    }
    const topicsEl = document.getElementById("evolving-topics");
    if (topicsEl) {
      // Extract topic names from objects
      const topicNames = evo.topics.map((topic) => 
        typeof topic === "string" ? topic : (topic.name || "")
      ).filter(Boolean);
      topicsEl.value = topicNames.join(", ");
    }
    const lastPromptEl = document.getElementById("evolving-lastprompt");
    if (lastPromptEl) {
      lastPromptEl.value = evo.lastPrompt || "";
    }
    const statusEl = document.getElementById("evolving-status");
    if (statusEl) {
      statusEl.textContent = buildEvolutionStatus(evo);
    }
  }

  function handleEvolvingApply() {
    const editor = document.getElementById("evolving-editor");
    if (!editor || editor.classList.contains("tab-panel-hidden")) return;
    const profileId = editor.dataset.profileId;
    if (!profileId) {
      showToast("Select a profile first");
      return;
    }

    const applyBtn = document.getElementById("evolving-apply");
    if (applyBtn) applyBtn.disabled = true;

    const topicsInput = document.getElementById("evolving-topics");
    const topics = parseTopicsInput(topicsInput?.value || "");

    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const state = normalizeProfilesState(data[STORAGE_PROFILES]);
      const idx = state.list.findIndex((p) => p.id === profileId);
      if (idx < 0) {
        showToast("Active profile not found");
        if (applyBtn) applyBtn.disabled = false;
        return;
      }

      const current = state.list[idx];
      const prevEvolution = normalizeEvolution(current.evolving_profile);
      
      // Convert user input (strings) to topic objects
      // Match existing topics by name to preserve count and lastUsed
      const normalizeTopicName = (name) => String(name || "").trim().toLowerCase();
      const existingTopicsMap = new Map();
      prevEvolution.topics.forEach((topic) => {
        const key = normalizeTopicName(typeof topic === "string" ? topic : topic.name);
        if (topic && typeof topic === "object") {
          existingTopicsMap.set(key, topic);
        } else {
          existingTopicsMap.set(key, { name: String(topic).trim(), count: 1, lastUsed: new Date().toISOString() });
        }
      });

      const now = new Date().toISOString();
      const topicObjects = topics.map((topicName) => {
        const key = normalizeTopicName(topicName);
        if (existingTopicsMap.has(key)) {
          // Preserve existing topic's count and lastUsed
          return existingTopicsMap.get(key);
        }
        // New topic: create object with count 1
        return {
          name: String(topicName).trim(),
          count: 1,
          lastUsed: now,
        };
      });

      // Check if topics changed
      const prevTopicNames = prevEvolution.topics.map((t) => 
        normalizeTopicName(typeof t === "string" ? t : t.name)
      );
      const newTopicNames = topicObjects.map((t) => normalizeTopicName(t.name));
      const topicsChanged =
        topicObjects.length !== prevEvolution.topics.length ||
        newTopicNames.some((name, i) => name !== prevTopicNames[i]);

      if (!topicsChanged) {
        showToast("No changes to apply");
        renderEvolvingEditor(state);
        if (applyBtn) applyBtn.disabled = false;
        return;
      }

      const merged = {
        ...prevEvolution,
        topics: topicObjects,
        lastUpdated: now,
      };
      state.list = state.list.slice();
      state.list[idx] = { ...current, evolving_profile: merged };

      chrome.storage.sync.set({ [STORAGE_PROFILES]: state }, () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          console.warn("[promptiply] Failed to persist manual evolution", err);
          showToast("Could not save evolution changes");
        } else {
          renderProfiles(state);
          renderEvolvingEditor(state);
          showToast("Evolution updated");
        }
        if (applyBtn) applyBtn.disabled = false;
      });
    });
  }

  function handleEvolvingReset() {
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const state = normalizeProfilesState(data[STORAGE_PROFILES]);
      renderEvolvingEditor(state);
      showToast("Fields reset to stored values");
    });
  }

  function renderPredefinedProfiles() {
    const pre = document.getElementById("predefined-list");
    if (!pre) return;

    pre.innerHTML = "";
    PREDEFINED_PROFILES.forEach((p) => {
      const row = document.createElement("div");
      row.className = "card";
      const meta = document.createElement("div");
      meta.className = "meta";
      const title = document.createElement("div");
      title.textContent = p.name;
      const line = document.createElement("div");
      line.className = "muted";
      line.textContent = p.persona;
      meta.appendChild(title);
      meta.appendChild(line);
      const actions = document.createElement("div");
      const useBtn = document.createElement("button");
      useBtn.textContent = "Use";
      useBtn.addEventListener("click", () => importPredefinedProfile(p));
      const importBtn = document.createElement("button");
      importBtn.textContent = "Import";
      importBtn.addEventListener("click", () => importPredefinedProfile(p, { activate: false }));
      actions.appendChild(useBtn);
      actions.appendChild(importBtn);
      row.appendChild(meta);
      row.appendChild(actions);
      pre.appendChild(row);
    });
  }

  function importPredefinedProfile(pref, opts = { activate: true }) {
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const cur = normalizeProfilesState(data[STORAGE_PROFILES]);
      const exists = cur.list.find((x) => x.name === pref.name);
      if (exists) {
        if (opts.activate) {
          cur.activeProfileId = exists.id;
          chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, () => renderProfiles(cur));
        }
        return;
      }
      const id = `p_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      const newP = {
        id,
        name: pref.name,
        persona: pref.persona,
        tone: pref.tone || "",
        styleGuidelines: pref.styleGuidelines || [],
        constraints: [],
        examples: [],
        domainTags: [],
        evolving_profile: createEmptyEvolution(),
        // Metadata for tracking imports
        importedFromPredefined: true,
        predefinedId: pref.id,
        importedAt: new Date().toISOString()
      };
      cur.list.push(newP);
      if (opts.activate && !cur.activeProfileId) cur.activeProfileId = newP.id;
      chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, () => {
        renderProfiles(cur);
        if (!opts.silent) showToast(`Imported "${pref.name}"`);
      });
    });
  }

  // Auto-import predefined profiles on first load
  function autoImportPredefinedProfiles() {
    chrome.storage.local.get(['predefined_profiles_imported'], (data) => {
      if (!data.predefined_profiles_imported) {
        console.log('[promptiply] First load - auto-importing predefined profiles');
        PREDEFINED_PROFILES.forEach((p, index) => {
          // Delay each import slightly to avoid race conditions
          setTimeout(() => {
            importPredefinedProfile(p, { activate: index === 0, silent: true });
          }, index * 100);
        });
        chrome.storage.local.set({ predefined_profiles_imported: true });
      }
    });
  }

  // Restore Defaults - resets to only predefined profiles
  function showRestoreConfirmation() {
    console.log('[promptiply] showRestoreConfirmation called');
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const cur = normalizeProfilesState(data[STORAGE_PROFILES]);
      const predefinedProfiles = cur.list.filter(p => p.importedFromPredefined === true);
      const customProfiles = cur.list.filter(p => !p.importedFromPredefined);
      
      if (customProfiles.length === 0) {
        showToast('Already at defaults (only predefined profiles exist)');
        return;
      }

      // Create confirmation modal
      const modal = document.createElement('div');
      modal.className = 'modal modal-show';
      modal.id = 'restore-confirm-modal';
      modal.innerHTML = `
        <div class="dialog">
          <div class="title-flex">
            <img src="../icons/icon-48.png" alt="promptiply" class="icon-48" />
            <div>Restore Defaults</div>
          </div>
          <div class="onboarding-section">
            <p>This will remove <strong>${customProfiles.length}</strong> custom profile(s) and keep only the predefined profiles:</p>
            <div class="list modal-list-container">
              ${customProfiles.map(p => `
                <div class="card modal-card-compact">
                  <div><strong>${escapeHtml(p.name)}</strong></div>
                  <div class="muted modal-text-muted-small">${escapeHtml(p.persona || '')}</div>
                </div>
              `).join('')}
            </div>
            <p class="muted">Predefined profiles (${predefinedProfiles.length}) will be kept. You'll be able to undo this for 10 seconds.</p>
          </div>
          <div class="actions actions-space-between actions-top-margin">
            <button id="restore-cancel">Cancel</button>
            <button id="restore-confirm" class="primary">Restore Defaults</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      console.log('[promptiply] Modal created: restore-confirm-modal, classList:', modal.className);
      
      // Wire up buttons
      const cancelBtn = document.getElementById('restore-cancel');
      const confirmBtn = document.getElementById('restore-confirm');
      
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          modal.remove();
        });
      }
      
      if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          modal.remove();
          restoreDefaults(customProfiles);
        });
      }
    });
  }

  function restoreDefaults(toDelete) {
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const cur = normalizeProfilesState(data[STORAGE_PROFILES]);
      
      // Store for undo
      deletedProfilesUndo = [...toDelete];
      
      // Keep only predefined profiles
      const remaining = cur.list.filter(p => p.importedFromPredefined);
      const updated = {
        list: remaining,
        activeProfileId: remaining.some(p => p.id === cur.activeProfileId) ? cur.activeProfileId : (remaining[0]?.id || null)
      };
      
      chrome.storage.sync.set({ [STORAGE_PROFILES]: updated }, () => {
        renderProfiles(updated);
        showUndoToast(toDelete.length);
        console.log('[promptiply] Restored defaults, removed', toDelete.length, 'custom profiles');
      });
    });
  }

  function showUndoToast(count) {
    // Clear any existing undo timeout
    if (undoTimeout) {
      clearTimeout(undoTimeout);
      undoTimeout = null;
    }

    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast-undo';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <span>Removed ${count} profile(s)</span>
      <button id="undo-restore" class="undo-toast-button">Undo</button>
    `;
    
    container.appendChild(el);
    
    // Wire up undo button
    const undoBtn = document.getElementById('undo-restore');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        undoRestore();
        el.remove();
      });
    }
    
    // Auto-remove after 10 seconds
    undoTimeout = setTimeout(() => {
      try {
        el.remove();
        deletedProfilesUndo = null;
      } catch (_) {}
    }, 10000);
  }

  function undoRestore() {
    if (!deletedProfilesUndo || deletedProfilesUndo.length === 0) {
      showToast('Nothing to undo');
      return;
    }
    
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const cur = normalizeProfilesState(data[STORAGE_PROFILES]);
      
      // Restore deleted profiles
      const updated = {
        list: [...cur.list, ...deletedProfilesUndo],
        activeProfileId: cur.activeProfileId
      };
      
      chrome.storage.sync.set({ [STORAGE_PROFILES]: updated }, () => {
        renderProfiles(updated);
        showToast(`Restored ${deletedProfilesUndo.length} profile(s)`);
        console.log('[promptiply] Undo restore: added back', deletedProfilesUndo.length, 'profiles');
        deletedProfilesUndo = null;
      });
    });
    
    if (undoTimeout) {
      clearTimeout(undoTimeout);
      undoTimeout = null;
    }
  }

  // Export profiles with selection
  function exportProfiles() {
    console.log('[promptiply] exportProfiles called');
    chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
      const profiles = normalizeProfilesState(data[STORAGE_PROFILES]);
      
      if (profiles.list.length === 0) {
        showToast('No profiles to export');
        return;
      }
      
      // Show export modal with selection
      const modal = document.createElement('div');
      modal.className = 'modal modal-show';
      modal.id = 'export-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'export-modal-title');
      modal.innerHTML = `
        <div class="dialog">
          <div class="title-flex">
            <img src="../icons/icon-48.png" alt="promptiply" class="icon-48" />
            <div id="export-modal-title">Export Profiles</div>
          </div>
          <div class="onboarding-section">
            <p>Select profiles to export:</p>
            <div class="export-select-all">
              <input type="checkbox" id="export-select-all-checkbox" checked />
              <label for="export-select-all-checkbox">Select All</label>
            </div>
            <div class="export-selection-list">
              ${profiles.list.map(p => `
                <div class="export-profile-item">
                  <input type="checkbox" id="export-profile-${p.id}" value="${p.id}" checked />
                  <label for="export-profile-${p.id}" class="export-profile-info">
                    <div><strong>${escapeHtml(p.name)}</strong></div>
                    <div class="muted modal-text-muted-small">${escapeHtml(p.persona || '')}</div>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="actions actions-space-between actions-top-margin">
            <button id="export-cancel">Cancel</button>
            <button id="export-execute" class="primary">Export Selected</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      console.log('[promptiply] Modal created: export-modal, classList:', modal.className);
      
      // Get references
      const selectAllCheckbox = document.getElementById('export-select-all-checkbox');
      const profileCheckboxes = Array.from(modal.querySelectorAll('.export-profile-item input[type="checkbox"]'));
      
      // Handle select all
      if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
          profileCheckboxes.forEach(cb => cb.checked = e.target.checked);
        });
      }
      
      // Update select all when individual checkboxes change
      profileCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          const allChecked = profileCheckboxes.every(c => c.checked);
          const noneChecked = profileCheckboxes.every(c => !c.checked);
          if (selectAllCheckbox) {
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = !allChecked && !noneChecked;
          }
        });
      });
      
      // Wire up buttons
      const cancelBtn = document.getElementById('export-cancel');
      const executeBtn = document.getElementById('export-execute');
      
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          modal.remove();
        });
      }
      
      if (executeBtn) {
        executeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const selectedIds = Array.from(modal.querySelectorAll('.export-profile-item input[type="checkbox"]:checked'))
            .map(cb => cb.value);
          
          if (selectedIds.length === 0) {
            const existingError = modal.querySelector('.export-error-message');
            if (existingError) existingError.remove();
            
            const statusEl = document.createElement('p');
            statusEl.className = 'muted modal-text-muted-small export-error-message';
            statusEl.textContent = 'Please select at least one profile to export';
            const actionsDiv = modal.querySelector('.actions');
            if (actionsDiv && actionsDiv.parentNode) {
              actionsDiv.parentNode.insertBefore(statusEl, actionsDiv);
            }
            return;
          }
          
          const selectedProfiles = profiles.list.filter(p => selectedIds.includes(p.id));
          const envelope = createExportEnvelope(selectedProfiles);
          const json = JSON.stringify(envelope, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `promptiply-profiles-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          modal.remove();
          showToast(`Exported ${selectedProfiles.length} profile(s)`);
          console.log('[promptiply] Exported', selectedProfiles.length, 'profiles');
        });
      }
    });
  }

  // Import profiles modal
  function showImportModal() {
    console.log('[promptiply] showImportModal called');
    const modal = document.createElement('div');
    modal.className = 'modal modal-show';
    modal.id = 'import-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'import-modal-title');
    modal.innerHTML = `
      <div class="dialog">
        <div class="title-flex">
          <img src="../icons/icon-48.png" alt="promptiply" class="icon-48" />
          <div id="import-modal-title">Import Profiles</div>
        </div>
        <div class="onboarding-section">
          <p>Choose how you want to import profiles:</p>
          
          <div class="field">
            <label for="import-file-input">Select File</label>
            <div class="file-input-container">
              <input id="import-file-input" type="file" accept=".json" class="file-input-hidden" aria-describedby="import-file-hint-text" />
              <button type="button" id="import-file-button" class="secondary file-select-button">Choose File</button>
              <span id="import-file-display" class="muted modal-hint-text">No file selected</span>
            </div>
            <div id="import-file-hint-text" class="muted modal-hint-text">Choose a JSON file from your computer</div>
          </div>
          
          <div class="modal-text-center">— or —</div>
          
          <div class="field">
            <label for="import-url-input">Load from URL</label>
            <div class="url-input-container">
              <input id="import-url-input" type="url" placeholder="https://example.com/profiles.json" aria-describedby="import-url-hint-text" class="url-input-field" />
            </div>
            <div id="import-url-hint-text" class="muted modal-hint-text">Enter a URL to a JSON file (must support CORS)</div>
          </div>
          
          <div class="modal-text-center">— or —</div>
          
          <div class="field">
            <label for="import-json-textarea">Paste JSON</label>
            <textarea id="import-json-textarea" class="modal-textarea-mono" placeholder='{"schemaVersion":1,"profiles":[...]}' aria-describedby="import-json-hint-text"></textarea>
            <div id="import-json-hint-text" class="muted modal-hint-text">Paste your profile data in JSON format</div>
          </div>
          
          <div id="import-status-display" role="status" aria-live="polite" class="modal-status-box"></div>
        </div>
        <div class="actions actions-space-between actions-top-margin">
          <button type="button" id="import-cancel-btn">Cancel</button>
          <button type="button" id="import-execute-btn" class="primary">Import</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    console.log('[promptiply] Modal created: import-modal, classList:', modal.className);
    
    // File input button handler
    const fileButton = document.getElementById('import-file-button');
    const fileInput = document.getElementById('import-file-input');
    const fileDisplay = document.getElementById('import-file-display');
    
    if (fileButton && fileInput) {
      fileButton.addEventListener('click', () => {
        fileInput.click();
      });
      
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          const urlInput = document.getElementById('import-url-input');
          const jsonInput = document.getElementById('import-json-textarea');
          if (urlInput) urlInput.value = '';
          if (jsonInput) jsonInput.value = '';
          if (fileDisplay) {
            fileDisplay.textContent = e.target.files[0].name;
            fileDisplay.className = 'muted modal-hint-text file-display-selected';
          }
        } else {
          if (fileDisplay) {
            fileDisplay.textContent = 'No file selected';
            fileDisplay.className = 'muted modal-hint-text';
          }
        }
      });
    }
    
    // URL input handler
    const urlInput = document.getElementById('import-url-input');
    if (urlInput) {
      urlInput.addEventListener('input', (e) => {
        if (e.target.value.trim()) {
          if (fileInput) fileInput.value = '';
          if (fileDisplay) {
            fileDisplay.textContent = 'No file selected';
            fileDisplay.className = 'muted modal-hint-text';
          }
          const jsonInput = document.getElementById('import-json-textarea');
          if (jsonInput) jsonInput.value = '';
        }
      });
    }
    
    // JSON textarea handler
    const jsonInput = document.getElementById('import-json-textarea');
    if (jsonInput) {
      jsonInput.addEventListener('input', (e) => {
        if (e.target.value.trim()) {
          if (urlInput) urlInput.value = '';
          if (fileInput) fileInput.value = '';
          if (fileDisplay) {
            fileDisplay.textContent = 'No file selected';
            fileDisplay.className = 'muted modal-hint-text';
          }
        }
      });
    }
    
    // Wire up buttons
    const cancelBtn = document.getElementById('import-cancel-btn');
    const executeBtn = document.getElementById('import-execute-btn');
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.remove();
      });
    }
    
    if (executeBtn) {
      executeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        executeImport(modal);
      });
    }
  }

  function executeImport(modal) {
    const urlInput = document.getElementById('import-url-input');
    const fileInput = document.getElementById('import-file-input');
    const jsonInput = document.getElementById('import-json-textarea');
    const statusEl = document.getElementById('import-status-display');
    
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'modal-status-box';
    }
    
    // Try URL first
    if (urlInput && urlInput.value.trim()) {
      importFromURL(urlInput.value.trim(), statusEl, modal);
      return;
    }
    
    // Try file
    if (fileInput && fileInput.files.length > 0) {
      importFromFile(fileInput.files[0], statusEl, modal);
      return;
    }
    
    // Try JSON
    if (jsonInput && jsonInput.value.trim()) {
      importFromJSON(jsonInput.value.trim(), statusEl, modal);
      return;
    }
    
    if (statusEl) {
      statusEl.textContent = 'Please provide a URL, file, or JSON data';
      statusEl.className = 'modal-status-box status-error';
    }
  }

  function importFromURL(url, statusEl, modal) {
    statusEl.innerHTML = '<span role="status">Loading from URL...</span>';
    statusEl.className = 'modal-status-box status-loading';
    
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        processImportData(data, statusEl, modal);
      })
      .catch(error => {
        console.error('[promptiply] URL import failed:', error);
        statusEl.innerHTML = `
          <div class="status-error">
            <strong>Failed to load from URL:</strong><br/>
            ${escapeHtml(error.message)}<br/>
            <span class="muted modal-hint-text">
              This may be due to CORS restrictions. Try downloading the file and using "From File" instead, or paste the JSON directly.
            </span>
          </div>
        `;
      });
  }

  function importFromFile(file, statusEl, modal) {
    statusEl.innerHTML = '<span role="status">Reading file...</span>';
    statusEl.className = 'modal-status-box status-loading';
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        processImportData(data, statusEl, modal);
      } catch (error) {
        statusEl.innerHTML = `<div class="status-error">Invalid JSON file: ${escapeHtml(error.message)}</div>`;
      }
    };
    reader.onerror = () => {
      statusEl.innerHTML = '<div class="status-error">Failed to read file</div>';
    };
    reader.readAsText(file);
  }

  function importFromJSON(json, statusEl, modal) {
    try {
      const data = JSON.parse(json);
      processImportData(data, statusEl, modal);
    } catch (error) {
      statusEl.innerHTML = `<div class="status-error">Invalid JSON: ${escapeHtml(error.message)}</div>`;
    }
  }

  function processImportData(data, statusEl, modal) {
    try {
      const profiles = parseImportEnvelope(data);
      
      if (!Array.isArray(profiles) || profiles.length === 0) {
        statusEl.innerHTML = '<div class="status-error">No profiles found in import data</div>';
        return;
      }
      
      // Validate profiles have required fields
      const invalid = profiles.filter(p => !p.name || typeof p.name !== 'string');
      if (invalid.length > 0) {
        statusEl.innerHTML = `<div class="status-error">Invalid profiles: ${invalid.length} profile(s) missing name</div>`;
        return;
      }
      
      // Import the profiles
      chrome.storage.sync.get([STORAGE_PROFILES], (storageData) => {
        const cur = normalizeProfilesState(storageData[STORAGE_PROFILES]);
        
        // Add imported profiles (avoid duplicates by name)
        let imported = 0;
        let skipped = 0;
        
        profiles.forEach(prof => {
          const exists = cur.list.find(p => p.name === prof.name);
          if (exists) {
            skipped++;
            return;
          }
          
          const id = `p_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
          const importedProfile = normalizeProfileObject({
            ...prof,
            id,
            name: prof.name,
            persona: prof.persona || '',
            tone: prof.tone || '',
            styleGuidelines: prof.styleGuidelines || [],
            constraints: prof.constraints || [],
            examples: prof.examples || [],
            domainTags: prof.domainTags || [],
            importedFromPredefined: prof.importedFromPredefined || false,
            predefinedId: prof.predefinedId,
            importedAt: new Date().toISOString()
          });
          if (importedProfile) {
            cur.list.push(importedProfile);
          }
          imported++;
        });
        
        chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, () => {
          renderProfiles(cur);
          modal.remove();
          showToast(`Imported ${imported} profile(s)${skipped > 0 ? `, skipped ${skipped} duplicate(s)` : ''}`);
          console.log('[promptiply] Import complete:', { imported, skipped });
        });
      });
      
    } catch (error) {
      statusEl.innerHTML = `<div class="status-error">${escapeHtml(error.message)}</div>`;
    }
  }

  // Robust event binding
  function attachCoreListeners() {
    try {
      console.log("[promptiply] attachCoreListeners: attempting to bind core UI");
      let attachedAny = false;

      // Tab switching
      const tabEls = Array.from(document.querySelectorAll(".tab"));
      tabEls.forEach((t) => {
        if (!t.dataset.prAttached) {
          t.addEventListener("click", () => selectTab(t.dataset.tab));
          t.dataset.prAttached = "1";
          attachedAny = true;
        }
      });

      // Buttons
      const runBtn = document.getElementById("run-onboarding");
      if (runBtn && !runBtn.dataset.prAttached) {
        runBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          try {
            openOnboardingWizard();
          } catch (e) {
            console.error("openOnboardingWizard failed", e);
          }
        });
        runBtn.dataset.prAttached = "1";
        console.log("[promptiply] attachCoreListeners: bound run-onboarding");
        attachedAny = true;
      }

      const saveBtn = document.getElementById("save-settings");
      if (saveBtn && !saveBtn.dataset.prAttached) {
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          try {
            saveSettings();
          } catch (e) {
            console.error("saveSettings failed", e);
          }
        });
        saveBtn.dataset.prAttached = "1";
        console.log("[promptiply] attachCoreListeners: bound save-settings");
        attachedAny = true;
      }

      const saveProvBtn = document.getElementById("save-providers-settings");
      if (saveProvBtn && !saveProvBtn.dataset.prAttached) {
        saveProvBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          try {
            saveSettings();
          } catch (e) {
            console.error("saveProvidersSettings failed", e);
          }
        });
        saveProvBtn.dataset.prAttached = "1";
        console.log("[promptiply] attachCoreListeners: bound save-providers-settings");
        attachedAny = true;
      }

      const newProfileBtn = document.getElementById("new-profile");
      if (newProfileBtn && !newProfileBtn.dataset.prAttached) {
        newProfileBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          try {
            openWizard();
          } catch (e) {
            console.error("openWizard failed", e);
          }
        });
        newProfileBtn.dataset.prAttached = "1";
        console.log("[promptiply] attachCoreListeners: bound new-profile");
        attachedAny = true;
      }

      const refineHotkeyRecord = document.getElementById("refine-hotkey-record");
      if (refineHotkeyRecord && !refineHotkeyRecord.dataset.prAttached) {
        refineHotkeyRecord.addEventListener("click", () => {
          if (isRecordingHotkey) stopRecordingHotkey();
          else startRecordingHotkey();
        });
        refineHotkeyRecord.dataset.prAttached = "1";
        attachedAny = true;
      }

      // Mode change handler
      const mode = document.getElementById("mode");
      if (mode && !mode.dataset.prAttached) {
        mode.addEventListener("change", () => {
          updateProviderDisabled();
          chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
            const cur = data[STORAGE_SETTINGS] || {};
            cur.mode = mode.value;
            chrome.storage.local.set({ [STORAGE_SETTINGS]: cur });
          });
        });
        mode.dataset.prAttached = "1";
        attachedAny = true;
      }

      // Model select handlers
      const openaiModelSelect = document.getElementById("openai-model-select");
      const openaiModelCustom = document.getElementById("openai-model-custom");
      if (openaiModelSelect && !openaiModelSelect.dataset.prAttached) {
        openaiModelSelect.addEventListener("change", () => {
          if (openaiModelSelect.value === "custom") {
            openaiModelCustom?.classList.remove("custom-input-hidden");
          } else {
            openaiModelCustom?.classList.add("custom-input-hidden");
          }
        });
        openaiModelSelect.dataset.prAttached = "1";
      }

      const anthropicModelSelect = document.getElementById("anthropic-model-select");
      const anthropicModelCustom = document.getElementById("anthropic-model-custom");
      if (anthropicModelSelect && !anthropicModelSelect.dataset.prAttached) {
        anthropicModelSelect.addEventListener("change", () => {
          if (anthropicModelSelect.value === "custom") {
            anthropicModelCustom?.classList.remove("custom-input-hidden");
          } else {
            anthropicModelCustom?.classList.add("custom-input-hidden");
          }
        });
        anthropicModelSelect.dataset.prAttached = "1";
      }

      // Wizard buttons
      const wizardCancel = document.getElementById("wizard-cancel");
      if (wizardCancel && !wizardCancel.dataset.prAttached) {
        wizardCancel.addEventListener("click", closeWizard);
        wizardCancel.dataset.prAttached = "1";
      }

      const wizardBack = document.getElementById("wizard-back");
      if (wizardBack && !wizardBack.dataset.prAttached) {
        wizardBack.addEventListener("click", () => setWizardStep(wizardState.step - 1));
        wizardBack.dataset.prAttached = "1";
      }

      const wizardNext = document.getElementById("wizard-next");
      if (wizardNext && !wizardNext.dataset.prAttached) {
        wizardNext.addEventListener("click", () => {
          // Capture current inputs
          if (wizardState.step === 1) {
            const name = document.getElementById("w-name")?.value?.trim();
            if (!name) return;
            wizardState.name = name;
            wizardState.persona = document.getElementById("w-persona")?.value?.trim() || "";
            wizardState.tone = document.getElementById("w-tone")?.value?.trim() || "";
          } else if (wizardState.step === 2) {
            wizardState.guidelines = (document.getElementById("w-guidelines")?.value || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            wizardState.evolvingTopics = parseTopicsInput(document.getElementById("w-evolving-topics")?.value || "");
          }
          setWizardStep(wizardState.step + 1);
        });
        wizardNext.dataset.prAttached = "1";
      }

      const wizardSave = document.getElementById("wizard-save");
      if (wizardSave && !wizardSave.dataset.prAttached) {
        wizardSave.addEventListener("click", () => {
          chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
            const cur = normalizeProfilesState(data[STORAGE_PROFILES]);
            if (wizardState.editingId) {
              const idx = cur.list.findIndex((p) => p.id === wizardState.editingId);
              if (idx >= 0) {
                cur.list[idx] = {
                  ...cur.list[idx],
                  name: wizardState.name,
                  persona: wizardState.persona,
                  tone: wizardState.tone,
                  styleGuidelines: wizardState.guidelines,
                  evolving_profile: buildEvolutionFromWizard(cur.list[idx].evolving_profile),
                };
              }
            } else {
              const id = `p_${Date.now()}`;
              const prof = {
                id,
                name: wizardState.name,
                persona: wizardState.persona,
                tone: wizardState.tone,
                styleGuidelines: wizardState.guidelines || [],
                constraints: [],
                examples: [],
                domainTags: [],
                evolving_profile: buildEvolutionFromWizard(),
              };
              cur.list.push(prof);
              if (!cur.activeProfileId) cur.activeProfileId = id;
            }
            chrome.storage.sync.set({ [STORAGE_PROFILES]: cur }, () => {
              renderProfiles(cur);
              closeWizard();
            });
          });
        });
        wizardSave.dataset.prAttached = "1";
      }

      // Onboarding buttons
      const onboardingSkip = document.getElementById("onboarding-skip");
      if (onboardingSkip && !onboardingSkip.dataset.prAttached) {
        onboardingSkip.addEventListener("click", closeOnboardingWizard);
        onboardingSkip.dataset.prAttached = "1";
      }

      const onboardingBack = document.getElementById("onboarding-back");
      if (onboardingBack && !onboardingBack.dataset.prAttached) {
        onboardingBack.addEventListener("click", () => setOnboardingStep(onboardingState.step - 1));
        onboardingBack.dataset.prAttached = "1";
      }

      const onboardingNext = document.getElementById("onboarding-next");
      if (onboardingNext && !onboardingNext.dataset.prAttached) {
        onboardingNext.addEventListener("click", handleOnboardingNext);
        onboardingNext.dataset.prAttached = "1";
      }

      const onboardingFinish = document.getElementById("onboarding-finish");
      if (onboardingFinish && !onboardingFinish.dataset.prAttached) {
        onboardingFinish.addEventListener("click", finishOnboarding);
        onboardingFinish.dataset.prAttached = "1";
      }

      // Restore Defaults button
      const restoreBtn = document.getElementById("restore-defaults");
      if (restoreBtn && !restoreBtn.dataset.prAttached) {
        restoreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showRestoreConfirmation();
        });
        restoreBtn.dataset.prAttached = "1";
        console.log("[promptiply] attachCoreListeners: bound restore-defaults");
      }

      // Export profiles button
      const exportBtn = document.getElementById("export-profiles");
      if (exportBtn && !exportBtn.dataset.prAttached) {
        exportBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          exportProfiles();
        });
        exportBtn.dataset.prAttached = "1";
        console.log("[promptiply] attachCoreListeners: bound export-profiles");
      }

      // Import profiles button
      const importBtn = document.getElementById("import-profiles");
      if (importBtn && !importBtn.dataset.prAttached) {
        importBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showImportModal();
        });
        importBtn.dataset.prAttached = "1";
        console.log("[promptiply] attachCoreListeners: bound import-profiles");
      }

      const evolvingApply = document.getElementById("evolving-apply");
      if (evolvingApply && !evolvingApply.dataset.prAttached) {
        evolvingApply.addEventListener("click", (e) => {
          e.stopPropagation();
          handleEvolvingApply();
        });
        evolvingApply.dataset.prAttached = "1";
      }

      const evolvingReset = document.getElementById("evolving-reset");
      if (evolvingReset && !evolvingReset.dataset.prAttached) {
        evolvingReset.addEventListener("click", (e) => {
          e.stopPropagation();
          handleEvolvingReset();
        });
        evolvingReset.dataset.prAttached = "1";
      }

      const success = attachedAny && tabEls.length > 0;
      console.log("[promptiply] attachCoreListeners result:", { attachedAny, tabCount: tabEls.length, success });
      return success;
    } catch (e) {
      console.warn("attachCoreListeners error", e);
      return false;
    }
  }

  // Initialize: Try immediate, then DOMContentLoaded, then MutationObserver
  if (!attachCoreListeners()) {
    document.addEventListener("DOMContentLoaded", attachCoreListeners);
    try {
      const mo = new MutationObserver((mutations, obs) => {
        if (attachCoreListeners()) obs.disconnect();
      });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 5000);
    } catch (_) {}
  }

  // Delegated click handler as last-resort fallback
  document.addEventListener(
    "click",
    (ev) => {
      try {
        const target = ev.target;
        if (!target || !target.closest) return;

        const tab = target.closest(".tab");
        if (tab && tab.dataset && tab.dataset.tab) {
          // Skip if already has direct listener
          if (tab.dataset.prAttached) return;
          console.log("[promptiply] delegated tab click ->", tab.dataset.tab);
          selectTab(tab.dataset.tab);
          return;
        }

        const runOnboarding = target.closest("#run-onboarding");
        if (runOnboarding) {
          // Skip if already has direct listener
          if (runOnboarding.dataset.prAttached) return;
          console.log("[promptiply] delegated click: run-onboarding");
          try {
            openOnboardingWizard();
          } catch (e) {
            console.error(e);
          }
          return;
        }

        const saveSettingsBtn = target.closest("#save-settings");
        if (saveSettingsBtn) {
          // Skip if already has direct listener
          if (saveSettingsBtn.dataset.prAttached) return;
          console.log("[promptiply] delegated click: save-settings");
          try {
            saveSettings();
          } catch (e) {
            console.error(e);
          }
          return;
        }

        const saveProvidersSettingsBtn = target.closest("#save-providers-settings");
        if (saveProvidersSettingsBtn) {
          // Skip if already has direct listener
          if (saveProvidersSettingsBtn.dataset.prAttached) return;
          console.log("[promptiply] delegated click: save-providers-settings");
          try {
            saveSettings();
          } catch (e) {
            console.error(e);
          }
          return;
        }

        const newProfile = target.closest("#new-profile");
        if (newProfile) {
          // Skip if already has direct listener
          if (newProfile.dataset.prAttached) return;
          console.log("[promptiply] delegated click: new-profile");
          try {
            openWizard();
          } catch (e) {
            console.error(e);
          }
          return;
        }

        const restoreDefaults = target.closest("#restore-defaults");
        if (restoreDefaults) {
          // Skip if already has direct listener
          if (restoreDefaults.dataset.prAttached) return;
          console.log("[promptiply] delegated click: restore-defaults");
          try {
            showRestoreConfirmation();
          } catch (e) {
            console.error(e);
          }
          return;
        }

        const exportProfilesBtn = target.closest("#export-profiles");
        if (exportProfilesBtn) {
          // Skip if already has direct listener
          if (exportProfilesBtn.dataset.prAttached) return;
          console.log("[promptiply] delegated click: export-profiles");
          try {
            exportProfiles();
          } catch (e) {
            console.error(e);
          }
          return;
        }

        const importProfilesBtn = target.closest("#import-profiles");
        if (importProfilesBtn) {
          // Skip if already has direct listener
          if (importProfilesBtn.dataset.prAttached) return;
          console.log("[promptiply] delegated click: import-profiles");
          try {
            showImportModal();
          } catch (e) {
            console.error(e);
          }
          return;
        }
      } catch (e) {
        /* ignore */
      }
    },
    true
  );

  // Load initial data
  chrome.storage.local.get([STORAGE_SETTINGS], (data) => {
    const s = data[STORAGE_SETTINGS] || { mode: "webui" };
    const mode = document.getElementById("mode");
    const provider = document.getElementById("provider");
    const openaiKey = document.getElementById("openai-key");
    const openaiModelSelect = document.getElementById("openai-model-select");
    const openaiModelCustom = document.getElementById("openai-model-custom");
    const anthropicKey = document.getElementById("anthropic-key");
    const anthropicModelSelect = document.getElementById("anthropic-model-select");
    const anthropicModelCustom = document.getElementById("anthropic-model-custom");

    if (mode) mode.value = s.mode || "webui";
    if (provider) provider.value = s.provider || (s.openaiKey ? "openai" : s.anthropicKey ? "anthropic" : "openai");
    if (openaiKey) openaiKey.value = s.openaiKey || "";
    if (openaiModelSelect && openaiModelCustom) setModelSelect(openaiModelSelect, openaiModelCustom, s.openaiModel || "gpt-5-nano");
    if (anthropicKey) anthropicKey.value = s.anthropicKey || "";
    if (anthropicModelSelect && anthropicModelCustom) setModelSelect(anthropicModelSelect, anthropicModelCustom, s.anthropicModel || "claude-haiku-4-5");
    recordedHotkey = s.refineHotkey || getDefaultHotkey();
    updateHotkeyDisplay();
    updateProviderDisabled();
  });

  chrome.storage.sync.get([STORAGE_PROFILES], (data) => {
    const p = normalizeProfilesState(data[STORAGE_PROFILES]);
    renderProfiles(p);
  });

  // Load predefined profiles from storage, then render
  loadPredefinedProfiles(() => {
    renderPredefinedProfiles();
  });

  // Display version
  const versionEl = document.getElementById("version");
  if (versionEl && chrome.runtime?.getManifest) {
    const m = chrome.runtime.getManifest();
    if (m?.version) versionEl.textContent = `v${m.version}`;
  }

  // Auto-open onboarding on first load
  try {
    chrome.storage.local.get([STORAGE_ONBOARDING], (data) => {
      if (!data[STORAGE_ONBOARDING]) setTimeout(() => openOnboardingWizard(), 500);
    });
  } catch (_) {}

  // Auto-import predefined profiles on first load
  autoImportPredefinedProfiles();

  console.log("[promptiply] Options script loaded");
  window.__PR_OPTIONS_LOADED = true;
})();
