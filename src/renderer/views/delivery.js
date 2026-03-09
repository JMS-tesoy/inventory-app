// FILE: src/renderer/views/delivery.js
// PURPOSE: Delivery page view logic (Notion-style)

function renderDeliveryView() {
  const container = document.getElementById('view-delivery');
  if (!container) return;

  container.innerHTML = `
    <div class="notion-page">
      <div class="notion-header">
        <h1>Delivery</h1>
        <div class="notion-toolbar">
          <input type="text" id="delivery-search" placeholder="Search deliveries…" style="margin-right:12px;">
          <button class="notion-btn" id="new-delivery-btn">+ New Delivery</button>
        </div>
      </div>
      <div class="notion-content">
        <form id="delivery-form" style="display:none;margin-bottom:16px;background:#222;padding:16px;border-radius:8px;">
          <label>Date: <input type="date" name="date" required></label>
          <label>Recipient: <input type="text" name="recipient" required></label>
          <label>Items: <input type="text" name="items" required placeholder="e.g. 3 boxes"></label>
          <label>Status: 
            <select name="status" required>
              <option value="Delivered">Delivered</option>
              <option value="Pending">Pending</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>
          <label>Note: <input type="text" name="note" placeholder="Optional note"></label>
          <button type="submit" class="notion-btn">Add Delivery</button>
        </form>
        <div class="notion-table">
          <div class="notion-table-header">
            <span>Date</span>
            <span>Recipient</span>
            <span>Items</span>
            <span>Status</span>
            <span>Note</span>
            <span>Actions</span>
          </div>
          <div class="notion-table-body" id="delivery-table-body">
            <!-- Deliveries will appear here -->
          </div>
        </div>
      </div>
    </div>
  `;

  // State
  let deliveries = [];
  let filter = '';

  // Load deliveries from DB
  async function loadDeliveries() {
    try {
      const result = await window.api.invoke('deliveries:get');
      if (Array.isArray(result)) {
        deliveries = result;
        renderTable();
      } else if (result && result.ok === false) {
        document.getElementById('delivery-table-body').innerHTML = `<div style='color:#f44;padding:16px;'>Error loading deliveries: ${result.error || 'Unknown error'}</div>`;
      } else {
        deliveries = [];
        renderTable();
      }
    } catch (err) {
      document.getElementById('delivery-table-body').innerHTML = `<div style='color:#f44;padding:16px;'>Error loading deliveries: ${err.message || err}</div>`;
    }
  }

  // Render table
  function renderTable() {
    const tableBody = document.getElementById('delivery-table-body');
    tableBody.innerHTML = '';
    const filtered = deliveries.filter(d =>
      !filter ||
      d.recipient?.toLowerCase().includes(filter) ||
      d.items?.toLowerCase().includes(filter) ||
      d.status?.toLowerCase().includes(filter) ||
      d.note?.toLowerCase().includes(filter)
    );
    if (filtered.length === 0) {
      tableBody.innerHTML = '<div style="padding:16px;color:#888;">No deliveries found.</div>';
      return;
    }
    filtered.forEach(d => {
      const row = document.createElement('div');
      row.className = 'notion-table-row';
      row.innerHTML = `
        <span>${d.date}</span>
        <span>${d.recipient}</span>
        <span>${d.items}</span>
        <span>${d.status}</span>
        <span>${d.note || ''}</span>
        <span>
          <button class="notion-btn btn-edit" data-id="${d.delivery_id}" style="margin-right:4px;">Edit</button>
          <button class="notion-btn btn-delete" data-id="${d.delivery_id}">Delete</button>
        </span>
      `;
      tableBody.appendChild(row);
    });
  }

  // Show form
  const newBtn = document.getElementById('new-delivery-btn');
  const form = document.getElementById('delivery-form');
  if (newBtn && form) {
    newBtn.addEventListener('click', () => {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      form.reset();
      form.dataset.editId = '';
    });
    // Add or edit delivery
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      const date = form.date.value;
      const recipient = form.recipient.value;
      const items = form.items.value;
      const status = form.status.value;
      const note = form.note.value;
      const editId = form.dataset.editId;
      if (!date || !recipient || !items || !status) {
        window.toast('All fields except note are required.', 'error');
        return;
      }
      if (editId) {
        // Edit existing
        deliveries = deliveries.map(d => d.delivery_id === editId ? { ...d, date, recipient, items, status, note } : d);
        await window.api.invoke('deliveries:save', deliveries);
        window.toast('Delivery updated.', 'success');
      } else {
        // Add new
        const newDelivery = {
          delivery_id: Date.now().toString(),
          date,
          recipient,
          items,
          status,
          note,
        };
        await window.api.invoke('deliveries:append', newDelivery);
        window.toast('Delivery added.', 'success');
      }
      form.reset();
      form.style.display = 'none';
      await loadDeliveries();
    });
  }

  // Edit/delete actions
  document.getElementById('delivery-table-body').addEventListener('click', async function(e) {
    if (e.target.classList.contains('btn-edit')) {
      const id = e.target.dataset.id;
      const d = deliveries.find(x => x.delivery_id === id);
      if (d && form) {
        form.style.display = 'block';
        form.date.value = d.date;
        form.recipient.value = d.recipient;
        form.items.value = d.items;
        form.status.value = d.status;
        form.note.value = d.note || '';
        form.dataset.editId = d.delivery_id;
      }
    }
    if (e.target.classList.contains('btn-delete')) {
      const id = e.target.dataset.id;
      deliveries = deliveries.filter(x => x.delivery_id !== id);
      await window.api.invoke('deliveries:save', deliveries);
      window.toast('Delivery deleted.', 'success');
      await loadDeliveries();
    }
  });

  // Search/filter
  document.getElementById('delivery-search').addEventListener('input', function(e) {
    filter = e.target.value.toLowerCase();
    renderTable();
  });

  // Initial load
  loadDeliveries();
}

// Initialize when view is activated
window.initView = window.initView || function(view) {
  if (view === 'delivery') renderDeliveryView();
};
