/**
 * FILE: src/renderer/app.js
 * PURPOSE: Renderer-side app bootstrap. Handles:
 *   - View routing (top nav)
 *   - Toast notifications
 *   - History panel (right sidebar)
 *   - Shared cache of departments/employees/stocks for dropdowns
 *   - Global window.App object consumed by all view files
 * CONNECTED TO: index.html (script tag)
 *               views/add-stocks.js, views/less-stocks.js, views/settings.js
 *               preload.js (window.api.invoke)
 */

/* ─── Shared App namespace ────────────────────────────────────────────────── */
window.App = {
  /** Cached lookup data — refreshed via App.refreshLookups() */
  departments: [],
  employees:   [],
  stocks:      [],

  /** Refresh all dropdown caches from the database */
  async refreshLookups() {
    [App.departments, App.employees, App.stocks] = await Promise.all([
      api.invoke('departments:get'),
      api.invoke('employees:get'),
      api.invoke('stocks:get'),
    ]);
  },

  /** Navigate to a named view */
  navigate(viewName) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    const btn  = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    const view = document.getElementById(`view-${viewName}`);
    if (btn)  btn.classList.add('active');
    if (view) view.classList.add('active');

    try {
      sessionStorage.setItem('activeView', viewName);
    } catch {
      // ignore storage errors
    }

    // Hide history panel on full-width views
    const panel = document.getElementById('history-panel');
    if (panel) panel.style.display = (viewName === 'settings' || viewName === 'rcm' || viewName === 'audit-log') ? 'none' : '';
  },
};

function _normalizeUiTheme(value) {
  return String(value || '').trim().toLowerCase() === 'light' ? 'light' : 'dark';
}

function _normalizeUiFontSize(value) {
  return String(value || '').trim().toLowerCase() === 'large' ? 'large' : 'normal';
}

window.applyUiPreferences = function(settings = {}) {
  const theme = _normalizeUiTheme(settings.ui_theme);
  const fontSize = _normalizeUiFontSize(settings.ui_font_size);

  document.body.classList.toggle('ui-theme-light', theme === 'light');
  document.body.classList.toggle('ui-theme-dark', theme !== 'light');
  document.documentElement.classList.toggle('ui-font-large', fontSize === 'large');
};

function initView(view) {
  if (view === 'add-stocks'  && window.AddStocksView)  return AddStocksView.init();
  if (view === 'less-stocks' && window.LessStocksView) return LessStocksView.init();
  if (view === 'rcm'         && window.RCMView)        return RCMView.init();
  if (view === 'audit-log'   && window.AuditLogView)   return AuditLogView.init();
  if (view === 'settings'    && window.SettingsView)   return SettingsView.init();
}

/* ─── Toast ───────────────────────────────────────────────────────────────── */
window.toast = function(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span>${_toastIcon(type)}</span>
    <span>${message}</span>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => el.remove(), 350);
  }, duration);
};

function _toastIcon(type) {
  const icons = {
    success: '✓',
    error:   '✕',
    info:    'ℹ',
  };
  return icons[type] || icons.info;
}

async function ensureAppUnlocked() {
  try {
    if (sessionStorage.getItem('appUnlockedSession') === 'true') return true;
  } catch {
    // ignore storage errors
  }

  const settings = await api.invoke('settings:get');
  const enabled = _toBool(settings?.app_lock_enabled, false);

  if (!enabled) return true;

  const unlocked = await showAppLockModal();
  if (unlocked) {
    try {
      sessionStorage.setItem('appUnlockedSession', 'true');
    } catch {
      // ignore storage errors
    }
  }

  return unlocked;
}

function _licenseReasonText(reason) {
  const map = {
    missing: 'No license found for this machine.',
    public_key_missing: 'License public key is not configured.',
    invalid_format: 'License key format is invalid.',
    invalid_payload: 'License payload is invalid.',
    invalid_signature: 'License signature is invalid.',
    machine_mismatch: 'This license key is for a different machine.',
    invalid_expiry: 'License expiry is invalid.',
    expired: 'License has expired.',
  };
  return map[String(reason || '').trim()] || 'License validation failed.';
}

async function ensureLicenseValid() {
  const status = await api.invoke('license:status');
  if (status?.valid) return true;

  return await showLicenseModal(status || {});
}

function showLicenseModal(initialStatus = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '13000';

    const expiresHint = initialStatus?.expiresAt ? `Last expiry: ${initialStatus.expiresAt}` : 'No active validity found.';
    const reasonText = _licenseReasonText(initialStatus?.reason);
    const machineId = String(initialStatus?.machineId || 'UNKNOWN');

    overlay.innerHTML = `
      <div class="modal" style="max-width:580px;">
        <h2>License Required</h2>
        <p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin-bottom:8px;">
          This app is locked until a valid time-bound license for this machine is provided.
        </p>
        <p style="font-size:12px;color:var(--warning);margin-bottom:8px;">${reasonText}</p>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">${expiresHint}</p>

        <div class="form-group" style="margin-bottom:10px;">
          <label>Machine ID (send this to owner)</label>
          <input type="text" id="license-machine-id" readonly value="${machineId}">
        </div>

        <div class="form-group">
          <label>License Key</label>
          <textarea id="license-key-input" rows="4" placeholder="Paste license key here"></textarea>
        </div>

        <div id="license-error" style="font-size:12px;color:var(--error);margin-top:8px;display:none;"></div>

        <div class="modal-actions" style="margin-top:14px;">
          <button class="btn btn-secondary" id="license-copy-machine">Copy Machine ID</button>
          <button class="btn btn-danger" id="license-exit-app">Exit App</button>
          <button class="btn btn-primary" id="license-activate-btn">Activate</button>
        </div>
      </div>
    `;

    const keyInput = overlay.querySelector('#license-key-input');
    const errEl = overlay.querySelector('#license-error');

    const showError = (msg) => {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.style.display = 'block';
    };

    overlay.querySelector('#license-copy-machine')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(machineId);
        toast('Machine ID copied.', 'success');
      } catch {
        showError('Unable to copy. Please copy manually.');
      }
    });

    overlay.querySelector('#license-exit-app')?.addEventListener('click', () => {
      void api.invoke('app:quit');
    });

    overlay.querySelector('#license-activate-btn')?.addEventListener('click', async () => {
      const token = String(keyInput?.value || '').trim();
      if (!token) {
        showError('License key is required.');
        return;
      }

      const result = await api.invoke('license:activate', { token });
      if (result?.ok) {
        overlay.remove();
        toast('License activated.', 'success');
        resolve(true);
        return;
      }

      showError(_licenseReasonText(result?.reason || result?.error));
    });

    document.body.appendChild(overlay);
    keyInput?.focus();
  });
}

function showAppLockModal() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '12000';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <h2>App Locked</h2>
        <div class="form-group">
          <label>Password</label>
          <div style="position:relative;">
            <input type="password" id="lock-pin-input" autocomplete="off" style="padding-right:42px;">
            <button
              type="button"
              id="lock-pin-eye-btn"
              aria-label="Show password"
              title="Show password"
              style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--text-muted);cursor:pointer;"
            ></button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="lock-pin-submit">Unlock</button>
        </div>
      </div>
    `;

    const pinInput = overlay.querySelector('#lock-pin-input');
    const eyeBtn = overlay.querySelector('#lock-pin-eye-btn');

    const renderEyeIcon = (visible) => {
      if (!eyeBtn) return;
      if (visible) {
        eyeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.9 10.9 0 0 1 12 20C7 20 2.73 16.89 1 12c.92-2.6 2.69-4.77 4.94-6.2"></path>
            <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84"></path>
            <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a10.93 10.93 0 0 1-1.67 2.68"></path>
            <path d="M1 1l22 22"></path>
          </svg>
        `;
        eyeBtn.setAttribute('aria-label', 'Hide password');
        eyeBtn.setAttribute('title', 'Hide password');
      } else {
        eyeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
        eyeBtn.setAttribute('aria-label', 'Show password');
        eyeBtn.setAttribute('title', 'Show password');
      }
    };

    renderEyeIcon(false);

    const submit = () => {
      const pin = String(pinInput?.value || '').trim();
      const normalizedInput = _normalizeDatePassword(pin);
      const normalizedToday = _todayDatePassword();

      if (!normalizedInput) {
        toast('Password must be a valid date in M/D/YYYY format.', 'error');
        pinInput?.focus();
        return;
      }

      if (normalizedInput === normalizedToday) {
        overlay.remove();
        resolve(true);
      } else {
        toast('Invalid password.', 'error');
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
      }
    };

    overlay.querySelector('#lock-pin-submit')?.addEventListener('click', submit);
    eyeBtn?.addEventListener('click', () => {
      if (!pinInput) return;
      const showing = pinInput.type === 'text';
      pinInput.type = showing ? 'password' : 'text';
      renderEyeIcon(!showing);
      pinInput.focus();
    });

    pinInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    document.body.appendChild(overlay);
    pinInput?.focus();
  });
}

function _normalizeDatePassword(value = '') {
  const text = String(value || '').trim();
  const match = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{2}|\d{4})$/.exec(text);
  if (!match) return '';

  const month = Number(match[1]);
  const day = Number(match[2]);
  const yearRaw = String(match[3]);
  const year = yearRaw.length === 2 ? (2000 + Number(yearRaw)) : Number(yearRaw);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  return `${month}/${day}/${year}`;
}

function _todayDatePassword() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  return `${month}/${day}/${year}`;
}

function _toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

/* ─── Navigation wiring ───────────────────────────────────────────────────── */
document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;

    const isRcmActive = document.getElementById('view-rcm')?.classList.contains('active');
    if (isRcmActive && view !== 'rcm' && window.RCMView?.hasUnsavedChanges?.()) {
      window.RCMView?.playUnsavedAlertSound?.();
      toast('Please save RCM changes before switching pages.', 'info');
      return;
    }

    App.navigate(view);
    initView(view);
  });
});

/* ─── History Panel ───────────────────────────────────────────────────────── */
const HIST_PAGE_SIZE = 20;
let histPage = 1;
let histData = [];

/** Load and render the history panel */
async function loadHistory() {
  const search  = document.getElementById('hist-search')?.value?.toLowerCase() || '';
  const dateFrom = document.getElementById('hist-from')?.value || '';
  const dateTo   = document.getElementById('hist-to')?.value   || '';
  const type     = document.getElementById('hist-type')?.value  || '';

  let rows = await api.invoke('movements:history', { type, dateFrom, dateTo });

  // Client-side text filter (search across stock + employee names)
  if (search) {
    rows = rows.filter(r =>
      r.stock_name?.toLowerCase().includes(search) ||
      r.employee_name?.toLowerCase().includes(search) ||
      r.department_name?.toLowerCase().includes(search)
    );
  }

  histData = rows;
  histPage = 1;
  renderHistoryPage();
}

function renderHistoryPage() {
  const body   = document.getElementById('hist-body');
  const paging = document.getElementById('hist-pagination');
  if (!body) return;

  const total = histData.length;
  const pages = Math.ceil(total / HIST_PAGE_SIZE) || 1;
  const start = (histPage - 1) * HIST_PAGE_SIZE;
  const slice = histData.slice(start, start + HIST_PAGE_SIZE);

  if (total === 0) {
    body.innerHTML = '<div class="empty">No movements found.</div>';
    paging.style.display = 'none';
    return;
  }

  body.innerHTML = slice.map(r => `
    <div class="history-item">
      <div class="history-meta">
        <span class="history-date">${r.date}</span>
        <span class="history-type ${r.type}">${r.type}</span>
      </div>
      <div class="history-stock">${r.stock_name} <span class="history-qty">×${r.qty} ${r.uom}</span></div>
      <div class="history-emp">${r.employee_name} · ${r.department_name}</div>
      ${r.note ? `<div class="history-emp" style="color:var(--text-dim);">${r.note}</div>` : ''}
    </div>
  `).join('');

  // Pagination
  if (pages > 1) {
    paging.style.display = 'flex';
    paging.innerHTML = `
      <button class="btn btn-secondary btn-xs" ${histPage <= 1 ? 'disabled' : ''} onclick="histPage--;renderHistoryPage()">‹</button>
      <span class="page-info">Page ${histPage} / ${pages}</span>
      <button class="btn btn-secondary btn-xs" ${histPage >= pages ? 'disabled' : ''} onclick="histPage++;renderHistoryPage()">›</button>
    `;
  } else {
    paging.style.display = 'none';
  }
}

// Expose for views to call after a successful transaction
window.refreshHistory = loadHistory;

// Wire history filter inputs
['hist-search', 'hist-from', 'hist-to', 'hist-type'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => loadHistory());
});

document.getElementById('hist-clear')?.addEventListener('click', () => {
  const search = document.getElementById('hist-search');
  const from = document.getElementById('hist-from');
  const type = document.getElementById('hist-type');

  if (search) search.value = '';
  if (from) from.value = '';
  if (type) type.value = '';

  loadHistory();
});

/* ─── Shared UI helpers ───────────────────────────────────────────────────── */

/**
 * buildSelect(items, valueKey, labelKey, selectedValue, placeholder)
 * — generates an <option> list string for <select> elements.
 */
window.buildOptions = function(items, valueKey, labelKey, selectedValue = '', placeholder = '— Select —') {
  const opts = [`<option value="">${placeholder}</option>`];
  for (const item of items) {
    const val = item[valueKey];
    const lbl = item[labelKey];
    opts.push(`<option value="${val}" ${val === selectedValue ? 'selected' : ''}>${lbl}</option>`);
  }
  return opts.join('');
};

/**
 * makeAutocomplete(inputEl, items, valueKey, labelKey, onSelect)
 * — attaches a live-search dropdown to an input element.
 */
window.makeAutocomplete = function(inputEl, items, valueKey, labelKey, onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'autocomplete-wrap';
  inputEl.parentNode.insertBefore(wrap, inputEl);
  wrap.appendChild(inputEl);

  const list = document.createElement('div');
  list.className = 'autocomplete-list';
  wrap.appendChild(list);

  let selectedId = '';

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.toLowerCase();
    const filtered = items.filter(i => i[labelKey].toLowerCase().includes(q) && i.is_active !== false);
    list.innerHTML = filtered.slice(0, 10).map(i =>
      `<div class="autocomplete-item" data-val="${i[valueKey]}">${i[labelKey]}</div>`
    ).join('') || '<div class="autocomplete-item" style="color:var(--text-dim);">No results</div>';
    list.classList.add('open');
  });

  list.addEventListener('mousedown', e => {
    const item = e.target.closest('.autocomplete-item[data-val]');
    if (!item) return;
    selectedId = item.dataset.val;
    const found = items.find(i => i[valueKey] === selectedId);
    inputEl.value = found ? found[labelKey] : '';
    list.classList.remove('open');
    if (onSelect) onSelect(selectedId, found);
  });

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) list.classList.remove('open');
  });

  return {
    getValue: () => selectedId,
    setValue: (id) => {
      selectedId = id;
      const found = items.find(i => i[valueKey] === id);
      inputEl.value = found ? found[labelKey] : '';
    },
    reset: () => { selectedId = ''; inputEl.value = ''; },
  };
};

/* ─── Boot ────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const uiSettings = await api.invoke('settings:get');
    window.applyUiPreferences(uiSettings);
  } catch {
    window.applyUiPreferences({ ui_theme: 'dark', ui_font_size: 'normal' });
  }

  await ensureAppUnlocked();
  await App.refreshLookups();
  loadHistory();

  let startView = 'add-stocks';
  try {
    const saved = sessionStorage.getItem('activeView');
    const allowed = ['add-stocks', 'less-stocks', 'rcm', 'audit-log', 'settings'];
    if (saved && allowed.includes(saved)) startView = saved;
  } catch {
    // ignore storage errors
  }

  App.navigate(startView);
  initView(startView);
});
