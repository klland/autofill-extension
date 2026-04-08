# Autofill Extension — Design Spec

**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

A Chrome Extension that detects form fields on web pages and suggests filling in the user's personal data (stored locally). When a user focuses on an input field, a suggestion bubble appears above it. If the user types new data, the extension asks whether to remember it. Users can correct mislabeled fields, and the extension learns per-site rules.

---

## Platform & Constraints

- **Platform:** Chrome Extension (Manifest V3)
- **Storage:** `chrome.storage.local` — all data stays on the user's machine, no server, no account required
- **Tech stack:** Plain HTML / CSS / JavaScript (no framework, no build step)
- **Phase:** Desktop (Chrome) first; mobile is future scope

---

## Supported Profile Fields

| Key | Label |
|---|---|
| `name` | 姓名 |
| `id_number` | 身分證字號 |
| `taiwan_pass` | 台胞證號碼 |
| `passport` | 護照號碼 |
| `phone_mobile` | 手機號碼 |
| `phone_home` | 市話號碼 |
| `email` | 電子郵件 |
| `birthday` | 生日 |
| `city` | 縣市 |
| `district` | 鄉鎮區 |
| `address` | 詳細地址 |
| `postal_code` | 郵遞區號 |
| `company` | 公司名稱 |
| `job_title` | 職稱 |

---

## Architecture

```
Chrome Extension
├── content.js          ← Injected into every page; detects fields, renders bubble
├── background.js       ← Service Worker; manages storage, field rules, logic
├── popup/
│   ├── popup.html      ← Profile manager UI
│   ├── popup.css
│   └── popup.js
└── manifest.json
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| `content.js` | Observe focus events on `<input>` fields, detect field type, render suggestion bubble, detect new user-typed values, send messages to background |
| `background.js` | Store/retrieve profile data, store/retrieve field learning rules, respond to content script queries |
| `popup/` | UI for viewing and editing all profile fields, grouped by category |

---

## Data Storage (chrome.storage.local)

```json
{
  "profile": {
    "name": "王小明",
    "id_number": "A123456789",
    "taiwan_pass": "",
    "passport": "",
    "phone_mobile": "0912345678",
    "phone_home": "02-12345678",
    "email": "example@gmail.com",
    "birthday": "1990-01-01",
    "city": "台北市",
    "district": "大安區",
    "address": "信義路一段1號",
    "postal_code": "106",
    "company": "某某公司",
    "job_title": "工程師"
  },
  "field_rules": {
    "gov.tw::companyName": "name",
    "example.com::tel1": "phone_mobile"
  }
}
```

- `field_rules` key format: `hostname::fieldIdentifier` where `fieldIdentifier` is the field's `id`, `name`, or a hash of its `placeholder`
- Learned rules take priority over built-in keyword matching

---

## Field Detection Logic

### Priority order (highest to lowest)

1. **Learned rule** — check `field_rules` for `hostname::fieldId`
2. **`autocomplete` attribute** — maps standard values (e.g. `tel`, `email`, `bday`) directly
3. **Keyword matching** — scan `name`, `id`, `placeholder` against keyword table

### Keyword Table

| Field type | Keywords (case-insensitive) |
|---|---|
| `name` | 姓名, name, fullname, 真實姓名, 使用者名稱 |
| `phone_mobile` | 手機, mobile, cell, 電話, phone |
| `phone_home` | 市話, 室內電話, landline, tel |
| `id_number` | 身分證, idno, id_number, nationalid |
| `taiwan_pass` | 台胞證, mainlandid, 來台證 |
| `passport` | 護照, passport |
| `email` | email, mail, 電子郵件 |
| `birthday` | 生日, birth, dob, birthday |
| `city` | 縣市, city, 城市 |
| `district` | 鄉鎮, 區, district |
| `address` | 地址, address, addr |
| `postal_code` | 郵遞區號, zip, postal |
| `company` | 公司, company, 單位 |
| `job_title` | 職稱, title, position, 職務 |

---

## Suggestion Bubble UI

### Appearance
- Renders **above** the focused input field
- Injected as a shadow DOM element to avoid CSS conflicts with host page
- Disappears on: field blur, Escape key, fill action, ignore action

### Layout (detected field)
```
┌─────────────────────────────────┐
│ 手機號碼：0912-345-678          │
│                [填入]  [其他欄位] │
└─────────────────────────────────┘
```

- **填入** — fills the field with the stored value and closes the bubble
- **其他欄位** — opens a dropdown listing all profile fields; user picks the correct one; extension learns the correction and saves to `field_rules`

### Layout (undetected field)
If no field type is detected, no bubble appears. User can click the extension icon (popup) to manually copy a value.

---

## New Value Detection & Memory

When the user types into a field that has a recognized type and the value differs from the stored profile value:

1. After the field loses focus (`blur` event), content script checks: is this a known field type, and is the value new?
2. If yes, a small toast appears above the field:

```
┌───────────────────────────────┐
│ 要記住這筆資料嗎？             │
│ 手機：0987-654-321            │
│              [記住]  [忽略]   │
└───────────────────────────────┘
```

3. **記住** — updates `profile[fieldType]` in `chrome.storage.local`
4. **忽略** — dismisses, no change

---

## Popup UI — Profile Manager

### Layout

```
┌──────────┬────────────────────────────┐
│ 個人資料 │  姓名                      │
│ 聯絡方式 │  ┌─────────────────────┐   │
│ 證件     │  │ 王小明              │   │
│ 地址     │  └─────────────────────┘   │
│ 工作     │  生日                      │
│          │  ┌─────────────────────┐   │
│          │  │ 1990-01-01          │   │
│          │  └─────────────────────┘   │
│          │               [儲存]        │
└──────────┴────────────────────────────┘
```

### Categories

| Sidebar label | Fields |
|---|---|
| 個人資料 | 姓名, 生日 |
| 聯絡方式 | 手機, 市話, 電子郵件 |
| 證件 | 身分證, 台胞證, 護照 |
| 地址 | 縣市, 鄉鎮區, 詳細地址, 郵遞區號 |
| 工作 | 公司名稱, 職稱 |

- Each field is an editable text input
- 「儲存」button saves all changes in the current category to `chrome.storage.local`
- Sensitive fields (身分證, 台胞證, 護照) are masked by default (`****`) with a show/hide toggle

---

## File Structure

```
autofill-extension/
├── manifest.json
├── content.js
├── background.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-09-autofill-extension-design.md
```

---

## Out of Scope (Phase 1)

- Mobile / custom keyboard
- Multiple profiles (e.g. work vs personal)
- Password management
- Cloud sync
- Firefox / Edge support
