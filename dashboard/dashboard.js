// ─── Folia Dashboard ─────────────────────────────────────────────────────────

var PRIORITY_LABEL = { 1: "High", 2: "Medium", 3: "Low" };
var PRIORITY_COLOR = { 1: "#ef4444", 2: "#f59e0b", 3: "#6b7280" };

var S = {
  bookmarks: [], folders: [], sources: [],
  secureVault: [],
  view: "all",
  filterFolder: null, filterSource: null,
  search: "", sort: "date",
  newFolderOpen: false,
  newSourceOpen: false,
  separateSources: true,
  selectedIds: [],
  bulkMode: false
};

function getSourceMeta(id) {
  var s = S.sources.find(function(x) { return x.id === id; });
  if (s) return s;
  return { icon: "?", color: "#6b7280", label: id || "Unknown" };
}

// Render a source icon — favicon img if available, else emoji/text
function sourceIconHtml(sm, size) {
  size = size || 14;
  // Always render text icon — favicon is set via JS after insertion
  var letter = String(sm.icon || (sm.label || "?").charAt(0));
  var id = "si_" + (sm.id || Math.random().toString(36).slice(2));
  if (sm.faviconUrl) {
    return '<span class="src-fav" data-fav="' + sm.faviconUrl + '" data-size="' + size + '" ' +
           'style="display:inline-flex;align-items:center;justify-content:center;' +
           'width:' + size + 'px;height:' + size + 'px">' + letter + '</span>';
  }
  return '<span style="display:inline-flex;align-items:center;justify-content:center;' +
         'width:' + size + 'px;height:' + size + 'px">' + letter + '</span>';
}

// After any innerHTML injection, call this to swap in favicons
function hydrateFavicons(root) {
  (root || document).querySelectorAll(".src-fav[data-fav]").forEach(function(el) {
    var src = el.dataset.fav;
    var size = el.dataset.size || 14;
    if (!src) return;
    var img = new Image();
    img.onload = function() {
      el.innerHTML = "";
      img.style.cssText = "width:" + size + "px;height:" + size + "px;border-radius:3px;object-fit:contain";
      el.appendChild(img);
    };
    img.src = src;
  });
}

function msg(payload) {
  return new Promise(function(r) { chrome.runtime.sendMessage(payload, r); });
}

// ── Client-side duplicate name guard ─────────────────────────────────────────
function nameExistsInList(list, name, labelField, excludeId) {
  var lower = name.trim().toLowerCase();
  return list.some(function(item) {
    if (excludeId && item.id === excludeId) return false;
    return ((item[labelField] || item.name || item.label || "").toLowerCase() === lower);
  });
}



// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  var data = await msg({ type: "GET_DATA" });
  S.bookmarks   = data.bookmarks   || [];
  S.folders     = data.folders     || [];
  S.sources     = data.sources     || [];
  S.secureVault   = data.secureVault   || [];
  S.separateSources  = (data.separateSources !== undefined) ? data.separateSources : true;
  if (data.enigmaSettings) { ES.key = data.enigmaSettings.key || 'AAA'; ES.rings = data.enigmaSettings.rings || [0,0,0]; }
  S.browserSyncEnabled = (data.browserSyncEnabled !== undefined) ? data.browserSyncEnabled : true;
  render();

}



function render() {
  renderSidebar(); renderTopbar(); renderContent();
  hydrateFavicons();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  var sb = document.getElementById("sidebar");
  var high = S.bookmarks.filter(function(b) { return b.priority === 1; }).length;
  var srcs = Array.from(new Set(S.bookmarks.map(function(b) { return b.source; }))).length;

  sb.innerHTML = [
    '<div class="logo"><div class="logo-text">🔖 Folia</div><div class="logo-sub">AI Bookmark Manager</div></div>',
    '<div class="stats-grid">',
    stat(S.bookmarks.length, "Saved", "#c9a96e"),
    stat(high, "High Priority", "#ef4444"),
    stat(srcs, "Sources", "#6e40c9"),
    stat(S.folders.length, "Folders", "#4285F4"),
    '</div>',
    '<nav class="nav">',
    navBtn("all",      "⊞", "All Bookmarks",     S.bookmarks.length),
    navBtn("folders",  "🗂", "Folders",            S.folders.length),
    navBtn("settings", "⚙", "Sources & Settings", ""),
    navBtnSecure(),

    '<div class="nav-label">Sources <span style="font-size:9px;color:#3a3632;font-weight:400">click to enable/disable</span></div>',
    S.sources.map(function(s) {
      var cnt = S.bookmarks.filter(function(b) { return b.source === s.id; }).length;
      var sIcon = s.faviconUrl
        ? '<span class="src-fav" data-fav="' + s.faviconUrl + '" data-size="14" style="display:inline-flex;align-items:center;width:14px;height:14px">' + (s.icon || (s.label||'?').charAt(0)) + '</span>'
        : '<span>' + (s.icon || (s.label||'?').charAt(0)) + '</span>';
      var isOff = s.enabled === false;
      return '<button class="nav-btn" data-action="ts" data-val="' + s.id + '" title="' + (isOff ? 'Disabled — click to enable' : 'Enabled — click to disable') + '" style="' + (isOff ? 'opacity:0.35;text-decoration:line-through;' : '') + '">' +
        '<span style="font-size:14px;display:inline-flex;align-items:center;vertical-align:middle">' + sIcon + '</span> ' + (s.label||s.id) +
        '<span class="nav-count" style="color:' + (isOff ? '#3a3632' : '#c9a96e') + '">' + cnt + '</span></button>';
    }).join(""),
    '</nav>'
  ].join("");

  sb.querySelectorAll("[data-action='ts']").forEach(function(btn) {
    btn.addEventListener("click", async function() {
      var res = await msg({ type: "TOGGLE_SOURCE", id: btn.dataset.val });
      S.sources = res.sources;
      var src = S.sources.find(function(x) { return x.id === btn.dataset.val; });
      showToast((src ? src.label : btn.dataset.val) + " capture " + (src && src.enabled ? "ON" : "OFF"));
      render();
    });
  });
}

function stat(val, lbl, color) {
  return '<div class="stat"><div class="stat-val" style="color:' + color + '">' + val + '</div><div class="stat-lbl">' + lbl + '</div></div>';
}

function navBtnSecure() {
  var active = S.view === "secure";
  var cnt = S.secureVault ? S.secureVault.length : 0;
  return '<button class="nav-btn' + (active ? " active" : "") + '" data-nav="secure" style="' + (active ? "border-color:#f59e0b44;color:#f59e0b;" : "") + '">' +
    '<span>🗄</span> Secure Folder' +
    '<span class="nav-count" style="color:' + (active ? "#f59e0b" : "#3a3632") + '">' + cnt + '</span></button>';
}


function navBtn(viewId, icon, label, count) {
  var active = S.view === viewId && !S.filterSource;
  return '<button class="nav-btn' + (active ? " active" : "") + '" data-nav="' + viewId + '"><span>' + icon + '</span> ' + label +
    (count !== "" ? '<span class="nav-count">' + count + '</span>' : "") + '</button>';
}

document.getElementById("sidebar").addEventListener("click", function(e) {
  var btn = e.target.closest("[data-nav]");
  if (!btn) return;
  S.view = btn.dataset.nav; S.filterSource = null; S.filterFolder = null; render();
});

// ── Topbar ────────────────────────────────────────────────────────────────────
function renderTopbar() {
  var tb = document.getElementById("topbar");

  var bulkBar = S.bulkMode && S.selectedIds.length > 0
    ? '<div id="bulkBar" style="display:flex;align-items:center;gap:8px;background:#1a1816;border:1px solid #c9a96e44;border-radius:10px;padding:5px 10px;font-size:12px;color:#c9a96e">' +
        '<span style="font-weight:700">' + S.selectedIds.length + ' selected</span>' +
        '<select id="bulkMoveSelect" class="fi" style="font-size:11px;padding:4px 8px;height:28px">' +
          '<option value="">Move to folder…</option>' +
          S.folders.map(function(f) { return '<option value="' + f.id + '">' + f.icon + ' ' + esc(f.name) + '</option>'; }).join("") +
        '</select>' +
        '<button id="bulkDeleteBtn" class="btn-ghost" style="font-size:11px;padding:4px 10px;color:#ef4444;border-color:#ef444433">× Delete all</button>' +
        '<button id="bulkCancelBtn" class="btn-ghost" style="font-size:11px;padding:4px 10px">Cancel</button>' +
      '</div>'
    : '';

  tb.innerHTML =
    '<div class="search-wrap"><span class="search-icon">⌕</span>' +
    '<input id="searchInput" type="text" placeholder="Search…" value="' + esc(S.search) + '" autocomplete="off"/>' +
    '<div id="urlPreview" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;background:#0d0c0b;border:1px solid #2e2c29;border-radius:8px;padding:8px 12px;font-size:11px;color:#6b9fd4;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:100;pointer-events:none"></div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
    bulkBar +
    '<button id="bulkModeBtn" class="sort-btn' + (S.bulkMode ? ' active' : '') + '" title="Toggle bulk select mode" style="' + (S.bulkMode ? 'color:#c9a96e;border-color:#c9a96e44;' : '') + '">⊡ Select</button>' +
    '<div class="sort-btns">' +
      ["date","priority"].map(function(s) {
        return '<button class="sort-btn' + (S.sort===s?" active":"") + '" data-sort="' + s + '">' + s + '</button>';
      }).join("") +
    '</div></div>';

  // Search input
  var si = tb.querySelector("#searchInput");
  si.addEventListener("input", function(e) { S.search = e.target.value; renderContent(); });

  // URL preview: show URL of first matching bookmark under search box
  si.addEventListener("input", function(e) {
    var q = e.target.value.trim().toLowerCase();
    var preview = tb.querySelector("#urlPreview");
    if (!q) { preview.style.display = "none"; return; }
    var match = S.bookmarks.find(function(b) {
      return b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q);
    });
    if (match) {
      preview.textContent = match.url;
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  });
  si.addEventListener("blur", function() {
    setTimeout(function() { var p = tb.querySelector("#urlPreview"); if(p) p.style.display = "none"; }, 200);
  });
  si.addEventListener("focus", function() {
    if (!S.search) return;
    si.dispatchEvent(new Event("input"));
  });

  // Sort
  tb.querySelectorAll("[data-sort]").forEach(function(btn) {
    btn.addEventListener("click", function() { S.sort = btn.dataset.sort; renderTopbar(); renderContent(); });
  });

  // Bulk mode toggle
  tb.querySelector("#bulkModeBtn").addEventListener("click", function() {
    S.bulkMode = !S.bulkMode;
    S.selectedIds = [];
    renderTopbar(); renderContent();
  });

  // Bulk bar actions
  if (S.bulkMode && S.selectedIds.length > 0) {
    tb.querySelector("#bulkMoveSelect").addEventListener("change", async function() {
      var folderId = this.value;
      if (!folderId) return;
      for (var i = 0; i < S.selectedIds.length; i++) {
        var id = S.selectedIds[i];
        await msg({ type: "UPDATE_BOOKMARK", id: id, changes: { folderId: folderId } });
        var idx = S.bookmarks.findIndex(function(b) { return b.id === id; });
        if (idx !== -1) S.bookmarks[idx] = Object.assign({}, S.bookmarks[idx], { folderId: folderId });
      }
      showToast("✦ Moved " + S.selectedIds.length + " bookmarks");
      S.selectedIds = []; S.bulkMode = false;
      renderTopbar(); renderContent();
    });

    tb.querySelector("#bulkDeleteBtn").addEventListener("click", async function() {
      if (!confirm("Delete " + S.selectedIds.length + " bookmarks?")) return;
      for (var i = 0; i < S.selectedIds.length; i++) {
        await msg({ type: "DELETE_BOOKMARK", id: S.selectedIds[i] });
      }
      S.bookmarks = S.bookmarks.filter(function(b) { return !S.selectedIds.includes(b.id); });
      showToast("Deleted " + S.selectedIds.length + " bookmarks");
      S.selectedIds = []; S.bulkMode = false;
      renderTopbar(); renderContent();
    });

    tb.querySelector("#bulkCancelBtn").addEventListener("click", function() {
      S.selectedIds = []; S.bulkMode = false;
      renderTopbar(); renderContent();
    });
  }
}

// ── Content ───────────────────────────────────────────────────────────────────
function renderContent() {
  var area = document.getElementById("contentArea");
  area.innerHTML = "";
  try {
    if (S.view === "all")      renderAll(area);
    if (S.view === "folders")  renderFolders(area);
    if (S.view === "settings") renderSettings(area);
    if (S.view === "secure")   renderSecure(area);
  } catch(e) {
    area.innerHTML = '<div style="padding:40px;color:#ef4444;font-family:monospace;font-size:13px">' +
      '<div style="font-size:16px;margin-bottom:12px">⚠ Render error in ' + S.view + ' view</div>' +
      '<pre style="white-space:pre-wrap;color:#ef9999">' + e.message + '\n\n' + e.stack + '</pre></div>';
  }
}

// ── All Bookmarks ─────────────────────────────────────────────────────────────
function renderAll(area) {
  var q = S.search.toLowerCase();
  var bms = S.bookmarks.filter(function(b) {
    if (S.filterFolder   && b.folderId  !== S.filterFolder)   return false;
    if (S.filterSource   && b.source    !== S.filterSource)   return false;
    if (q) return b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || (b.tags||[]).some(function(t) { return t.includes(q); });
    return true;
  });
  if (S.sort === "priority") bms.sort(function(a,b) { return a.priority - b.priority; });

  else bms.sort(function(a,b) { return b.savedAt - a.savedAt; });

  var titleText = S.filterSource ? (S.sources.find(function(s) { return s.id === S.filterSource; }) || {label:"Source"}).label
    : S.filterFolder ? ((S.folders.find(function(f) { return f.id === S.filterFolder; }) || {name:"Folder"}).name)
    : "All Bookmarks";

  var heading = document.createElement("div");
  heading.className = "page-title";
  heading.innerHTML = esc(titleText) + ' <span class="page-count">' + bms.length + ' items</span>';
  area.appendChild(heading);

  var list = document.createElement("div");
  list.className = "bm-list";
  if (bms.length === 0) list.appendChild(emptyEl("No bookmarks found", "🔖"));
  else bms.forEach(function(bm) { list.appendChild(makeBmCard(bm)); });
  area.appendChild(list);
}

// ── Bookmark Card ─────────────────────────────────────────────────────────────
function makeBmCard(bm) {
  var sm = getSourceMeta(bm.source);
  var folder = S.folders.find(function(f) { return f.id === bm.folderId; });
  var host = bm.url; try { host = new URL(bm.url).hostname; } catch(e) {}
  var isSelected = S.selectedIds.includes(bm.id);

  var card = document.createElement("div");
  card.className = "bm-card" + (isSelected ? " bm-selected" : "");
  if (isSelected) card.style.borderColor = "#c9a96e44";

  // URL preview tooltip element (shown on hover of title)
  var urlTooltip = '<div class="url-tooltip" style="display:none;position:absolute;bottom:calc(100% + 4px);left:0;right:0;background:#0d0c0b;border:1px solid #2e2c29;border-radius:6px;padding:5px 10px;font-size:10px;color:#6b9fd4;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:50;pointer-events:none">' + esc(bm.url) + '</div>';

  card.innerHTML =
    (S.bulkMode ? '<div class="bulk-cb" style="display:flex;align-items:center;padding:0 6px 0 0;flex-shrink:0"><input type="checkbox" ' + (isSelected ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#c9a96e;cursor:pointer"/></div>' : '') +
    '<div class="src-dot" style="background:' + sm.color + '22;color:' + sm.color + ';border:1px solid ' + sm.color + '44;overflow:hidden">' + sourceIconHtml(sm, 16) + '</div>' +
    '<div class="bm-info" style="position:relative">' +
      urlTooltip +
      '<div class="bm-title bm-title-hover" style="cursor:pointer">' + esc(bm.title) + '</div>' +
      '<div class="bm-meta">' +
        (folder ? '<span class="pill" style="background:' + folder.color + '22;color:' + folder.color + ';border:1px solid ' + folder.color + '44">' + folder.icon + ' ' + esc(folder.name) + '</span>' : '') +
        '<span class="pill" style="background:' + PRIORITY_COLOR[bm.priority] + '22;color:' + PRIORITY_COLOR[bm.priority] + ';border:1px solid ' + PRIORITY_COLOR[bm.priority] + '44">' + PRIORITY_LABEL[bm.priority] + '</span>' +
        '<span class="bm-host">' + esc(host) + ' · ' + timeAgo(bm.savedAt) + '</span>' +
      '</div>' +
      ((bm.tags||[]).length > 0 ? '<div class="bm-tags">' + bm.tags.map(function(t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join("") + '</div>' : '') +
      (bm.note ? '<div class="bm-note">' + esc(bm.note) + '</div>' : '') +
      (bm.aiReason ? '<div class="bm-note" style="color:#475569;font-style:italic">🤖 ' + esc(bm.aiReason) + '</div>' : '') +
      // Inline edit panel (hidden by default)
      '<div class="edit-panel" style="display:none">' +
        '<div class="edit-row">' +
          '<label>Folder</label>' +
          '<select class="fi edit-folder">' +
            S.folders.map(function(f) { return '<option value="' + f.id + '"' + (bm.folderId === f.id ? ' selected' : '') + '>' + f.icon + ' ' + esc(f.name) + '</option>'; }).join("") +
          '</select>' +
        '</div>' +
        '<div class="edit-row">' +
          '<label>Priority</label>' +
          '<select class="fi edit-priority">' +
            [1,2,3].map(function(p) { return '<option value="' + p + '"' + (bm.priority === p ? ' selected' : '') + '>' + PRIORITY_LABEL[p] + '</option>'; }).join("") +
          '</select>' +
        '</div>' +
        '<textarea class="note-area edit-note" placeholder="Add a note…">' + esc(bm.note||"") + '</textarea>' +
        '<div style="display:flex;gap:7px;margin-top:6px">' +
          '<button class="btn-primary save-edit-btn" style="font-size:11px;padding:5px 14px">Save changes</button>' +
          '<button class="btn-ghost cancel-edit-btn" style="font-size:11px;padding:5px 10px">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="bm-actions">' +
      '<button class="action-btn edit-btn" title="Edit folder / priority / note">✎</button>' +
      '<a href="' + esc(bm.url) + '" target="_blank" class="action-btn" title="Open" style="text-decoration:none">↗</a>' +
      '<button class="action-btn del-btn" title="Delete">×</button>' +
    '</div>';

  // URL preview tooltip on title hover
  var titleEl = card.querySelector(".bm-title-hover");
  var tooltip  = card.querySelector(".url-tooltip");
  if (titleEl && tooltip) {
    titleEl.addEventListener("mouseenter", function() { tooltip.style.display = "block"; });
    titleEl.addEventListener("mouseleave", function() { tooltip.style.display = "none"; });
  }

  // Bulk select checkbox
  if (S.bulkMode) {
    var cb = card.querySelector(".bulk-cb input");
    if (cb) {
      cb.addEventListener("change", function() {
        if (this.checked) {
          if (!S.selectedIds.includes(bm.id)) S.selectedIds.push(bm.id);
        } else {
          S.selectedIds = S.selectedIds.filter(function(id) { return id !== bm.id; });
        }
        // Update card style immediately without full re-render
        card.style.borderColor = this.checked ? "#c9a96e44" : "";
        card.classList.toggle("bm-selected", this.checked);
        // Update bulk bar count
        var bulkBar = document.getElementById("bulkBar");
        if (bulkBar) bulkBar.querySelector("span").textContent = S.selectedIds.length + " selected";
        renderTopbar();
      });
    }
    // Clicking anywhere on card toggles it in bulk mode
    card.addEventListener("click", function(e) {
      if (e.target.closest(".bulk-cb") || e.target.tagName === "A") return;
      e.preventDefault(); e.stopPropagation();
      var checkbox = card.querySelector(".bulk-cb input");
      if (checkbox) { checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event("change")); }
    });
  } else {
    // Normal click — open link
    card.addEventListener("click", function(e) {
      if (e.target.closest(".edit-panel") || e.target.classList.contains("del-btn") ||
          e.target.classList.contains("edit-btn") || e.target.tagName === "A") return;
      chrome.tabs.create({ url: bm.url });
    });
  }

  // Edit toggle
  card.querySelector(".edit-btn").addEventListener("click", function() {
    var panel = card.querySelector(".edit-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  // Save edit
  card.querySelector(".save-edit-btn").addEventListener("click", async function() {
    var folderId = card.querySelector(".edit-folder").value;
    var priority = parseInt(card.querySelector(".edit-priority").value);
    var note     = card.querySelector(".edit-note").value;
    await msg({ type: "UPDATE_BOOKMARK", id: bm.id, changes: { folderId: folderId, priority: priority, note: note } });
    var idx = S.bookmarks.findIndex(function(b) { return b.id === bm.id; });
    if (idx !== -1) S.bookmarks[idx] = Object.assign({}, S.bookmarks[idx], { folderId: folderId, priority: priority, note: note });
    showToast("✦ Bookmark updated");
    renderContent();
  });

  card.querySelector(".cancel-edit-btn").addEventListener("click", function() {
    card.querySelector(".edit-panel").style.display = "none";
  });

  // Delete
  card.querySelector(".del-btn").addEventListener("click", async function() {
    await msg({ type: "DELETE_BOOKMARK", id: bm.id });
    S.bookmarks = S.bookmarks.filter(function(b) { return b.id !== bm.id; });
    showToast("Removed");
    render();
  });

  return card;
}

// ── Folders ───────────────────────────────────────────────────────────────────
function renderFolders(area) {
  var header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:18px";
  header.innerHTML = '<div class="page-title" style="margin-bottom:0">Folders</div><button id="newFolderBtn" class="btn-primary">+ New Folder</button>';
  area.appendChild(header);

  if (S.newFolderOpen) {
    var form = document.createElement("div");
    form.className = "new-folder-form";
    form.innerHTML =
      '<input id="nfIcon"  class="fi" value="📁" style="width:48px;text-align:center;font-size:18px"/>' +
      '<input id="nfName"  class="fi" placeholder="Folder name" style="flex:1"/>' +
      '<input id="nfDesc"  class="fi" placeholder="Description (optional)" style="flex:2"/>' +
      '<input id="nfColor" type="color" value="#6e40c9" style="width:36px;height:36px;border-radius:8px;border:1px solid #3a3632;background:none;cursor:pointer"/>' +
      '<button id="nfCreate" class="btn-primary">Create</button>' +
      '<button id="nfCancel" class="btn-ghost">Cancel</button>';
    area.appendChild(form);

    form.querySelector("#nfCreate").addEventListener("click", async function() {
      var name = form.querySelector("#nfName").value.trim();
      if (!name) { showToast("Folder name required", true); return; }
      // Client-side duplicate check (case-insensitive)
      if (nameExistsInList(S.folders, name, "name")) {
        showToast("A folder named \"" + name + "\" already exists", true); return;
      }
      var folder = {
        id: "f_" + Date.now(),
        name: name,
        icon: form.querySelector("#nfIcon").value || "📁",
        color: form.querySelector("#nfColor").value,
        description: form.querySelector("#nfDesc").value || "Custom folder"
      };
      var res = await msg({ type: "ADD_FOLDER", folder: folder });
      if (res && !res.ok) { showToast(res.reason || "Name already exists", true); return; }
      S.folders.push(folder);
      S.newFolderOpen = false;
      showToast("Folder created");
      renderContent();
    });
    form.querySelector("#nfCancel").addEventListener("click", function() { S.newFolderOpen = false; renderContent(); });
  }

  header.querySelector("#newFolderBtn").addEventListener("click", function() { S.newFolderOpen = !S.newFolderOpen; renderContent(); });

  var grid = document.createElement("div");
  grid.className = "folder-grid";

  S.folders.forEach(function(f) {
    var bms  = S.bookmarks.filter(function(b) { return b.folderId === f.id; });
    var high = bms.filter(function(b) { return b.priority === 1; }).length;
    var isBuiltin = ["dev","design","startup","ai","social","general"].includes(f.id);

    var card = document.createElement("div");
    card.className = "folder-card";
    card.style.borderColor = f.color + "44";
    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div class="folder-emoji">' + f.icon + '</div>' +
        (!isBuiltin ? '<button class="action-btn del-folder-btn" title="Delete folder" style="color:#ef4444;font-size:16px;opacity:0.5">×</button>' : '') +
      '</div>' +
      '<div class="folder-name-d" style="color:' + f.color + '">' + esc(f.name) + '</div>' +
      '<div class="folder-desc">' + esc(f.description||"") + '</div>' +
      '<div class="folder-stats">' +
        '<div><div class="folder-num" style="color:' + f.color + '">' + bms.length + '</div><div class="folder-unit">bookmarks</div></div>' +
        (high > 0 ? '<span class="high-badge" style="background:' + f.color + '22;color:' + f.color + ';border:1px solid ' + f.color + '44">🔥 ' + high + ' high</span>' : '') +
      '</div>';

    if (!isBuiltin) {
      card.querySelector(".del-folder-btn").addEventListener("click", async function(e) {
        e.stopPropagation();
        if (!confirm('Delete "' + f.name + '"? Bookmarks will move to General.')) return;
        await msg({ type: "DELETE_FOLDER", id: f.id });
        S.folders = S.folders.filter(function(x) { return x.id !== f.id; });
        S.bookmarks = S.bookmarks.map(function(b) { return b.folderId === f.id ? Object.assign({}, b, { folderId: "general" }) : b; });
        showToast("Folder removed");
        renderContent();
      });
    }

    card.addEventListener("click", function(e) {
      if (e.target.classList.contains("del-folder-btn")) return;
      S.view = "all"; S.filterFolder = f.id; S.filterSource = null; render();
    });
    grid.appendChild(card);
  });
  area.appendChild(grid);

}

// ── Settings ──────────────────────────────────────────────────────────────────
function renderSettings(area) {
  area.innerHTML = '<div class="page-title">Sources &amp; Settings</div>';

  // Source toggles + delete custom + add new
  var sec1 = document.createElement("div");
  sec1.className = "settings-section";
  sec1.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
      '<div class="section-title">Sources</div>' +
      '<button id="addSourceBtn" class="btn-primary" style="font-size:11px;padding:6px 14px">+ Add Source</button>' +
    '</div>' +
    '<div class="section-sub">Toggle capture on/off from the sidebar. Add or remove custom sources here.</div>' +
    '<div class="source-grid" id="sourceGrid"></div>';
  area.appendChild(sec1);

  // Add source form
  if (S.newSourceOpen) {
    var sf = document.createElement("div");
    sf.className = "new-folder-form";
    sf.style.marginTop = "12px";
    sf.innerHTML =
      '<input id="nsIcon"  class="fi" value="🌐" style="width:48px;text-align:center;font-size:18px"/>' +
      '<input id="nsLabel" class="fi" placeholder="Source name (e.g. Substack)" style="flex:1"/>' +
      '<input id="nsDomain" class="fi" placeholder="Domain (e.g. substack.com)" style="flex:1.5"/>' +
      '<input id="nsColor" type="color" value="#c9a96e" style="width:36px;height:36px;border-radius:8px;border:1px solid #3a3632;background:none;cursor:pointer"/>' +
      '<button id="nsCreate" class="btn-primary">Add</button>' +
      '<button id="nsCancel" class="btn-ghost">Cancel</button>';
    sec1.appendChild(sf);

    sf.querySelector("#nsCreate").addEventListener("click", async function() {
      var label  = sf.querySelector("#nsLabel").value.trim();
      var domain = sf.querySelector("#nsDomain").value.trim().replace(/^https?:\/\//, "");
      if (!label || !domain) { showToast("Name and domain required", true); return; }
      var source = {
        id:      "custom_" + domain.replace(/\./g,"_"),
        label:   label,
        icon:    sf.querySelector("#nsIcon").value || "🌐",
        color:   sf.querySelector("#nsColor").value,
        enabled: true,
        custom:  true,
        domain:  domain
      };
      var res = await msg({ type: "ADD_SOURCE", source: source });
      if (!res || !res.ok) { showToast(res && res.reason ? res.reason : "Duplicate source name", true); return; }
      S.sources = res.sources; S.newSourceOpen = false; showToast("Source added"); renderContent();
    });
    sf.querySelector("#nsCancel").addEventListener("click", function() { S.newSourceOpen = false; renderContent(); });
  }

  sec1.querySelector("#addSourceBtn").addEventListener("click", function() { S.newSourceOpen = !S.newSourceOpen; renderContent(); });

  var grid = sec1.querySelector("#sourceGrid");
  S.sources.forEach(function(s) {
    var cnt = S.bookmarks.filter(function(b) { return b.source === s.id; }).length;
    var tile = document.createElement("div");
    tile.className = "source-tile";
    tile.style.borderColor = s.enabled ? s.color + "55" : "#2e2c29";
    tile.innerHTML =
      '<div class="src-icon" style="overflow:hidden;display:flex;align-items:center;justify-content:center">' + sourceIconHtml(s, 20) + '</div>' +
      '<div style="flex:1">' +
        '<div class="src-label" style="color:' + (s.enabled ? s.color : "#666") + '">' + esc(s.label) + (s.custom ? ' <span style="font-size:9px;color:#555">[custom]</span>' : '') + '</div>' +
        '<div class="src-cnt">' + cnt + ' bookmarks · ' + (s.enabled ? "ON" : "OFF") + '</div>' +
      '</div>' +
      (s.custom ? '<button class="action-btn del-src-btn" title="Remove source" style="color:#ef4444">×</button>' : '') +
      '';

    if (s.custom) {
      tile.querySelector(".del-src-btn").addEventListener("click", async function() {
        var res = await msg({ type: "DELETE_SOURCE", id: s.id });
        S.sources = res.sources;
        showToast("Source removed");
        render();
      });
    }
    grid.appendChild(tile);
  });



  // ── Separate Sources per Website setting ─────────────────────────────────
  var sec3 = document.createElement("div");
  sec3.className = "settings-section";
  sec3.style.marginTop = "16px";
  var on = S.separateSources;
  sec3.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
      '<div>' +
        '<div class="section-title" style="margin-bottom:2px">🗂 Separate Source per Website</div>' +
        '<div class="section-sub">When ON, each new website you save gets its own source entry with favicon. When OFF, only built-in sources are used and unknown sites are grouped together.</div>' +
      '</div>' +
      '<button id="sepSrcToggle" style="' +
        'flex-shrink:0;margin-left:16px;' +
        'background:' + (on ? '#c9a96e' : '#2e2c29') + ';' +
        'border:none;border-radius:20px;width:48px;height:26px;cursor:pointer;position:relative;transition:background 0.2s">' +
        '<div style="position:absolute;top:3px;left:' + (on ? '25px' : '3px') + ';' +
          'width:20px;height:20px;border-radius:50%;background:#fff;transition:left 0.2s"></div>' +
      '</button>' +
    '</div>' +
    (on ? '' :
      '<div style="background:#f59e0b11;border:1px solid #f59e0b33;border-radius:8px;padding:10px 14px;font-size:11px;color:#f59e0b">' +
        '⚠ All bookmarks previously saved under auto-created sources have been moved to a general group.' +
      '</div>');
  area.appendChild(sec3);

  sec3.querySelector("#sepSrcToggle").addEventListener("click", async function() {
    var res = await msg({ type: "TOGGLE_SEPARATE_SOURCES" });
    S.separateSources = res.separateSources;
    if (res.bookmarks) S.bookmarks = res.bookmarks;
    if (res.sources)   S.sources   = res.sources;
    showToast(res.separateSources ? "Separate sources ON" : "Separate sources OFF");
    render();
  });

  // ── Browser Bookmark Sync toggle ─────────────────────────────────────────────
  var sec4 = document.createElement("div");
  sec4.className = "settings-section";
  sec4.style.marginTop = "16px";
  var bsOn = S.browserSyncEnabled;
  sec4.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between">' +
      '<div>' +
        '<div class="section-title" style="margin-bottom:2px">★ Browser Bookmark Sync</div>' +
        '<div class="section-sub">When ON, saving a bookmark via the browser star (Ctrl+D) automatically saves it to Folia too.</div>' +
      '</div>' +
      '<button id="bsSyncToggle" style="' +
        'flex-shrink:0;margin-left:16px;' +
        'background:' + (bsOn ? '#c9a96e' : '#2e2c29') + ';' +
        'border:none;border-radius:20px;width:48px;height:26px;cursor:pointer;position:relative;transition:background 0.2s">' +
        '<div style="position:absolute;top:3px;left:' + (bsOn ? '25px' : '3px') + ';' +
          'width:20px;height:20px;border-radius:50%;background:#fff;transition:left 0.2s"></div>' +
      '</button>' +
    '</div>';
  area.appendChild(sec4);

  sec4.querySelector("#bsSyncToggle").addEventListener("click", function() {
    S.browserSyncEnabled = !S.browserSyncEnabled;
    chrome.storage.local.set({ browserSyncEnabled: S.browserSyncEnabled });
    showToast("Browser sync " + (S.browserSyncEnabled ? "ON — Ctrl+D saves will appear in Folia" : "OFF — browser bookmarks won't sync"));
    render();
  });

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────────
  var sec5 = document.createElement("div");
  sec5.className = "settings-section";
  sec5.style.marginTop = "16px";
  sec5.innerHTML =
    '<div class="section-title" style="margin-bottom:2px">⌨ Keyboard Shortcuts</div>' +
    '<div class="section-sub">Default shortcuts — change them in <strong style="color:var(--text)">chrome://extensions/shortcuts</strong> (Chrome) or <strong style="color:var(--text)">about:addons</strong> (Firefox).</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">' +
      kbRow("Alt + F", "Open Folia Dashboard") +
      kbRow("Alt + S", "Quick-save current page") +
    '</div>';
  area.appendChild(sec5);
}

function kbRow(keys, desc) {
  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#0f0e0d;border:1px solid var(--border);border-radius:8px">' +
    '<span style="color:var(--muted);font-size:12px">' + esc(desc) + '</span>' +
    '<kbd style="background:#1a1816;border:1px solid #3a3632;border-bottom:2px solid #3a3632;border-radius:5px;padding:3px 8px;font-family:monospace;font-size:11px;color:var(--accent)">' + esc(keys) + '</kbd>' +
  '</div>';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showToast(text, isErr) {
  var ex = document.querySelector(".toast");
  if (ex) ex.remove();
  var t = document.createElement("div");
  t.className = "toast";
  t.style.background = isErr ? "#ef4444" : "#c9a96e";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 2400);
}

function emptyEl(text, icon) {
  var d = document.createElement("div");
  d.className = "empty";
  d.innerHTML = '<div class="empty-icon">' + (icon||"🔖") + '</div><div>' + esc(text) + '</div>';
  return d;
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function timeAgo(ts) {
  var d = Date.now() - ts;
  if (d < 60000)    return "just now";
  if (d < 3600000)  return Math.floor(d/60000) + "m ago";
  if (d < 86400000) return Math.floor(d/3600000) + "h ago";
  return Math.floor(d/86400000) + "d ago";
}

init();

// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// ── ENIGMA M3 CIPHER ENGINE ───────────────────────────────────────────────────
// Used exclusively by Secure Folder for encrypting/decrypting bookmarks
// ═══════════════════════════════════════════════════════════════════════════════

var ENIGMA_ROTORS = {
  R1:  "EKMFLGDQVZNTOWYHXUSPAIBRCJ",
  R2:  "AJDKSIRUXBLHWTMCQGZNPYFVOE",
  R3:  "BDFHJLCPRTXVZNYEIWGAKMUSQO",
  REF: "YRUHQSLDPXNGOKMIEBFZCWVJAT"
};
var ENIGMA_NOTCHES = { R1: 'Q', R2: 'E', R3: 'V' };

// Enigma session state — key, rings, plugs, decoded cache
var ES = {
  key:        "AAA",
  rings:      [0, 0, 0],
  plugs:      {},
  vaultTitle: "",
  vaultUrl:   "",
  decoded:    {}
};

function enigmaRotate(arr) {
  var n = arr.slice(); n.push(n.shift()); return n;
}

function enigmaProcess(input, key, rings, plugs) {
  if (!key || key.length < 3) return input;
  input = input.toUpperCase();

  // Build plugboard both-ways map
  var pb = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function(l) { pb[l] = l; });
  Object.keys(plugs || {}).forEach(function(k) { pb[k] = plugs[k]; pb[plugs[k]] = k; });

  var r1 = ENIGMA_ROTORS.R1.split("");
  var r2 = ENIGMA_ROTORS.R2.split("");
  var r3 = ENIGMA_ROTORS.R3.split("");

  // Apply ring offsets
  for (var i = 0; i < rings[0]; i++) r1 = enigmaRotate(r1);
  for (var i = 0; i < rings[1]; i++) r2 = enigmaRotate(r2);
  for (var i = 0; i < rings[2]; i++) r3 = enigmaRotate(r3);

  // Apply initial key positions
  var k1 = key.charCodeAt(0) - 65;
  var k2 = key.charCodeAt(1) - 65;
  var k3 = key.charCodeAt(2) - 65;
  for (var i = 0; i < k1; i++) r1 = enigmaRotate(r1);
  for (var i = 0; i < k2; i++) r2 = enigmaRotate(r2);
  for (var i = 0; i < k3; i++) r3 = enigmaRotate(r3);

  var out = "";
  for (var i = 0; i < input.length; i++) {
    var ch = input[i];
    if (ch >= 'A' && ch <= 'Z') {
      // Double-stepping
      if (r2[0] === ENIGMA_NOTCHES.R2) { r3 = enigmaRotate(r3); r2 = enigmaRotate(r2); }
      if (r1[0] === ENIGMA_NOTCHES.R1)   r2 = enigmaRotate(r2);
      r1 = enigmaRotate(r1);

      // Forward through plugboard → R1 → R2 → R3 → Reflector → R3 → R2 → R1 → plugboard
      ch = pb[ch];
      ch = r1[ch.charCodeAt(0) - 65];
      ch = r2[ch.charCodeAt(0) - 65];
      ch = r3[ch.charCodeAt(0) - 65];
      ch = ENIGMA_ROTORS.REF[ch.charCodeAt(0) - 65];
      ch = String.fromCharCode(65 + r3.indexOf(ch));
      ch = String.fromCharCode(65 + r2.indexOf(ch));
      ch = String.fromCharCode(65 + r1.indexOf(ch));
      ch = pb[ch];
      out += ch;
    } else {
      out += input[i]; // preserve non-alpha characters as-is
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── SECURE FOLDER ─────────────────────────────────────────────────────────────
// Bookmarks saved here are Enigma-encrypted at rest. Enigma must be ON to add.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Save secureVault to storage ───────────────────────────────────────────────
async function saveSecureVault() {
  await msg({ type: "SAVE_SECURE_VAULT", entries: S.secureVault });
}

function renderSecure(area) {
  var vault = S.secureVault || [];

  // ── Header ───────────────────────────────────────────────────────────────────
  var hdr = document.createElement("div");
  hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:24px";

  var hdrLeft = document.createElement("div");
  hdrLeft.innerHTML =
    "<div class='page-title' style='margin-bottom:4px'>🗄 Secure Folder</div>" +
    "<div style='font-size:12px;color:#6b6560'>Configure your Enigma key and rings. These settings are used automatically when saving encrypted bookmarks.</div>";

  var hdrRight = document.createElement("div");
  hdrRight.style.cssText = "display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:20px";

  var statusLabel = document.createElement("span");
  statusLabel.style.cssText = "font-size:11px;font-weight:700;color:#f59e0b";
  statusLabel.textContent = "🔐 Enigma Active";

  hdrRight.appendChild(statusLabel);
  hdr.appendChild(hdrLeft);
  hdr.appendChild(hdrRight);
  area.appendChild(hdr);

  // ── Enigma Key & Rings Config ─────────────────────────────────────────────────
  var box = document.createElement("div");
  box.style.cssText = "background:#070a0f;border:1px solid #f59e0b44;border-radius:14px;padding:24px;width:100%;box-sizing:border-box";



  // Key input
  var keySection = document.createElement("div");
  keySection.style.marginBottom = "20px";
  var keyLbl = document.createElement("div");
  keyLbl.style.cssText = "font-size:10px;color:#6b6560;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px";
  keyLbl.textContent = "Grundstellung Key (3 letters)";
  var keyInp = document.createElement("input");
  keyInp.type = "text"; keyInp.maxLength = 3; keyInp.placeholder = "AAA";
  keyInp.style.cssText = "background:#000;border:2px solid #f59e0b44;border-radius:10px;color:#f59e0b;" +
    "font-size:32px;font-family:'Courier New',monospace;font-weight:700;letter-spacing:0.6em;" +
    "padding:14px 16px;text-align:center;width:100%;box-sizing:border-box;outline:none;transition:border-color 0.2s";
  keyInp.value = "";
  keyInp.addEventListener("input", function() {
    this.value = this.value.toUpperCase().replace(/[^A-Z]/g, "");
  });
  keyInp.addEventListener("focus", function() { this.style.borderColor = "#f59e0b"; });
  keyInp.addEventListener("blur",  function() { this.style.borderColor = "#f59e0b44"; });
  keySection.appendChild(keyLbl);
  keySection.appendChild(keyInp);
  box.appendChild(keySection);

  // Ring inputs
  var ringSection = document.createElement("div");
  ringSection.style.marginBottom = "24px";
  var ringLbl = document.createElement("div");
  ringLbl.style.cssText = "font-size:10px;color:#6b6560;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px";
  ringLbl.textContent = "Ring Settings (0 – 25 each)";
  ringSection.appendChild(ringLbl);

  var ringGrid = document.createElement("div");
  ringGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px";
  var ringInputs = [];
  [0,1,2].forEach(function(i) {
    var col = document.createElement("div");
    var lbl = document.createElement("div");
    lbl.style.cssText = "font-size:10px;color:#475569;text-align:center;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em";
    lbl.textContent = "Rotor " + (i+1);
    var inp = document.createElement("input");
    inp.type = "number"; inp.min = 0; inp.max = 25;
    inp.style.cssText = "background:#050709;border:1px solid #1e2530;border-radius:10px;color:#f59e0b;" +
      "font-family:monospace;font-size:24px;font-weight:700;padding:12px 4px;text-align:center;" +
      "width:100%;box-sizing:border-box;outline:none;transition:border-color 0.2s";
    inp.value = "";
    inp.addEventListener("focus", function() { this.style.borderColor = "#f59e0b"; });
    inp.addEventListener("blur",  function() { this.style.borderColor = "#1e2530"; });
    ringInputs.push(inp);
    col.appendChild(lbl);
    col.appendChild(inp);
    ringGrid.appendChild(col);
  });
  ringSection.appendChild(ringGrid);
  box.appendChild(ringSection);

  // Save button
  var saveBtn = document.createElement("button");
  saveBtn.className = "enigma-save-btn";
  saveBtn.style.cssText = "width:100%;font-size:14px;padding:14px;display:block;box-sizing:border-box";
  saveBtn.textContent = "Save Enigma Settings";
  saveBtn.addEventListener("click", function() {
    var key = keyInp.value.toUpperCase().replace(/[^A-Z]/g, "");
    if (key.length < 3) { showToast("Enter a 3-letter key", true); return; }
    var rings = ringInputs.map(function(inp) {
      return Math.max(0, Math.min(25, parseInt(inp.value) || 0));
    });
    ES.key = key;
    ES.rings = rings;
    // Persist to storage so popup can read them
    chrome.storage.local.set({ enigmaSettings: { key: key, rings: rings } });

    showToast("✓ Enigma settings saved — " + key + " / " + rings.join("-"));
  });
  box.appendChild(saveBtn);
  area.appendChild(box);

  // ── Vault list ───────────────────────────────────────────────────────────────
  if (vault.length === 0) return;

  var listHdr = document.createElement("div");
  listHdr.style.cssText = "font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b6560;margin:28px 0 10px";
  listHdr.textContent = "🗄 Encrypted Entries (" + vault.length + ")";
  area.appendChild(listHdr);

  vault.forEach(function(entry) {
    var cacheKey = "sec_" + entry.id;
    var decoded  = ES.decoded[cacheKey];
    var card = document.createElement("div");
    card.style.cssText = "background:#070a0f;border:1px solid #1e2530;border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px";

    var textWrap = document.createElement("div");
    textWrap.style.flex = "1";
    var titleEl = document.createElement("div");
    titleEl.style.cssText = "font-family:monospace;font-size:13px;margin-bottom:4px;word-break:break-all;" + (decoded ? "color:#f0ece4" : "color:#f59e0b;letter-spacing:0.12em");
    titleEl.textContent = decoded ? decoded.title : entry.encTitle;
    var urlEl = document.createElement("div");
    urlEl.style.cssText = "font-family:monospace;font-size:11px;word-break:break-all;" + (decoded ? "color:#6b9fd4" : "color:#b08040;letter-spacing:0.08em");
    urlEl.textContent = decoded ? decoded.url : entry.encUrl;
    var metaEl = document.createElement("div");
    metaEl.style.cssText = "font-size:10px;color:#3a3632;margin-top:4px";
    metaEl.textContent = timeAgo(entry.savedAt);
    textWrap.appendChild(titleEl);
    textWrap.appendChild(urlEl);
    textWrap.appendChild(metaEl);
    card.appendChild(textWrap);

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;flex-shrink:0";

    if (decoded) {
      var openBtn = document.createElement("a");
      openBtn.href = decoded.url; openBtn.target = "_blank";
      openBtn.className = "action-btn"; openBtn.style.cssText = "text-decoration:none;font-size:14px";
      openBtn.textContent = "↗"; actions.appendChild(openBtn);
    }

    var decodeBtn = document.createElement("button");
    decodeBtn.className = "action-btn";
    decodeBtn.style.cssText = "font-size:12px;" + (decoded ? "color:#6b6560" : "color:#f59e0b");
    decodeBtn.textContent = decoded ? "🔒 Lock" : "🔓 Decode";
    decodeBtn.addEventListener("click", function() {
      if (decoded) { delete ES.decoded[cacheKey]; render(); return; }
      showDecodeModal(entry, cacheKey);
    });
    actions.appendChild(decodeBtn);

    var delBtn = document.createElement("button");
    delBtn.className = "action-btn"; delBtn.style.color = "#ef4444"; delBtn.textContent = "×";
    delBtn.addEventListener("click", async function() {
      S.secureVault = S.secureVault.filter(function(e) { return e.id !== entry.id; });
      delete ES.decoded[cacheKey];
      await saveSecureVault(); showToast("Entry removed"); render();
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    area.appendChild(card);
  });
}
// ── END SECURE FOLDER ─────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// ── DECODE MODAL — 2 attempts max, then auto-delete ───────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function showDecodeModal(entry, cacheKey) {
  var existing = document.getElementById("__folia_decode_modal__");
  if (existing) existing.remove();

  // Always read attempts from live S.secureVault — never from stale passed entry
  var liveEntry = S.secureVault.find(function(e) { return e.id === entry.id; }) || entry;
  var attemptsUsed = liveEntry.attempts || 0;
  var attemptsLeft = 2 - attemptsUsed;

  // Parse keySnapshot to pre-fill inputs e.g. "AAA-000"
  var snapKey   = "AAA";
  var snapRings = [0, 0, 0];
  if (entry.keySnapshot) {
    var parts = entry.keySnapshot.split("-");
    if (parts[0] && parts[0].length === 3) snapKey = parts[0];
    if (parts[1] && parts[1].length === 3) {
      snapRings = parts[1].split("").map(Number);
    }
  }

  // Build modal with DOM methods — no innerHTML string concatenation
  var overlay = document.createElement("div");
  overlay.id = "__folia_decode_modal__";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center";

  var box = document.createElement("div");
  box.style.cssText = "background:#1a1816;border:1px solid #2e2c29;border-radius:16px;padding:28px 32px;width:380px;max-width:90vw;box-shadow:0 24px 80px rgba(0,0,0,0.6)";

  // Title
  var titleRow = document.createElement("div");
  titleRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:6px";
  titleRow.innerHTML = "<span style='font-size:22px'>🔐</span><div style='font-family:serif;font-size:18px;color:#f0ece4;font-weight:700'>Decode Entry</div>";
  box.appendChild(titleRow);

  var sub = document.createElement("div");
  sub.style.cssText = "font-size:11px;color:#6b6560;margin-bottom:16px";
  sub.textContent = "Enter the key and ring settings used when this entry was saved.";
  box.appendChild(sub);



  // Key input
  var keyLabel = document.createElement("label");
  keyLabel.style.cssText = "font-size:10px;color:#6b6560;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.08em";
  keyLabel.textContent = "Grundstellung Key (3 letters)";
  box.appendChild(keyLabel);

  var keyInput = document.createElement("input");
  keyInput.className = "enigma-key-input";
  keyInput.type = "text"; keyInput.maxLength = 3;
  keyInput.value = ""; keyInput.placeholder = "AAA";
  keyInput.style.cssText = "font-size:22px;padding:10px 14px;letter-spacing:0.5em;width:100%;text-align:center;margin-bottom:14px;box-sizing:border-box";
  keyInput.addEventListener("input", function() {
    this.value = this.value.toUpperCase().replace(/[^A-Z]/g, "");
  });
  box.appendChild(keyInput);

  // Ring settings
  var ringLabel = document.createElement("label");
  ringLabel.style.cssText = "font-size:10px;color:#6b6560;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em";
  ringLabel.textContent = "Ring Settings (0-25 each)";
  box.appendChild(ringLabel);

  var ringGrid = document.createElement("div");
  ringGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px";
  var ringInputs = [];
  [0,1,2].forEach(function(i) {
    var wrap = document.createElement("div");
    wrap.style.textAlign = "center";
    var lbl = document.createElement("div");
    lbl.style.cssText = "font-size:9px;color:#475569;margin-bottom:3px";
    lbl.textContent = "Rotor " + (i+1);
    var inp = document.createElement("input");
    inp.className = "enigma-ring-input";
    inp.type = "number"; inp.min = 0; inp.max = 25;
    inp.value = "";
    inp.style.cssText = "width:100%;text-align:center";
    ringInputs.push(inp);
    wrap.appendChild(lbl); wrap.appendChild(inp);
    ringGrid.appendChild(wrap);
  });
  box.appendChild(ringGrid);

  // Attempts warning
  var warn = document.createElement("div");
  warn.style.cssText = "border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:11px;" +
    "background:" + (attemptsLeft <= 1 ? "#ef444411" : "#f59e0b11") + ";" +
    "border:1px solid " + (attemptsLeft <= 1 ? "#ef444433" : "#f59e0b33") + ";" +
    "color:" + (attemptsLeft <= 1 ? "#ef9999" : "#f59e0b");
  warn.innerHTML = attemptsLeft <= 1
    ? "<strong style='color:#ef4444'>⚠ Last attempt.</strong> Wrong key = this entry is permanently deleted."
    : "🔑 <strong>" + attemptsLeft + " attempts</strong> remaining. Wrong key = deleted after 2 failures.";
  box.appendChild(warn);

  // Buttons
  var btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:10px";

  var decodeBtn = document.createElement("button");
  decodeBtn.className = "enigma-save-btn";
  decodeBtn.style.flex = "1";
  decodeBtn.textContent = "🔓 Decode";

  var cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", function() { overlay.remove(); });

  btnRow.appendChild(decodeBtn);
  btnRow.appendChild(cancelBtn);
  box.appendChild(btnRow);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  keyInput.focus();
  keyInput.select();

  // Click outside closes
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener("keydown", function(e) {
    if (e.key === "Escape") overlay.remove();
    if (e.key === "Enter") decodeBtn.click();
  });

  decodeBtn.addEventListener("click", async function() {
    var key = keyInput.value.trim().toUpperCase();
    if (!key || key.length < 3) { showToast("Enter a 3-letter key", true); return; }

    var rings = ringInputs.map(function(inp) {
      return Math.max(0, Math.min(25, parseInt(inp.value) || 0));
    });

    var decTitle = enigmaProcess(entry.encTitle, key, rings, {});
    var decUrl   = enigmaProcess(entry.encUrl,   key, rings, {});

    // Validate by comparing key+rings against the saved snapshot
    var inputSnapshot = key + "-" + rings.join("");
    var savedSnapshot = (entry.keySnapshot || "").toUpperCase();
    var looksValid = inputSnapshot === savedSnapshot;

    // Fallback: if no snapshot stored, use URL heuristic
    if (!entry.keySnapshot) {
      looksValid = decUrl.replace(/[^A-Z]/g,"").startsWith("HTTP");
    }

    var newAttempts = attemptsUsed + 1;
    var attemptsSave = looksValid ? 0 : newAttempts;
    await msg({ type: "UPDATE_SECURE_ATTEMPTS", id: entry.id, attempts: attemptsSave });
    // Keep S.secureVault in sync so next modal open reads correct count
    S.secureVault = S.secureVault.map(function(e) {
      return e.id === entry.id ? Object.assign({}, e, { attempts: attemptsSave }) : e;
    });

    if (looksValid) {
      ES.decoded[cacheKey] = { title: decTitle, url: decUrl };
      overlay.remove();

      // Dramatic reveal overlay
      var reveal = document.createElement("div");
      reveal.style.cssText = "position:fixed;inset:0;z-index:10000;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0";
      var lines = [
        { text: "TRANSMISSION DECRYPTED", color: "#f59e0b", size: "13px", spacing: "0.35em", delay: 0 },
        { text: "— CLASSIFIED —",         color: "#ef4444", size: "11px", spacing: "0.5em",  delay: 350 },
        { text: decTitle,                  color: "#f0ece4", size: "20px", spacing: "0.05em", delay: 800 },
        { text: decUrl.slice(0,48) + (decUrl.length > 48 ? "…" : ""), color: "#6b9fd4", size: "11px", spacing: "0.08em", delay: 1100 },
      ];
      lines.forEach(function(l) {
        var el = document.createElement("div");
        el.style.cssText = "font-family:'Courier New',monospace;font-weight:700;text-transform:uppercase;" +
          "color:" + l.color + ";font-size:" + l.size + ";letter-spacing:" + l.spacing + ";" +
          "opacity:0;transition:opacity 0.6s;margin:6px 40px;text-align:center;max-width:600px;word-break:break-all";
        el.textContent = l.text;
        reveal.appendChild(el);
        setTimeout(function() { el.style.opacity = "1"; }, l.delay);
      });
      // Dismiss
      setTimeout(function() {
        reveal.style.transition = "opacity 0.5s";
        reveal.style.opacity = "0";
        setTimeout(function() { reveal.remove(); render(); }, 500);
      }, 2400);
      reveal.addEventListener("click", function() { reveal.remove(); render(); });
      document.body.appendChild(reveal);
    } else if (newAttempts >= 2) {
      S.secureVault = S.secureVault.filter(function(e) { return e.id !== entry.id; });
      await saveSecureVault();
      overlay.remove();
      showToast("❌ Wrong key — entry permanently deleted", true);
      render();
    } else {
      overlay.remove();
      showDecodeModal(Object.assign({}, entry, { attempts: newAttempts }), cacheKey);
      showToast("Wrong key — 1 attempt remaining", true);
    }
  });
}
// ── END DECODE MODAL ──────────────────────────────────────────────────────────
