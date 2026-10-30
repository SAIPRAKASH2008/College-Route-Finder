/**
 * Route Computation and Algorithm Manager
 */

let stopsList = [];
let lastComputedResult = null;

async function initRoutePage() {
  if (!checkAuth()) return;
  renderNavbar('route');

  const user = getUser();
  const isAdmin = user && user.role === 'ADMIN';

  await loadStopsForDropdowns();

  const algoSelect = document.getElementById('algo-select');
  const destGroup = document.getElementById('dest-stop-group');
  const returnGroup = document.getElementById('return-college-group');
  const destStopSelect = document.getElementById('dest-stop');

  // Algorithm selection switcher
  algoSelect.addEventListener('change', () => {
    const val = algoSelect.value;
    if (val === 'KRUSKAL') {
      destGroup.style.display = 'block';
      destStopSelect.required = true;
      returnGroup.style.display = 'none';
    } else if (val === 'NEAREST_NEIGHBOUR') {
      destGroup.style.display = 'none';
      destStopSelect.required = false;
      returnGroup.style.display = 'block';
    } else if (val === 'MST') {
      destGroup.style.display = 'none';
      destStopSelect.required = false;
      returnGroup.style.display = 'none';
    }
  });

  // Compute form submit
  const routeForm = document.getElementById('route-form');
  const routeAlert = document.getElementById('route-alert');
  const btnCompute = document.getElementById('btn-compute');

  routeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const algorithm = algoSelect.value;
    const startId = document.getElementById('start-stop').value;
    const endId = destStopSelect.value;
    const returnToCollege = document.getElementById('return-college-check').checked;

    routeAlert.style.display = 'none';
    btnCompute.disabled = true;
    btnCompute.innerHTML = '<span>⚡ Running Graph Algorithm...</span>';

    try {
      const res = await authFetch('/api/route/compute', {
        method: 'POST',
        body: JSON.stringify({
          algorithm,
          startId: startId ? Number(startId) : null,
          endId: endId ? Number(endId) : null,
          returnToCollege
        })
      });

      const data = await res.json();

      if (!res.ok) {
        routeAlert.className = 'alert alert-danger';
        routeAlert.style.display = 'flex';
        routeAlert.innerHTML = `<span>⚠️</span><div>${data.error || 'Computation failed'}</div>`;
        return;
      }

      lastComputedResult = data;
      renderRouteResult(data, algorithm);

      // If Admin, enable save button
      if (isAdmin) {
        const btnSave = document.getElementById('btn-save-route-modal');
        if (btnSave) btnSave.style.display = 'inline-flex';
      }

      showToast(`Optimized route computed: ${data.totalDistance} km!`, 'success');

    } catch (err) {
      routeAlert.className = 'alert alert-danger';
      routeAlert.style.display = 'flex';
      routeAlert.innerHTML = `<span>⚠️</span><div>${err.message}</div>`;
    } finally {
      btnCompute.disabled = false;
      btnCompute.innerHTML = '<span>🚀 Compute Optimal Route</span>';
    }
  });

  // Save route modal listeners (Admin only)
  const btnSaveModal = document.getElementById('btn-save-route-modal');
  if (btnSaveModal) {
    btnSaveModal.addEventListener('click', () => {
      if (!lastComputedResult) return;
      document.getElementById('save-algo-display').value = lastComputedResult.algorithm;
      document.getElementById('save-dist-display').value = `${lastComputedResult.totalDistance} km`;
      document.getElementById('save-alert').style.display = 'none';
      document.getElementById('save-route-modal').classList.add('active');
    });
  }

  const saveForm = document.getElementById('save-route-form');
  if (saveForm) {
    saveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const route_name = document.getElementById('save-route-name').value.trim();
      const saveAlert = document.getElementById('save-alert');
      const btnConfirm = document.getElementById('btn-save-confirm');

      if (!lastComputedResult) return;

      btnConfirm.disabled = true;

      try {
        const res = await authFetch('/api/route/save', {
          method: 'POST',
          body: JSON.stringify({
            route_name,
            algorithm: lastComputedResult.algorithm,
            route_path: lastComputedResult.path || lastComputedResult.visitedStops,
            total_distance: lastComputedResult.totalDistance
          })
        });

        const data = await res.json();
        if (!res.ok) {
          saveAlert.className = 'alert alert-danger';
          saveAlert.style.display = 'flex';
          saveAlert.innerHTML = `<span>⚠️</span><div>${data.error || 'Failed to save route'}</div>`;
          return;
        }

        showToast('Route saved to Library successfully!', 'success');
        closeSaveRouteModal();
        saveForm.reset();

      } catch (err) {
        saveAlert.className = 'alert alert-danger';
        saveAlert.style.display = 'flex';
        saveAlert.innerHTML = `<span>⚠️</span><div>${err.message}</div>`;
      } finally {
        btnConfirm.disabled = false;
      }
    });
  }
}

async function loadStopsForDropdowns() {
  try {
    const res = await authFetch('/api/stops');
    if (!res.ok) return;
    stopsList = await res.json();

    const options = `
      <option value="">Choose pickup point...</option>
      ${stopsList.map(s => `
        <option value="${s.id}" ${s.is_college ? 'selected' : ''}>
          ${escapeHtml(s.name)} ${s.is_college ? '👑 [Campus Terminal]' : ''}
        </option>
      `).join('')}
    `;

    document.getElementById('start-stop').innerHTML = options;
    document.getElementById('dest-stop').innerHTML = options;

    // Pick first non-college as default destination
    const nonCollege = stopsList.find(s => !s.is_college);
    if (nonCollege) {
      document.getElementById('dest-stop').value = nonCollege.id;
    }
  } catch (err) {
    console.error('Error loading dropdown stops:', err);
  }
}

function renderRouteResult(data, algo) {
  const card = document.getElementById('itinerary-card');
  const distBadge = document.getElementById('route-total-dist');
  const stepsList = document.getElementById('itinerary-steps-list');
  const unreachableBox = document.getElementById('unreachable-box');
  const comparisonBox = document.getElementById('comparison-box');

  card.style.display = 'block';
  distBadge.textContent = `${data.totalDistance} km`;

  // Check unreachable stops
  if (data.unreachable && data.unreachable.length > 0) {
    const unreachableNames = data.unreachable.map(id => {
      const s = stopsList.find(x => x.id === Number(id));
      return s ? s.name : `Stop #${id}`;
    });
    unreachableBox.style.display = 'flex';
    unreachableBox.innerHTML = `
      <span>⚠️</span>
      <div>
        <strong>Disconnected Graph Warning:</strong> ${unreachableNames.length} stop(s) cannot be reached from this origin:
        <br><em style="color: #ffffff;">${unreachableNames.join(', ')}</em>
      </div>
    `;
  } else {
    unreachableBox.style.display = 'none';
  }

  // Render Itinerary Steps
  if (algo === 'MST') {
    // Prim's MST Edges
    stepsList.innerHTML = data.mstEdges.map((edge, idx) => `
      <li class="step-item">
        <div style="display: flex; align-items: center;">
          <span class="step-num" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">${idx + 1}</span>
          <span><strong>${escapeHtml(edge.sourceName)}</strong> ⟷ <strong>${escapeHtml(edge.destName)}</strong></span>
        </div>
        <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">
          ${edge.distance} km
        </span>
      </li>
    `).join('');

    // Highlight on graph
    highlightPathOnGraph(data.visitedStops, data.mstEdges, true);

  } else {
    // Kruskal route or Nearest Neighbour
    if (!data.segments || data.segments.length === 0) {
      stepsList.innerHTML = `
        <li class="step-item">
          <span>Start and destination are identical (${escapeHtml(data.stopNames[0])}). Total: 0 km.</span>
        </li>
      `;
    } else {
      stepsList.innerHTML = data.segments.map((seg, idx) => `
        <li class="step-item">
          <div style="display: flex; align-items: center;">
            <span class="step-num">${idx + 1}</span>
            <span>${escapeHtml(seg.fromName)} → <strong>${escapeHtml(seg.toName)}</strong></span>
          </div>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">
            +${seg.distance} km
          </span>
        </li>
      `).join('');
    }

    // Highlight on graph
    highlightPathOnGraph(data.path, data.segments, false, algo === 'NEAREST_NEIGHBOUR');
  }

  // Setup Google Maps turn-by-turn navigation button
  const btnGmaps = document.getElementById('btn-open-gmaps');
  if (btnGmaps) {
    if (algo !== 'MST' && data.path && data.path.length > 1) {
      const fullPathStops = data.path.map(id => stopsList.find(s => s.id === Number(id))).filter(Boolean);
      const origin = fullPathStops[0];
      const dest = fullPathStops[fullPathStops.length - 1];

      if (origin && dest && origin.latitude && origin.longitude && dest.latitude && dest.longitude) {
        const waypoints = fullPathStops
          .slice(1, -1)
          .filter(s => s.latitude && s.longitude)
          .map(s => `${s.latitude},${s.longitude}`)
          .join('|');

        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=driving`;

        btnGmaps.href = gmapsUrl;
        btnGmaps.style.display = 'inline-flex';
      } else {
        btnGmaps.style.display = 'none';
      }
    } else {
      btnGmaps.style.display = 'none';
    }
  }

  // Algorithm comparison metrics
  if (data.comparison) {
    comparisonBox.style.display = 'block';
    const c = data.comparison;
    document.getElementById('bench-current').textContent = `${data.totalDistance} km`;
    document.getElementById('bench-nn').textContent = `${c.nearestNeighbourTotalDistance} km`;
    document.getElementById('bench-mst').textContent = `${c.mstTotalDistance} km`;

    const maxDist = Math.max(data.totalDistance, c.nearestNeighbourTotalDistance, c.mstTotalDistance, 1);
    document.getElementById('bar-current').style.width = `${Math.min(100, Math.round((data.totalDistance / maxDist) * 100))}%`;
    document.getElementById('bar-nn').style.width = `${Math.min(100, Math.round((c.nearestNeighbourTotalDistance / maxDist) * 100))}%`;
    document.getElementById('bar-mst').style.width = `${Math.min(100, Math.round((c.mstTotalDistance / maxDist) * 100))}%`;
  }
}

function closeSaveRouteModal() {
  document.getElementById('save-route-modal').classList.remove('active');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', initRoutePage);
