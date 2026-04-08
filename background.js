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
