// content.js — injected into every page

(function () {
  'use strict';

  let activeBubble = null;
  let activeField = null;

  // Observe all focus events on input fields (capture phase catches all)
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeBubble();
  });

  // Also bind directly to existing inputs (for SPAs where focusin may miss)
  function bindInput(el) {
    if (!isTextInput(el)) return;
    if (el.__autofillBound) return;
    el.__autofillBound = true;
    el.addEventListener('focus', onFocusIn);
    el.addEventListener('blur', onFocusOut);
  }

  document.querySelectorAll('input, textarea').forEach(bindInput);

  // Watch for dynamically added inputs (React/Vue SPAs)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches('input, textarea')) bindInput(node);
        node.querySelectorAll && node.querySelectorAll('input, textarea').forEach(bindInput);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

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
      type: el.type || '',
    };

    chrome.runtime.sendMessage({ type: 'DETECT_FIELD', field: fieldDescriptor }, (res) => {
      if (chrome.runtime.lastError) return;
      if (!res || !res.fieldType || !res.value) return;
      if (res.emailList && res.emailList.length > 1) {
        showEmailListBubble(el, res);
      } else {
        showSuggestionBubble(el, res);
      }
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
    return !skipTypes.includes(el.type.toLowerCase());
  }

  function removeBubble() {
    if (activeBubble) {
      activeBubble.remove();
      activeBubble = null;
    }
  }

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

  function showEmailListBubble(inputEl, res) {
    removeBubble();

    const host = document.createElement('div');
    host.id = '__autofill_bubble__';
    Object.assign(host.style, { position: 'absolute', zIndex: '2147483647', pointerEvents: 'auto' });
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .bubble { background:#fff; border:1px solid #d1d5db; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); padding:8px 12px; font-family:system-ui,sans-serif; font-size:13px; color:#111; min-width:220px; }
      .bubble__title { font-weight:600; margin-bottom:6px; font-size:12px; color:#555; }
      .email-item { padding:5px 8px; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:6px; }
      .email-item:hover { background:#f3f4f6; }
      .email-item__addr { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .btn-fill { background:#2563eb; color:#fff; border:none; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer; flex-shrink:0; }
      .btn-fill:hover { background:#1d4ed8; }
    `;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const title = document.createElement('div');
    title.className = 'bubble__title';
    title.textContent = '選擇電子郵件';
    bubble.appendChild(title);

    res.emailList.forEach((email) => {
      const row = document.createElement('div');
      row.className = 'email-item';

      const addr = document.createElement('span');
      addr.className = 'email-item__addr';
      addr.textContent = email;

      const btn = document.createElement('button');
      btn.className = 'btn-fill';
      btn.textContent = '填入';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        fillField(inputEl, email);
        removeBubble();
      });

      row.appendChild(addr);
      row.appendChild(btn);
      bubble.appendChild(row);
    });

    shadow.appendChild(style);
    shadow.appendChild(bubble);
    document.body.appendChild(host);
    positionAbove(host, inputEl);
    activeBubble = host;
  }

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
        // Learn the correction — use el.id || el.name to match background.js lookup
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

  function checkNewValue(el) {
    if (!isTextInput(el)) return;
    const typedValue = el.value.trim();
    if (!typedValue) return;

    // Password field: offer to save as account for this site
    if (el.type === 'password') {
      // Find the nearest email input in the same form to pair with
      const form = el.closest('form');
      const emailEl = form
        ? form.querySelector('input[type="email"], input[name*="email"], input[id*="email"]')
        : null;
      const emailValue = emailEl ? emailEl.value.trim() : '';
      showAccountSaveToast(el, emailValue, typedValue);
      return;
    }

    const fieldDescriptor = {
      hostname: location.hostname,
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      type: el.type || '',
    };

    chrome.runtime.sendMessage({ type: 'DETECT_FIELD', field: fieldDescriptor }, (res) => {
      if (chrome.runtime.lastError) return;
      if (!res || !res.fieldType) return;
      if (res.value === typedValue) return; // same as stored, nothing to do

      // For email: offer to save to emails list
      if (res.fieldType === 'email') {
        showMemoryToast(el, 'email', '電子郵件', typedValue);
        return;
      }

      showMemoryToast(el, res.fieldType, res.label, typedValue);
    });
  }

  function showAccountSaveToast(inputEl, email, password) {
    removeBubble();

    const host = document.createElement('div');
    host.id = '__autofill_bubble__';
    Object.assign(host.style, { position: 'absolute', zIndex: '2147483647', pointerEvents: 'auto' });
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .toast { background:#fff; border:1px solid #d1d5db; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); padding:10px 12px; font-family:system-ui,sans-serif; font-size:13px; color:#111; min-width:240px; }
      .toast__title { font-weight:600; margin-bottom:4px; }
      .toast__value { color:#555; margin-bottom:8px; font-size:12px; }
      .toast__actions { display:flex; gap:8px; justify-content:flex-end; }
      button { cursor:pointer; border:none; border-radius:5px; padding:4px 10px; font-size:12px; }
      .btn-save { background:#16a34a; color:#fff; }
      .btn-save:hover { background:#15803d; }
      .btn-ignore { background:#f3f4f6; color:#374151; }
      .btn-ignore:hover { background:#e5e7eb; }
    `;

    const toast = document.createElement('div');
    toast.className = 'toast';

    const title = document.createElement('div');
    title.className = 'toast__title';
    title.textContent = '要記住這個網站的帳號嗎？';

    const valueEl = document.createElement('div');
    valueEl.className = 'toast__value';
    valueEl.textContent = email ? `帳號：${email}` : `網站：${location.hostname}`;

    const actions = document.createElement('div');
    actions.className = 'toast__actions';

    const btnSave = document.createElement('button');
    btnSave.className = 'btn-save';
    btnSave.textContent = '記住';
    btnSave.addEventListener('mousedown', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({
        type: 'SAVE_ACCOUNT',
        hostname: location.hostname,
        email,
        password,
      });
      // Also add email to the emails list if not empty
      if (email) {
        chrome.runtime.sendMessage({ type: 'SAVE_EMAIL', email });
      }
      removeBubble();
    });

    const btnIgnore = document.createElement('button');
    btnIgnore.className = 'btn-ignore';
    btnIgnore.textContent = '忽略';
    btnIgnore.addEventListener('mousedown', (e) => { e.preventDefault(); removeBubble(); });

    actions.appendChild(btnIgnore);
    actions.appendChild(btnSave);
    toast.appendChild(title);
    toast.appendChild(valueEl);
    toast.appendChild(actions);
    shadow.appendChild(style);
    shadow.appendChild(toast);
    document.body.appendChild(host);
    positionAbove(host, inputEl);
    activeBubble = host;
  }

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

    const title = document.createElement('div');
    title.className = 'toast__title';
    title.textContent = '要記住這筆資料嗎？';

    const valueEl = document.createElement('div');
    valueEl.className = 'toast__value';
    valueEl.textContent = `${label}：${newValue}`;

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
    toast.appendChild(title);
    toast.appendChild(valueEl);
    toast.appendChild(actions);
    shadow.appendChild(style);
    shadow.appendChild(toast);
    document.body.appendChild(host);

    positionAbove(host, inputEl);
    activeBubble = host;
  }

})();
