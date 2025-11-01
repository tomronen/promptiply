// Offscreen document for web-llm inference
// This runs in a full page context to enable WebGPU/WebAssembly

// Import web-llm - will be bundled at build time with esbuild
import { CreateMLCEngine } from '@mlc-ai/web-llm';

let engine = null;
let isInitializing = false;
let initPromise = null;

// Model configuration for Llama 3
// Using Llama 3.1 8B for better quality and proper refinement capabilities
const MODEL_ID = 'Llama-3.1-8B-Instruct-q4f16_1-MLC'; // Llama 3.1 8B model (~2-3GB download, better quality)
// Alternative models:
// 'Qwen2-0.5B-Instruct-q4f16_1-MLC' (smaller, faster but lower quality)
// 'TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC' (smallest)
// 'Llama-3.1-70B-Instruct-q4f16_1-MLC' (largest, best quality but very large download)

async function loadWebLLM() {
  // CreateMLCEngine is already imported and bundled
  // Just verify it's available
  if (!CreateMLCEngine) {
    throw new Error('CreateMLCEngine not available - bundling may have failed');
  }
  
  console.log('[promptiply:offscreen] web-llm module available, CreateMLCEngine:', typeof CreateMLCEngine);
  return CreateMLCEngine;
}

// Progress callback to send updates
let progressCallback = null;

function sendProgress(progress) {
  if (progressCallback) {
    progressCallback(progress);
  }
  
  // Also send to service worker which can relay to content scripts
  chrome.runtime.sendMessage({
    type: 'PR_LOCAL_PROGRESS',
    payload: progress,
  }).catch(() => {
    // Ignore errors if no listener
  });
}

async function initializeEngine(onProgress) {
  if (engine) {
    return engine;
  }
  
  if (isInitializing && initPromise) {
    return initPromise;
  }
  
  // Store progress callback
  if (onProgress) {
    progressCallback = onProgress;
  }
  
  isInitializing = true;
  initPromise = (async () => {
    try {
      // Ensure web-llm is loaded
      const CreateMLC = await loadWebLLM();
      
      console.log('[promptiply:offscreen] Initializing web-llm engine with model:', MODEL_ID);
      
      sendProgress({ 
        stage: 'loading', 
        message: 'Loading web-llm module...',
        progress: 0 
      });
      
      const chatOpts = {
        temperature: 0.2,
        repetition_penalty: 1.01,
      };

      // Create progress callback for web-llm initialization
      const initProgressCallback = (progress) => {
        if (progress.text) {
          console.log('[promptiply:offscreen] Model download progress:', progress.text);
          
          // Try to parse progress from web-llm progress messages
          let progressPercent = 0;
          let stage = 'downloading';
          let message = progress.text;
          
          // Extract percentage if available (web-llm format may vary)
          const percentMatch = progress.text.match(/(\d+)%/);
          if (percentMatch) {
            progressPercent = parseInt(percentMatch[1], 10);
          }
          
          // Detect different stages
          if (progress.text.toLowerCase().includes('initializing') || 
              progress.text.toLowerCase().includes('loading model')) {
            stage = 'initializing';
          } else if (progress.text.toLowerCase().includes('downloading') ||
                     progress.text.toLowerCase().includes('fetching')) {
            stage = 'downloading';
          } else if (progress.text.toLowerCase().includes('compiling') ||
                     progress.text.toLowerCase().includes('building')) {
            stage = 'compiling';
          }
          
          sendProgress({
            stage,
            message: progress.text,
            progress: progressPercent,
          });
        }
      };

      // Configure engine for Chrome extension context
      // Provide a custom fetch function that uses extension permissions
      // This ensures fetch requests go through the extension's network permissions
      const engineConfig = {
        initProgressCallback,
        // Provide custom fetch function that respects extension permissions
        // The default fetch should work, but we can wrap it if needed
      };
      
      console.log('[promptiply:offscreen] Using engine config:', JSON.stringify(engineConfig, null, 2));
      console.log('[promptiply:offscreen] Testing if fetch is available:', typeof fetch);
      console.log('[promptiply:offscreen] Window location:', window.location.href);
      console.log('[promptiply:offscreen] Chrome runtime:', typeof chrome?.runtime);
      
      // Test a fetch to Hugging Face to verify permissions BEFORE creating engine
      console.log('[promptiply:offscreen] Testing fetch to Hugging Face...');
      try {
        const testFetch = await fetch('https://huggingface.co', { 
          method: 'HEAD',
          mode: 'cors',
        });
        console.log('[promptiply:offscreen] Fetch test PASSED:', testFetch.status, testFetch.statusText);
      } catch (fetchTestError) {
        console.error('[promptiply:offscreen] Fetch test FAILED:', {
          message: fetchTestError.message,
          name: fetchTestError.name,
          stack: fetchTestError.stack,
          toString: fetchTestError.toString(),
        });
        // Don't throw immediately - let web-llm try and see what happens
        console.warn('[promptiply:offscreen] Continuing despite fetch test failure - web-llm may handle it differently');
      }

      sendProgress({ 
        stage: 'downloading', 
        message: 'Downloading model files (this may take a few minutes)...',
        progress: 0 
      });

      console.log('[promptiply:offscreen] Creating engine with model:', MODEL_ID);
      console.log('[promptiply:offscreen] Engine config:', engineConfig);
      console.log('[promptiply:offscreen] Chat options:', chatOpts);

      // CreateMLCEngine returns an engine with a chat() method that takes messages
      // The structure may vary, so we'll try the common patterns
      try {
        console.log('[promptiply:offscreen] About to call CreateMLCEngine with model:', MODEL_ID);
        console.log('[promptiply:offscreen] CreateMLCEngine type:', typeof CreateMLC);
        console.log('[promptiply:offscreen] Parameters:', {
          modelId: MODEL_ID,
          config: engineConfig,
          chatOpts: chatOpts,
        });
        
        // Log before and after to catch where it fails
        const beforeTime = Date.now();
        console.log('[promptiply:offscreen] Calling CreateMLCEngine now...');
        
        engine = await CreateMLC(
          MODEL_ID,
          engineConfig,
          chatOpts,
        );
        
        const afterTime = Date.now();
        console.log('[promptiply:offscreen] CreateMLCEngine call completed in', (afterTime - beforeTime), 'ms');
        
        console.log('[promptiply:offscreen] Engine created:', {
          type: typeof engine,
          keys: Object.keys(engine || {}),
          hasChat: !!engine?.chat,
          hasGenerate: !!engine?.generate,
        });
        
        console.log('[promptiply:offscreen] Engine initialized successfully');
        sendProgress({ 
          stage: 'ready', 
          message: 'Model ready',
          progress: 100 
        });
        
        isInitializing = false;
        return engine;
             } catch (createError) {
               console.error('[promptiply:offscreen] Engine creation failed:', createError);
               console.error('[promptiply:offscreen] Error details:', {
                 name: createError.name,
                 message: createError.message,
                 stack: createError.stack,
                 cause: createError.cause,
                 toString: createError.toString(),
                 // Log the error object itself to see all properties
                 errorObject: createError,
               });

               // Also log what network requests might have been made
               console.error('[promptiply:offscreen] NOTE: To see network requests from offscreen document:');
               console.error('[promptiply:offscreen] 1. Go to chrome://extensions');
               console.error('[promptiply:offscreen] 2. Find "promptiply" extension');
               console.error('[promptiply:offscreen] 3. Click "Inspect views: offscreen document" (if available)');
               console.error('[promptiply:offscreen] 4. Or click "service worker" link');
               console.error('[promptiply:offscreen] 5. Open Network tab in that DevTools window');

               // Check if it's a network/fetch error
               const isNetworkError = createError.message && (
                 createError.message.includes('Failed to fetch') ||
                 createError.message.includes('NetworkError') ||
                 createError.message.includes('CORS') ||
                 createError.message.includes('fetch') ||
                 createError.name === 'TypeError' ||
                 createError.name === 'NetworkError'
               );

               if (isNetworkError) {
                 const errorMsg = `Failed to download model: ${createError.message || createError.toString()}. This might be a network issue, CORS restriction, or missing permissions. To debug: 1) Go to chrome://extensions, 2) Find promptiply, 3) Click "Inspect views: offscreen document" or "service worker", 4) Check Network tab there.`;
                 console.error('[promptiply:offscreen] Network error details:', errorMsg);
                 sendProgress({
                   stage: 'error',
                   message: 'Network error downloading model. See offscreen document console for details.',
                   progress: 0
                 });
                 throw new Error(errorMsg);
               }

               // Re-throw other errors with full details
               throw new Error(`Engine creation failed: ${createError.message || createError.toString()}. Check offscreen document console for details.`);
             }
    } catch (error) {
      console.error('[promptiply:offscreen] Failed to initialize engine:', error);
      sendProgress({ 
        stage: 'error', 
        message: `Error: ${error.message || String(error)}`,
        progress: 0 
      });
      isInitializing = false;
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
}

async function refinePrompt(systemPrompt, userPrompt) {
  try {
    // Initialize engine if not already initialized
    const eng = await initializeEngine();
    
    if (!eng) {
      throw new Error('Engine not initialized');
    }
    
    console.log('[promptiply:offscreen] Engine type:', typeof eng, 'Methods:', Object.keys(eng));
    
    // Build messages array (following web-llm example pattern)
    // Format: ChatCompletionMessageParam[] = {role: string, content: string}[]
    const messages = [];
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    // Wrap user prompt with refinement instruction
    // Make it very explicit that we want ONLY the refined prompt, no explanations or prefixes
    // IMPORTANT: The user's text below is a PROMPT TO BE REFINED, not a question to answer
    const userWithInstruction = `Below is a user prompt that needs to be refined. Your job is to improve it while keeping the same intent.

IMPORTANT: 
- Do NOT answer the prompt as if it's a question
- Do NOT help the user with their request
- Do NOT provide information or assistance
- ONLY refine the prompt itself to make it better

For example:
- If the prompt says "I want to build a website", refine it to be a better prompt like "Create a comprehensive guide for building a modern, responsive website with [specific technologies]..."
- If the prompt says "Help me with math", refine it to be a better prompt like "Provide step-by-step solutions to [specific math problems] with detailed explanations..."

Output ONLY the refined prompt text - no explanations, no prefixes, no commentary. Start directly with the refined prompt.

Prompt to refine:
${userPrompt}`;
    messages.push({ role: 'user', content: userWithInstruction });
    
    console.log('[promptiply:offscreen] Generating refinement with', messages.length, 'messages');
    console.log('[promptiply:offscreen] User prompt to refine (first 200 chars):', userPrompt.substring(0, 200));
    console.log('[promptiply:offscreen] Engine structure check:', {
      engine: typeof eng,
      hasChat: !!eng?.chat,
      hasCompletions: !!eng?.chat?.completions,
      hasCreate: !!eng?.chat?.completions?.create,
      engineKeys: eng ? Object.keys(eng) : [],
    });
    
    // Generate response using web-llm API (following the example pattern)
    // From the example: engine.chat.completions.create({ stream: true, messages: chatHistory })
    let fullResponse = '';
    
    try {
      // Use the standard web-llm API as shown in the example
      if (!eng.chat || !eng.chat.completions || !eng.chat.completions.create) {
        console.error('[promptiply:offscreen] Engine does not have chat.completions.create:', {
          hasChat: !!eng.chat,
          hasCompletions: !!eng.chat?.completions,
          hasCreate: !!eng.chat?.completions?.create,
        });
        throw new Error('Engine does not support chat.completions.create API');
      }
      
      console.log('[promptiply:offscreen] Calling engine.chat.completions.create');
      const completion = await eng.chat.completions.create({
        stream: true,
        messages: messages,
      });
      
      console.log('[promptiply:offscreen] Got completion response, iterating chunks');
      // Iterate over streamed chunks (as shown in the example)
      for await (const chunk of completion) {
        const curDelta = chunk.choices?.[0]?.delta?.content;
        if (curDelta) {
          fullResponse += curDelta;
        }
      }
    } catch (apiError) {
      console.error('[promptiply:offscreen] API error:', apiError);
      throw new Error(`Failed to generate response: ${apiError.message || String(apiError)}`);
    }
    
    if (!fullResponse || fullResponse.trim().length === 0) {
      throw new Error('Empty response from model');
    }
    
    console.log('[promptiply:offscreen] Raw model response, length:', fullResponse.length);
    console.log('[promptiply:offscreen] Raw model response (first 500 chars):', fullResponse.substring(0, 500));
    
    // Clean up the response - remove common prefixes and unwanted text
    let cleaned = fullResponse.trim();
    
    // Remove common prefixes that models might add
    const prefixes = [
      /^refined\s+prompt\s*:?\s*/i,
      /^here[''s]?\s+the\s+refined\s+prompt\s*:?\s*/i,
      /^the\s+refined\s+prompt\s+is\s*:?\s*/i,
      /^refined\s+version\s*:?\s*/i,
      /^refinement\s*:?\s*/i,
      /^refined\s*:?\s*/i,
      // Remove markdown code blocks if present
      /^```[a-z]*\n?/i,
      /```\s*$/i,
      // Remove "Here is..." or "Here's..." patterns
      /^here[''s]?\s+(is|are)\s+[^:]+:\s*/i,
    ];
    
    for (const prefix of prefixes) {
      cleaned = cleaned.replace(prefix, '').trim();
    }
    
    // If response starts with quotes or markdown, try to extract the actual content
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    
    // Remove leading/trailing whitespace again after cleanup
    cleaned = cleaned.trim();
    
    // If the cleaned response is much shorter than original and seems incomplete,
    // or if it still looks like a conversational response, keep more of the original
    // But only if original was already pretty clean
    if (cleaned.length < fullResponse.length * 0.3 && cleaned.length > 0) {
      console.warn('[promptiply:offscreen] Cleaned response is much shorter, using original:', {
        originalLen: fullResponse.length,
        cleanedLen: cleaned.length,
      });
      // Use cleaned but log warning
    }
    
    console.log('[promptiply:offscreen] Cleaned refinement, length:', cleaned.length);
    console.log('[promptiply:offscreen] Cleaned refinement (first 200 chars):', cleaned.substring(0, 200));
    
    return cleaned;
  } catch (error) {
    console.error('[promptiply:offscreen] Error refining prompt:', error);
    throw error;
  }
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PR_LOCAL_REFINE') {
    const { systemPrompt, userPrompt } = message.payload || {};
    
    if (!userPrompt || !userPrompt.trim()) {
      sendResponse({ ok: false, error: 'No prompt provided' });
      return true;
    }
    
    refinePrompt(systemPrompt || '', userPrompt)
      .then((refined) => {
        sendResponse({ ok: true, refined });
      })
      .catch((error) => {
        console.error('[promptiply:offscreen] Refinement error:', error);
        sendResponse({ 
          ok: false, 
          error: error.message || String(error) 
        });
      });
    
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'PR_INIT_ENGINE') {
    const progressCallback = message.progressCallback ? 
      (progress) => {
        // Progress will be sent via sendProgress
        sendProgress(progress);
      } : null;
    
    initializeEngine(progressCallback)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || String(error) });
      });
    return true;
  }
});

// Initialize engine on load (silently in background)
console.log('[promptiply:offscreen] Offscreen document loaded');
console.log('[promptiply:offscreen] Current URL:', window.location.href);
console.log('[promptiply:offscreen] Fetch available:', typeof fetch);
console.log('[promptiply:offscreen] CreateMLCEngine available:', typeof CreateMLCEngine);

// Test basic fetch capability immediately (wrapped in async IIFE to avoid top-level await)
(async () => {
  try {
    const testFetch = await fetch('https://huggingface.co', { method: 'HEAD', mode: 'cors' });
    console.log('[promptiply:offscreen] Initial fetch test - OK:', testFetch.status);
  } catch (e) {
    console.error('[promptiply:offscreen] Initial fetch test - FAILED:', e.message, e.name, e.stack);
  }
})();

initializeEngine().catch((error) => {
  console.error('[promptiply:offscreen] Failed to initialize engine on load:', error);
  sendProgress({ 
    stage: 'error', 
    message: `Initialization failed: ${error.message || String(error)}`,
    progress: 0 
  });
});

