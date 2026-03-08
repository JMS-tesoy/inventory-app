/**
 * FILE: src/renderer/views/rcm.js
 * PURPOSE: RCM page for monitoring pulled-out stock requests.
 */

window.RCMView = (() => {
  const container = document.getElementById('view-rcm');
  const PICKUP_PRESET_KEY = 'rcm.pickupByPresets';
  const DEFAULT_PICKUP_NAMES = ['Alex', 'Maria', 'John', 'Sophia', 'Daniel'];
  const MAX_PICKUP_PRESETS = 20;

  let rows = [];
  let filteredRows = [];
  const expandedOutletKeys = new Set();
  let pickupPresets = [];
  let outletSortMode = 'newest';
  let editingOutletKey = null;
  let editingOutletValue = '';
  const dirtyOutletKeys = new Set();
  let rowKeyCounter = 0;
  let unsavedAlertAudioCtx = null;
  let lastUnsavedAlertAt = 0;

  function _playUnsavedAlertSound() {
    const now = Date.now();
    if (now - lastUnsavedAlertAt < 250) return;
    lastUnsavedAlertAt = now;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!unsavedAlertAudioCtx || unsavedAlertAudioCtx.state === 'closed') {
        unsavedAlertAudioCtx = new AudioCtx();
      }

      const ctx = unsavedAlertAudioCtx;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const playZapPulse = (startAt) => {
        const duration = 0.09;

        const toneOsc = ctx.createOscillator();
        const toneGain = ctx.createGain();
        toneOsc.type = 'square';
        toneOsc.frequency.setValueAtTime(2200, startAt);
        toneOsc.frequency.exponentialRampToValueAtTime(780, startAt + duration);
        toneGain.gain.setValueAtTime(0.0001, startAt);
        toneGain.gain.exponentialRampToValueAtTime(0.09, startAt + 0.006);
        toneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

        const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const noiseBuffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) {
          const decay = 1 - (i / frameCount);
          noiseData[i] = (Math.random() * 2 - 1) * decay;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(2600, startAt);
        noiseFilter.Q.setValueAtTime(1.5, startAt);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, startAt);
        noiseGain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.004);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

        toneOsc.connect(toneGain);
        toneGain.connect(ctx.destination);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        toneOsc.start(startAt);
        toneOsc.stop(startAt + duration + 0.01);
        noiseSource.start(startAt);
        noiseSource.stop(startAt + duration + 0.01);
      };

      const t0 = ctx.currentTime;
      playZapPulse(t0);
    } catch {
      // ignore audio failures to avoid blocking UX
    }
  }

  function _syncSaveLockUI() {
    const groupsHost = document.getElementById('rcm-outlet-groups');
    if (!groupsHost) return;

    groupsHost.querySelectorAll('.rcm-save-outlet').forEach(btn => {
      const key = String(btn.dataset.outletKey || '');
      btn.disabled = !dirtyOutletKeys.has(key);
    });

    groupsHost.querySelectorAll('.rcm-outlet-unsaved').forEach(hint => {
      const key = String(hint.dataset.outletKey || '');
      const dirty = dirtyOutletKeys.has(key);
      hint.textContent = dirty ? 'Unsaved changes' : '';
      hint.classList.toggle('rcm-unsaved-active', dirty);
    });
  }

  function _activeDirtyOutletKey() {
    return dirtyOutletKeys.values().next().value || '';
  }

  function _findOutletHint(outletKey) {
    return Array.from(document.querySelectorAll('.rcm-outlet-unsaved')).find(el => String(el.dataset.outletKey || '') === outletKey) || null;
  }

  function _markOutletDirty(outletKey) {
    if (!outletKey) return;
    dirtyOutletKeys.add(outletKey);
    _syncSaveLockUI();
    _syncStatusBoxColors(document.getElementById('rcm-outlet-groups') || document);
  }

  function _replaceDirtyOutletKey(oldKey, nextKey) {
    if (!oldKey || !nextKey || oldKey === nextKey) return;
    if (!dirtyOutletKeys.has(oldKey)) return;
    dirtyOutletKeys.delete(oldKey);
    dirtyOutletKeys.add(nextKey);
    _syncSaveLockUI();
  }

  function _promptSaveFirst(targetOutletKey = '') {
    const activeKey = _activeDirtyOutletKey();
    if (!activeKey) return false;
    if (targetOutletKey && targetOutletKey === activeKey) return false;

    _playUnsavedAlertSound();

    const hint = _findOutletHint(activeKey);
    if (hint) {
      hint.classList.remove('rcm-unsaved-vibrate');
      void hint.offsetWidth;
      hint.classList.add('rcm-unsaved-vibrate');
    }
    toast('Please save changes in the edited table first.', 'info');
    return true;
  }

  function _syncStatusBoxColors(scope = document) {
    scope.querySelectorAll('.rcm-status-select').forEach(selectEl => {
      const wrapper = selectEl.closest('.rcm-status-box');
      if (!wrapper) return;
      wrapper.classList.remove('in-progress', 'done');
      wrapper.classList.add(_normalizeStatus(selectEl.value) === 'done' ? 'done' : 'in-progress');
    });
  }

  function _normalizeStatus(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'done') return 'done';
    return 'in_progress';
  }

  function _normalizeRowsStatus(inputRows) {
    return _withRowKeys((Array.isArray(inputRows) ? inputRows : []).map(row => ({
      ...row,
      status: _normalizeStatus(row?.status),
    })));
  }

  function _extractRowsFromGetResult(result) {
    if (result?.ok === false) {
      throw new Error(result?.error || 'Failed to load pull-out records.');
    }
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.rows)) return result.rows;
    return [];
  }

  function _newRowKey() {
    rowKeyCounter += 1;
    return `rk_${Date.now()}_${rowKeyCounter}`;
  }

  function _withRowKeys(inputRows) {
    return (Array.isArray(inputRows) ? inputRows : []).map(row => ({
      ...row,
      __rowKey: String(row?.__rowKey || _newRowKey()),
    }));
  }

  function _findRowByKey(rowKey) {
    return rows.find(r => String(r.__rowKey) === String(rowKey));
  }

  function _sanitizeQtyInput(value) {
    const text = String(value || '');
    let cleaned = text.replace(/[^0-9.]/g, '');

    const firstDot = cleaned.indexOf('.');
    if (firstDot >= 0) {
      cleaned = `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
    }

    return cleaned;
  }

  function _today() {
    return new Date().toISOString().slice(0, 10);
  }

  function _esc(value = '') {
    return String(value).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function _stockName(stockId) {
    const stock = (App.stocks || []).find(s => s.stock_id === stockId);
    return stock ? stock.stock_name : stockId || '—';
  }

  function _stockInputValue(row) {
    const typed = String(row?.__stockInput || '').trim();
    if (typed) return typed;
    const name = _stockName(row?.stock_id);
    return name === '—' ? '' : name;
  }

  function _activeStocks() {
    return (App.stocks || []).filter(s => s.is_active !== false);
  }

  function _stockDatalistOptions() {
    return _activeStocks()
      .slice()
      .sort((a, b) => String(a.stock_name || '').localeCompare(String(b.stock_name || '')))
      .map(s => `<option value="${_esc(s.stock_name)}"></option>`)
      .join('');
  }

  function _syncStockDatalist() {
    const list = document.getElementById('rcm-stock-options');
    if (!list) return;
    list.innerHTML = _stockDatalistOptions();
  }

  function _findStockByTyped(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    return _activeStocks().find(s => (
      String(s.stock_name || '').trim().toLowerCase() === text ||
      String(s.stock_id || '').trim().toLowerCase() === text
    )) || null;
  }

  function _applyTypedStockToRow(targetRow, rawValue, inputEl = null) {
    const typed = String(rawValue || '').trim();
    targetRow.__stockInput = typed;
    const found = _findStockByTyped(typed);
    if (found) {
      targetRow.stock_id = found.stock_id;
      targetRow.__stockInput = found.stock_name;
      if (inputEl) inputEl.value = found.stock_name;
      return;
    }
    targetRow.stock_id = '';
  }

  function _newStockId(existingIds = null) {
    const existing = existingIds || new Set((App.stocks || []).map(s => String(s.stock_id || '').trim()).filter(Boolean));
    let next = '';
    do {
      next = `S-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    } while (existing.has(next));
    existing.add(next);
    return next;
  }

  async function _syncTypedStockInputsForOutlet(outletKey) {
    const key = String(outletKey || '');
    if (!key) return;

    const stocks = Array.isArray(App.stocks) ? [...App.stocks] : [];
    const stockIds = new Set(stocks.map(s => String(s.stock_id || '').trim()).filter(Boolean));
    let added = 0;

    for (const row of rows) {
      if (_outletKey(row.outlet) !== key) continue;

      const typed = String(row.__stockInput || '').trim();
      if (!typed) {
        row.stock_id = '';
        continue;
      }

      const existing = stocks.find(s => (
        String(s.stock_name || '').trim().toLowerCase() === typed.toLowerCase() ||
        String(s.stock_id || '').trim().toLowerCase() === typed.toLowerCase()
      ));

      if (existing) {
        row.stock_id = String(existing.stock_id || '').trim();
        row.__stockInput = String(existing.stock_name || '').trim();
        continue;
      }

      const newStock = {
        stock_id: _newStockId(stockIds),
        stock_name: typed,
        barcode: '',
        category: 'Savemore Pharma',
        supplier: 'Savemore Pharma',
        uom: 'box',
        min_stock_threshold: 10,
        is_active: true,
      };
      stocks.push(newStock);
      row.stock_id = newStock.stock_id;
      row.__stockInput = newStock.stock_name;
      added += 1;
    }

    if (added > 0) {
      await api.invoke('stocks:save', stocks);
      await App.refreshLookups();
    }
  }

  function _outletLabel(outlet) {
    const value = String(outlet || '').trim();
    return value || 'Unassigned Outlet';
  }

  function _outletKey(outlet) {
    const value = String(outlet || '').trim().toLowerCase();
    return value || '__unassigned__';
  }

  function _qtyPresetOptions() {
    const options = ['<option value="">⋯</option>'];
    for (let i = 1; i <= 50; i++) {
      options.push(`<option value="${i}">${i}</option>`);
    }
    return options.join('');
  }

  function _pickupPresetOptions() {
    const options = ['<option value="">⋯</option>'];
    for (const name of pickupPresets) {
      options.push(`<option value="${_esc(name)}">${_esc(name)}</option>`);
    }
    return options.join('');
  }

  function _normalizePickupName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
  }

  function _loadPickupPresets() {
    let stored = [];
    try {
      const raw = localStorage.getItem(PICKUP_PRESET_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) stored = parsed;
    } catch {
      // ignore storage errors
    }

    const merged = [...stored, ...DEFAULT_PICKUP_NAMES]
      .map(_normalizePickupName)
      .filter(Boolean);

    const seen = new Set();
    pickupPresets = [];
    for (const name of merged) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      pickupPresets.push(name);
    }
    pickupPresets = pickupPresets.slice(0, MAX_PICKUP_PRESETS);
  }

  function _savePickupPresets() {
    try {
      localStorage.setItem(PICKUP_PRESET_KEY, JSON.stringify(pickupPresets.slice(0, MAX_PICKUP_PRESETS)));
    } catch {
      // ignore storage errors
    }
  }

  function _rememberPickupName(name, persist = true) {
    const normalized = _normalizePickupName(name);
    if (!normalized) return;

    const existingIndex = pickupPresets.findIndex(n => n.toLowerCase() === normalized.toLowerCase());
    if (existingIndex >= 0) {
      const [existing] = pickupPresets.splice(existingIndex, 1);
      pickupPresets.unshift(existing);
    } else {
      pickupPresets.unshift(normalized);
    }

    if (pickupPresets.length > MAX_PICKUP_PRESETS) {
      pickupPresets = pickupPresets.slice(0, MAX_PICKUP_PRESETS);
    }

    if (persist) _savePickupPresets();
  }

  function _seedPickupPresetsFromRows() {
    for (const row of rows) {
      const name = _normalizePickupName(row.pickup_by);
      if (!name) continue;
      _rememberPickupName(name, false);
    }
    _savePickupPresets();
  }

  function _outletAccent(key) {
    const text = String(key || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return {
      border: `hsla(${hue}, 42%, 62%, 0.35)`,
      bg: `hsla(${hue}, 35%, 58%, 0.08)`,
      text: `hsl(${hue}, 45%, 74%)`,
    };
  }

  function _csvCell(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function _safeFilePart(value, fallback = 'outlet') {
    const text = String(value || '').trim();
    const cleaned = text.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
    return cleaned || fallback;
  }

  function _downloadCsv(filename, csvText) {
    const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function _exportOutletCsv(outletKey, outletLabel) {
    const key = String(outletKey || '');
    if (!key) return;

    const outletRows = filteredRows.filter(r => _outletKey(r.outlet) === key);
    if (!outletRows.length) {
      toast('No rows to export for this outlet.', 'info');
      return;
    }

    const headers = ['RCM#', 'Lot#', 'Request Date', 'Stock/DISC', 'Qty', 'Date', 'Picked Up By', 'Status', 'Note'];
    const lines = [headers.map(_csvCell).join(',')];

    for (const row of outletRows) {
      const statusLabel = _normalizeStatus(row.status) === 'done' ? 'Done' : 'In Progress';
      const values = [
        row.pullout_id || '',
        row.lot_no || '',
        row.request_date || '',
        _stockName(row.stock_id),
        row.qty ?? '',
        row.schedule_date || '',
        row.pickup_by || '',
        statusLabel,
        row.note || '',
      ];
      lines.push(values.map(_csvCell).join(','));
    }

    const stamp = _today();
    const fileName = `rcm_${_safeFilePart(outletLabel, 'outlet')}_${stamp}.csv`;
    _downloadCsv(fileName, lines.join('\r\n'));
    toast(`CSV exported for ${outletLabel}.`, 'success');
  }

  function render() {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>RCM Pull-out Monitoring</h1>
          <p>Track pulled-out stock by status, outlet, schedule, and assigned pickup person.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-secondary btn-sm" id="rcm-add-outlet">New Outlet</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;justify-content:flex-end;overflow-x:auto;">
            <input type="text" id="rcm-search" placeholder="Search..." style="width:180px;min-width:180px;">
            <select id="rcm-status" style="width:120px;min-width:120px;">
              <option value="">All Status</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <input type="date" id="rcm-schedule-from" style="width:132px;min-width:132px;">
            <input type="date" id="rcm-schedule-to" value="${_today()}" style="width:132px;min-width:132px;">
            <button class="btn btn-secondary btn-sm" id="rcm-clear">Clear</button>
            <select id="rcm-outlet-sort" style="width:170px;min-width:170px;">
              <option value="newest">Outlet Sort: Newest</option>
              <option value="az">Outlet Sort: A-Z</option>
              <option value="za">Outlet Sort: Z-A</option>
            </select>
          </div>
        </div>
        <div id="rcm-new-outlet-wrap" style="display:none;max-width:360px;margin-top:-4px;margin-bottom:12px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="rcm-new-outlet-name" placeholder="Type outlet name">
            <button class="btn btn-primary btn-sm" id="rcm-submit-outlet">Add</button>
            <button class="btn btn-secondary btn-sm" id="rcm-cancel-outlet">Cancel</button>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:10px;gap:10px;">
          <span id="rcm-count" style="font-size:12px;color:var(--text-dim);"></span>
        </div>
        <datalist id="rcm-stock-options">${_stockDatalistOptions()}</datalist>
        <div id="rcm-outlet-groups"></div>
      </div>
    `;

    wireEvents();
    _syncStockDatalist();
    _syncSaveLockUI();
    _syncStatusBoxColors(document.getElementById('rcm-outlet-groups') || document);
  }

  function applyFilters() {
    const q = String(document.getElementById('rcm-search')?.value || '').trim().toLowerCase();
    const status = String(document.getElementById('rcm-status')?.value || '');
    const from = String(document.getElementById('rcm-schedule-from')?.value || '');
    const to = String(document.getElementById('rcm-schedule-to')?.value || '');

    filteredRows = rows.filter(r => {
      if (status && r.status !== status) return false;
      if (from && r.schedule_date && r.schedule_date < from) return false;
      if (to && r.schedule_date && r.schedule_date > to) return false;

      if (!q) return true;

      return [
        r.pullout_id,
        r.lot_no,
        r.outlet,
        _stockName(r.stock_id),
        r.pickup_by,
        r.status,
        r.note,
      ].join(' ').toLowerCase().includes(q);
    });

    renderTable();
  }

  function renderTable() {
    const groupsHost = document.getElementById('rcm-outlet-groups');
    const count = document.getElementById('rcm-count');
    const outletSort = document.getElementById('rcm-outlet-sort');
    if (!groupsHost || !count) return;

    _syncStockDatalist();

    if (outletSort) outletSort.value = outletSortMode;

    if (filteredRows.length === 0) {
      groupsHost.innerHTML = '<div class="empty">No pull-out records found.</div>';
      count.textContent = '0 pull-out';
      _syncSaveLockUI();
      return;
    }

    const outletMap = new Map();
    let index = 0;
    for (const row of filteredRows) {
      const key = _outletKey(row.outlet);
      if (!outletMap.has(key)) {
        outletMap.set(key, {
          key,
          label: _outletLabel(row.outlet),
          firstIndex: index,
          rows: [],
        });
      }
      outletMap.get(key).rows.push(row);
      index += 1;
    }

    for (const key of outletMap.keys()) {
      if (!expandedOutletKeys.has(key)) {
        expandedOutletKeys.add(key);
      }
    }

    const groups = Array.from(outletMap.values());
    if (outletSortMode === 'az') {
      groups.sort((a, b) => a.label.localeCompare(b.label));
    } else if (outletSortMode === 'za') {
      groups.sort((a, b) => b.label.localeCompare(a.label));
    } else {
      groups.sort((a, b) => a.firstIndex - b.firstIndex);
    }
    count.textContent = `${filteredRows.length} pull-out`;

    groupsHost.innerHTML = groups.map(group => {
      const open = expandedOutletKeys.has(group.key);
      const accent = _outletAccent(group.key);

      const rowsHtml = group.rows.map((r) => {
        const statusValue = _normalizeStatus(r.status);
        const qtyOptions = _qtyPresetOptions();
        const pickupOptions = _pickupPresetOptions();
        return `
          <tr>
            <td><input type="text" data-id="${_esc(r.__rowKey)}" data-field="pullout_id" value="${_esc(r.pullout_id)}" placeholder="RCM#"></td>
            <td><input type="text" data-id="${_esc(r.__rowKey)}" data-field="lot_no" value="${_esc(r.lot_no || '')}" placeholder="Lot#"></td>
            <td><input type="date" class="rcm-date-input" data-id="${_esc(r.__rowKey)}" data-field="request_date" value="${_esc(r.request_date || '')}"></td>
            <td>
              <input type="text" class="rcm-stock-input" list="rcm-stock-options" data-id="${_esc(r.__rowKey)}" data-field="stock_id" value="${_esc(_stockInputValue(r))}" placeholder="Type or select product">
            </td>
            <td>
              <div class="rcm-qty-inline-wrap">
                <input type="number" min="0.001" step="any" class="rcm-qty-input" data-id="${_esc(r.__rowKey)}" data-field="qty" value="${Number(r.qty) || ''}">
                <select class="rcm-qty-inline-select" data-id="${_esc(r.__rowKey)}" title="Preset quantity">
                  ${qtyOptions}
                </select>
              </div>
            </td>
            <td><input type="date" class="rcm-date-input" data-id="${_esc(r.__rowKey)}" data-field="schedule_date" value="${_esc(r.schedule_date || '')}"></td>
            <td>
              <div class="rcm-pickup-inline-wrap">
                <input type="text" class="rcm-pickup-input" data-id="${_esc(r.__rowKey)}" data-field="pickup_by" value="${_esc(r.pickup_by || '')}" placeholder="Person">
                <select class="rcm-pickup-inline-select" data-id="${_esc(r.__rowKey)}" title="Preset person">
                  ${pickupOptions}
                </select>
              </div>
            </td>
            <td>
              <div class="rcm-status-box ${statusValue === 'done' ? 'done' : 'in-progress'}">
                <select class="rcm-status-select" data-id="${_esc(r.__rowKey)}" data-field="status">
                  <option value="in_progress" ${statusValue === 'in_progress' ? 'selected' : ''}>In Progress</option>
                  <option value="done" ${statusValue === 'done' ? 'selected' : ''}>Done</option>
                </select>
              </div>
            </td>
            <td><input type="text" data-id="${_esc(r.__rowKey)}" data-field="note" value="${_esc(r.note || '')}" placeholder="Optional"></td>
            <td><button class="btn btn-warning btn-xs rcm-del" data-id="${_esc(r.__rowKey)}">Remove</button></td>
          </tr>
        `;
      }).join('');

      const isEditingOutlet = editingOutletKey === group.key;
      return `
        <section class="rcm-outlet-group" data-outlet-key="${_esc(group.key)}" style="--outlet-accent:${accent.border};--outlet-accent-bg:${accent.bg};--outlet-accent-text:${accent.text};">
          <div class="rcm-outlet-head ${open ? 'open' : ''}">
            <button type="button" class="rcm-outlet-toggle" data-outlet-key="${_esc(group.key)}">
              ${isEditingOutlet
                ? `<input type="text" class="rcm-edit-outlet-input" data-outlet-key="${_esc(group.key)}" value="${_esc(editingOutletValue)}" placeholder="Outlet name">`
                : `<span>${_esc(group.label)}</span>`}
            </button>
            ${isEditingOutlet
              ? `<button type="button" class="btn btn-xs btn-primary rcm-edit-outlet-save" data-outlet-key="${_esc(group.key)}">Save</button>
                 <button type="button" class="btn btn-xs btn-secondary rcm-edit-outlet-cancel">Cancel</button>`
              : `<button type="button" class="btn btn-xs rcm-edit-outlet" data-outlet-key="${_esc(group.key)}" data-outlet-label="${_esc(group.label)}">Edit</button>`}
            <span class="rcm-outlet-unsaved" data-outlet-key="${_esc(group.key)}"></span>
            <span class="rcm-outlet-meta">${group.rows.length}</span>
            <button type="button" class="btn btn-secondary btn-xs rcm-add-row-outlet" data-outlet="${_esc(group.label)}">+ Add Row</button>
            <button type="button" class="btn btn-secondary btn-xs rcm-export-outlet" data-outlet-key="${_esc(group.key)}" data-outlet-label="${_esc(group.label)}">Export CSV</button>
            <button type="button" class="btn btn-primary btn-xs rcm-save-outlet" data-outlet-key="${_esc(group.key)}">Save</button>
          </div>
          <div class="rcm-outlet-body" style="display:${open ? 'block' : 'none'};">
            <table class="data-table">
              <thead>
                <tr>
                  <th>RCM#</th>
                  <th>Lot#</th>
                  <th>Request Date</th>
                  <th>Stock/DISC</th>
                  <th>Qty</th>
                  <th>Date</th>
                  <th>Picked Up By</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th style="width:70px;">Action</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </section>
      `;
    }).join('');

    _syncSaveLockUI();
    _syncStatusBoxColors(groupsHost);
  }

  function _saveOutlet(outletKey) {
    const key = String(outletKey || '');
    if (!key || !dirtyOutletKeys.has(key)) return;

    return _syncTypedStockInputsForOutlet(key).then(() => {
      const payloadRows = rows.map(({ __rowKey, __stockInput, ...persisted }) => persisted);

      return api.invoke('pullouts:save', payloadRows).then(result => {
        if (result?.ok) {
          _syncStockDatalist();
          toast('Pull-out monitoring records saved.', 'success');
          dirtyOutletKeys.delete(key);
          _syncSaveLockUI();
          return api.invoke('pullouts:get');
        }
        toast(result?.error || 'Failed to save pull-out records.', 'error');
        return null;
      }).then(latestRows => {
        if (latestRows) {
          try {
            rows = _normalizeRowsStatus(_extractRowsFromGetResult(latestRows));
          } catch (error) {
            toast(error?.message || 'Failed to refresh pull-out records.', 'error');
          }
          applyFilters();
        }
      });
    });
  }

  function wireEvents() {
    ['rcm-search', 'rcm-status', 'rcm-schedule-from', 'rcm-schedule-to'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (_promptSaveFirst()) return;
        applyFilters();
      });
      el.addEventListener('change', () => {
        if (_promptSaveFirst()) return;
        applyFilters();
      });
    });

    document.getElementById('rcm-add-outlet')?.addEventListener('click', () => {
      if (_promptSaveFirst()) return;
      const outletWrap = document.getElementById('rcm-new-outlet-wrap');
      const outletInput = document.getElementById('rcm-new-outlet-name');
      if (!outletWrap) return;

      const isHidden = outletWrap.style.display === 'none' || !outletWrap.style.display;
      if (isHidden) {
        outletWrap.style.display = 'block';
        outletInput?.focus();
        return;
      }

      const outletName = String(outletInput?.value || '').trim();
      if (!outletName) {
        toast('Please type outlet name first.', 'info');
        outletInput?.focus();
        return;
      }

      const outletKey = _outletKey(outletName);
      rows.unshift({
        __rowKey: _newRowKey(),
        pullout_id: '',
        lot_no: '',
        request_date: _today(),
        outlet: outletName,
        stock_id: '',
        qty: '',
        schedule_date: '',
        pickup_by: '',
        status: 'in_progress',
        note: '',
      });

      expandedOutletKeys.add(outletKey);
      if (outletInput) outletInput.value = '';
      outletWrap.style.display = 'none';
      applyFilters();
    });

    document.getElementById('rcm-new-outlet-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('rcm-add-outlet')?.click();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        document.getElementById('rcm-cancel-outlet')?.click();
      }
    });

    document.getElementById('rcm-cancel-outlet')?.addEventListener('click', () => {
      if (_promptSaveFirst()) return;
      const outletWrap = document.getElementById('rcm-new-outlet-wrap');
      const outletInput = document.getElementById('rcm-new-outlet-name');
      if (outletInput) outletInput.value = '';
      if (outletWrap) outletWrap.style.display = 'none';
    });

    document.getElementById('rcm-submit-outlet')?.addEventListener('click', () => {
      document.getElementById('rcm-add-outlet')?.click();
    });

    document.getElementById('rcm-outlet-sort')?.addEventListener('change', (e) => {
      if (_promptSaveFirst()) return;
      outletSortMode = String(e.target.value || 'newest');
      renderTable();
    });

    document.getElementById('rcm-clear')?.addEventListener('click', () => {
      if (_promptSaveFirst()) return;
      const search = document.getElementById('rcm-search');
      const status = document.getElementById('rcm-status');
      const from = document.getElementById('rcm-schedule-from');
      const to = document.getElementById('rcm-schedule-to');
      if (search) search.value = '';
      if (status) status.value = '';
      if (from) from.value = '';
      if (to) to.value = _today();
      applyFilters();
    });

    const groupsHost = document.getElementById('rcm-outlet-groups');
    groupsHost?.addEventListener('change', (e) => {
      const pickupPreset = e.target.closest('.rcm-pickup-inline-select');
      if (pickupPreset) {
        const id = pickupPreset.dataset.id;
        const target = _findRowByKey(id);
        if (!target) return;
        if (_promptSaveFirst(_outletKey(target.outlet))) return;

        const selectedName = _normalizePickupName(pickupPreset.value);
        if (selectedName) {
          target.pickup_by = selectedName;
          const pickupInput = groupsHost.querySelector(`.rcm-pickup-input[data-id="${id}"]`);
          if (pickupInput) pickupInput.value = selectedName;
          _rememberPickupName(selectedName);
          _markOutletDirty(_outletKey(target.outlet));
          applyFilters();
        }

        pickupPreset.value = '';
        return;
      }

      const qtyPreset = e.target.closest('.rcm-qty-inline-select');
      if (qtyPreset) {
        const id = qtyPreset.dataset.id;
        const target = _findRowByKey(id);
        if (!target) return;
        if (_promptSaveFirst(_outletKey(target.outlet))) return;

        const selected = Number(qtyPreset.value) || 0;
        if (selected > 0) {
          target.qty = selected;
          const qtyInput = groupsHost.querySelector(`.rcm-qty-input[data-id="${id}"]`);
          if (qtyInput) qtyInput.value = String(selected);
          _markOutletDirty(_outletKey(target.outlet));
          applyFilters();
        }

        qtyPreset.value = '';
        return;
      }

      const id = e.target?.dataset?.id;
      const field = e.target?.dataset?.field;
      if (!id || !field) return;
      const target = _findRowByKey(id);
      if (!target) return;
      if (_promptSaveFirst(_outletKey(target.outlet))) {
        if (field in target) {
          if (field === 'status') {
            e.target.value = _normalizeStatus(target[field]);
          } else if (field === 'stock_id' && e.target.classList?.contains('rcm-stock-input')) {
            e.target.value = _stockInputValue(target);
          } else {
            e.target.value = target[field] ?? '';
          }
          if (field === 'status') _syncStatusBoxColors(groupsHost);
        }
        return;
      }
      let value = e.target.value;
      if (field === 'qty') {
        const cleaned = _sanitizeQtyInput(value);
        e.target.value = cleaned;
        value = cleaned === '' ? '' : Number(cleaned) || 0;
      }
      if (field === 'pullout_id') {
        const nextId = String(value || '').trim();
        if (!nextId) {
          e.target.value = target.pullout_id;
          return;
        }
        target.pullout_id = nextId;
      } else if (field === 'stock_id' && e.target.classList?.contains('rcm-stock-input')) {
        _applyTypedStockToRow(target, value, e.target);
      } else {
        target[field] = field === 'status' ? _normalizeStatus(value) : value;
        if (field === 'pickup_by') {
          _rememberPickupName(value);
        }
        if (field === 'status') {
          e.target.value = target[field];
          _syncStatusBoxColors(groupsHost);
        }
      }
      _markOutletDirty(_outletKey(target.outlet));
      applyFilters();
    });

    groupsHost?.addEventListener('input', (e) => {
      if (e.target.classList?.contains('rcm-edit-outlet-input')) {
        editingOutletValue = String(e.target.value || '');
        return;
      }

      const id = e.target?.dataset?.id;
      const field = e.target?.dataset?.field;
      if (!id || !field || e.target.tagName !== 'INPUT') return;
      const target = _findRowByKey(id);
      if (!target) return;
      if (_promptSaveFirst(_outletKey(target.outlet))) return;
      if (field === 'pullout_id') return;
      if (field === 'stock_id' && e.target.classList?.contains('rcm-stock-input')) {
        _applyTypedStockToRow(target, e.target.value, null);
        _markOutletDirty(_outletKey(target.outlet));
        return;
      }
      if (field === 'qty') {
        const cleaned = _sanitizeQtyInput(e.target.value);
        if (e.target.value !== cleaned) e.target.value = cleaned;
        target[field] = cleaned === '' ? '' : (Number(cleaned) || 0);
      } else {
        target[field] = e.target.value;
      }
      _markOutletDirty(_outletKey(target.outlet));
    });

    groupsHost?.addEventListener('click', (e) => {
      const editOutletSaveBtn = e.target.closest('.rcm-edit-outlet-save');
      if (editOutletSaveBtn) {
        const outletKey = String(editOutletSaveBtn.dataset.outletKey || '');
        if (_promptSaveFirst(outletKey)) return;
        const nextOutletName = String(editingOutletValue || '').trim();
        if (!outletKey) return;
        if (!nextOutletName) {
          toast('Outlet name cannot be empty.', 'info');
          return;
        }

        for (const row of rows) {
          if (_outletKey(row.outlet) === outletKey) {
            row.outlet = nextOutletName;
          }
        }

        expandedOutletKeys.delete(outletKey);
        const nextOutletKey = _outletKey(nextOutletName);
        expandedOutletKeys.add(nextOutletKey);
        editingOutletKey = null;
        editingOutletValue = '';
        _replaceDirtyOutletKey(outletKey, nextOutletKey);
        _markOutletDirty(nextOutletKey);
        applyFilters();
        _saveOutlet(nextOutletKey);
        return;
      }

      const editOutletCancelBtn = e.target.closest('.rcm-edit-outlet-cancel');
      if (editOutletCancelBtn) {
        editingOutletKey = null;
        editingOutletValue = '';
        renderTable();
        return;
      }

      const saveOutletBtn = e.target.closest('.rcm-save-outlet');
      if (saveOutletBtn) {
        const outletKey = String(saveOutletBtn.dataset.outletKey || '');
        _saveOutlet(outletKey);
        return;
      }

      const editOutletBtn = e.target.closest('.rcm-edit-outlet');
      if (editOutletBtn) {
        if (_promptSaveFirst()) return;
        const outletKey = String(editOutletBtn.dataset.outletKey || '');
        const outletLabel = String(editOutletBtn.dataset.outletLabel || '').trim();
        if (!outletKey) return;

        editingOutletKey = outletKey;
        editingOutletValue = outletLabel === 'Unassigned Outlet' ? '' : outletLabel;
        renderTable();
        const editInput = groupsHost.querySelector(`.rcm-edit-outlet-input[data-outlet-key="${outletKey}"]`);
        if (editInput) {
          editInput.focus();
          editInput.select();
        }
        return;
      }

      const addOutletRowBtn = e.target.closest('.rcm-add-row-outlet');
      if (addOutletRowBtn) {
        const outletName = String(addOutletRowBtn.dataset.outlet || '').trim();
        if (_promptSaveFirst(_outletKey(outletName))) return;
        if (!outletName) return;

        rows.unshift({
          __rowKey: _newRowKey(),
          pullout_id: '',
          lot_no: '',
          request_date: _today(),
          outlet: outletName,
          stock_id: '',
          qty: '',
          schedule_date: '',
          pickup_by: '',
          status: 'in_progress',
          note: '',
        });

        const outletKey = _outletKey(outletName);
        expandedOutletKeys.add(outletKey);
        applyFilters();
        return;
      }

      const exportOutletBtn = e.target.closest('.rcm-export-outlet');
      if (exportOutletBtn) {
        const outletKey = String(exportOutletBtn.dataset.outletKey || '');
        const outletLabel = String(exportOutletBtn.dataset.outletLabel || 'Outlet');
        _exportOutletCsv(outletKey, outletLabel);
        return;
      }

      const outletToggle = e.target.closest('.rcm-outlet-toggle');
      if (outletToggle) {
        if (e.target.classList?.contains('rcm-edit-outlet-input')) return;
        const key = outletToggle.dataset.outletKey;
        if (_promptSaveFirst(String(key || ''))) return;
        if (!key) return;
        if (expandedOutletKeys.has(key)) {
          expandedOutletKeys.delete(key);
        } else {
          expandedOutletKeys.add(key);
        }
        renderTable();
        return;
      }

      const btn = e.target.closest('.rcm-del');
      if (!btn) return;
      const id = btn.dataset.id;
      const target = _findRowByKey(id);
      if (!target) return;
      const outletKey = _outletKey(target.outlet);
      if (_promptSaveFirst(outletKey)) return;
      rows = rows.filter(r => String(r.__rowKey) !== String(id));
      _markOutletDirty(outletKey);
      applyFilters();
    });

    groupsHost?.addEventListener('keydown', (e) => {
      const isSpaceKey = e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar';
      const isEditableField = e.target?.matches?.('input, textarea, select, [contenteditable="true"]');
      if (isSpaceKey && isEditableField && !e.target.classList?.contains('rcm-qty-input')) {
        return;
      }

      if (e.target.classList?.contains('rcm-qty-input')) {
        const allowedKeys = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End', '.']);
        if (e.ctrlKey || e.metaKey) return;
        if (/^[0-9]$/.test(e.key) || allowedKeys.has(e.key)) {
          if (e.key === '.' && String(e.target.value || '').includes('.')) {
            e.preventDefault();
          }
          return;
        }
        e.preventDefault();
        return;
      }

      const isEditOutletInput = e.target.classList?.contains('rcm-edit-outlet-input');
      if (isEditOutletInput) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const saveBtn = groupsHost.querySelector(`.rcm-edit-outlet-save[data-outlet-key="${e.target.dataset.outletKey || ''}"]`);
          saveBtn?.click();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          groupsHost.querySelector('.rcm-edit-outlet-cancel')?.click();
          return;
        }
      }

      if (e.key !== 'Enter') return;
      if (!(e.target.matches('input, select'))) return;

      const rowId = String(e.target.dataset?.id || '');
      if (!rowId) return;

      const row = _findRowByKey(rowId);
      if (!row) return;
      const outletKey = _outletKey(row.outlet);

      if (_promptSaveFirst(outletKey)) {
        e.preventDefault();
        return;
      }

      if (!dirtyOutletKeys.has(outletKey)) return;
      e.preventDefault();
      _saveOutlet(outletKey);
    });
  }

  return {
    async init() {
      _loadPickupPresets();
      await App.refreshLookups();
      try {
        rows = _normalizeRowsStatus(_extractRowsFromGetResult(await api.invoke('pullouts:get')));
      } catch (error) {
        rows = [];
        toast(error?.message || 'Failed to load pull-out records.', 'error');
      }
      _seedPickupPresetsFromRows();
      filteredRows = [...rows];
      dirtyOutletKeys.clear();
      render();
      applyFilters();
    },
    hasUnsavedChanges() {
      return dirtyOutletKeys.size > 0;
    },
    playUnsavedAlertSound() {
      _playUnsavedAlertSound();
    },
  };
})();
