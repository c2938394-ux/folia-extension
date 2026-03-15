// ─── Folia Popup JS ───────────────────────────────────────────────────────────

const PRIORITY_LABEL = { 1: "High", 2: "Med", 3: "Low" };
const PRIORITY_COLOR = { 1: "#ef4444", 2: "#f59e0b", 3: "#6b7280" };

const SOURCE_META = {
  twitter:   { icon: "𝕏",  color: "#1DA1F2" },
  instagram: { icon: "📷", color: "#E1306C" },
  reddit:    { icon: "🤖", color: "#FF4500" },
  linkedin:  { icon: "💼", color: "#0077B5" },
  youtube:   { icon: "▶",  color: "#FF0000" },
  google:    { icon: "G",  color: "#4285F4" },
  pinterest: { icon: "📌", color: "#E60023" },
  github:    { icon: "⬡",  color: "#6e40c9" },
  medium:    { icon: "M",  color: "#00ab6c" }
};

// ── State ─────────────────────────────────────────────────────────────────────
let state = { bookmarks: [], folders: [], sources: [], tab: "recent", search: "", lastSaved: null, secureVault: [] };

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Load data
  const data = await msg({ type: "GET_DATA" });
  state.bookmarks     = data.bookmarks     || [];
  state.folders       = data.folders       || [];
  state.sources       = data.sources       || [];
  state.secureVault     = data.secureVault     || [];
  state.enigmaSettings  = data.enigmaSettings  || { key: 'AAA', rings: [0,0,0] };

  // Load current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    document.getElementById("tabTitle").textContent = tab.title || "Untitled";
    document.getElementById("tabUrl").textContent   = (() => { try { return new URL(tab.url).hostname; } catch { return tab.url; } })();

    const fav = document.getElementById("tabFavicon");
    try {
      const domain = new URL(tab.url).hostname;
      const img = document.createElement("img");
      img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      img.onerror = () => { fav.textContent = "🌐"; };
      fav.innerHTML = "";
      fav.appendChild(img);
    } catch (_) {}

    // AI badge removed — no prediction needed on popup open
  }

  // Save current tab button
  document.getElementById("saveCurrentBtn").addEventListener("click", async () => {
    if (!tab) return;
    const result = await msg({
      type: "SAVE_BOOKMARK",
      payload: { title: tab.title, url: tab.url },
    });
    if (result?.duplicate) {
      showFlash("Already in Folia!", "⚠");
    } else if (result?.saved) {
      state.bookmarks.unshift(result.bm);
      state.lastSaved = result.bm;
      updateCount();
      render();
      showFlash(`Saved to ${state.folders.find(f=>f.id===result.bm.folderId)?.name || "General"}`);
    }
  });

  // Open dashboard
  document.getElementById("openDashboardBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  });

  // Save to Secure Folder — opens dashboard on Secure view if Enigma is off
  document.getElementById("saveSecureBtn").addEventListener("click", async () => {
    if (!tab) return;
const es    = state.enigmaSettings;
    const key   = es.key   || "AAA";
    const rings = es.rings || [0,0,0];
    const encTitle = enigmaProcessPopup(tab.title, key, rings, {});
    const encUrl   = enigmaProcessPopup(tab.url,   key, rings, {});
    const entry = {
      id:          Date.now().toString() + Math.random().toString(36).slice(2),
      encTitle:    encTitle,
      encUrl:      encUrl,
      keySnapshot: key + "-" + rings.join(""),
      savedAt:     Date.now(),
      attempts:    0
    };
    state.secureVault.unshift(entry);
    await new Promise(r => chrome.runtime.sendMessage({ type: "SAVE_SECURE_VAULT", entries: state.secureVault }, r));
    showFlash("Saved 🔐 Key: " + key + "-" + rings.join(""));
  });

  // Search
  document.getElementById("searchInput").addEventListener("input", e => {
    state.search = e.target.value;
    render();
  });

  // Tab buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      render();
    });
  });

  updateCount();
  render();
}

// ── Messaging helper ──────────────────────────────────────────────────────────
function msg(payload) {
  return new Promise(resolve => chrome.runtime.sendMessage(payload, resolve));
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const content = document.getElementById("content");
  content.innerHTML = "";

  if (state.tab === "recent") renderRecent(content);
  if (state.tab === "folders") renderFolders(content);
  if (state.tab === "sources") renderSources(content);
}

function renderRecent(container) {
  const q = state.search.toLowerCase();
  const filtered = state.bookmarks
    .filter(b => !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
    .slice(0, 40);

  if (filtered.length === 0) {
    container.appendChild(emptyState("No bookmarks yet", "🔖", "Hit + to save your first one"));
    return;
  }

  filtered.forEach(bm => container.appendChild(makeCard(bm)));
}

function renderFolders(container) {
  const grid = document.createElement("div");
  grid.className = "folder-grid";

  state.folders.forEach(f => {
    const bms = state.bookmarks.filter(b => b.folderId === f.id);
    const high = bms.filter(b => b.priority === 1).length;
    const card = document.createElement("div");
    card.className = "folder-card";
    card.style.borderColor = f.color + "44";
    card.innerHTML = `
      <div class="folder-icon">${f.icon}</div>
      <div class="folder-name" style="color:${f.color}">${f.name}</div>
      <div class="folder-count">${bms.length} bookmarks</div>
      ${high > 0 ? `<div class="folder-high" style="background:${f.color}22;color:${f.color}">🔥 ${high} high priority</div>` : ""}
    `;
    card.addEventListener("click", () => {
      // Switch to recent tab and filter by folder
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelector('[data-tab="recent"]').classList.add("active");
      state.tab = "recent";
      state.search = "";
      document.getElementById("searchInput").value = "";
      // Temporarily filter
      const orig = state.bookmarks;
      const folderBms = state.bookmarks.filter(b => b.folderId === f.id);
      container.innerHTML = "";
      document.querySelector(".content").innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="color:${f.color};font-weight:700;font-size:13px">${f.icon} ${f.name}</span>
          <button id="backBtn" style="background:none;border:1px solid #2e2c29;border-radius:7px;color:#666;padding:3px 10px;font-size:11px;cursor:pointer">← Back</button>
        </div>
      `;
      const content = document.querySelector(".content");
      folderBms.forEach(bm => content.appendChild(makeCard(bm)));
      if (folderBms.length === 0) content.appendChild(emptyState("No bookmarks in this folder"));
      document.getElementById("backBtn").addEventListener("click", () => render());
    });
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function renderSources(container) {
  state.sources.forEach(s => {
    const count = state.bookmarks.filter(b => b.source === s.id).length;
    const row = document.createElement("div");
    row.className = "source-row";
    row.style.borderColor = s.enabled ? s.color + "44" : "#2e2c29";

    const toggle = document.createElement("button");
    toggle.className = "toggle";
    toggle.style.background = s.enabled ? s.color : "#2e2c29";
    toggle.innerHTML = `<div class="toggle-thumb" style="left:${s.enabled ? "18px" : "2px"}"></div>`;
    toggle.addEventListener("click", async () => {
      const result = await msg({ type: "TOGGLE_SOURCE", id: s.id });
      state.sources = result.sources;
      render();
    });

    row.innerHTML = `
      <div class="source-icon" style="overflow:hidden;display:flex;align-items:center;justify-content:center">${sourceIconHtml(s, 18)}</div>
      <div class="source-info">
        <div class="source-name" style="color:${s.enabled ? s.color : "#666"}">${s.label}</div>
        <div class="source-count">${count} bookmarks · capture ${s.enabled ? "ON" : "OFF"}</div>
      </div>
    `;
    row.appendChild(toggle);
    container.appendChild(row);
  });
}

// ── Resolve source meta from live sources list ────────────────────────────────
function getSourceMeta(sourceId) {
  const live = state.sources.find(s => s.id === sourceId);
  if (live) return live;
  return SOURCE_META[sourceId] || { icon: "?", color: "#6b7280" };
}

// Render source icon — favicon img if available, else text/emoji
function sourceIconHtml(sm, size = 14) {
  if (sm.faviconUrl) {
    return `<img src="${sm.faviconUrl}" style="width:${size}px;height:${size}px;border-radius:3px;object-fit:contain;vertical-align:middle"
      onerror="this.style.display='none';this.nextSibling.style.display='inline'">` +
      `<span style="display:none">${esc(sm.icon || (sm.label||'?').charAt(0))}</span>`;
  }
  return `<span>${esc(sm.icon || (sm.label||'?').charAt(0))}</span>`;
}

// ── Card builder ──────────────────────────────────────────────────────────────
function makeCard(bm) {
  const sm = getSourceMeta(bm.source);
  const folder = state.folders.find(f => f.id === bm.folderId);
  const card = document.createElement("div");
  card.className = "bm-card";
  card.title = bm.url;

  card.innerHTML = `
    <div class="bm-source" style="background:${sm.color}22;color:${sm.color};border:1px solid ${sm.color}44;overflow:hidden">${sourceIconHtml(sm, 14)}</div>
    <div class="bm-body">
      <div class="bm-title">${esc(bm.title)}</div>
      <div class="bm-meta">
        ${folder ? `<span class="bm-folder" style="background:${folder.color}22;color:${folder.color};border:1px solid ${folder.color}44">${folder.icon} ${folder.name}</span>` : ""}
        <span class="bm-priority" style="background:${PRIORITY_COLOR[bm.priority]}22;color:${PRIORITY_COLOR[bm.priority]};border:1px solid ${PRIORITY_COLOR[bm.priority]}44">${PRIORITY_LABEL[bm.priority]}</span>
        <span>${timeAgo(bm.savedAt)}</span>
      </div>
    </div>
    <button class="bm-del" title="Remove">×</button>
  `;

  // Open on click
  card.addEventListener("click", (e) => {
    if (e.target.classList.contains("bm-del")) return;
    chrome.tabs.create({ url: bm.url });
  });

  // Delete
  card.querySelector(".bm-del").addEventListener("click", async (e) => {
    e.stopPropagation();
    await msg({ type: "DELETE_BOOKMARK", id: bm.id });
    state.bookmarks = state.bookmarks.filter(b => b.id !== bm.id);
    updateCount();
    render();
  });

  return card;
}

// ── Flash message ─────────────────────────────────────────────────────────────
function showFlash(text, icon = "🔖") {
  const content = document.getElementById("content");
  const existing = content.querySelector(".save-flash");
  if (existing) existing.remove();
  const flash = document.createElement("div");
  flash.className = "save-flash";
  flash.innerHTML = `<div class="save-flash-icon">${icon}</div><div class="save-flash-text">✦ ${text}</div>`;
  content.prepend(flash);
  setTimeout(() => flash.remove(), 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyState(msg, icon = "🔖", sub = "") {
  const el = document.createElement("div");
  el.className = "empty";
  el.innerHTML = `<div class="empty-icon">${icon}</div><div>${msg}</div>${sub ? `<div style="font-size:11px;color:#3a3632">${sub}</div>` : ""}`;
  return el;
}

function updateCount() {
  document.getElementById("totalCount").textContent = `${state.bookmarks.length} bookmark${state.bookmarks.length !== 1 ? "s" : ""}`;
}

function esc(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return "just now";
  if (d < 3600000)  return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return `${Math.floor(d/86400000)}d ago`;
}

// ── Minimal Enigma cipher for popup quick-save ───────────────────────────────
const _ROTORS = { R1:"EKMFLGDQVZNTOWYHXUSPAIBRCJ", R2:"AJDKSIRUXBLHWTMCQGZNPYFVOE", R3:"BDFHJLCPRTXVZNYEIWGAKMUSQO", REF:"YRUHQSLDPXNGOKMIEBFZCWVJAT" };
const _NOTCH  = { R1:'Q', R2:'E', R3:'V' };
function _rot(a) { var n=a.slice(); n.push(n.shift()); return n; }
function enigmaProcessPopup(input, key, rings, plugs) {
  if (!key || key.length < 3) return input;
  input = input.toUpperCase();
  var pb = {}; "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(l => pb[l]=l);
  Object.keys(plugs||{}).forEach(k => { pb[k]=plugs[k]; pb[plugs[k]]=k; });
  var r1=_ROTORS.R1.split(""), r2=_ROTORS.R2.split(""), r3=_ROTORS.R3.split("");
  for(var i=0;i<rings[0];i++) r1=_rot(r1);
  for(var i=0;i<rings[1];i++) r2=_rot(r2);
  for(var i=0;i<rings[2];i++) r3=_rot(r3);
  for(var i=0;i<key.charCodeAt(0)-65;i++) r1=_rot(r1);
  for(var i=0;i<key.charCodeAt(1)-65;i++) r2=_rot(r2);
  for(var i=0;i<key.charCodeAt(2)-65;i++) r3=_rot(r3);
  var out="";
  for(var i=0;i<input.length;i++){
    var ch=input[i];
    if(ch>='A'&&ch<='Z'){
      if(r2[0]===_NOTCH.R2){r3=_rot(r3);r2=_rot(r2);}
      if(r1[0]===_NOTCH.R1)r2=_rot(r2);
      r1=_rot(r1);
      ch=pb[ch]; ch=r1[ch.charCodeAt(0)-65]; ch=r2[ch.charCodeAt(0)-65]; ch=r3[ch.charCodeAt(0)-65];
      ch=_ROTORS.REF[ch.charCodeAt(0)-65];
      ch=String.fromCharCode(65+r3.indexOf(ch)); ch=String.fromCharCode(65+r2.indexOf(ch)); ch=String.fromCharCode(65+r1.indexOf(ch));
      ch=pb[ch]; out+=ch;
    } else { out+=input[i]; }
  }
  return out;
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
