// background.js — Service Worker

const DEFAULT_PROFILE = {
  name: '',
  id_number: '',
  taiwan_pass: '',
  taiwan_pass_expiry: '',
  passport: '',
  passport_expiry: '',
  phone_mobile: '',
  phone_home: '',
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
  taiwan_pass_expiry: '台胞證到期日',
  passport: '護照號碼',
  passport_expiry: '護照到期日',
  phone_mobile: '手機號碼',
  phone_home: '市話號碼',
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

// Ensure default storage exists on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['profile', 'field_rules', 'emails', 'accounts'], (data) => {
    if (!data.profile) chrome.storage.local.set({ profile: DEFAULT_PROFILE });
    if (!data.field_rules) chrome.storage.local.set({ field_rules: {} });
    if (!data.emails) chrome.storage.local.set({ emails: [] });
    if (!data.accounts) chrome.storage.local.set({ accounts: {} });
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
    chrome.storage.local.get(['profile', 'field_rules', 'emails', 'accounts'], (data) => {
      const profile = data.profile || DEFAULT_PROFILE;
      const fieldRules = data.field_rules || {};
      const emails = data.emails || [];
      const accounts = data.accounts || {};
      const fieldType = detectFieldType(msg.field, fieldRules);

      // Password field: look up stored account for this hostname
      if (msg.field.inputType === 'password' || msg.field.type === 'password') {
        const account = accounts[msg.field.hostname];
        if (account && account.password) {
          sendResponse({
            fieldType: 'password',
            value: account.password,
            label: '密碼',
            allFields: [],
            isPassword: true,
          });
        } else {
          sendResponse({ fieldType: null, value: null, label: null, allFields: [] });
        }
        return;
      }

      // Email field: if site has stored account, suggest that email first; else list all emails
      if (fieldType === 'email') {
        const account = accounts[msg.field.hostname];
        const siteEmail = account ? account.email : null;
        const emailList = siteEmail
          ? [siteEmail, ...emails.filter(e => e !== siteEmail)]
          : emails;

        sendResponse({
          fieldType: 'email',
          value: emailList[0] || null,
          label: '電子郵件',
          allFields: Object.entries(FIELD_LABELS).map(([key, label]) => ({
            key, label, value: profile[key] || '',
          })),
          emailList,
        });
        return;
      }

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
    return true;
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
    chrome.storage.local.get(['profile', 'emails', 'accounts'], (data) => {
      sendResponse({
        profile: data.profile || DEFAULT_PROFILE,
        labels: FIELD_LABELS,
        emails: data.emails || [],
        accounts: data.accounts || {},
      });
    });
    return true;
  }

  if (msg.type === 'SAVE_PROFILE') {
    chrome.storage.local.set({ profile: msg.profile }, () => sendResponse({ ok: true }));
    return true;
  }

  // Save a new email to the emails list
  if (msg.type === 'SAVE_EMAIL') {
    chrome.storage.local.get('emails', (data) => {
      const emails = data.emails || [];
      if (!emails.includes(msg.email)) {
        emails.push(msg.email);
        chrome.storage.local.set({ emails }, () => sendResponse({ ok: true }));
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  // Delete an email from the list
  if (msg.type === 'DELETE_EMAIL') {
    chrome.storage.local.get('emails', (data) => {
      const emails = (data.emails || []).filter(e => e !== msg.email);
      chrome.storage.local.set({ emails }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Save account (email + password) for a hostname
  if (msg.type === 'SAVE_ACCOUNT') {
    chrome.storage.local.get('accounts', (data) => {
      const accounts = data.accounts || {};
      accounts[msg.hostname] = { email: msg.email, password: msg.password };
      chrome.storage.local.set({ accounts }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Delete account for a hostname
  if (msg.type === 'DELETE_ACCOUNT') {
    chrome.storage.local.get('accounts', (data) => {
      const accounts = data.accounts || {};
      delete accounts[msg.hostname];
      chrome.storage.local.set({ accounts }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Save all emails list (from popup)
  if (msg.type === 'SAVE_EMAILS') {
    chrome.storage.local.set({ emails: msg.emails }, () => sendResponse({ ok: true }));
    return true;
  }
});
