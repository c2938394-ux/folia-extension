// ─── Folia Content Script ─────────────────────────────────────────────────────
(function () {
  if (window.__foliaInjected) return;
  window.__foliaInjected = true;

  var hoverBtn     = null;
  var hoverTarget  = null;
  var hoverTimer   = null;
  var sourcesCache = [];
  var currentSourceId = "web";
  var hoverAttached   = false;

  // ── Source detection — custom sources (domain field) checked first ────────────
  function detectSourceFromList(sources, url) {
    url = url || "";
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      if (s.custom && s.domain && url.includes(s.domain)) return s.id;
    }
    if (url.includes("twitter.com") || url.includes("x.com"))    return "twitter";
    if (url.includes("instagram.com"))                            return "instagram";
    if (url.includes("reddit.com"))                               return "reddit";
    if (url.includes("linkedin.com"))                             return "linkedin";
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("pinterest.com"))                            return "pinterest";
    if (url.includes("github.com"))                               return "github";
    if (url.includes("medium.com"))                               return "medium";
    if (url.includes("google.com"))                               return "google";
    return "web";
  }

  function getSourceMeta(sourceId) {
    var found = sourcesCache.find(function(s) { return s.id === sourceId; });
    if (found) return found;
    // Built-in fallbacks
    var builtins = {
      twitter:   { icon: "𝕏",  color: "#1DA1F2", label: "X / Twitter" },
      instagram: { icon: "📷", color: "#E1306C", label: "Instagram" },
      reddit:    { icon: "🤖", color: "#FF4500", label: "Reddit" },
      linkedin:  { icon: "💼", color: "#0077B5", label: "LinkedIn" },
      youtube:   { icon: "▶",  color: "#FF0000", label: "YouTube" },
      pinterest: { icon: "📌", color: "#E60023", label: "Pinterest" },
      github:    { icon: "⬡",  color: "#6e40c9", label: "GitHub" },
      medium:    { icon: "M",  color: "#00ab6c", label: "Medium" },
      google:    { icon: "G",  color: "#4285F4", label: "Google" }
    };
    return builtins[sourceId] || { icon: "?", color: "#c9a96e", label: sourceId || "Site" };
  }

  function isSourceEnabled(sourceId) {
    var src = sourcesCache.find(function(s) { return s.id === sourceId; });
    return src ? src.enabled : true;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────
  function showToast(text, type) {
    var ex = document.getElementById("__folia_toast__");
    if (ex) ex.remove();
    var t = document.createElement("div");
    t.id = "__folia_toast__";
    t.style.cssText =
      "position:fixed;bottom:28px;right:28px;z-index:2147483647;" +
      "background:" + (type === "error" ? "#ef4444" : "#c9a96e") + ";" +
      "color:#0a0908;padding:10px 18px;border-radius:24px;" +
      "font-family:'DM Sans',system-ui,sans-serif;font-size:13px;font-weight:700;" +
      "box-shadow:0 4px 24px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;pointer-events:none;";
    t.innerHTML = "<span>" + (type === "error" ? "⚠" : "🔖") + "</span> " + text;
    document.body.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.remove(); }, 2800);
  }

  // ── Valid link — no nav/hash/js links; allow same-domain on custom source pages ─
  function isValidHoverLink(link) {
    if (!link || !link.href) return false;
    if (!link.href.startsWith("http")) return false;
    try {
      var linkHost = new URL(link.href).hostname;
      var pageHost = window.location.hostname;
      if (linkHost === pageHost) {
        // Allow same-domain only if current page is a known custom source
        // (e.g. saving internal chatgpt.com links)
        var pageSrc = detectSourceFromList(sourcesCache, window.location.href);
        var pageSrcObj = sourcesCache.find(function(s) { return s.id === pageSrc; });
        if (!pageSrcObj || !pageSrcObj.custom) return false;
      }
    } catch(e) { return false; }
    return true;
  }

  // ── Create hover button (once) ───────────────────────────────────────────────
  function ensureBtn() {
    if (hoverBtn) return hoverBtn;
    hoverBtn = document.createElement("button");
    hoverBtn.id = "__folia_hover_btn__";
    hoverBtn.title = "Save to Folia";
    hoverBtn.textContent = "🔖";
    hoverBtn.style.cssText =
      "position:fixed;z-index:2147483646;" +
      "background:#c9a96e;color:#0a0908;" +
      "border:none;border-radius:50%;" +
      "width:30px;height:30px;font-size:14px;" +
      "cursor:pointer;box-shadow:0 2px 12px rgba(201,169,110,0.5);" +
      "display:none;align-items:center;justify-content:center;" +
      "transition:transform 0.15s;pointer-events:all;";
    hoverBtn.addEventListener("mouseenter", function() { hoverBtn.style.transform = "scale(1.15)"; });
    hoverBtn.addEventListener("mouseleave", function() { hoverBtn.style.transform = "scale(1)"; });
    hoverBtn.addEventListener("click", function(e) {
      e.preventDefault(); e.stopPropagation();
      if (!hoverTarget) return;
      var url   = hoverTarget.href;
      var title = hoverTarget.textContent.trim().slice(0, 120) || url;
      // Detect source: check the link's URL first, then fall back to page source
      // so that links on chatgpt.com get tagged as "chatgpt" not "web"
      var srcId = detectSourceFromList(sourcesCache, url);
      // Inherit page source when link has no specific source match
      if (!srcId || srcId === "unknown") {
        var pageSrc = detectSourceFromList(sourcesCache, window.location.href);
        if (pageSrc) srcId = pageSrc;
      }
      chrome.runtime.sendMessage({ type: "SAVE_BOOKMARK", payload: { title: title, url: url, source: srcId } }, function(res) {
        if (res && res.duplicate) showToast("Already saved!", "error");
        else showToast("Saved: " + (title.slice(0, 30) || url));
      });
      hideBtn();
    });
    document.body.appendChild(hoverBtn);
    return hoverBtn;
  }

  // ── Show / hide ───────────────────────────────────────────────────────────────
  function showBtn(link, x, y) {
    var btn = ensureBtn();
    hoverTarget = link;
    btn.style.left    = Math.min(x + 14, window.innerWidth - 44) + "px";
    btn.style.top     = Math.max(y - 18, 8) + "px";
    btn.style.display = "flex";
  }

  function hideBtn() {
    if (hoverBtn) hoverBtn.style.display = "none";
    hoverTarget = null;
  }

  // ── Attach hover listeners (once) ────────────────────────────────────────────
  function attachHoverOnce() {
    if (hoverAttached) return;
    hoverAttached = true;

    document.addEventListener("mouseover", function(e) {
      var link = e.target.closest("a[href]");
      if (!link || !isValidHoverLink(link)) { clearTimeout(hoverTimer); return; }

      // Check if the target link's source is enabled
      var targetSrcId = detectSourceFromList(sourcesCache, link.href);
      if (!isSourceEnabled(targetSrcId)) { clearTimeout(hoverTimer); return; }

      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function() { showBtn(link, e.clientX, e.clientY); }, 400);
    }, { passive: true });

    document.addEventListener("mouseout", function(e) {
      var link = e.target.closest("a[href]");
      if (!link) return;
      clearTimeout(hoverTimer);
      setTimeout(function() {
        var b = document.getElementById("__folia_hover_btn__");
        if (!b || !b.matches(":hover")) hideBtn();
      }, 180);
    }, { passive: true });

    document.addEventListener("scroll", hideBtn, { passive: true });
  }

  // ── Refresh sources from storage ──────────────────────────────────────────────
  function refreshSources(cb) {
    chrome.runtime.sendMessage({ type: "GET_DATA" }, function(data) {
      sourcesCache    = data && data.sources ? data.sources : [];
      currentSourceId = detectSourceFromList(sourcesCache, window.location.href);
      if (cb) cb();
    });
  }

  // ── Message listener ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === "FOLIA_SAVED") {
      showToast('Saved: "' + (msg.title || "").slice(0, 40) + '"');
    }
    if (msg.type === "FOLIA_SOURCES_UPDATED") {
      refreshSources(function() {
        // If current hover target's source is now disabled, hide
        if (hoverTarget) {
          var srcId = detectSourceFromList(sourcesCache, hoverTarget.href);
          if (!isSourceEnabled(srcId)) hideBtn();
        }
      });
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  refreshSources(function() {
    attachHoverOnce();
  });

})();
