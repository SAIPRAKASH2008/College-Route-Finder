/**
 * Road Connections (Edges) Controller
 */

let allEdges = [];
let availableStops = [];

async function initEdgesPage() {
  if (!checkAuth('ADMIN')) return;
  renderNavbar('edges');

  await loadStopsOptions();
  await loadEdges();

  // Add edge listener
  const addForm = document.getElementById('add-edge-form');
  const addAlert = document.getElementById('add-edge-alert');
  const btnAdd = document.getElementById('btn-add-edge');

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const source_stop_id = document.getElementById('edge-source').value;
    const dest_stop_id = document.getElementById('edge-dest').value;
    const distance_km = document.getElementById('edge-distance').value;

    if (source_stop_id === dest_stop_id) {
      addAlert.className = 'alert alert-danger';
      addAlert.style.display = 'flex';
      addAlert.innerHTML = '<span>⚠️</span><div>Self-loops are forbidden! Pickup Point A and B must be distinct.</div>';
      return;
    }

    addAlert.style.display = 'none';
    btnAdd.disabled = true;

    try {
      const res = await authFetch('/api/edges', {
        method: 'POST',
        body: JSON.stringify({
          source_stop_id,
          dest_stop_id,
          distance_km: parseFloat(distance_km)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        addAlert.className = 'alert alert-danger';
        addAlert.style.display = 'flex';
        addAlert.innerHTML = `<span>⚠️</span><div>${data.error || 'Failed to add edge'}</div>`;
        return;
      }

      showToast('Road connection created!', 'success');
      addForm.reset();
      await loadEdges();

    } catch (err) {
      addAlert.className = 'alert alert-danger';
      addAlert.style.display = 'flex';
      addAlert.innerHTML = `<span>⚠️</span><div>${err.message}</div>`;
    } finally {
      btnAdd.disabled = false;
    }
  });

  // Edit edge listener
  const editForm = document.getElementById('edit-edge-form');
  const editAlert = document.getElementById('edit-edge-alert');
  const btnSaveEdit = document.getElementById('btn-save-edge-edit');

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-edge-id').value;
    const source_stop_id = document.getElementById('edit-edge-source').value;
    const dest_stop_id = document.getElementById('edit-edge-dest').value;
    const distance_km = document.getElementById('edit-edge-distance').value;

    if (source_stop_id === dest_stop_id) {
      editAlert.className = 'alert alert-danger';
      editAlert.style.display = 'flex';
      editAlert.innerHTML = '<span>⚠️</span><div>Stops cannot be identical.</div>';
      return;
    }

    editAlert.style.display = 'none';
    btnSaveEdit.disabled = true;

    try {
      const res = await authFetch(`/api/edges/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          source_stop_id,
          dest_stop_id,
          distance_km: parseFloat(distance_km)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        editAlert.className = 'alert alert-danger';
        editAlert.style.display = 'flex';
        editAlert.innerHTML = `<span>⚠️</span><div>${data.error || 'Update failed'}</div>`;
        return;
      }

      showToast('Road distance updated!', 'success');
      closeEditEdgeModal();
      await loadEdges();

    } catch (err) {
      editAlert.className = 'alert alert-danger';
      editAlert.style.display = 'flex';
      editAlert.innerHTML = `<span>⚠️</span><div>${err.message}</div>`;
    } finally {
      btnSaveEdit.disabled = false;
    }
  });

  // Search filter
  document.getElementById('search-edges').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allEdges.filter(edge =>
      edge.source_name.toLowerCase().includes(q) ||
      edge.dest_name.toLowerCase().includes(q) ||
      String(edge.distance_km).includes(q)
    );
    renderEdgesTable(filtered);
  });
}

async function loadStopsOptions() {
  try {
    const res = await authFetch('/api/stops');
    if (!res.ok) return;
    availableStops = await res.json();

    const optionsHtml = `
      <option value="">Select pickup point...</option>
      ${availableStops.map(s => `
        <option value="${s.id}">${escapeHtml(s.name)}${s.is_college ? ' 👑 [Campus Terminal]' : ''}</option>
      `).join('')}
    `;

    document.getElementById('edge-source').innerHTML = optionsHtml;
    document.getElementById('edge-dest').innerHTML = optionsHtml;
    document.getElementById('edit-edge-source').innerHTML = optionsHtml;
    document.getElementById('edit-edge-dest').innerHTML = optionsHtml;
  } catch (err) {
    console.error('Error loading stops for dropdown:', err);
  }
}

async function loadEdges() {
  try {
    const res = await authFetch('/api/edges');
    if (!res.ok) return;
    allEdges = await res.json();
    renderEdgesTable(allEdges);
  } catch (err) {
    console.error('Error loading edges:', err);
  }
}

function renderEdgesTable(edges) {
  const tbody = document.getElementById('edges-tbody');
  if (!tbody) return;

  if (edges.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-dim);">
          No road connections created yet. Add your first connection on the left.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = edges.map(e => `
    <tr>
      <td style="font-family: monospace; color: var(--text-dim); font-weight: 600;">#${e.id}</td>
      <td style="font-weight: 600;">
        ${escapeHtml(e.source_name)} ${e.source_is_college ? '👑' : ''}
      </td>
      <td style="text-align: center; color: var(--accent); font-weight: bold;">
        ⟷
      </td>
      <td style="font-weight: 600;">
        ${escapeHtml(e.dest_name)} ${e.dest_is_college ? '👑' : ''}
      </td>
      <td>
        <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 0.85rem;">
          ${e.distance_km} km
        </span>
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" onclick="openEditEdgeModal(${e.id})" title="Edit Edge">
          ✏️
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteEdge(${e.id})" title="Delete Edge" style="margin-left: 0.35rem;">
          🗑️
        </button>
      </td>
    </tr>
  `).join('');
}

function openEditEdgeModal(id) {
  const edge = allEdges.find(e => e.id === id);
  if (!edge) return;

  document.getElementById('edit-edge-id').value = edge.id;
  document.getElementById('edit-edge-source').value = edge.source_stop_id;
  document.getElementById('edit-edge-dest').value = edge.dest_stop_id;
  document.getElementById('edit-edge-distance').value = edge.distance_km;
  document.getElementById('edit-edge-alert').style.display = 'none';

  document.getElementById('edit-edge-modal').classList.add('active');
}

function closeEditEdgeModal() {
  document.getElementById('edit-edge-modal').classList.remove('active');
}

async function deleteEdge(id) {
  if (!confirm('Are you sure you want to remove this road connection?')) return;

  try {
    const res = await authFetch(`/api/edges/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      await loadEdges();
    } else {
      showToast(data.error || 'Failed to delete edge', 'danger');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', initEdgesPage);
