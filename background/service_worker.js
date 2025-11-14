// promptiply background service worker
// Note: Service workers can't use ES6 imports, so we'll load the handler dynamically
let activeRefinementTabId = null;
let mlcEngineHandler = null;
let ExtensionServiceWorkerMLCEngineHandler = null;

const EVOLUTION_TOPIC_LIMIT = 10;
const DEFAULT_PROFILE_STATE = Object.freeze({ list: [], activeProfileId: null });
const STOP_WORDS = new Set([
  'the','and','for','that','with','this','from','your','about','please','could','would','should',
  'when','where','what','why','how','have','need','like','into','some','more','than','then','them',
  'they','their','there','here','been','also','just','make','made','will','step','steps','help',
  'question','questions','issue','issues','problem','problems','project','projects','using','user',
  'users','want','wants','goal','goals','request','asks','asking','provide','giving','give','take'
]);

function createEmptyEvolution() {
  return {
    topics: [],
    lastUpdated: null,
    usageCount: 0,
    lastPrompt: '',
  };
}

function normalizeEvolution(evolution) {
  if (!evolution || typeof evolution !== 'object') {
    return createEmptyEvolution();
  }

  const rawTopics = Array.isArray(evolution.topics) ? evolution.topics : [];
  const now = new Date().toISOString();
  
  // Migrate from old string format to new object format
  const topics = rawTopics.map((topic) => {
    // If it's already an object, normalize it
    if (topic && typeof topic === 'object') {
      return {
        name: String(topic.name || topic).trim(),
        count: typeof topic.count === 'number' && Number.isFinite(topic.count) && topic.count > 0 ? topic.count : 1,
        lastUsed: typeof topic.lastUsed === 'string' ? topic.lastUsed : (topic.lastUsed || now),
      };
    }
    // If it's a string (old format), convert to object
    const name = String(topic || '').trim();
    if (!name) return null;
    return {
      name,
      count: 1,
      lastUsed: now,
    };
  }).filter(Boolean).slice(0, EVOLUTION_TOPIC_LIMIT);

  return {
    topics,
    lastUpdated: typeof evolution.lastUpdated === 'string' ? evolution.lastUpdated : null,
    usageCount:
      typeof evolution.usageCount === 'number' && Number.isFinite(evolution.usageCount)
        ? evolution.usageCount
        : 0,
    lastPrompt: typeof evolution.lastPrompt === 'string' ? evolution.lastPrompt : '',
  };
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    ...profile,
    evolving_profile: normalizeEvolution(profile.evolving_profile),
  };
}

function normalizeProfilesState(raw) {
  const state = raw && typeof raw === 'object' ? { ...DEFAULT_PROFILE_STATE, ...raw } : { ...DEFAULT_PROFILE_STATE };
  state.list = Array.isArray(state.list)
    ? state.list
        .map(normalizeProfile)
        .filter(Boolean)
    : [];
  return state;
}

function deriveTopicsFromContext(prompt, refined) {
  const text = `${prompt || ''}\n${refined || ''}`;
  const lower = text.toLowerCase();

  const wordPattern = /[a-z0-9+#/\.]{2,}/gi;
  const words = lower.match(wordPattern) || [];

  const filteredWords = words.filter((token) => {
    if (!token) return false;
    if (STOP_WORDS.has(token)) return false;
    if (/^[0-9]+$/.test(token)) return false;
    return token.length >= 3 || /[+#]/.test(token);
  });

  const tokenCounts = new Map();
  const bigramCounts = new Map();

  filteredWords.forEach((token) => {
    tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  });

  for (let i = 0; i < filteredWords.length - 1; i += 1) {
    const first = filteredWords[i];
    const second = filteredWords[i + 1];
    if (!first || !second) continue;
    const phrase = `${first} ${second}`;
    bigramCounts.set(phrase, (bigramCounts.get(phrase) || 0) + 1);
  }

  const candidates = [];

  Array.from(bigramCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, EVOLUTION_TOPIC_LIMIT * 2)
    .forEach(([phrase, score]) => {
      candidates.push({ topic: normalizeTokenToTopic(phrase), score: score * 2 });
    });

  Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([token, score]) => {
      candidates.push({ topic: normalizeTokenToTopic(token), score });
    });

  const seen = new Set();
  const results = [];
  for (const candidate of candidates) {
    if (!candidate.topic) continue;
    const key = candidate.topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(candidate.topic);
    if (results.length >= EVOLUTION_TOPIC_LIMIT) break;
  }

  return results;
}

function normalizeTokenToTopic(token) {
  if (!token) return '';
  if (token.includes(' ')) {
    const pieces = token
      .split(' ')
      .map((part) => normalizeTokenToTopic(part))
      .filter(Boolean);
    return pieces.join(' ').trim();
  }

  if (/^[a-z]+$/.test(token)) {
    return token.charAt(0).toUpperCase() + token.slice(1);
  }

  if (/^[a-z0-9]+$/i.test(token)) {
    return token.toUpperCase();
  }

  return token.toUpperCase();
}

function extractJsonSegment(rawText) {
  if (!rawText) return null;
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function normalizeRefinementResult(rawText, originalPrompt) {
  const raw = rawText ?? '';
  const result = {
    refinedPrompt: raw.trim(),
    topics: [],
    rawText: raw,
  };

  const jsonSegment = extractJsonSegment(raw);
  if (jsonSegment) {
    try {
      const parsed = JSON.parse(jsonSegment);
      const refinedCandidate = parsed.refinedPrompt || parsed.refined_prompt || parsed.refined || parsed.prompt;
      const topicsCandidate = Array.isArray(parsed.topics)
        ? parsed.topics
        : Array.isArray(parsed.Tags)
        ? parsed.Tags
        : [];

      if (typeof refinedCandidate === 'string' && refinedCandidate.trim()) {
        result.refinedPrompt = refinedCandidate.trim();
      }

      if (Array.isArray(topicsCandidate)) {
        result.topics = topicsCandidate
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .filter(Boolean)
          .slice(0, EVOLUTION_TOPIC_LIMIT);
      }
    } catch (error) {
      console.warn('[promptiply:bg] Failed to parse refinement JSON', error);
    }
  }

  if (!result.topics.length) {
    result.topics = deriveTopicsFromContext(originalPrompt, result.refinedPrompt);
  }

  return result;
}

function truncatePrompt(prompt, maxLen) {
  if (!prompt) return '';
  if (prompt.length <= maxLen) return prompt;
  return `${prompt.slice(0, maxLen - 1)}…`;
}

function calculateTopicScore(topic, now, maxCount) {
  if (!topic || !topic.name) return 0;
  
  // Frequency component: normalized count (0-1)
  const frequencyWeight = 0.4;
  const frequencyScore = maxCount > 0 ? topic.count / maxCount : 0;
  
  // Recency component: decay function based on days since last used
  const recencyWeight = 0.6;
  let recencyScore = 0;
  if (topic.lastUsed) {
    const lastUsedDate = new Date(topic.lastUsed);
    const nowDate = new Date(now);
    const daysSinceLastUsed = (nowDate - lastUsedDate) / (1000 * 60 * 60 * 24);
    // Decay function: 1 / (1 + days) - more recent = higher score
    recencyScore = 1 / (1 + daysSinceLastUsed);
  } else {
    // If no lastUsed, treat as very old
    recencyScore = 0;
  }
  
  // Combined score
  const score = (frequencyScore * frequencyWeight) + (recencyScore * recencyWeight);
  return score;
}

function evolveProfile(profile, { prompt, refined, topics }) {
  const normalized = normalizeProfile(profile);
  if (!normalized) return { changed: false, profile };

  // Extract topic names from provided topics (can be strings or objects)
  const providedTopicNames = Array.isArray(topics)
    ? topics
        .map((topic) => {
          if (typeof topic === 'string') return topic.trim();
          if (topic && typeof topic === 'object' && topic.name) return String(topic.name).trim();
          return '';
        })
        .filter(Boolean)
    : [];

  // Get resolved topic names (from LLM or fallback to context extraction)
  const resolvedTopicNames = providedTopicNames.length 
    ? providedTopicNames 
    : deriveTopicsFromContext(prompt, refined);

  const now = new Date().toISOString();
  const existingTopics = Array.isArray(normalized.evolving_profile.topics)
    ? normalized.evolving_profile.topics.slice()
    : [];

  // Helper function to normalize topic name for comparison (case-insensitive)
  const normalizeTopicName = (name) => String(name || '').trim().toLowerCase();

  // Update existing topics or add new ones
  const topicMap = new Map();
  
  // First, add all existing topics to the map
  existingTopics.forEach((topic) => {
    const key = normalizeTopicName(topic.name);
    topicMap.set(key, { ...topic });
  });

  // Process resolved topics
  resolvedTopicNames.forEach((topicName) => {
    const key = normalizeTopicName(topicName);
    if (topicMap.has(key)) {
      // Existing topic: increment count and update lastUsed
      const existing = topicMap.get(key);
      topicMap.set(key, {
        ...existing,
        count: (existing.count || 1) + 1,
        lastUsed: now,
      });
    } else {
      // New topic: add with count 1
      topicMap.set(key, {
        name: String(topicName).trim(),
        count: 1,
        lastUsed: now,
      });
    }
  });

  // Convert map to array and calculate max count for scoring
  const allTopics = Array.from(topicMap.values());
  const maxCount = Math.max(...allTopics.map((t) => t.count || 1), 1);

  // Calculate scores and sort by score (descending), then by lastUsed (descending) as tiebreaker
  const scoredTopics = allTopics.map((topic) => ({
    ...topic,
    score: calculateTopicScore(topic, now, maxCount),
  }));

  scoredTopics.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.0001) {
      return b.score - a.score; // Higher score first
    }
    // Tiebreaker: more recent lastUsed first
    const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
    const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
    return bTime - aTime;
  });

  // Keep top N topics and remove score field
  const finalTopics = scoredTopics
    .slice(0, EVOLUTION_TOPIC_LIMIT)
    .map(({ score, ...topic }) => topic);

  // Check if topics changed
  const changed =
    finalTopics.length !== existingTopics.length ||
    finalTopics.some((topic, idx) => {
      const existing = existingTopics[idx];
      if (!existing) return true;
      return (
        normalizeTopicName(topic.name) !== normalizeTopicName(existing.name) ||
        topic.count !== existing.count ||
        topic.lastUsed !== existing.lastUsed
      );
    });

  const updated = {
    ...normalized,
    evolving_profile: {
      ...normalized.evolving_profile,
      topics: finalTopics,
      usageCount: (normalized.evolving_profile.usageCount || 0) + 1,
      lastUpdated: now,
      lastPrompt: truncatePrompt(prompt, 200),
    },
  };

  return { changed: true, profile: updated };
}

async function applyProfileEvolution({ profilesState, activeProfileIndex, prompt, refined, topics }) {
  if (!profilesState || typeof activeProfileIndex !== 'number' || activeProfileIndex < 0) return;

  const currentProfile = profilesState.list[activeProfileIndex];
  if (!currentProfile) return;

  const { changed, profile } = evolveProfile(currentProfile, { prompt, refined, topics });
  if (!changed) return;

  profilesState.list = profilesState.list.slice();
  profilesState.list[activeProfileIndex] = profile;

  try {
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ profiles: profilesState }, () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.warn('[promptiply:bg] Failed to persist evolved profile', error);
  }
}

// Load web-llm handler dynamically
async function loadMLCHandler() {
  if (ExtensionServiceWorkerMLCEngineHandler) {
    return ExtensionServiceWorkerMLCEngineHandler;
  }

  try {
    console.log('[promptiply:bg] Loading web-llm handler...');
    // Import the handler module dynamically
    // Note: This won't work in service workers with ES6 imports, we'll use the offscreen approach instead
    // The handler is loaded in the offscreen document
    return null;
  } catch (error) {
    console.error('[promptiply:bg] Failed to load MLCEngineHandler:', error);
    return null;
  }
}

// Set up web-llm service worker handler connection
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'web_llm_service_worker') {
    console.log('[promptiply:bg] Web-LLM service worker connection established');
    // This will be handled by the offscreen document
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'PR_REFINEMENT_REQUEST') {
    // Store the active tab ID for progress updates
    if (sender?.tab?.id) {
      activeRefinementTabId = sender.tab.id;
    }

    handleRefinement(msg.payload, sender).then((res) => {
      activeRefinementTabId = null;
      console.log('[promptiply:bg] Sending response back to content script:', {
        ok: true,
        status: 'ok',
        refinedLength: res?.refinedPrompt?.length || 0,
        refinedPreview: res?.refinedPrompt?.slice(0, 100)
      });
      sendResponse({
        ok: true,
        status: 'ok',
        refined: res?.refinedPrompt || '',
        topics: Array.isArray(res?.topics) ? res.topics : [],
        raw: res?.rawText,
      });
    }).catch((err) => {
      activeRefinementTabId = null;
      console.error('[promptiply:bg] Refinement error:', err);
      sendResponse({ ok: false, err: String(err.message || err), error: String(err.message || err) });
    });
    return true; // Keep channel open for async response
  }

  // Relay progress updates from offscreen to content script
  if (msg && msg.type === 'PR_LOCAL_PROGRESS') {
    if (activeRefinementTabId) {
      chrome.tabs.sendMessage(activeRefinementTabId, {
        type: 'PR_PROGRESS_UPDATE',
        payload: msg.payload,
      }).catch(() => {
        // Ignore errors if tab is closed or content script not ready
      });
    }
    // Don't send response for progress updates
    return false;
  }
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'refine') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'PR_TRIGGER_REFINE' });
      }
    });
  } else if (cmd === 'switch-profile') {
    // Cycle to the next profile
    chrome.storage.sync.get(['profiles'], (data) => {
      const profilesState = normalizeProfilesState(data.profiles);

      if (!profilesState.list || profilesState.list.length === 0) {
        console.log('[promptiply:bg] No profiles available to switch');
        return;
      }

      // Find the index of the currently active profile
      const currentIndex = profilesState.list.findIndex((p) => p.id === profilesState.activeProfileId);

      // Calculate the next profile index (cycle through, including null/"no profile")
      // We treat -1 (no active profile) as position before the first profile
      let nextIndex;
      if (currentIndex === -1) {
        // Currently no profile selected, select the first one
        nextIndex = 0;
      } else if (currentIndex === profilesState.list.length - 1) {
        // At the end, cycle back to "no profile" (null)
        nextIndex = -1;
      } else {
        // Move to the next profile
        nextIndex = currentIndex + 1;
      }

      // Set the new active profile
      const newActiveProfileId = nextIndex === -1 ? null : profilesState.list[nextIndex].id;
      profilesState.activeProfileId = newActiveProfileId;

      chrome.storage.sync.set({ profiles: profilesState }, () => {
        const profileName = nextIndex === -1
          ? '(no profile)'
          : (profilesState.list[nextIndex].name || profilesState.list[nextIndex].id);
        console.log('[promptiply:bg] Switched to profile:', profileName);

        // Show a notification to the user
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'PR_PROFILE_SWITCHED',
              payload: { profileName }
            }).catch(() => {
              // Ignore errors if content script is not ready
            });
          }
        });
      });
    });
  }
});

// Open options page on first install to start onboarding
try {
  chrome.runtime.onInstalled.addListener((details) => {
    try {
      if (details && details.reason === 'install') {
        console.log('[promptiply:bg] First install detected - opening onboarding');
        // Create sensible default profile(s) in sync storage if none exist
        try {
          chrome.storage.sync.get(['profiles'], (data) => {
            const existing = data && data.profiles;
            if (!existing || !existing.list || existing.list.length === 0) {
              const defaultProfile = {
                id: 'default',
                name: 'Default',
                persona: 'General assistant',
                instructions: 'Be concise, ask clarifying questions when needed.',
                temperature: 0.2,
                evolving_profile: createEmptyEvolution(),
              };
              const payload = { list: [defaultProfile], activeProfileId: 'default' };
              chrome.storage.sync.set({ profiles: payload }, () => {
                console.log('[promptiply:bg] Default profile created on install');
              });
            }
          });
        } catch (e) {
          console.warn('[promptiply:bg] Failed to create default profiles:', e);
        }

        chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html?onboard=1') }).catch(() => {});
      }
    } catch (e) {
      console.error('[promptiply:bg] onInstalled handler error:', e);
    }
  });
} catch (e) {
  // Some environments may not allow setting onInstalled here — ignore safely
}
async function handleRefinement(payload, sender) {
  const { prompt } = payload || {};
  console.log('[promptiply:bg] Received refinement request', { hasPayload: !!payload, promptPreview: prompt?.slice(0, 100) });

  if (!prompt || !prompt.trim()) {
    throw new Error('No prompt provided');
  }

  // Load settings
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (data) => {
      resolve(data.settings || {});
    });
  });

  const mode = settings.mode || 'webui';
  const provider = settings.provider || 'openai';

  // Detect site from sender URL
  const senderUrl = sender?.tab?.url || '';
  let site = null;
  if (senderUrl.includes('chat.openai.com') || senderUrl.includes('chatgpt.com')) {
    site = 'chatgpt';
  } else if (senderUrl.includes('claude.ai')) {
    site = 'claude';
  }

  console.log('[promptiply:bg] Mode/provider/model', { mode, provider, model: settings[provider === 'openai' ? 'openaiModel' : 'anthropicModel'] });

  // Load active profile
  const profilesState = await new Promise((resolve) => {
    chrome.storage.sync.get(['profiles'], (data) => {
      resolve(normalizeProfilesState(data.profiles));
    });
  });

  const activeProfileIndex = profilesState.list.findIndex((p) => p.id === profilesState.activeProfileId);
  const activeProfile = activeProfileIndex >= 0 ? profilesState.list[activeProfileIndex] : null;

  const system = buildSystemPrompt(activeProfile);
  const user = buildUserPrompt(prompt, activeProfile);

  if (mode === 'api') {
    if (provider === 'openai') {
      const result = await refineWithOpenAI({ system, user, settings, originalPrompt: prompt });
      await applyProfileEvolution({
        profilesState,
        activeProfileIndex,
        prompt,
        refined: result.refinedPrompt,
        topics: result.topics,
      });
      return result;
    } else if (provider === 'anthropic') {
      const result = await refineWithAnthropic({ system, user, settings, originalPrompt: prompt });
      await applyProfileEvolution({
        profilesState,
        activeProfileIndex,
        prompt,
        refined: result.refinedPrompt,
        topics: result.topics,
      });
      return result;
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } else if (mode === 'webui') {
    // WebUI mode uses the site the user is on, not the provider setting
    if (!site) {
      throw new Error('Could not determine site for WebUI mode');
    }
    const result = await refineViaWebUI({ site, system, user, originalPrompt: prompt });
    await applyProfileEvolution({
      profilesState,
      activeProfileIndex,
      prompt,
      refined: result.refinedPrompt,
      topics: result.topics,
    });
    return result;
  } else if (mode === 'local') {
    const result = await refineWithLocal({ system, user, originalPrompt: prompt });
    await applyProfileEvolution({
      profilesState,
      activeProfileIndex,
      prompt,
      refined: result.refinedPrompt,
      topics: result.topics,
    });
    return result;
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }
}

async function refineWithOpenAI({ system, user, settings, originalPrompt }) {
  const apiKey = settings.openaiKey;
  const model = settings.openaiModel || 'gpt-5-nano';

  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('[promptiply:bg] OpenAI request', { model, sysLen: system.length, userLen: user.length, hasSystem: !!system, systemPreview: system?.slice(0, 100) });

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const requestBody = {
    model,
    messages,
  };

  // Heuristic: some models (like gpt-5-nano) don't support temperature
  // Check if model name suggests it doesn't support params
  const supportsTemp = !model.includes('nano') && !model.includes('micro');
  if (supportsTemp) {
    requestBody.temperature = 0.2;
  }

  // Try JSON mode first, then fallback to plain text
  try {
    requestBody.response_format = { type: 'json_object' };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[promptiply:bg] OpenAI HTTP error (json mode)', res.status, errBody);

      // If 400 error, retry without response_format
      if (res.status === 400) {
        console.log('[promptiply:bg] Retrying OpenAI without response_format');
        delete requestBody.response_format;

        const retryRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!retryRes.ok) {
          const retryErrBody = await retryRes.text();
          console.error('[promptiply:bg] OpenAI HTTP error (plain mode)', retryRes.status, retryErrBody);
          throw new Error(`OpenAI API error: ${retryRes.status} ${retryErrBody}`);
        }

        const retryData = await retryRes.json();
        const text = retryData.choices?.[0]?.message?.content || '';
        console.log('[promptiply:bg] OpenAI response (plain mode)', { length: text.length });
        return normalizeRefinementResult(text, originalPrompt);
      } else {
        throw new Error(`OpenAI API error: ${res.status} ${errBody}`);
      }
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    console.log('[promptiply:bg] OpenAI response (json mode)', { length: text.length });
    return normalizeRefinementResult(text, originalPrompt);
  } catch (e) {
    if (e.message && e.message.includes('OpenAI API error')) {
      throw e;
    }
    console.error('[promptiply:bg] OpenAI fetch error:', e);
    throw new Error(`OpenAI API error: ${e.message}`);
  }
}

async function refineWithAnthropic({ system, user, settings, originalPrompt }) {
  const apiKey = settings.anthropicKey;
  const model = settings.anthropicModel || 'claude-haiku-4-5';

  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  console.log('[promptiply:bg] Anthropic request', { model, sysLen: system.length, userLen: user.length, hasSystem: !!system, systemPreview: system?.slice(0, 100) });

  // Anthropic Messages API structure
  // https://docs.anthropic.com/en/api/messages
  const messages = [
    {
      role: 'user',
      content: user
    }
  ];

  const requestBody = {
    model: model,
    messages: messages,
    max_tokens: 4096, // Required by Anthropic API
  };

  // Add system prompt if provided
  if (system && system.trim()) {
    requestBody.system = system;
  }

  // Add temperature (optional, defaults to 1.0)
  // Using 0.2 for more deterministic refinement
  requestBody.temperature = 0.2;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[promptiply:bg] Anthropic HTTP error', res.status, errBody);

      let errorMessage = `Anthropic API error: ${res.status}`;
      try {
        const errJson = JSON.parse(errBody);
        errorMessage += ` - ${errJson.error?.message || errBody}`;
      } catch (_) {
        errorMessage += ` - ${errBody}`;
      }

      throw new Error(errorMessage);
    }

    const data = await res.json();

    // Anthropic response structure:
    // {
    //   "content": [
    //     { "type": "text", "text": "..." }
    //   ],
    //   ...
    // }
    let text = '';

    if (data.content && Array.isArray(data.content)) {
      // Extract text from all text content blocks
      const textBlocks = data.content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text);
      text = textBlocks.join('\n');
    }
    
    if (!text && data.text) {
      // Fallback if structure is different
      text = data.text;
    }
    
    console.log('[promptiply:bg] Anthropic response', {
      length: text.length,
      contentBlocks: data.content?.length || 0,
      preview: text.slice(0, 100)
    });

    if (!text || !text.trim()) {
      throw new Error('Empty response from Anthropic API');
    }
    
    return normalizeRefinementResult(text, originalPrompt);
  } catch (e) {
    if (e.message && e.message.includes('Anthropic API error')) {
      throw e;
    }
    console.error('[promptiply:bg] Anthropic fetch error:', e);
    throw new Error(`Anthropic API error: ${e.message}`);
  }
}

async function refineViaWebUI({ site, system, user, originalPrompt }) {
  const url = site === 'claude' ? 'https://claude.ai/' : 'https://chat.openai.com/';
  const composed = `${system}\n\n${user}`;
  let previousActiveTabId = null;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    previousActiveTabId = activeTab?.id || null;
  } catch (_) {}

  const tab = await chrome.tabs.create({ url, active: false });

  try {
    await waitForTabComplete(tab.id);

    if (site === 'claude') {
      await chrome.tabs.update(tab.id, { active: true });
      await new Promise(r => setTimeout(r, 1500));
    } else {
      console.log('[promptiply:bg] ChatGPT mode - keeping tab inactive until response completes');
    }

    // Inject automation script according to site with timeout
    let result = '';
    try {
      const scriptPromise = chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: automateRefinement,
        args: [site, composed]
      });
      
      // For ChatGPT, activate tab after a delay so script can detect completion
      if (site !== 'claude') {
        // Activate tab after 5 seconds (should give ChatGPT time to start responding)
        setTimeout(async () => {
          try {
            await chrome.tabs.update(tab.id, { active: true });
            console.log('[promptiply:bg] ChatGPT tab activated after delay to detect completion');
          } catch (e) {
            console.error('[promptiply:bg] Error activating ChatGPT tab:', e);
          }
        }, 5000);
      }
      
      // Add 60 second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('WebUI automation timeout')), 60000);
      });

      const [{ result: automationResult }] = await Promise.race([scriptPromise, timeoutPromise]);
      result = automationResult || '';
      console.log('[promptiply:bg] WebUI result received', {
        length: result.length,
        preview: result.slice(0, 200),
        isEmpty: !result || result.trim().length === 0,
        site
      });

      // Add a small delay to ensure the result is fully captured before closing the tab
      await new Promise(r => setTimeout(r, 500));
      console.log('[promptiply:bg] Waited 500ms before closing tab to ensure result is captured');

    } catch (e) {
      console.error('[promptiply:bg] WebUI automation error:', e);
      result = '';
    } finally {
      // Always close the tab and restore focus
      if (tab && tab.id) {
        try {
          await chrome.tabs.remove(tab.id);
          console.log('[promptiply:bg] WebUI tab closed');
        } catch (closeErr) {
          console.error('[promptiply:bg] Error closing tab:', closeErr);
        }
      }
      // Reactivate the previously active tab
      if (previousActiveTabId) {
        try {
          await new Promise(r => setTimeout(r, 100));
          await chrome.tabs.update(previousActiveTabId, { active: true });
        } catch (_) {}
      }
    }
    const finalResult = result || '';
    console.log('[promptiply:bg] refineViaWebUI returning result', {
      length: finalResult.length,
      preview: finalResult.slice(0, 200),
      isEmpty: !finalResult || finalResult.trim().length === 0,
      site
    });

    // If we got an empty result, return the original prompt as fallback
    if (!finalResult || finalResult.trim().length === 0) {
      console.warn('[promptiply:bg] WebUI automation returned empty result, using original prompt as fallback');
      return normalizeRefinementResult(originalPrompt, originalPrompt);
    }

    return normalizeRefinementResult(finalResult, originalPrompt);
  } catch (e) {
    console.error('[promptiply:bg] WebUI outer error:', e);
    // Ensure tab is closed even on outer error
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch (_) {}
    }
    if (previousActiveTabId) {
      try {
        await new Promise(r => setTimeout(r, 100));
        await chrome.tabs.update(previousActiveTabId, { active: true });
      } catch (_) {}
    }
    return normalizeRefinementResult(originalPrompt, originalPrompt);
  }
}

async function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function automateRefinement(site, composed) {
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function sendAndReadChatGPT() {
    try {
      console.log('[promptiply:webui] ChatGPT automation starting, composed length:', composed.length);

      // Wait for page to be ready (ChatGPT tab may be in background)
      await delay(1000);

      // Try ChatGPT input selectors - can be textarea or contenteditable
      // Updated selectors for latest ChatGPT UI (as of 2025)
      const selectors = [
        '#prompt-textarea',
        'div[contenteditable="true"][data-id="root"]',
        '#composer-background textarea',
        '.ProseMirror[contenteditable="true"]',
        '[data-testid="composer-input"]',
        'textarea[placeholder*="Message"]',
        'div[contenteditable="true"]',
        'textarea[data-id]',
        'textarea'
      ];
      let input = null;
      for (const sel of selectors) {
        for (let i = 0; i < 20 && !input; i++) {
          await delay(150);
          input = document.querySelector(sel);
          if (input && input.offsetParent !== null) break; // Make sure it's visible
        }
        if (input) break;
      }
      console.log('[promptiply:webui] Found ChatGPT input:', input ? input.tagName || input.className : 'NOT FOUND');
      if (!input) return '';

      // Clear and insert text
      input.focus();
      await delay(50);

      if ('value' in input) {
        // textarea
        input.value = '';
        input.value = composed;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable (ProseMirror)
        const range = document.createRange();
        range.selectNodeContents(input);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        await delay(30);
        try {
          document.execCommand('delete', false);
          document.execCommand('insertText', false, composed);
        } catch (e) {
          input.textContent = composed;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      await delay(200);

      // Find and click send button - Updated selectors for latest ChatGPT UI
      let sendBtn = null;
      const sendBtnSelectors = [
        'button[data-testid="send-button"]',
        'button[data-testid="composer-send-button"]',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
        'button.absolute.rounded-lg',
        'form button[type="submit"]'
      ];

      for (const sel of sendBtnSelectors) {
        sendBtn = document.querySelector(sel);
        if (sendBtn && !sendBtn.disabled) break;
      }

      if (!sendBtn) {
        const form = input.closest('form');
        if (form) sendBtn = form.querySelector('button[type="submit"], button:not([disabled])');
      }

      console.log('[promptiply:webui] Found ChatGPT send button:', sendBtn ? 'YES' : 'NOT FOUND');

      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        console.log('[promptiply:webui] Clicked ChatGPT send button');
      } else {
        // Fallback: try Enter key
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true
        });
        input.dispatchEvent(enterEvent);
        console.log('[promptiply:webui] Triggered Enter key for ChatGPT');
      }

      await delay(300);

      // Wait for assistant response
      let content = '';
      let stableCount = 0;
      const composedStart = composed.slice(0, 50).toLowerCase();

      for (let i = 0; i < 120; i++) { // up to ~30s max
        await delay(250);

        // ChatGPT assistant messages
        const msgs = Array.from(document.querySelectorAll(
          '[data-message-author-role="assistant"], ' +
          '.markdown.prose, ' +
          '[data-testid*="message"][data-message-author-role="assistant"], ' +
          'div[data-message-author-role="assistant"]'
        ));

        const last = msgs[msgs.length - 1];
        if (last) {
          const txt = (last.innerText || last.textContent || '').trim();
          // Make sure it's not our sent message
          if (txt && txt.length > 20 && !txt.toLowerCase().startsWith(composedStart)) {
            if (txt === content) {
              stableCount++;
              if (stableCount >= 4) { // Content stable for 1 second
                console.log('[promptiply:webui] ChatGPT response complete (stable), length:', content.length);
                break;
              }
            } else {
              stableCount = 0;
              content = txt;
              console.log('[promptiply:webui] Found ChatGPT assistant message, length:', content.length);
            }
          }
        }

        // Check if still typing
        const typing = document.querySelector('[data-testid="typing"], [class*="typing"], [aria-label*="typing"]');
        if (!typing && content && content.length > 30 && stableCount >= 2) {
          console.log('[promptiply:webui] ChatGPT response complete (no typing, stable)');
          break;
        }

        // Timeout after max iterations
        if (i === 119 && content) {
          console.log('[promptiply:webui] ChatGPT timeout reached, using current content');
        } else if (i === 119) {
          console.log('[promptiply:webui] ChatGPT timeout reached, NO content found');
        }
      }

      const finalResult = content.trim();
      console.log('[promptiply:webui] Final ChatGPT result:', { length: finalResult.length, preview: finalResult.slice(0, 100) });
      return finalResult;
    } catch (e) {
      console.error('[promptiply:webui] ChatGPT automation error:', e);
      return '';
    }
  }

  async function sendAndReadClaude() {
    try {
      console.log('[promptiply:webui] Claude automation starting, composed length:', composed.length);

      // Wait briefly for page to be ready (we already waited 1.5s after activation)
      await delay(300);

      // Try Claude's ProseMirror input first, then fallback
      // Updated selectors for latest Claude UI (as of 2025)
      const selectors = [
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][placeholder*="Reply"]',
        'div[contenteditable="true"][data-placeholder]',
        '[contenteditable="true"][role="textbox"]',
        '.ProseMirror[contenteditable="true"]',
        '[contenteditable="true"]'
      ];
      let input = null;
      for (const sel of selectors) {
        for (let i = 0; i < 20 && !input; i++) {
          await delay(150);
          input = document.querySelector(sel);
          if (input && input.offsetParent !== null) break; // Make sure it's visible
        }
        if (input) break;
      }
      console.log('[promptiply:webui] Found input:', input ? input.id || input.className : 'NOT FOUND');
      if (!input) return '';

      // Focus and clear
      input.focus();
      await delay(50);

      // Select all content
      const range = document.createRange();
      range.selectNodeContents(input);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      await delay(30);

      // Delete existing content
      try {
        document.execCommand('delete', false);
      } catch (_) {}
      await delay(30);

      // Insert our composed message
      console.log('[promptiply:webui] Inserting composed text, length:', composed.length);
      try {
        document.execCommand('insertText', false, composed);
      } catch (e) {
        // Fallback: direct textContent manipulation
        input.textContent = composed;
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
      }
      await delay(200);

      // Verify text was inserted
      const insertedText = input.innerText || input.textContent || '';
      console.log('[promptiply:webui] Text after insertion:', insertedText.length, 'chars, starts with:', insertedText.slice(0, 50));

      // Find send button - try multiple approaches
      let sendBtn = null;

      // Method 1: Look for button with send-related text/aria
      sendBtn = Array.from(document.querySelectorAll('button')).find(b => {
        const txt = (b.textContent || '').toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return /send|submit/.test(txt) || /send/.test(aria);
      });

      // Method 2: Look for button near the input
      if (!sendBtn) {
        const inputContainer = input.closest('form, div[class*="composer"], div[class*="input"]');
        if (inputContainer) {
          sendBtn = inputContainer.querySelector('button[type="submit"], button:not([disabled])');
        }
      }

      // Method 3: Look for any enabled button that might be send
      if (!sendBtn) {
        sendBtn = document.querySelector('button:not([disabled])');
      }

      console.log('[promptiply:webui] Found send button:', sendBtn ? (sendBtn.textContent || sendBtn.className) : 'NOT FOUND');

      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        console.log('[promptiply:webui] Clicked send button');
      } else {
        // Fallback: try Enter key combo
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        input.dispatchEvent(enterEvent);
        console.log('[promptiply:webui] Triggered Enter key');
      }

      await delay(300);

      // Wait for assistant response
      let content = '';
      let stableCount = 0;
      const composedStart = composed.slice(0, 50).toLowerCase();

      // Find the main content area and sidebar to exclude
      const mainContent = document.querySelector('main, [role="main"], [class*="main"], [class*="content"]');
      const sidebar = document.querySelector('nav[aria-label="Sidebar"], aside, [role="navigation"][class*="sidebar"], [class*="Sidebar"]');

      for (let i = 0; i < 120; i++) { // up to ~30s max
        await delay(250);

        // Claude assistant messages - try multiple selectors
        // First, try to find messages only in the main content area
        // Priority: Claude-specific markdown containers, then general message selectors
        const allPossibleSelectors = [
          'div[class*="standard-markdown"]',
          'div[class*="progressive-markdown"]',
          'div[class*="font-claude-response"]',
          'div[class*="claude-response"]',
          'article',
          '[role="article"]',
          '[data-role="assistant"]',
          '[class*="Message"][class*="assistant"]',
          '[class*="message"][class*="assistant"]',
          '[class*="MessageContent"]',
          '[class*="message-content"]',
          'div[class*="assistant"]',
          '[data-testid*="assistant"]'
        ];

        let msgs = [];
        // Try to find messages in the main content area first
        if (mainContent) {
          for (const sel of allPossibleSelectors) {
            const found = Array.from(mainContent.querySelectorAll(sel));
            if (found.length > 0) {
              msgs = found;
              console.log('[promptiply:webui] Found messages in main content with selector:', sel, 'count:', found.length);
              break;
            }
          }
        }

        // If no messages in main content, search entire document
        if (msgs.length === 0) {
          for (const sel of allPossibleSelectors) {
            const found = Array.from(document.querySelectorAll(sel));
            if (found.length > 0) {
              msgs = found;
              console.log('[promptiply:webui] Found messages with selector:', sel, 'count:', found.length);
              break;
            }
          }
        }

        // If no messages found with specific selectors, try fallback: find all text blocks
        if (msgs.length === 0 && i >= 8) { // Wait at least 2 seconds before fallback
          console.log('[promptiply:webui] No specific messages found, trying fallback selectors');
          const fallbackSelectors = [
            'div[class*="content"]',
            'div[class*="text"]',
            'p',
            'div'
          ];

          for (const sel of fallbackSelectors) {
            const found = Array.from(document.querySelectorAll(sel));
            if (found.length > 0) {
              // Filter to find text containers that might be responses
              const candidates = found.filter(el => {
                const txt = (el.innerText || el.textContent || '').trim();
                if (!txt || txt.length < 50) return false;
                // Exclude if it's the input or contains the input
                const inputEl = document.querySelector('.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]');
                if (inputEl && (el.contains(inputEl) || inputEl.contains(el))) return false;
                // Exclude if it's our composed message
                if (txt.toLowerCase().startsWith(composedStart)) return false;
                // Exclude if it contains the refinement instruction
                if (txt.toLowerCase().includes('refine this prompt')) return false;
                // Exclude Claude disclaimer messages
                if (txt.toLowerCase().includes('claude can make mistakes') ||
                    txt.toLowerCase().includes('please double-check responses') ||
                    txt.toLowerCase().includes('double-check responses')) return false;
                // Exclude CSS/JS code blocks
                if (txt.includes('@keyframes') || txt.includes('@media') ||
                    txt.includes('function(') || txt.includes('const ') ||
                    txt.match(/^[a-z-]+:\s*[^;]+;$/im)) return false;
                // Exclude if it has too many CSS-like patterns
                if ((txt.match(/[@{}:;]/g) || []).length > txt.length / 10) return false;
                // Exclude if it's in a script or style tag
                if (el.closest('script, style, noscript')) return false;
                // Exclude user messages - they have font-user-message class
                if (el.classList.contains('font-user-message') || el.closest('.font-user-message')) return false;
                // Exclude sidebar navigation elements
                const sidebar = el.closest('nav[aria-label="Sidebar"], aside, [role="navigation"], [class*="sidebar"], [class*="Sidebar"]');
                if (sidebar) return false;
                // Exclude common sidebar UI text patterns
                const sidebarTexts = ['new chat', 'chats', 'projects', 'artifacts', 'recents', 'free plan', 'pro plan', 'upgrade'];
                if (sidebarTexts.some(s => txt.toLowerCase().includes(s)) && txt.length < 200) return false;
                // Exclude if it's in header or footer
                if (el.closest('header, footer, [role="banner"], [role="contentinfo"]')) return false;
                return true;
              });

              if (candidates.length > 0) {
                msgs = candidates;
                console.log('[promptiply:webui] Found messages with fallback selector:', sel, 'count:', candidates.length);
                break;
              }
            }
          }
        }

        // Filter messages: exclude input areas, sidebar, and our sent message
        msgs = msgs.filter(msg => {
          const txt = (msg.innerText || msg.textContent || '').trim();
          // Exclude empty, very short, or our input
          if (!txt || txt.length < 20) return false;
          // Exclude if it starts with our composed message
          if (txt.toLowerCase().startsWith(composedStart)) return false;
          // Exclude if it contains the refinement instruction
          if (txt.toLowerCase().includes('refine this prompt')) return false;
          // Exclude Claude disclaimer messages
          if (txt.toLowerCase().includes('claude can make mistakes') ||
              txt.toLowerCase().includes('please double-check responses') ||
              txt.toLowerCase().includes('double-check responses')) return false;
          // Exclude CSS/JS code blocks
          if (txt.includes('@keyframes') || txt.includes('@media') ||
              txt.includes('function(') || txt.includes('const ') ||
              txt.match(/^[a-z-]+:\s*[^;]+;$/im)) return false;
          // Exclude if it has too many CSS-like patterns
          if ((txt.match(/[@{}:;]/g) || []).length > txt.length / 10) return false;
          // Exclude if it's in or contains the input area
          const inputEl = document.querySelector('.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]');
          if (inputEl && (msg.contains(inputEl) || inputEl.contains(msg))) return false;
          // Exclude if it's in a script or style tag
          if (msg.closest('script, style, noscript')) return false;
          // Exclude user messages - they have font-user-message class
          if (msg.classList.contains('font-user-message') || msg.closest('.font-user-message')) return false;
          // Exclude sidebar navigation elements
          const sidebar = msg.closest('nav[aria-label="Sidebar"], aside, [role="navigation"], [class*="sidebar"], [class*="Sidebar"]');
          if (sidebar) return false;
          // Exclude common sidebar UI text patterns
          const sidebarTexts = ['new chat', 'chats', 'projects', 'artifacts', 'recents', 'free plan', 'pro plan', 'upgrade'];
          if (sidebarTexts.some(s => txt.toLowerCase().includes(s)) && txt.length < 200) return false;
          // Exclude if it's in header or footer
          if (msg.closest('header, footer, [role="banner"], [role="contentinfo"]')) return false;
          return true;
        });

        // Sort messages by length (prefer longer messages - the actual response)
        // This helps avoid picking up the short disclaimer message
        msgs.sort((a, b) => {
          const aTxt = (a.innerText || a.textContent || '').trim();
          const bTxt = (b.innerText || b.textContent || '').trim();
          return bTxt.length - aTxt.length;
        });

        const last = msgs.length > 0 ? msgs[0] : null; // Get the longest message first
        if (last) {
          const txt = (last.innerText || last.textContent || '').trim();
          // Make sure it's not our sent message and has substantial content (more than just disclaimer)
          if (txt && txt.length > 100 && !txt.toLowerCase().startsWith(composedStart)) {
            if (txt === content) {
              stableCount++;
              if (stableCount >= 6) { // Content stable for 1.5 seconds (wait for [COMPLETION])
                console.log('[promptiply:webui] Claude response complete (stable), length:', content.length, 'preview:', content.slice(0, 100));
                // Add extra delay to ensure Claude's [COMPLETION] message has appeared
                await delay(1000);
                // Re-capture content one more time after completion
                const finalTxt = (last.innerText || last.textContent || '').trim();
                if (finalTxt && finalTxt.length > content.length) {
                  content = finalTxt;
                  console.log('[promptiply:webui] Re-captured after completion, new length:', content.length);
                }
                break;
              }
            } else {
              stableCount = 0;
              content = txt;
              console.log('[promptiply:webui] Found Claude assistant message, length:', content.length, 'preview:', content.slice(0, 100));
            }
          }
        } else {
          // Debug: log what we found
          if (i % 4 === 0) { // Log every second
            console.log('[promptiply:webui] No valid messages found, iteration:', i, 'allMessages:', msgs.length);
          }
        }

        // Check if still typing
        const typing = document.querySelector('[class*="typing"], [aria-label*="typing"], [class*="loading"], [class*="spinner"]');
        if (!typing && content && content.length > 30 && stableCount >= 2) {
          console.log('[promptiply:webui] Claude response complete (no typing, stable), length:', content.length);
          // Add extra delay to ensure Claude is fully done (console shows [COMPLETION])
          await delay(1000);
          break;
        }

        // Timeout after max iterations
        if (i === 119 && content) {
          console.log('[promptiply:webui] Claude timeout reached, using current content, length:', content.length);
        } else if (i === 119) {
          console.log('[promptiply:webui] Claude timeout reached, NO content found');
        }
      }

      // Wait a bit more after breaking to ensure we have the final content
      if (content && content.length > 0) {
        await delay(500);
        // Re-check for final content one more time
        const finalCheckSelectors = [
          'article',
          '[role="article"]',
          '[data-role="assistant"]',
          '[class*="Message"][class*="assistant"]'
        ];

        for (const sel of finalCheckSelectors) {
          const found = Array.from(document.querySelectorAll(sel));
          if (found.length > 0) {
            const filtered = found.filter(msg => {
              const txt = (msg.innerText || msg.textContent || '').trim();
              if (!txt || txt.length < 20) return false;
              if (txt.toLowerCase().startsWith(composedStart)) return false;
              if (txt.toLowerCase().includes('refine this prompt')) return false;
              // Exclude Claude disclaimer messages
              if (txt.toLowerCase().includes('claude can make mistakes') ||
                  txt.toLowerCase().includes('please double-check responses') ||
                  txt.toLowerCase().includes('double-check responses')) return false;
              // Exclude CSS/JS code blocks
              if (txt.includes('@keyframes') || txt.includes('@media') ||
                  txt.includes('function(') || txt.includes('const ') ||
                  txt.match(/^[a-z-]+:\s*[^;]+;$/im)) return false;
              // Exclude if it has too many CSS-like patterns
              if ((txt.match(/[@{}:;]/g) || []).length > txt.length / 10) return false;
              const inputEl = document.querySelector('.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]');
              if (inputEl && (msg.contains(inputEl) || inputEl.contains(msg))) return false;
              // Exclude if it's in a script or style tag
              if (msg.closest('script, style, noscript')) return false;
              // Exclude user messages - they have font-user-message class
              if (msg.classList.contains('font-user-message') || msg.closest('.font-user-message')) return false;
              // Exclude sidebar navigation elements
              const sidebar = msg.closest('nav[aria-label="Sidebar"], aside, [role="navigation"], [class*="sidebar"], [class*="Sidebar"]');
              if (sidebar) return false;
              // Exclude common sidebar UI text patterns
              const sidebarTexts = ['new chat', 'chats', 'projects', 'artifacts', 'recents', 'free plan', 'pro plan', 'upgrade'];
              if (sidebarTexts.some(s => txt.toLowerCase().includes(s)) && txt.length < 200) return false;
              // Exclude if it's in header or footer
              if (msg.closest('header, footer, [role="banner"], [role="contentinfo"]')) return false;
              return true;
            });

            if (filtered.length > 0) {
              // Sort by length, prefer longer messages
              filtered.sort((a, b) => {
                const aTxt = (a.innerText || a.textContent || '').trim();
                const bTxt = (b.innerText || b.textContent || '').trim();
                return bTxt.length - aTxt.length;
              });

              const finalTxt = (filtered[0].innerText || filtered[0].textContent || '').trim();
              // Only update if it's longer and substantial (more than just disclaimer)
              if (finalTxt && finalTxt.length > 100 && finalTxt.length > content.length) {
                content = finalTxt;
                console.log('[promptiply:webui] Updated content after final check, length:', content.length);
              }
            }
          }
        }
      }

      let finalResult = content.trim();

      // If still no content found, try one last desperate attempt: find the largest text block
      if (!finalResult || finalResult.length === 0) {
        console.log('[promptiply:webui] No content found with standard approach, trying desperate fallback');
        const inputEl = document.querySelector('.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]');
        const allElements = Array.from(document.querySelectorAll('div, p, article, section, span'));

        // Find all text blocks that are not the input and not our message
        const textBlocks = allElements
          .map(el => {
            const txt = (el.innerText || el.textContent || '').trim();
            if (!txt || txt.length < 50) return null;
            if (inputEl && (el.contains(inputEl) || inputEl.contains(el))) return null;
            if (txt.toLowerCase().startsWith(composedStart)) return null;
            if (txt.toLowerCase().includes('refine this prompt')) return null;
            // Exclude Claude disclaimer messages
            if (txt.toLowerCase().includes('claude can make mistakes') ||
                txt.toLowerCase().includes('please double-check responses') ||
                txt.toLowerCase().includes('double-check responses')) return null;
            // Exclude CSS/JS code blocks
            if (txt.includes('@keyframes') || txt.includes('@media') ||
                txt.includes('function(') || txt.includes('const ') ||
                txt.match(/^[a-z-]+:\s*[^;]+;$/im)) return null;
            // Exclude if it has too many CSS-like patterns
            if ((txt.match(/[@{}:;]/g) || []).length > txt.length / 10) return null;
            // Exclude if it's in a script or style tag
            if (el.closest('script, style, noscript')) return null;
            // Exclude user messages - they have font-user-message class
            if (el.classList.contains('font-user-message') || el.closest('.font-user-message')) return null;
            // Exclude sidebar navigation elements
            const sidebar = el.closest('nav[aria-label="Sidebar"], aside, [role="navigation"], [class*="sidebar"], [class*="Sidebar"]');
            if (sidebar) return null;
            // Exclude common sidebar UI text patterns
            const sidebarTexts = ['new chat', 'chats', 'projects', 'artifacts', 'recents', 'free plan', 'pro plan', 'upgrade'];
            if (sidebarTexts.some(s => txt.toLowerCase().includes(s)) && txt.length < 200) return null;
            // Exclude if it's in header or footer
            if (el.closest('header, footer, [role="banner"], [role="contentinfo"]')) return null;
            return { el, txt, len: txt.length };
          })
          .filter(Boolean)
          .sort((a, b) => b.len - a.len); // Sort by length, largest first

        if (textBlocks.length > 0) {
          finalResult = textBlocks[0].txt.trim();
          console.log('[promptiply:webui] Found content with desperate fallback, length:', finalResult.length);
        }
      }

      console.log('[promptiply:webui] Final Claude result:', {
        length: finalResult.length,
        isEmpty: !finalResult || finalResult.length === 0,
        preview: finalResult.slice(0, 200)
      });
      return finalResult;
    } catch (e) {
      console.error('[promptiply:webui] Claude automation error:', e);
      return '';
    }
  }

  // Route to appropriate function
  if (site === 'claude') {
    return await sendAndReadClaude();
  } else {
    return await sendAndReadChatGPT();
  }
}

function buildSystemPrompt(profile) {
  const baseSystemPrompt = `You are a prompt refinement assistant. Your job is to refine user prompts to make them clearer, more effective, and better structured while preserving their original intent completely.

CRITICAL: The user will provide text that is a PROMPT TO BE REFINED, NOT a question to answer or request to fulfill.

CRITICAL INSTRUCTIONS:
1. Do NOT answer the user's prompt as if it's a question (e.g., if they say "I want to build a website", do NOT explain how to build a website)
2. Do NOT provide information, help, or assistance about the topic
3. ONLY refine the prompt itself to make it clearer, more detailed, and more effective
4. Treat each request as INDEPENDENT - do not reference previous conversations
5. Output ONLY the refined prompt text - no explanations, no prefixes like "Refined Prompt:", no conversational responses
6. Preserve ALL the original details, parameters, requirements, and context from the input prompt
7. Improve clarity, structure, and effectiveness while keeping the exact same intent
8. If the original prompt is already good, make only minor improvements rather than rewriting it completely
9. Start your response directly with the refined prompt - no introductory text
10. Transform conversational prompts into clear, actionable prompts (e.g., "I want X" → "Provide a comprehensive guide/tutorial/explanation for X...")`;

  if (!profile) {
    return baseSystemPrompt;
  }

  const parts = [baseSystemPrompt];
  parts.push('\nAdditionally, refine prompts according to the following profile:');

  if (profile.persona) parts.push(`Target persona: ${profile.persona}`);
  if (profile.tone) parts.push(`Target tone: ${profile.tone}`);
  if (profile.styleGuidelines && profile.styleGuidelines.length > 0) {
    parts.push(`Style guidelines: ${profile.styleGuidelines.join('; ')}`);
  }

  if (profile.evolving_profile) {
    const evo = normalizeEvolution(profile.evolving_profile);
    if (evo.topics.length > 0) {
      // Extract topic names from objects
      const topicNames = evo.topics.map((topic) => 
        typeof topic === 'string' ? topic : (topic.name || '')
      ).filter(Boolean);
      if (topicNames.length > 0) {
        parts.push(`Focus especially on recent topics: ${topicNames.join(', ')}`);
      }
    }
  }

  parts.push('\nRespond strictly with JSON containing fields refinedPrompt (string) and topics (array of strings).');
  parts.push('\nThe topics array must contain 1-6 single words or hyphenated single concepts (e.g., "React", "Jenkins", "Github-Actions", "Python", "Docker"), not multi-word phrases (e.g., "web development", "CI pipelines", "cloud computing").');
  parts.push('\nRefine the user\'s prompt so that when used, it will generate responses that match the profile above. Preserve the original intent while improving clarity, structure, and effectiveness.');

  return parts.join('\n');
}

function buildUserPrompt(prompt, profile) {
  const instructions = [
    'Return a JSON object with two fields: refinedPrompt (string) and topics (array of short strings).',
    'The refinedPrompt must preserve the user\'s intent while improving clarity.',
    'The topics array must contain 1-6 single words or hyphenated single concepts (e.g., "React", "Jenkins", "Github-Actions", "Python", "Docker"), not multi-word phrases (e.g., "web development", "CI pipelines", "cloud computing").',
    'Avoid explanations or additional keys; respond with valid JSON only.',
  ];

  const profileHints = [];
  if (profile?.name) profileHints.push(`Profile name: ${profile.name}`);
  if (profile?.persona) profileHints.push(`Persona: ${profile.persona}`);
  if (profile?.tone) profileHints.push(`Tone: ${profile.tone}`);
  if (profile?.styleGuidelines?.length) {
    profileHints.push(`Style guidelines: ${profile.styleGuidelines.join('; ')}`);
  }

  const context = [
    'You are refining prompts. Follow these instructions strictly.',
    ...profileHints,
    ...instructions,
    'User prompt:',
    prompt,
  ].join('\n');

  return context;
}

// Local mode using web-llm
async function ensureOffscreenDocument() {
  // Check if offscreen document already exists
  const clients = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (clients.length > 0) {
    console.log('[promptiply:bg] Offscreen document already exists');
    return;
  }

  // Create offscreen document
  // Note: We use DOM_SCRAPING reason as WEB_GPU is not available yet
  // The offscreen document can still access WebGPU when needed
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/index.html',
      reasons: ['DOM_SCRAPING'],
      justification: 'Offscreen document required for local LLM inference with web-llm (WebGPU support)',
    });
    console.log('[promptiply:bg] Offscreen document created');

    // Wait a bit for the offscreen document to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error('[promptiply:bg] Failed to create offscreen document:', error);
    throw new Error(`Failed to create offscreen document: ${error.message}`);
  }
}

async function refineWithLocal({ system, user, originalPrompt }) {
  try {
    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    console.log('[promptiply:bg] Sending refinement request to offscreen document');
    console.log('[promptiply:bg] User prompt length:', user.length);
    console.log('[promptiply:bg] User prompt preview:', user.substring(0, 200));
    console.log('[promptiply:bg] System prompt length:', system.length);

    // The offscreen document will send progress updates via PR_LOCAL_PROGRESS messages
    // which we'll relay to the content script

    // Send message to offscreen document
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Local refinement timeout (30 minutes)'));
      }, 1800000); // 30 minute timeout (allows for slow internet connections during model download)

      chrome.runtime.sendMessage(
        {
          type: 'PR_LOCAL_REFINE',
          payload: {
            systemPrompt: system,
            userPrompt: user,
          },
        },
        (response) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response || !response.ok) {
            reject(new Error(response?.error || 'Unknown error from offscreen document'));
            return;
          }

          resolve(response.refined);
        }
      );
    });

    console.log('[promptiply:bg] Received refined prompt from local mode, length:', response.length);
    return normalizeRefinementResult(response, originalPrompt);
  } catch (error) {
    console.error('[promptiply:bg] Local refinement error:', error);
    throw error;
  }
}

