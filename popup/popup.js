// popup/popup.js

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  setupNavigation();
  setupMaskToggles();
  setupFormSubmit();
  setupEmailAdd();
});

function loadAll() {
  chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (res) => {
    if (chrome.runtime.lastError || !res) return;

    // Fill profile fields
    const profile = res.profile;
    document.querySelectorAll('[data-key]').forEach((input) => {
      const key = input.dataset.key;
      if (profile[key] !== undefined) input.value = profile[key];
    });

    // Render emails list (without changing visibility)
    renderEmails(res.emails || []);

    // Render accounts list (without changing visibility)
    renderAccounts(res.accounts || {});
  });
}

function reloadLists() {
  chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    renderEmails(res.emails || []);
    renderAccounts(res.accounts || {});
  });
}

function setupNavigation() {
  const items = document.querySelectorAll('.sidebar__item');
  const profileActions = document.getElementById('profile-actions');

  items.forEach((item) => {
    item.addEventListener('click', () => {
      items.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');

      const category = item.dataset.category;
      const isSpecial = category === 'emails' || category === 'accounts';

      // Hide/show profile form actions
      profileActions.classList.toggle('hidden', isSpecial);

      // Show/hide profile sections (only sections inside the form)
      document.querySelectorAll('#profile-form .section[data-category]').forEach((section) => {
        section.classList.toggle('hidden', section.dataset.category !== category);
      });

      // Show/hide special sections
      document.getElementById('emails-section').classList.toggle('hidden', category !== 'emails');
      document.getElementById('accounts-section').classList.toggle('hidden', category !== 'accounts');
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

// ---- Emails ----

function setupEmailAdd() {
  const btn = document.getElementById('btn-add-email');
  const input = document.getElementById('new-email-input');

  btn.addEventListener('click', () => {
    const email = input.value.trim();
    if (!email) return;
    chrome.runtime.sendMessage({ type: 'SAVE_EMAIL', email }, () => {
      input.value = '';
      reloadLists();
    });
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
  });
}

function renderEmails(emails) {
  const list = document.getElementById('emails-list');
  list.innerHTML = '';
  if (emails.length === 0) {
    const empty = document.createElement('li');
    empty.style.cssText = 'color:#9ca3af;font-size:12px;padding:4px 0;';
    empty.textContent = '尚無信箱，請新增';
    list.appendChild(empty);
    return;
  }
  emails.forEach((email) => {
    const li = document.createElement('li');
    li.className = 'list-item';

    const main = document.createElement('div');
    main.className = 'list-item__main';
    const primary = document.createElement('div');
    primary.className = 'list-item__primary';
    primary.textContent = email;
    main.appendChild(primary);

    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.textContent = '×';
    del.title = '刪除';
    del.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DELETE_EMAIL', email }, () => reloadLists());
    });

    li.appendChild(main);
    li.appendChild(del);
    list.appendChild(li);
  });
}

// ---- Accounts ----

function renderAccounts(accounts) {
  const list = document.getElementById('accounts-list');
  list.innerHTML = '';
  const entries = Object.entries(accounts);
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.style.cssText = 'color:#9ca3af;font-size:12px;padding:4px 0;';
    empty.textContent = '尚無帳號，填入密碼後會詢問是否記住';
    list.appendChild(empty);
    return;
  }
  entries.forEach(([hostname, { email, password }]) => {
    const li = document.createElement('li');
    li.className = 'list-item';

    const main = document.createElement('div');
    main.className = 'list-item__main';

    const primary = document.createElement('div');
    primary.className = 'list-item__primary';
    primary.textContent = hostname;

    const secondary = document.createElement('div');
    secondary.className = 'list-item__secondary';
    secondary.textContent = email || '（無信箱）';

    main.appendChild(primary);
    main.appendChild(secondary);

    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.textContent = '×';
    del.title = '刪除';
    del.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DELETE_ACCOUNT', hostname }, () => reloadLists());
    });

    li.appendChild(main);
    li.appendChild(del);
    list.appendChild(li);
  });
}
