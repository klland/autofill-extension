# Autofill Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Extension (MV3) that detects form fields on web pages and offers to fill in locally-stored personal profile data, with per-site field learning.

**Architecture:** A Content Script handles DOM observation, bubble rendering, and new-value detection. A Background Service Worker owns all storage reads/writes and field-rule logic. A Popup page provides the profile manager UI. All data lives in `chrome.storage.local` — no server required.

**Tech Stack:** Plain HTML / CSS / JavaScript (no framework, no build step), Chrome Extension Manifest V3

---

## File Map

| File | Role |
|---|---|
| `manifest.json` | Extension manifest — permissions, entry points |
| `background.js` | Service worker — storage API, field detection logic, message handler |
| `content.js` | Injected into every page — focus observer, bubble UI (Shadow DOM), blur observer |
| `popup/popup.html` | Popup shell — sidebar layout |
| `popup/popup.css` | Popup styles |
| `popup/popup.js` | Popup logic — load/save profile, category switching, mask toggle |
| `icons/icon16.png` | Extension icon (16×16) |
| `icons/icon48.png` | Extension icon (48×48) |
| `icons/icon128.png` | Extension icon (128×128) |

---

## Task 1: Project scaffold & manifest

**Files:**
- Create: `manifest.json`
- Create: `background.js` (stub)
- Create: `content.js` (stub)
- Create: `popup/popup.html` (stub)
- Create: `popup/popup.css` (empty)
- Create: `popup/popup.js` (stub)

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "自動填入助手",
  "version": "1.0.0",
  "description": "偵測表單欄位並自動填入個人資料",
  "permissions": ["storage", "activeTab"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Create stub `background.js`**

```js
// background.js — Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Autofill Extension installed');
});
```

- [ ] **Step 3: Create stub `content.js`**

```js
// content.js — injected into every page
console.log('Autofill content script loaded');
```

- [ ] **Step 4: Create stub `popup/popup.html`**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="popup.css" />
  <title>自動填入助手</title>
</head>
<body>
  <p>Popup placeholder</p>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create empty `popup/popup.css` and stub `popup/popup.js`**

`popup/popup.css` — empty file (just create it)

```js
// popup/popup.js
console.log('Popup loaded');
```

- [ ] **Step 6: Create placeholder icons**

Create `icons/` directory. For now, create three 1×1 pixel transparent PNG files named `icon16.png`, `icon48.png`, `icon128.png`. (Replace with real icons later — Chrome will accept minimal PNGs during development.)

You can generate them with:
```bash
# Run from autofill-extension/ directory
mkdir -p icons
python3 -c "
import struct, zlib, base64
def tiny_png():
    sig = b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    ihdr_chunk = b'IHDR' + ihdr
    crc = struct.pack('>I', zlib.crc32(ihdr_chunk) & 0xffffffff)
    ihdr_block = struct.pack('>I', 13) + ihdr_chunk + crc
    raw = b'\\x00\\xff\\xff\\xff'
    compressed = zlib.compress(raw)
    idat_data = b'IDAT' + compressed
    idat_block = struct.pack('>I', len(compressed)) + idat_data + struct.pack('>I', zlib.crc32(idat_data) & 0xffffffff)
    iend_data = b'IEND'
    iend_block = struct.pack('>I', 0) + iend_data + struct.pack('>I', zlib.crc32(iend_data) & 0xffffffff)
    return sig + ihdr_block + idat_block + iend_block
data = tiny_png()
for name in ['icons/icon16.png','icons/icon48.png','icons/icon128.png']:
    open(name,'wb').write(data)
print('Icons created')
"
```

- [ ] **Step 7: Init git repo and first commit**

```bash
cd /c/Users/phil9/文件/autofill-extension
git init
git add manifest.json background.js content.js popup/ icons/
git commit -m "feat: initial scaffold — manifest, stubs, icons"
```

- [ ] **Step 8: Load extension in Chrome to verify scaffold works**

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" → select the `autofill-extension/` folder
4. Verify: extension appears in the list with no errors
5. Click the extension icon → "Popup placeholder" should appear

---

## Task 2: Background Service Worker — storage & field detection logic

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Define the default profile and keyword table in `background.js`**

Replace the contents of `background.js` with:

```js
// background.js — Service Worker

const DEFAULT_PROFILE = {
  name: '',
  id_number: '',
  taiwan_pass: '',
  passport: '',
  phone_mobile: '',
  phone_home: '',
  email: '',
  birthday: '',
  city: '',
  district: '',
  address: '',
  postal_code: '',
  company: '',
  job_title: '',
};

const FIELD_LABELS = {
  name: '姓名',
  id_number: '身分證字號',
  taiwan_pass: '台胞證號碼',
  passport: '護照號碼',
  phone_mobile: '手機號碼',
  phone_home: '市話號碼',
  email: '電子郵件',
  birthday: '生日',
  city: '縣市',
  district: '鄉鎮區',
  address: '詳細地址',
  postal_code: '郵遞區號',
  company: '公司名稱',
  job_title: '職稱',
};

// keyword → field type. Order matters: more specific first.
const KEYWORD_MAP = [
  { type: 'id_number',    keywords: ['身分證', 'idno', 'id_number', 'nationalid'] },
  { type: 'taiwan_pass',  keywords: ['台胞證', 'mainlandid', '來台證'] },
  { type: 'passport',     keywords: ['護照', 'passport'] },
  { type: 'phone_mobile', keywords: ['手機', 'mobile', 'cell'] },
  { type: 'phone_home',   keywords: ['市話', '室內電話', 'landline'] },
  { type: 'email',        keywords: ['email', 'mail', '電子郵件'] },
  { type: 'birthday',     keywords: ['生日', 'birth', 'dob', 'birthday'] },
  { type: 'postal_code',  keywords: ['郵遞區號', 'zip', 'postal'] },
  { type: 'district',     keywords: ['鄉鎮', 'district'] },
  { type: 'city',         keywords: ['縣市', 'city', '城市'] },
  { type: 'address',      keywords: ['地址', 'address', 'addr'] },
  { type: 'company',      keywords: ['公司', 'company', '單位'] },
  { type: 'job_title',    keywords: ['職稱', 'position', '職務'] },
  { type: 'name',         keywords: ['姓名', 'fullname', '真實姓名', '使用者名稱', 'name'] },
  { type: 'phone_mobile', keywords: ['電話', 'phone', 'tel'] },
];

const AUTOCOMPLETE_MAP = {
  'name': 'name',
  'given-name': 'name',
  'family-name': 'name',
  'email': 'email',
  'tel': 'phone_mobile',
  'tel-local': 'phone_mobile',
  'bday': 'birthday',
  'bday-day': 'birthday',
  'bday-month': 'birthday',
  'bday-year': 'birthday',
  'postal-code': 'postal_code',
  'address-line1': 'address',
  'address-line2': 'address',
  'address-level1': 'city',
  'address-level2': 'district',
  'organization': 'company',
  'organization-title': 'job_title',
};

// Ensure default profile exists in storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['profile', 'field_rules'], (data) => {
    if (!data.profile) {
      chrome.storage.local.set({ profile: DEFAULT_PROFILE });
    }
    if (!data.field_rules) {
      chrome.storage.local.set({ field_rules: {} });
    }
  });
});
```

- [ ] **Step 2: Add `detectFieldType` function**

Append to `background.js`:

```js
/**
 * Detect the profile field type for a given input field descriptor.
 * @param {object} field - { hostname, id, name, placeholder, autocomplete }
 * @param {object} fieldRules - learned rules map
 * @returns {string|null} field type key or null
 */
function detectFieldType(field, fieldRules) {
  // 1. Learned rule
  const ruleKey = buildRuleKey(field.hostname, field.id || field.name);
  if (ruleKey && fieldRules[ruleKey]) {
    return fieldRules[ruleKey];
  }

  // 2. autocomplete attribute
  if (field.autocomplete && AUTOCOMPLETE_MAP[field.autocomplete]) {
    return AUTOCOMPLETE_MAP[field.autocomplete];
  }

  // 3. Keyword matching against id, name, placeholder
  const haystack = [field.id, field.name, field.placeholder]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const { type, keywords } of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (haystack.includes(kw.toLowerCase())) {
        return type;
      }
    }
  }

  return null;
}

function buildRuleKey(hostname, fieldId) {
  if (!hostname || !fieldId) return null;
  return `${hostname}::${fieldId}`;
}
```

- [ ] **Step 3: Add message handler**

Append to `background.js`:

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DETECT_FIELD') {
    chrome.storage.local.get(['profile', 'field_rules'], (data) => {
      const profile = data.profile || DEFAULT_PROFILE;
      const fieldRules = data.field_rules || {};
      const fieldType = detectFieldType(msg.field, fieldRules);
      const value = fieldType ? (profile[fieldType] || null) : null;
      sendResponse({
        fieldType,
        value,
        label: fieldType ? FIELD_LABELS[fieldType] : null,
        allFields: Object.entries(FIELD_LABELS).map(([key, label]) => ({
          key,
          label,
          value: profile[key] || '',
        })),
      });
    });
    return true; // keep channel open for async sendResponse
  }

  if (msg.type === 'SAVE_PROFILE_FIELD') {
    chrome.storage.local.get('profile', (data) => {
      const profile = data.profile || DEFAULT_PROFILE;
      profile[msg.fieldType] = msg.value;
      chrome.storage.local.set({ profile }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (msg.type === 'SAVE_FIELD_RULE') {
    chrome.storage.local.get('field_rules', (data) => {
      const rules = data.field_rules || {};
      const key = buildRuleKey(msg.hostname, msg.fieldId);
      if (key) rules[key] = msg.fieldType;
      chrome.storage.local.set({ field_rules: rules }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (msg.type === 'GET_PROFILE') {
    chrome.storage.local.get('profile', (data) => {
      sendResponse({ profile: data.profile || DEFAULT_PROFILE, labels: FIELD_LABELS });
    });
    return true;
  }

  if (msg.type === 'SAVE_PROFILE') {
    chrome.storage.local.set({ profile: msg.profile }, () => sendResponse({ ok: true }));
    return true;
  }
});
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/phil9/文件/autofill-extension
git add background.js
git commit -m "feat: background — storage, field detection, message handler"
```

---

## Task 3: Content Script — field observation & bubble rendering

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Replace `content.js` with field observer skeleton**

```js
// content.js — injected into every page

(function () {
  'use strict';

  let activeBubble = null;
  let activeField = null;

  // Observe all focus events on input fields
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeBubble();
  });

  function onFocusIn(e) {
    const el = e.target;
    if (!isTextInput(el)) return;
    activeField = el;

    const fieldDescriptor = {
      hostname: location.hostname,
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      autocomplete: el.getAttribute('autocomplete') || '',
    };

    chrome.runtime.sendMessage({ type: 'DETECT_FIELD', field: fieldDescriptor }, (res) => {
      if (chrome.runtime.lastError) return;
      if (!res || !res.fieldType || !res.value) return;
      showSuggestionBubble(el, res);
    });
  }

  function onFocusOut(e) {
    const el = e.target;
    if (!isTextInput(el)) return;

    // Delay so bubble click events fire before removal
    setTimeout(() => {
      if (activeBubble && !activeBubble.contains(document.activeElement)) {
        checkNewValue(el);
        removeBubble();
      }
    }, 200);
  }

  function isTextInput(el) {
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false;
    const skipTypes = ['submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio', 'hidden', 'range', 'color'];
    return !skipTypes.includes(el.type);
  }

  function removeBubble() {
    if (activeBubble) {
      activeBubble.remove();
      activeBubble = null;
    }
  }
})();
```

- [ ] **Step 2: Add `showSuggestionBubble` function inside the IIFE (before the closing `})();`)**

```js
  function showSuggestionBubble(inputEl, res) {
    removeBubble();

    const host = document.createElement('div');
    host.id = '__autofill_bubble__';
    Object.assign(host.style, {
      position: 'absolute',
      zIndex: '2147483647',
      pointerEvents: 'auto',
    });

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .bubble {
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 8px 12px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        color: #111;
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        min-width: 220px;
      }
      .bubble__label { color: #555; flex: 1; overflow: hidden; text-overflow: ellipsis; }
      .bubble__label strong { color: #111; }
      button {
        cursor: pointer;
        border: none;
        border-radius: 5px;
        padding: 4px 10px;
        font-size: 12px;
      }
      .btn-fill { background: #2563eb; color: #fff; }
      .btn-fill:hover { background: #1d4ed8; }
      .btn-other { background: #f3f4f6; color: #374151; }
      .btn-other:hover { background: #e5e7eb; }
      .dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        min-width: 160px;
        margin-top: 4px;
        overflow: hidden;
      }
      .dropdown__item {
        padding: 8px 14px;
        cursor: pointer;
        font-size: 13px;
      }
      .dropdown__item:hover { background: #f3f4f6; }
    `;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const labelEl = document.createElement('span');
    labelEl.className = 'bubble__label';
    labelEl.innerHTML = `${res.label}：<strong>${res.value}</strong>`;

    const btnFill = document.createElement('button');
    btnFill.className = 'btn-fill';
    btnFill.textContent = '填入';
    btnFill.addEventListener('mousedown', (e) => {
      e.preventDefault();
      fillField(inputEl, res.value);
      removeBubble();
    });

    const btnOther = document.createElement('button');
    btnOther.className = 'btn-other';
    btnOther.textContent = '其他欄位';
    btnOther.addEventListener('mousedown', (e) => {
      e.preventDefault();
      showDropdown(bubble, shadow, inputEl, res);
    });

    bubble.appendChild(labelEl);
    bubble.appendChild(btnFill);
    bubble.appendChild(btnOther);
    shadow.appendChild(style);
    shadow.appendChild(bubble);
    document.body.appendChild(host);

    positionAbove(host, inputEl);
    activeBubble = host;
  }
```

- [ ] **Step 3: Add `showDropdown`, `positionAbove`, `fillField` helpers inside the IIFE**

```js
  function showDropdown(bubble, shadow, inputEl, res) {
    // Remove existing dropdown if any
    const existing = shadow.querySelector('.dropdown');
    if (existing) { existing.remove(); return; }

    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    Object.assign(bubble.style, { position: 'relative' });

    res.allFields.forEach(({ key, label, value }) => {
      if (!value) return; // skip empty fields
      const item = document.createElement('div');
      item.className = 'dropdown__item';
      item.textContent = `${label}：${value}`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        fillField(inputEl, value);
        // Learn the correction
        chrome.runtime.sendMessage({
          type: 'SAVE_FIELD_RULE',
          hostname: location.hostname,
          fieldId: inputEl.id || inputEl.name,
          fieldType: key,
        });
        removeBubble();
      });
      dropdown.appendChild(item);
    });

    bubble.appendChild(dropdown);
  }

  function positionAbove(host, inputEl) {
    const rect = inputEl.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    host.style.left = `${rect.left + scrollX}px`;
    // Temporarily place off-screen to measure height
    host.style.top = '-9999px';
    requestAnimationFrame(() => {
      const hostH = host.offsetHeight || 44;
      host.style.top = `${rect.top + scrollY - hostH - 6}px`;
    });
  }

  function fillField(inputEl, value) {
    inputEl.focus();
    inputEl.value = value;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/phil9/文件/autofill-extension
git add content.js
git commit -m "feat: content script — field observer, suggestion bubble, dropdown"
```

- [ ] **Step 5: Manual smoke test**

1. Reload the extension in `chrome://extensions/`
2. Open any page with a form (e.g. `chrome://newtab/` won't work — try a test page)
3. Create a quick test HTML file:

```html
<!-- test.html — open via File > Open in Chrome -->
<!DOCTYPE html>
<html>
<body>
  <input type="text" name="phone" placeholder="手機號碼" />
  <input type="text" name="email" placeholder="email" />
</body>
</html>
```

4. First set a profile value via `chrome.storage.local.set({profile:{phone_mobile:'0912345678', email:'test@test.com'}})` in DevTools console on any extension page
5. Open `test.html` in Chrome, click the phone field — bubble should appear above it

---

## Task 4: Content Script — new value detection (memory toast)

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add `checkNewValue` implementation inside the IIFE (replace the stub)**

Find this line in `content.js`:
```js
        checkNewValue(el);
```

The `checkNewValue` function is called but not yet defined. Add it inside the IIFE before `removeBubble`:

```js
  function checkNewValue(el) {
    if (!isTextInput(el)) return;
    const typedValue = el.value.trim();
    if (!typedValue) return;

    const fieldDescriptor = {
      hostname: location.hostname,
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      autocomplete: el.getAttribute('autocomplete') || '',
    };

    chrome.runtime.sendMessage({ type: 'DETECT_FIELD', field: fieldDescriptor }, (res) => {
      if (chrome.runtime.lastError) return;
      if (!res || !res.fieldType) return;
      if (res.value === typedValue) return; // same as stored, nothing to do

      showMemoryToast(el, res.fieldType, res.label, typedValue);
    });
  }
```

- [ ] **Step 2: Add `showMemoryToast` inside the IIFE**

```js
  function showMemoryToast(inputEl, fieldType, label, newValue) {
    removeBubble();

    const host = document.createElement('div');
    host.id = '__autofill_bubble__';
    Object.assign(host.style, {
      position: 'absolute',
      zIndex: '2147483647',
      pointerEvents: 'auto',
    });

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .toast {
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 8px 12px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        color: #111;
        min-width: 240px;
      }
      .toast__title { font-weight: 600; margin-bottom: 4px; }
      .toast__value { color: #555; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .toast__actions { display: flex; gap: 8px; justify-content: flex-end; }
      button { cursor: pointer; border: none; border-radius: 5px; padding: 4px 10px; font-size: 12px; }
      .btn-save { background: #16a34a; color: #fff; }
      .btn-save:hover { background: #15803d; }
      .btn-ignore { background: #f3f4f6; color: #374151; }
      .btn-ignore:hover { background: #e5e7eb; }
    `;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="toast__title">要記住這筆資料嗎？</div>
      <div class="toast__value">${label}：${newValue}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'toast__actions';

    const btnSave = document.createElement('button');
    btnSave.className = 'btn-save';
    btnSave.textContent = '記住';
    btnSave.addEventListener('mousedown', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({
        type: 'SAVE_PROFILE_FIELD',
        fieldType,
        value: newValue,
      });
      removeBubble();
    });

    const btnIgnore = document.createElement('button');
    btnIgnore.className = 'btn-ignore';
    btnIgnore.textContent = '忽略';
    btnIgnore.addEventListener('mousedown', (e) => {
      e.preventDefault();
      removeBubble();
    });

    actions.appendChild(btnIgnore);
    actions.appendChild(btnSave);
    toast.appendChild(actions);
    shadow.appendChild(style);
    shadow.appendChild(toast);
    document.body.appendChild(host);

    positionAbove(host, inputEl);
    activeBubble = host;
  }
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/phil9/文件/autofill-extension
git add content.js
git commit -m "feat: content script — new value detection and memory toast"
```

- [ ] **Step 4: Manual smoke test**

1. Reload extension
2. Open `test.html` from Task 3
3. Click the phone field, type a new value (different from stored), click away
4. Memory toast should appear above the field asking to save

---

## Task 5: Popup UI — HTML & CSS

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.css`

- [ ] **Step 1: Replace `popup/popup.html`**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="popup.css" />
  <title>自動填入助手</title>
</head>
<body>
  <div class="layout">
    <nav class="sidebar">
      <div class="sidebar__title">自動填入助手</div>
      <ul class="sidebar__nav">
        <li class="sidebar__item active" data-category="personal">個人資料</li>
        <li class="sidebar__item" data-category="contact">聯絡方式</li>
        <li class="sidebar__item" data-category="id">證件</li>
        <li class="sidebar__item" data-category="address">地址</li>
        <li class="sidebar__item" data-category="work">工作</li>
      </ul>
    </nav>
    <main class="content">
      <form id="profile-form">
        <!-- personal -->
        <section class="section" data-category="personal">
          <div class="field">
            <label>姓名</label>
            <input type="text" data-key="name" />
          </div>
          <div class="field">
            <label>生日</label>
            <input type="text" data-key="birthday" placeholder="1990-01-01" />
          </div>
        </section>

        <!-- contact -->
        <section class="section hidden" data-category="contact">
          <div class="field">
            <label>手機號碼</label>
            <input type="text" data-key="phone_mobile" />
          </div>
          <div class="field">
            <label>市話號碼</label>
            <input type="text" data-key="phone_home" />
          </div>
          <div class="field">
            <label>電子郵件</label>
            <input type="email" data-key="email" />
          </div>
        </section>

        <!-- id -->
        <section class="section hidden" data-category="id">
          <div class="field">
            <label>身分證字號</label>
            <div class="masked-field">
              <input type="password" data-key="id_number" />
              <button type="button" class="btn-toggle" data-target="id_number">顯示</button>
            </div>
          </div>
          <div class="field">
            <label>台胞證號碼</label>
            <div class="masked-field">
              <input type="password" data-key="taiwan_pass" />
              <button type="button" class="btn-toggle" data-target="taiwan_pass">顯示</button>
            </div>
          </div>
          <div class="field">
            <label>護照號碼</label>
            <div class="masked-field">
              <input type="password" data-key="passport" />
              <button type="button" class="btn-toggle" data-target="passport">顯示</button>
            </div>
          </div>
        </section>

        <!-- address -->
        <section class="section hidden" data-category="address">
          <div class="field">
            <label>縣市</label>
            <input type="text" data-key="city" />
          </div>
          <div class="field">
            <label>鄉鎮區</label>
            <input type="text" data-key="district" />
          </div>
          <div class="field">
            <label>詳細地址</label>
            <input type="text" data-key="address" />
          </div>
          <div class="field">
            <label>郵遞區號</label>
            <input type="text" data-key="postal_code" />
          </div>
        </section>

        <!-- work -->
        <section class="section hidden" data-category="work">
          <div class="field">
            <label>公司名稱</label>
            <input type="text" data-key="company" />
          </div>
          <div class="field">
            <label>職稱</label>
            <input type="text" data-key="job_title" />
          </div>
        </section>

        <div class="actions">
          <button type="submit" class="btn-save">儲存</button>
          <span class="save-msg hidden" id="save-msg">已儲存</span>
        </div>
      </form>
    </main>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `popup/popup.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: #111;
  background: #f9fafb;
  width: 360px;
  min-height: 420px;
}

.layout {
  display: flex;
  height: 100%;
  min-height: 420px;
}

/* Sidebar */
.sidebar {
  width: 96px;
  background: #1e293b;
  color: #cbd5e1;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar__title {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  padding: 14px 10px 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sidebar__nav { list-style: none; flex: 1; }

.sidebar__item {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}

.sidebar__item:hover { background: #334155; }
.sidebar__item.active {
  background: #334155;
  border-left-color: #3b82f6;
  color: #fff;
}

/* Content */
.content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background: #fff;
}

.section { display: flex; flex-direction: column; gap: 12px; }
.section.hidden { display: none; }

.field { display: flex; flex-direction: column; gap: 4px; }

.field label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field input {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
}

.field input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }

.masked-field {
  display: flex;
  gap: 6px;
  align-items: center;
}

.masked-field input { flex: 1; }

.btn-toggle {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  color: #374151;
}

.btn-toggle:hover { background: #e5e7eb; }

.actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
}

.btn-save {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 7px 18px;
  font-size: 13px;
  cursor: pointer;
}

.btn-save:hover { background: #1d4ed8; }

.save-msg { font-size: 12px; color: #16a34a; }
.save-msg.hidden { display: none; }
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/phil9/文件/autofill-extension
git add popup/popup.html popup/popup.css
git commit -m "feat: popup UI — sidebar layout, all field sections, styles"
```

---

## Task 6: Popup JS — load/save profile, category switching, mask toggle

**Files:**
- Modify: `popup/popup.js`

- [ ] **Step 1: Replace `popup/popup.js`**

```js
// popup/popup.js

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  setupNavigation();
  setupMaskToggles();
  setupFormSubmit();
});

function loadProfile() {
  chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    const profile = res.profile;
    document.querySelectorAll('[data-key]').forEach((input) => {
      const key = input.dataset.key;
      if (profile[key] !== undefined) {
        input.value = profile[key];
      }
    });
  });
}

function setupNavigation() {
  const items = document.querySelectorAll('.sidebar__item');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      // Update active sidebar item
      items.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');

      // Show matching section, hide others
      const category = item.dataset.category;
      document.querySelectorAll('.section').forEach((section) => {
        section.classList.toggle('hidden', section.dataset.category !== category);
      });
    });
  });
}

function setupMaskToggles() {
  document.querySelectorAll('.btn-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.target;
      const input = document.querySelector(`[data-key="${key}"]`);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.textContent = isHidden ? '隱藏' : '顯示';
    });
  });
}

function setupFormSubmit() {
  const form = document.getElementById('profile-form');
  const saveMsg = document.getElementById('save-msg');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const profile = {};
    document.querySelectorAll('[data-key]').forEach((input) => {
      profile[input.dataset.key] = input.value.trim();
    });

    chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', profile }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) return;
      saveMsg.classList.remove('hidden');
      setTimeout(() => saveMsg.classList.add('hidden'), 2000);
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/phil9/文件/autofill-extension
git add popup/popup.js
git commit -m "feat: popup JS — load/save profile, nav, mask toggle"
```

- [ ] **Step 3: Manual smoke test**

1. Reload extension in `chrome://extensions/`
2. Click the extension icon — popup should open with sidebar
3. Click each sidebar category — sections should switch
4. Fill in a name, click 儲存 — "已儲存" flash should appear
5. Close and reopen popup — saved values should persist

---

## Task 7: End-to-end smoke test & git push

**Files:** No code changes

- [ ] **Step 1: Full end-to-end test**

1. Open Chrome, reload the extension
2. Click extension icon → go to 個人資料 → enter 姓名 and 生日 → 儲存
3. Go to 聯絡方式 → enter 手機號碼 → 儲存
4. Go to 證件 → enter 身分證字號 → 儲存
5. Open `test.html` (from Task 3) in a new tab
6. Click the `name="phone"` input — bubble should appear above showing 手機號碼
7. Click 填入 — field should be populated
8. Click another field, type a different phone number, click away — memory toast should appear
9. Click 記住 — reopen popup, verify 手機號碼 updated
10. Click 其他欄位 on the bubble — dropdown with all non-empty fields should appear

- [ ] **Step 2: Initialize GitHub remote and push**

```bash
cd /c/Users/phil9/文件/autofill-extension
# Create repo on GitHub first via gh CLI:
gh repo create autofill-extension --public --source=. --remote=origin --push
```

If you prefer private:
```bash
gh repo create autofill-extension --private --source=. --remote=origin --push
```

- [ ] **Step 3: Verify on GitHub**

Open the repo URL returned by `gh repo create` and confirm all files are present.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Chrome Extension MV3, `chrome.storage.local` | Task 1 |
| All 14 profile fields | Task 2, 5, 6 |
| Auto-detect on focus, suggestion bubble above field | Task 3 |
| 填入 button | Task 3 |
| 其他欄位 dropdown with learning | Task 3 |
| New value detection on blur, memory toast | Task 4 |
| 記住 / 忽略 buttons | Task 4 |
| Popup with sidebar categories | Task 5 |
| Load/save profile | Task 6 |
| Sensitive field masking with toggle | Task 5, 6 |
| Shadow DOM for bubble isolation | Task 3 |
| Learned rules priority in detection | Task 2 |
| autocomplete attribute detection | Task 2 |
| Keyword matching fallback | Task 2 |

All spec requirements covered. No gaps found.
