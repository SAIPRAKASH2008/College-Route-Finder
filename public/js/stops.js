/**
 * Pickup Points (Stops) Management Controller
 */

let allStops = [];

async function initStopsPage() {
  if (!checkAuth('ADMIN')) return;
  renderNavbar('stops');

  await loadStops();

  // Add stop form listener
  const addForm = document.getElementById('add-stop-form');
  const addAlert = document.getElementById('add-alert');
  const btnAdd = document.getElementById('btn-add-stop');

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('stop-name').value.trim();
    const latitude = document.getElementById('stop-lat').value;
    const longitude = document.getElementById('stop-lng').value;
    const is_college = document.getElementById('stop-is-college').checked;

    addAlert.style.display = 'none';
    btnAdd.disabled = true;

    try {
      const res = await authFetch('/api/stops', {
        method: 'POST',
        body: JSON.stringify({
          name,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          is_college
        })
      });

      const data = await res.json();

      if (!res.ok) {
        addAlert.className = 'alert alert-danger';
        addAlert.style.display = 'flex';
        addAlert.innerHTML = `<span>⚠️</span><div>${data.error || 'Failed to add stop'}</div>`;
        return;
      }

      showToast(`Pickup point "${name}" added successfully!`, 'success');
      addForm.reset();
      await loadStops();

    } catch (err) {
      addAlert.className = 'alert alert-danger';
      addAlert.style.display = 'flex';
      addAlert.innerHTML = `<span>⚠️</span><div>${err.message}</div>`;
    } finally {
      btnAdd.disabled = false;
    }
  });

  // Edit stop form listener
  const editForm = document.getElementById('edit-stop-form');
  const editAlert = document.getElementById('edit-alert');
  const btnSaveEdit = document.getElementById('btn-save-edit');

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-stop-id').value;
    const name = document.getElementById('edit-stop-name').value.trim();
    const latitude = document.getElementById('edit-stop-lat').value;
    const longitude = document.getElementById('edit-stop-lng').value;
    const is_college = document.getElementById('edit-stop-is-college').checked;

    editAlert.style.display = 'none';
    btnSaveEdit.disabled = true;

    try {
      const res = await authFetch(`/api/stops/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          is_college
        })
      });

      const data = await res.json();
      if (!res.ok) {
        editAlert.className = 'alert alert-danger';
        editAlert.style.display = 'flex';
        editAlert.innerHTML = `<span>⚠️</span><div>${data.error || 'Update failed'}</div>`;
        return;
      }

      showToast('Pickup point updated!', 'success');
      closeEditModal();
      await loadStops();

    } catch (err) {
      editAlert.className = 'alert alert-danger';
      editAlert.style.display = 'flex';
      editAlert.innerHTML = `<span>⚠️</span><div>${err.message}</div>`;
    } finally {
      btnSaveEdit.disabled = false;
    }
  });

  // Search filter
  document.getElementById('search-stops').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allStops.filter(s =>
      s.name.toLowerCase().includes(q) || String(s.id).includes(q)
    );
    renderStopsTable(filtered);
  });
}

async function loadStops() {
  try {
    const res = await authFetch('/api/stops');
    if (!res.ok) return;
    allStops = await res.json();
    renderStopsTable(allStops);
  } catch (err) {
    console.error('Error loading stops:', err);
  }
}

function renderStopsTable(stops) {
  const tbody = document.getElementById('stops-tbody');
  if (!tbody) return;

  if (stops.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-dim);">
          No pickup points found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = stops.map(s => `
    <tr>
      <td style="font-family: monospace; color: var(--text-dim); font-weight: 600;">#${s.id}</td>
      <td style="font-weight: 600;">
        ${escapeHtml(s.name)}
      </td>
      <td style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">
        ${s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : '<span style="color: var(--text-dim);">Not Set</span>'}
      </td>
      <td>
        ${s.is_college ? `
          <span class="badge badge-college">👑 Campus Terminal</span>
        ` : `
          <span class="badge badge-stop">📍 Pickup Stop</span>
        `}
      </td>
      <td style="text-align: right; white-space: nowrap;">
        ${s.latitude && s.longitude ? `
          <a href="https://www.google.com/maps?q=${s.latitude},${s.longitude}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Open in Google Maps" style="margin-right: 0.35rem; color: var(--lavender); border-color: rgba(230, 224, 240, 0.35); text-decoration: none; display: inline-flex; align-items: center; gap: 0.2rem;">
            🗺️ Maps
          </a>
        ` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openEditModal(${s.id})" title="Edit Stop">
          ✏️
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteStop(${s.id}, '${escapeHtml(s.name)}')" title="Delete Stop" style="margin-left: 0.35rem;">
          🗑️
        </button>
      </td>
    </tr>
  `).join('');
}

function openEditModal(id) {
  const stop = allStops.find(s => s.id === id);
  if (!stop) return;

  document.getElementById('edit-stop-id').value = stop.id;
  document.getElementById('edit-stop-name').value = stop.name;
  document.getElementById('edit-stop-lat').value = stop.latitude || '';
  document.getElementById('edit-stop-lng').value = stop.longitude || '';
  document.getElementById('edit-stop-is-college').checked = Boolean(stop.is_college);
  document.getElementById('edit-alert').style.display = 'none';

  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
}

async function deleteStop(id, name) {
  if (!confirm(`Are you sure you want to delete "${name}"?\nWARNING: All road connections (edges) connected to this stop will also be removed!`)) {
    return;
  }

  try {
    const res = await authFetch(`/api/stops/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to delete stop', 'danger');
      return;
    }

    showToast(data.message, 'success');
    await loadStops();
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

/* ==========================================================================
   Interactive Map Location Picker (Leaflet + Nominatim Geocoding)
   ========================================================================== */
let pickerMap = null;
let pickerMarker = null;
let pickerTarget = 'add';
let currentPicked = { lat: 12.9716, lng: 77.5946, label: '' };

function openMapPicker(target = 'add') {
  pickerTarget = target;
  const modal = document.getElementById('map-picker-modal');
  modal.classList.add('active');

  // Check if form already has lat/lng
  const latId = target === 'add' ? 'stop-lat' : 'edit-stop-lat';
  const lngId = target === 'add' ? 'stop-lng' : 'edit-stop-lng';
  const nameId = target === 'add' ? 'stop-name' : 'edit-stop-name';

  const existingLat = parseFloat(document.getElementById(latId).value);
  const existingLng = parseFloat(document.getElementById(lngId).value);
  const existingName = document.getElementById(nameId).value;

  if (!isNaN(existingLat) && !isNaN(existingLng)) {
    currentPicked.lat = existingLat;
    currentPicked.lng = existingLng;
    currentPicked.label = existingName || '';
  } else {
    currentPicked.lat = 12.9716;
    currentPicked.lng = 77.5946;
    currentPicked.label = '';
  }

  updatePickerDisplay(currentPicked.lat, currentPicked.lng, currentPicked.label);

  setTimeout(() => {
    if (!pickerMap && typeof L !== 'undefined') {
      pickerMap = L.map('picker-map').setView([currentPicked.lat, currentPicked.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(pickerMap);

      pickerMarker = L.marker([currentPicked.lat, currentPicked.lng], { draggable: true }).addTo(pickerMap);

      pickerMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setPickedPosition(pos.lat, pos.lng);
      });

      pickerMap.on('click', (e) => {
        setPickedPosition(e.latlng.lat, e.latlng.lng);
      });
    } else if (pickerMap) {
      pickerMap.invalidateSize();
      pickerMap.setView([currentPicked.lat, currentPicked.lng], 13);
      if (pickerMarker) pickerMarker.setLatLng([currentPicked.lat, currentPicked.lng]);
    }
  }, 200);
}

function closeMapPicker() {
  const modal = document.getElementById('map-picker-modal');
  modal.classList.remove('active');
}

function setPickedPosition(lat, lng, label = '') {
  currentPicked.lat = parseFloat(lat.toFixed(6));
  currentPicked.lng = parseFloat(lng.toFixed(6));
  currentPicked.label = label;

  if (pickerMarker) {
    pickerMarker.setLatLng([currentPicked.lat, currentPicked.lng]);
  }
  updatePickerDisplay(currentPicked.lat, currentPicked.lng, label);
}

function updatePickerDisplay(lat, lng, label) {
  const coordsEl = document.getElementById('picked-coords-display');
  const addressEl = document.getElementById('picked-address-display');
  if (coordsEl) coordsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (addressEl) addressEl.textContent = label || 'Click map or drag pin to adjust location';
}

async function searchMapLocation() {
  const input = document.getElementById('map-search-input');
  const query = input ? input.value.trim() : '';
  if (!query) return;

  const btn = event ? event.target : null;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
    const results = await res.json();
    if (results && results.length > 0) {
      const item = results[0];
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      setPickedPosition(lat, lng, item.display_name.split(',')[0]);
      if (pickerMap) {
        pickerMap.setView([lat, lng], 15);
      }
    } else {
      showToast('No matching location found. Try adding city name (e.g. Bangalore).', 'warning');
    }
  } catch (err) {
    showToast('Search failed: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function applyPickedLocation() {
  const latId = pickerTarget === 'add' ? 'stop-lat' : 'edit-stop-lat';
  const lngId = pickerTarget === 'add' ? 'stop-lng' : 'edit-stop-lng';
  const nameId = pickerTarget === 'add' ? 'stop-name' : 'edit-stop-name';

  document.getElementById(latId).value = currentPicked.lat;
  document.getElementById(lngId).value = currentPicked.lng;

  const nameInput = document.getElementById(nameId);
  if (nameInput && (!nameInput.value.trim() || nameInput.value === '')) {
    if (currentPicked.label) {
      nameInput.value = currentPicked.label;
    }
  }

  showToast(`Location coordinates set to (${currentPicked.lat}, ${currentPicked.lng})`, 'success');
  closeMapPicker();
}

// Allow Enter key to search in picker
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'map-search-input') {
    e.preventDefault();
    searchMapLocation();
  }
});

document.addEventListener('DOMContentLoaded', initStopsPage);

