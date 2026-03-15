# 🔖 Folia — AI Bookmark Manager

> The only bookmark manager with a working WWII Enigma cipher vault, per-domain AI auto-classification, and instant save from anywhere.

---

## ✨ Features

### 🤖 AI Classification
Every bookmark is instantly saved with regex, then silently upgraded in the background by an OpenRouter AI that assigns the right folder, priority, and a one-line reason — all via a Supabase Edge Function. Your API key never touches the extension.

### 🔐 Enigma M3 Cipher Vault
A fully working Wehrmacht Enigma M3 cipher engine — rotors, reflector, double-stepping, plugboard. Encrypt bookmark titles and URLs with a 3-letter key + ring settings. **2 wrong attempts = entry permanently self-destructs.** Successful decode triggers a full-screen military intel reveal animation.

### 🌐 Per-Domain Auto-Source
Save any URL and Folia automatically creates a source entry for that domain — fetches the favicon, assigns a deterministic color, groups all future saves from that domain. Zero setup.

### ⚡ Three Ways to Save
- **Popup button** — one click from any tab
- **Hover 🔖** — floating button on every page
- **Alt+S** — keyboard shortcut, no mouse needed

### ⊡ Bulk Select
Checkbox multiple bookmarks, then move to a folder or delete — all in one action.

### 🔄 Bidirectional Browser Sync
Ctrl+D in the browser → appears in Folia with AI classification. Delete from browser → disappears from Folia.

---

## 🚀 Install

### Chrome / Edge
1. Download and unzip this repo
2. Go to `chrome://extensions`
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** → select the `folia-extension/` folder

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` inside the `folia-extension/` folder

---

## ⚙️ Setup AI Classification

The AI runs on a Supabase Edge Function calling OpenRouter.

1. Get a free API key at [openrouter.ai](https://openrouter.ai)
2. Go to your Supabase project → **Edge Functions → classify-bookmark → Secrets**
3. Add secret: `OPENROUTER_API_KEY` = your key

Or deploy your own Edge Function using the code in `/supabase/functions/classify-bookmark/index.ts`.

---

## 🗂 Project Structure

```
folia-extension/
├── manifest.json          # MV3, Chrome + Firefox
├── background/
│   └── background.js      # AI classification, bookmark sync, message handlers
├── content/
│   ├── content.js         # Hover-save button
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.js           # Quick save + Enigma encrypt
│   └── popup.css
├── dashboard/
│   ├── dashboard.html
│   └── dashboard.js       # Full UI + Enigma cipher engine
└── icons/
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + F` | Open Folia Dashboard |
| `Alt + S` | Quick-save current page |

Change shortcuts at `chrome://extensions/shortcuts`

---

## 🔐 Enigma Cipher — How It Works

Folia implements the authentic **Enigma M3** used by the German Navy in WWII:
- **3 rotors** (R1, R2, R3) with authentic wiring
- **Double-stepping anomaly** preserved
- **Reflector** (UKW-B wiring)
- **Ring settings** (0–25 per rotor)
- **3-letter Grundstellung key**

Encrypted entries show only ciphertext. You have **2 attempts** to enter the correct key — on the second failure the entry is **permanently deleted**. Correct decode triggers a cinematic reveal animation.

---

## 🛠 Tech Stack

- Vanilla JS browser extension (MV3)
- Supabase Edge Functions (Deno)
- OpenRouter AI (model: `openrouter/auto`)
- Chrome Extensions API / Firefox WebExtensions API

---

Built for the lingodec Hackathon 2026.
