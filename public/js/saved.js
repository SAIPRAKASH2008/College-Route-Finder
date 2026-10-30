/**
 * Saved Routes Library Controller
 */

let allSavedRoutes = [];

async function initSavedPage() {
  if (!checkAuth()) return;
  renderNavbar('saved');

  await loadSavedRoutes();

  // Search filter
  document.getElementById('search-saved').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allSavedRoutes.filter(r =>
      r.route_name.toLowerCase().includes(q) ||
      r.algorithm.toLowerCase().includes(q) ||
      (r.creator_name && r.creator_name.toLowerCase().includes(q))
    );
    renderSavedTable(filtered);
  });
}

async function loadSavedRoutes() {
  try {
    const res = await authFetch('/api/route/saved');
    if (!res.ok) return;
    allSavedRoutes = await res.json();
    renderSavedTable(allSavedRoutes);
  } catch (err) {
    console.error('Error loading saved routes:', err);
  }
}

function renderSavedTable(routes) {
  const tbody = document.getElementById('saved-tbody');
  if (!tbody) return;

  const user = getUser();
  const isAdmin = user && user.role === 'ADMIN';

  if (routes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
          No saved routes published yet. Go to <a href="/route.html" style="color: var(--accent);">Route Finder</a> to compute and save routes.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = routes.map(r => {
    let algoBadge = '';
    if (r.algorithm === 'DIJKSTRA') {
      algoBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa;">Dijkstra</span>';
    } else if (r.algorithm === 'MST') {
      algoBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">Prim MST</span>';
    } else {
      algoBadge = '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">Nearest Neighbour</span>';
    }

    const dateStr = new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <tr>
        <td style="font-family: monospace; color: var(--text-dim); font-weight: 600;">#${r.id}</td>
        <td style="font-weight: 600; color: #ffffff;">
          ${escapeHtml(r.route_name)}
        </td>
        <td>${algoBadge}</td>
        <td>
          <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 0.85rem; font-weight: 700;">
            ${r.total_distance} km
          </span>
        </td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(r.creator_name || 'Admin')}</td>
        <td style="font-size: 0.85rem; color: var(--text-dim);">${dateStr}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="viewRouteDetails(${r.id})" title="Inspect Path">
            👁️ View
          </button>
          ${isAdmin ? `
            <button class="btn btn-danger btn-sm" onclick="deleteSavedRoute(${r.id})" title="Delete Route" style="margin-left: 0.35rem;">
              🗑️
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function viewRouteDetails(id) {
  const route = allSavedRoutes.find(r => r.id === id);
  if (!route) return;

  document.getElementById('details-modal-title').textContent = `🚍 ${route.route_name}`;

  const pathDisplay = Array.isArray(route.route_path)
    ? route.route_path.join(' → ')
    : JSON.stringify(route.route_path);

  document.getElementById('details-modal-body').innerHTML = `
    <div style="background: rgba(15, 23, 42, 0.7); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span style="color: var(--text-muted);">Algorithm:</span>
        <strong style="color: #ffffff;">${route.algorithm}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span style="color: var(--text-muted);">Total Traveled Distance:</span>
        <strong style="color: #34d399;">${route.total_distance} km</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Created By:</span>
        <span style="color: #ffffff;">${escapeHtml(route.creator_name || 'Admin')}</span>
      </div>
    </div>

    <div>
      <strong style="color: var(--accent);">Stop Sequence (Node IDs):</strong>
      <div style="font-family: monospace; background: #0f172a; padding: 0.75rem; border-radius: var(--radius-sm); margin-top: 0.35rem; color: #38bdf8; word-break: break-all;">
        ${pathDisplay}
      </div>
    </div>
  `;

  document.getElementById('route-details-modal').classList.add('active');
}

function closeDetailsModal() {
  document.getElementById('route-details-modal').classList.remove('active');
}

async function deleteSavedRoute(id) {
  if (!confirm('Are you sure you want to delete this saved route?')) return;

  try {
    const res = await authFetch(`/api/route/saved/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      await loadSavedRoutes();
    } else {
      showToast(data.error || 'Failed to delete route', 'danger');
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

document.addEventListener('DOMContentLoaded', initSavedPage);
