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
