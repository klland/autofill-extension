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
