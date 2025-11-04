(function(){
  // Try to load the full options script; if it fails to load or throws, fall back to index-fix.js
  try{
    window.__PR_OPTIONS_LOADED = false;
    const primary = document.createElement('script');
    primary.src = 'index.js';
    primary.defer = true;
    primary.type = 'text/javascript';
    primary.addEventListener('load', ()=>{
      window.__PR_OPTIONS_LOADED = true;
      console.log('[promptiply] options: loaded index.js');
      try{ chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ promptiply_options_init: { loaded: 'index.js', timestamp: Date.now() } }); }catch(_){ try{ localStorage.setItem('promptiply_options_init', JSON.stringify({ loaded: 'index.js', timestamp: Date.now() })); }catch(__){} }
    });
    primary.addEventListener('error', ()=>{
      console.warn('[promptiply] options: failed to load index.js, falling back to index-fix.js');
      try{ chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ promptiply_options_init: { loaded: 'index.js_error', timestamp: Date.now() } }); }catch(_){ try{ localStorage.setItem('promptiply_options_init', JSON.stringify({ loaded: 'index.js_error', timestamp: Date.now() })); }catch(__){} }
      const fb = document.createElement('script'); fb.src = 'index-fix.js'; fb.defer = true; fb.type = 'text/javascript'; document.head.appendChild(fb);
    });
    document.head.appendChild(primary);

    // Timeout fallback in case a runtime parse error prevents load events from firing
    setTimeout(()=>{
      if(!window.__PR_OPTIONS_LOADED){
        console.warn('[promptiply] options: fallback timeout, injecting index-fix.js');
        try{ chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ promptiply_options_init: { loaded: 'timeout_fallback', timestamp: Date.now() } }); }catch(_){ try{ localStorage.setItem('promptiply_options_init', JSON.stringify({ loaded: 'timeout_fallback', timestamp: Date.now() })); }catch(__){} }
        const fb = document.createElement('script'); fb.src = 'index-fix.js'; fb.defer = true; fb.type = 'text/javascript'; document.head.appendChild(fb);
      }
    }, 1200);

    // If an uncaught error originates from index.js, trigger fallback loader
    window.addEventListener('error', (ev)=>{
      try{
        if(ev && ev.filename && ev.filename.indexOf('index.js')!==-1){
          if(!window.__PR_OPTIONS_LOADED){
            console.warn('[promptiply] options: runtime error in index.js detected, injecting fallback');
            try{ chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ promptiply_options_init: { loaded: 'runtime_error', message: String(ev.message||''), timestamp: Date.now() } }); }catch(_){ try{ localStorage.setItem('promptiply_options_init', JSON.stringify({ loaded: 'runtime_error', message: String(ev.message||''), timestamp: Date.now() })); }catch(__){} }
            const fb = document.createElement('script'); fb.src = 'index-fix.js'; fb.defer = true; fb.type = 'text/javascript'; document.head.appendChild(fb);
          }
        }
      }catch(_){/* ignore */}
    }, {capture:true});
  }catch(e){
    try{ const fb = document.createElement('script'); fb.src = 'index-fix.js'; fb.defer = true; fb.type = 'text/javascript'; document.head.appendChild(fb); }catch(_){/* ignore */}
  }
})();
