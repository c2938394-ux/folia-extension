// ─── Folia Background ────────────────────────────────────────────────────────
// CLASSIFY_URL loaded from config.js (gitignored) — see config.example.js
var CLASSIFY_URL = (typeof FOLIA_CONFIG !== "undefined" && FOLIA_CONFIG.CLASSIFY_URL)
  ? FOLIA_CONFIG.CLASSIFY_URL
  : "";

// ── Enigma output detector — all caps A-Z, no spaces, length > 6 ─────────────
// Enigma cipher produces only uppercase A-Z with no spaces or punctuation.
// If title or URL looks like ciphertext, we must NEVER send it to any AI.
function looksEncrypted(str) {
  if (!str || str.length < 6) return false;
  var cleaned = str.replace(/[^A-Za-z]/g, "");
  if (cleaned.length === 0) return false;
  // Encrypted if >90% uppercase letters and no lowercase
  var upperCount = (str.match(/[A-Z]/g) || []).length;
  var lowerCount = (str.match(/[a-z]/g) || []).length;
  return lowerCount === 0 && upperCount > 6;
}

// AI classification via Supabase Edge Function (falls back to regex if offline)
function classifyBookmarkAI(title, url, cb) {
  // SECURITY: never send encrypted/secure content to AI
  if (looksEncrypted(title) || looksEncrypted(url)) {
    cb(classifyBookmark(title, url, []));
    return;
  }
  fetch(CLASSIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title, url: url })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.fallback || data.error || !data.folderId) {
      cb(classifyBookmark(title, url, []));
    } else {
      cb({ folderId: data.folderId, priority: data.priority, reason: data.reason });
    }
  })
  .catch(function() {
    // Offline or error — fall back to regex
    cb(classifyBookmark(title, url, []));
  });
}

// ── Classifier ────────────────────────────────────────────────────────────────
function classifyBookmark(title, url, tags) {
  title = title || ""; url = url || ""; tags = tags || [];
  var text = (title + " " + url + " " + tags.join(" ")).toLowerCase();

  if (/react|typescript|javascript|css|html|github|npm|api|code|dev|programming|framework|backend|frontend|node|python|swift|kotlin|rust|golang/.test(text))
    return { folderId: "dev", priority: 1 };
  if (/design|figma|ui|ux|color|typography|font|layout|visual|aesthetic|art|creative|dribbble|behance|canva/.test(text))
    return { folderId: "design", priority: 2 };
  if (/startup|saas|funding|mrr|revenue|product|launch|growth|marketing|business|entrepreneur|vc|investor/.test(text))
    return { folderId: "startup", priority: 1 };
  if (/\bai\b|gpt|llm|claude|openai|machine learning|neural|model|chatgpt|gemini|\bml\b|hugging|diffusion/.test(text))
    return { folderId: "ai", priority: 1 };
  if (/twitter|instagram|reddit|linkedin|youtube|pinterest|social|post|tweet|reel|story/.test(text))
    return { folderId: "social", priority: 3 };
  return { folderId: "general", priority: 3 };
}

// ── Source detection ──────────────────────────────────────────────────────────
// Returns { id, isNew, sourceObj } — isNew=true means caller must persist it
function detectOrCreateSource(url, sources) {
  url = url || ""; sources = sources || [];

  // 1. Check all existing sources (custom domain match first)
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    if (s.custom && s.domain && url.includes(s.domain)) return { id: s.id, isNew: false };
  }
  // 2. Built-in matches
  var builtins = [
    { id: "twitter",   test: function(u) { return u.includes("twitter.com") || u.includes("x.com"); } },
    { id: "instagram", test: function(u) { return u.includes("instagram.com"); } },
    { id: "reddit",    test: function(u) { return u.includes("reddit.com"); } },
    { id: "linkedin",  test: function(u) { return u.includes("linkedin.com"); } },
    { id: "youtube",   test: function(u) { return u.includes("youtube.com") || u.includes("youtu.be"); } },
    { id: "pinterest", test: function(u) { return u.includes("pinterest.com"); } },
    { id: "github",    test: function(u) { return u.includes("github.com"); } },
    { id: "medium",    test: function(u) { return u.includes("medium.com"); } },
    { id: "google",    test: function(u) { return u.includes("google.com"); } }
  ];
  for (var i = 0; i < builtins.length; i++) {
    if (builtins[i].test(url)) return { id: builtins[i].id, isNew: false };
  }

  // 3. Auto-create a new source for this domain
  try {
    var hostname = new URL(url).hostname.replace(/^www\./, "");
    // Check if auto-source for this hostname already exists
    var existingAuto = sources.find(function(s) { return s.domain === hostname; });
    if (existingAuto) return { id: existingAuto.id, isNew: false };

    var label      = hostname.split(".")[0];
    label          = label.charAt(0).toUpperCase() + label.slice(1);
    var id         = "auto_" + hostname.replace(/[^a-z0-9]/gi, "_");
    var color      = domainColor(hostname);
    var faviconUrl = "https://www.google.com/s2/favicons?domain=" + hostname + "&sz=32";

    var newSource = {
      id:         id,
      label:      label,
      icon:       label.charAt(0).toUpperCase(),  // letter fallback
      color:      color,
      faviconUrl: faviconUrl,
      domain:     hostname,
      enabled:    true,
      custom:     true,
      auto:       true   // auto-created, not manually added by user
    };
    return { id: id, isNew: true, sourceObj: newSource };
  } catch(e) {
    return { id: "unknown", isNew: false };
  }
}

// ── Built-in only source detection (no auto-create) ─────────────────────────
function detectOrCreateSourceBuiltinOnly(url, sources) {
  url = url || ""; sources = sources || [];
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    if (!s.auto && s.custom && s.domain && url.includes(s.domain)) return { id: s.id, isNew: false };
  }
  var builtins = [
    { id: "twitter",   test: function(u) { return u.includes("twitter.com") || u.includes("x.com"); } },
    { id: "instagram", test: function(u) { return u.includes("instagram.com"); } },
    { id: "reddit",    test: function(u) { return u.includes("reddit.com"); } },
    { id: "linkedin",  test: function(u) { return u.includes("linkedin.com"); } },
    { id: "youtube",   test: function(u) { return u.includes("youtube.com") || u.includes("youtu.be"); } },
    { id: "pinterest", test: function(u) { return u.includes("pinterest.com"); } },
    { id: "github",    test: function(u) { return u.includes("github.com"); } },
    { id: "medium",    test: function(u) { return u.includes("medium.com"); } },
    { id: "google",    test: function(u) { return u.includes("google.com"); } }
  ];
  for (var i = 0; i < builtins.length; i++) {
    if (builtins[i].test(url)) return { id: builtins[i].id, isNew: false };
  }
  return { id: "general_web", isNew: false };
}

// ── Deterministic color from domain string ────────────────────────────────────
function domainColor(domain) {
  var hash = 0;
  for (var i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  var hue = Math.abs(hash) % 360;
  // Avoid dull yellows (45-65) and near-white
  if (hue > 45 && hue < 65) hue = (hue + 40) % 360;
  return "hsl(" + hue + ",65%,55%)";
}

// ── Case-insensitive duplicate name check ─────────────────────────────────────
function nameExists(list, name, excludeId) {
  var lower = name.trim().toLowerCase();
  return list.some(function(item) {
    if (excludeId && item.id === excludeId) return false;
    return (item.name || item.label || "").toLowerCase() === lower;
  });
}

var DEFAULT_FOLDERS = [
  { id: "dev",     name: "Development", icon: "⌨",  color: "#6e40c9", description: "Coding, frameworks, tools" },
  { id: "design",  name: "Design",      icon: "🎨", color: "#E1306C", description: "UI/UX, visual inspiration" },
  { id: "startup", name: "Startup",     icon: "🚀", color: "#FF4500", description: "Entrepreneurship, growth" },
  { id: "ai",      name: "AI & ML",     icon: "🧠", color: "#4285F4", description: "Artificial intelligence" },
  { id: "social",  name: "Social",      icon: "💬", color: "#1DA1F2", description: "Social media saves" },
  { id: "general", name: "General",     icon: "📌", color: "#6b7280", description: "Everything else" },
];

// "web" removed — every saved URL gets its own auto-source now
var DEFAULT_SOURCES = [
  { id: "twitter",   label: "X / Twitter", icon: "𝕏",  color: "#1DA1F2", enabled: true,  custom: false },
  { id: "instagram", label: "Instagram",   icon: "📷", color: "#E1306C", enabled: true,  custom: false },
  { id: "reddit",    label: "Reddit",      icon: "🤖", color: "#FF4500", enabled: true,  custom: false },
  { id: "linkedin",  label: "LinkedIn",    icon: "💼", color: "#0077B5", enabled: true,  custom: false },
  { id: "youtube",   label: "YouTube",     icon: "▶",  color: "#FF0000", enabled: true,  custom: false },
  { id: "google",    label: "Google",      icon: "G",  color: "#4285F4", enabled: true,  custom: false },
  { id: "pinterest", label: "Pinterest",   icon: "📌", color: "#E60023", enabled: false, custom: false },
  { id: "github",    label: "GitHub",      icon: "⬡",  color: "#6e40c9", enabled: true,  custom: false },
  { id: "medium",    label: "Medium",      icon: "M",  color: "#00ab6c", enabled: false, custom: false }
];

// ── Install ───────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.get(["bookmarks","folders","sources"], function(ex) {
    if (!ex.bookmarks)     chrome.storage.local.set({ bookmarks: [] });
    if (!ex.folders)       chrome.storage.local.set({ folders: DEFAULT_FOLDERS });
    if (!ex.sources)       chrome.storage.local.set({ sources: DEFAULT_SOURCES });
    if (ex.separateSources === undefined) chrome.storage.local.set({ separateSources: true });
    if (!ex.secureVault)   chrome.storage.local.set({ secureVault: [] });
  });

});


// ── Save bookmark — auto-creates source if needed ─────────────────────────────
function saveBookmark(payload, cb) {
  var title    = payload.title    || "";
  var url      = payload.url      || "";
  var note     = payload.note     || "";
  var tags     = payload.tags     || [];
  var folderId = payload.folderId || null;
  var priority = payload.priority || null;
  var sourceOverride = payload.source || null;

  chrome.storage.local.get(["bookmarks","sources","separateSources"], function(d) {
    var bookmarks   = d.bookmarks   || [];
    var sources     = d.sources     || [];

    if (bookmarks.find(function(b) { return b.url === url; })) {
      cb({ duplicate: true }); return;
    }

    // Detect or auto-create source
    var separateSources = (d.separateSources !== undefined) ? d.separateSources : true;
    var detected;
    if (sourceOverride) {
      var exists = sources.find(function(s) { return s.id === sourceOverride; });
      detected = exists ? { id: sourceOverride, isNew: false } : (separateSources ? detectOrCreateSource(url, sources) : { id: "general_web", isNew: false });
    } else if (separateSources) {
      detected = detectOrCreateSource(url, sources);
    } else {
      // separateSources OFF — use built-in match only, no auto-create
      detected = detectOrCreateSourceBuiltinOnly(url, sources);
    }

    // 1. Classify instantly with regex — zero delay
    var cls = classifyBookmark(title, url, tags);
    var bm = {
      id:       Date.now().toString() + Math.random().toString(36).slice(2),
      title:    title,
      url:      url,
      source:   detected.id,
      tags:     tags,
      priority: priority || cls.priority,
      folderId: folderId || cls.folderId,
      savedAt:  Date.now(),
      note:     note,
      aiReason: null
    };

    bookmarks.unshift(bm);

    var saveSources = detected.isNew && detected.sourceObj;
    if (saveSources) sources.push(detected.sourceObj);

    chrome.storage.local.set(saveSources ? { bookmarks: bookmarks, sources: sources } : { bookmarks: bookmarks }, function() {
      if (saveSources) broadcastSourcesUpdated();
      cb({ saved: true, bm: bm });
    });

    // 2. Upgrade with AI in background — no delay to user
    // SECURITY: skip AI entirely if content looks encrypted
    if (looksEncrypted(title) || looksEncrypted(url)) return;
    classifyBookmarkAI(title, url, function(aiResult) {
      if (!aiResult || aiResult.fallback) return;
      chrome.storage.local.get("bookmarks", function(d2) {
        var bms2 = d2.bookmarks || [];
        var idx  = bms2.findIndex(function(b) { return b.id === bm.id; });
        if (idx === -1) return; // deleted before AI came back
        bms2[idx] = Object.assign({}, bms2[idx], {
          folderId: bm.folderId === cls.folderId ? aiResult.folderId : bms2[idx].folderId,
          priority: bm.priority === cls.priority ? aiResult.priority : bms2[idx].priority,
          aiReason: aiResult.reason || null
        });
        chrome.storage.local.set({ bookmarks: bms2 });
      });
    });
  });
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────
function broadcastSourcesUpdated() {
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(function(tab) {
      try { chrome.tabs.sendMessage(tab.id, { type: "FOLIA_SOURCES_UPDATED" }); } catch(e) {}
    });
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {

  if (msg.type === "SAVE_BOOKMARK") {
    saveBookmark(msg.payload, sendResponse);
    return true;
  }

  if (msg.type === "GET_DATA") {
    chrome.storage.local.get(["bookmarks","folders","sources","secureVault","separateSources","enigmaSettings","browserSyncEnabled"], sendResponse);
    return true;
  }

  if (msg.type === "DELETE_BOOKMARK") {
    chrome.storage.local.get("bookmarks", function(d) {
      var bms = (d.bookmarks || []).filter(function(b) { return b.id !== msg.id; });
      chrome.storage.local.set({ bookmarks: bms }, function() {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === "UPDATE_BOOKMARK") {
    chrome.storage.local.get("bookmarks", function(d) {
      var updated = (d.bookmarks || []).map(function(b) { return b.id === msg.id ? Object.assign({}, b, msg.changes) : b; });
      chrome.storage.local.set({ bookmarks: updated }, function() {
        sendResponse({ ok: true });
      });
    });
    return true;
  }


  if (msg.type === "TOGGLE_SOURCE") {
    chrome.storage.local.get("sources", function(d) {
      var updated = (d.sources||[]).map(function(s) {
        return s.id === msg.id ? Object.assign({}, s, { enabled: !s.enabled }) : s;
      });
      chrome.storage.local.set({ sources: updated }, function() {
        broadcastSourcesUpdated();
        sendResponse({ sources: updated });
      });
    });
    return true;
  }

  if (msg.type === "ADD_FOLDER") {
    chrome.storage.local.get("folders", function(d) {
      var folders = d.folders || [];
      if (nameExists(folders, msg.folder.name)) { sendResponse({ ok: false, reason: "A folder with that name already exists." }); return; }
      folders.push(msg.folder);
      chrome.storage.local.set({ folders: folders }, function() {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === "DELETE_FOLDER") {
    chrome.storage.local.get(["folders","bookmarks"], function(d) {
      var folders = (d.folders || []).filter(function(f) { return f.id !== msg.id; });
      var bms     = (d.bookmarks||[]).map(function(b) { return b.folderId === msg.id ? Object.assign({}, b, { folderId: "general" }) : b; });
      chrome.storage.local.set({ folders: folders, bookmarks: bms }, function() {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === "ADD_SOURCE") {
    chrome.storage.local.get("sources", function(d) {
      var sources = d.sources || [];
      if (nameExists(sources, msg.source.label)) { sendResponse({ ok: false, reason: "A source with that name already exists." }); return; }
      if (sources.find(function(s) { return s.id === msg.source.id; })) { sendResponse({ ok: false, reason: "A source with that name already exists." }); return; }
      sources.push(msg.source);
      chrome.storage.local.set({ sources: sources }, function() {
        broadcastSourcesUpdated();
        sendResponse({ ok: true, sources: sources });
      });
    });
    return true;
  }

  if (msg.type === "UPDATE_SOURCE") {
    chrome.storage.local.get("sources", function(d) {
      var updated = (d.sources||[]).map(function(s) { return s.id === msg.id ? Object.assign({}, s, msg.changes) : s; });
      chrome.storage.local.set({ sources: updated }, function() {
        broadcastSourcesUpdated();
        sendResponse({ ok: true, sources: updated });
      });
    });
    return true;
  }

  if (msg.type === "DELETE_SOURCE") {
    chrome.storage.local.get("sources", function(d) {
      var updated = (d.sources||[]).filter(function(s) { return s.id !== msg.id; });
      chrome.storage.local.set({ sources: updated }, function() { sendResponse({ ok: true, sources: updated }); });
    });
    return true;
  }



  if (msg.type === "SAVE_SECURE_VAULT") {
    chrome.storage.local.set({ secureVault: msg.entries }, function() { sendResponse({ ok: true }); });
    return true;
  }

  if (msg.type === "TOGGLE_SEPARATE_SOURCES") {
    chrome.storage.local.get(["separateSources","bookmarks","sources"], function(d) {
      var next = !d.separateSources;
      if (!next) {
        // Turning OFF — move all auto-source bookmarks to "general_web" source,
        // remove all auto-created sources
        var bookmarks = (d.bookmarks||[]).map(function(b) {
          var src = (d.sources||[]).find(function(s) { return s.id === b.source; });
          if (src && src.auto) return Object.assign({}, b, { source: "general_web" });
          return b;
        });
        var sources = (d.sources||[]).filter(function(s) { return !s.auto; });
        chrome.storage.local.set({ separateSources: false, bookmarks: bookmarks, sources: sources }, function() {
          sendResponse({ separateSources: false, bookmarks: bookmarks, sources: sources });
        });
      } else {
        chrome.storage.local.set({ separateSources: true }, function() {
          sendResponse({ separateSources: true });
        });
      }
    });
    return true;
  }

  if (msg.type === "UPDATE_SECURE_ATTEMPTS") {
    chrome.storage.local.get("secureVault", function(d) {
      var vault = (d.secureVault||[]).map(function(e) {
        if (e.id !== msg.id) return e;
        return Object.assign({}, e, { attempts: msg.attempts });
      });
      chrome.storage.local.set({ secureVault: vault }, function() { sendResponse({ ok: true }); });
    });
    return true;
  }

});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(function(command) {
  if (command === "open-dashboard") {
    var url = chrome.runtime.getURL("dashboard/dashboard.html");
    chrome.tabs.query({ url: url }, function(tabs) {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: url });
      }
    });
  }
  if (command === "save-bookmark") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      var tab = tabs[0];
      if (!tab || !tab.url || !tab.url.startsWith("http")) return;
      saveBookmark({ title: tab.title || tab.url, url: tab.url }, function(res) {
        if (res.duplicate) {
          chrome.action.setBadgeText({ text: "DUP" });
          chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
        } else {
          chrome.action.setBadgeText({ text: "✓" });
          chrome.action.setBadgeBackgroundColor({ color: "#c9a96e" });
        }
        setTimeout(function() { chrome.action.setBadgeText({ text: "" }); }, 2000);
        try { chrome.tabs.sendMessage(tab.id, { type: "FOLIA_SAVED", title: tab.title }); } catch(e) {}
      });
    });
  }
});


// Fires whenever the user clicks the browser's star / bookmark button
// Native browser bookmark → auto-save to Folia
chrome.bookmarks.onCreated.addListener(function(id, bookmarkInfo) {
  var url   = bookmarkInfo.url;
  var title = bookmarkInfo.title || url;

  // Skip folders (no URL) and non-http URLs
  if (!url || !url.startsWith("http")) return;

  chrome.storage.local.get(["bookmarks","sources","separateSources","browserSyncEnabled"], function(d) {
    // Respect the user's on/off toggle
    if (d.browserSyncEnabled === false) return;
    var bookmarks      = d.bookmarks      || [];
    var sources        = d.sources        || [];
        var separateSources = d.separateSources !== undefined ? d.separateSources : true;

    // Avoid duplicates — skip if URL already saved
    var exists = bookmarks.some(function(b) { return b.url === url; });
    if (exists) return;

    // Detect or create source
    var srcResult = separateSources
      ? detectOrCreateSource(url, sources)
      : detectOrCreateSourceBuiltinOnly(url, sources);

    if (srcResult.isNew) {
      sources = sources.concat([srcResult.sourceObj]);
      chrome.storage.local.set({ sources: sources });
      broadcastSourcesUpdated();
    }

    // Classify instantly with regex
    var clsNow = classifyBookmark(title, url, []);
    var bm = {
      id:          Date.now().toString() + Math.random().toString(36).slice(2),
      url:         url,
      title:       title,
      source:      srcResult.id,
      folderId:    clsNow.folderId,
      priority:    clsNow.priority,
      savedAt:     Date.now(),
      tags:        [],
      note:        "",
      aiReason:    null,
      fromBrowser: true
    };

    bookmarks = [bm].concat(bookmarks);
    chrome.storage.local.set({ bookmarks: bookmarks });

    // Badge feedback immediately
    try {
      chrome.action.setBadgeText({ text: "★" });
      chrome.action.setBadgeBackgroundColor({ color: "#c9a96e" });
      setTimeout(function() { chrome.action.setBadgeText({ text: "" }); }, 2000);
    } catch(e) {}

    // Upgrade with AI in background
    if (looksEncrypted(title) || looksEncrypted(url)) return;
    classifyBookmarkAI(title, url, function(aiResult) {
      if (!aiResult || aiResult.fallback) return;
      chrome.storage.local.get("bookmarks", function(d2) {
        var bms2 = d2.bookmarks || [];
        var idx  = bms2.findIndex(function(b) { return b.id === bm.id; });
        if (idx === -1) return;
        bms2[idx] = Object.assign({}, bms2[idx], {
          folderId: aiResult.folderId,
          priority: aiResult.priority,
          aiReason: aiResult.reason || null
        });
        chrome.storage.local.set({ bookmarks: bms2 });
      });
    });
  });
});

// ── Browser bookmark removed → remove from Folia (no undo) ───────────────────
chrome.bookmarks.onRemoved.addListener(function(id, removeInfo) {
  var url = removeInfo.node && removeInfo.node.url;
  if (!url || !url.startsWith("http")) return;

  chrome.storage.local.get(["bookmarks", "browserSyncEnabled"], function(d) {
    if (d.browserSyncEnabled === false) return;

    var bookmarks = d.bookmarks || [];
    var updated = bookmarks.filter(function(b) {
      // Remove only bookmarks that were originally saved via browser (fromBrowser flag)
      // matching this URL — don't delete manually-saved ones with the same URL
      return !(b.fromBrowser && b.url === url);
    });

    if (updated.length === bookmarks.length) return; // nothing to remove

    chrome.storage.local.set({ bookmarks: updated });
  });
});
