/**
 * Dashboard Controller: Real-time Live Visitor & Intruder Alerts
 */

async function initDashboard() {
  if (!checkAuth()) return;
  renderNavbar('dashboard');
  document.getElementById('btn-close-photo-modal')?.addEventListener('click', closePhotoModal);

  const user = getUser();
  const isAdmin = user && user.role === 'ADMIN';

  if (isAdmin) {
    const btn2FA = document.getElementById('admin-2fa-btn');
    if (btn2FA) btn2FA.style.display = 'inline-flex';

    await loadStats();
    await loadVisitors();
    await loadIntruders();
  } else {
    // Regular students see simplified view
    document.getElementById('stat-intruders').textContent = '—';
    document.getElementById('stat-visitors').textContent = '—';
    loadGraphStatsForUser();
  }

  // Server-Sent Events listeners
  onLiveEvent('visitor:arrive', (visitor) => {
    appendVisitorItem(visitor);
    const statElem = document.getElementById('stat-visitors');
    if (statElem && statElem.textContent !== '—') {
      statElem.textContent = parseInt(statElem.textContent || '0', 10) + 1;
    }
    showDesktopNotification(
      '🌐 New Visitor Arrived',
      `Page: ${visitor.page} | IP: ${visitor.ip}`
    );
  });

  onLiveEvent('security:intruder', (intruder) => {
    appendIntruderCard(intruder);
    const statElem = document.getElementById('stat-intruders');
    if (statElem) {
      statElem.textContent = parseInt(statElem.textContent || '0', 10) + 1;
    }
  });
}

// Load statistics
async function loadStats() {
  try {
    const res = await authFetch('/api/security/stats');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('stat-visitors').textContent = data.totalVisitors || 0;
    document.getElementById('stat-intruders').textContent = data.totalIntruders || 0;
    document.getElementById('stat-stops').textContent = data.totalStops || 0;
    document.getElementById('stat-edges').textContent = data.totalEdges || 0;

    // Check locked users
    const lockedContainer = document.getElementById('locked-accounts-container');
    const lockedList = document.getElementById('locked-list');
    if (data.lockedUsers && data.lockedUsers.length > 0) {
      lockedContainer.style.display = 'block';
      lockedList.innerHTML = data.lockedUsers.map(u => `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem; font-size: 0.8rem;">
          <span style="color: #fca5a5;">${u.email}</span>
          <button class="btn btn-secondary btn-sm" data-clear-lockout="${escapeHtml(u.email)}">Unlock</button>
        </div>
      `).join('');
      lockedList.querySelectorAll('[data-clear-lockout]').forEach((button) => {
        button.addEventListener('click', () => clearLockout(button.dataset.clearLockout));
      });
    } else {
      lockedContainer.style.display = 'none';
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadGraphStatsForUser() {
  try {
    const res = await authFetch('/api/graph');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('stat-stops').textContent = data.stats.totalNodes || 0;
    document.getElementById('stat-edges').textContent = data.stats.totalEdges || 0;
  } catch (err) {
    console.error(err);
  }
}

// Load visitor log feed
async function loadVisitors() {
  const container = document.getElementById('visitor-feed-list');
  try {
    const res = await authFetch('/api/security/visitors');
    if (!res.ok) return;
    const visitors = await res.json();

    if (visitors.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-dim); font-size: 0.875rem;">
          🌐 No visitor traffic recorded yet.
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    visitors.forEach(v => appendVisitorItem(v, false));
  } catch (err) {
    console.error('Error loading visitors:', err);
  }
}

function appendVisitorItem(v, prepend = true) {
  const container = document.getElementById('visitor-feed-list');
  if (!container) return;

  // Clear placeholder if present
  if (container.children.length === 1 && container.children[0].textContent.includes('Waiting')) {
    container.innerHTML = '';
  }

  const timeStr = new Date(v.created_at || v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-left">
      <div class="feed-icon">🌐</div>
      <div>
        <div class="feed-title">Visited <code style="color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 0.1rem 0.4rem; border-radius: 4px;">${escapeHtml(v.page)}</code></div>
        <div class="feed-meta">
          <span>IP: ${escapeHtml(v.ip_address || v.ip || '127.0.0.1')}</span>
          <span>•</span>
          <span title="${escapeHtml(v.user_agent || v.userAgent || '')}">${getDeviceName(v.user_agent || v.userAgent)}</span>
        </div>
      </div>
    </div>
    <div class="feed-time">${timeStr}</div>
  `;

  if (prepend && container.firstChild) {
    container.insertBefore(item, container.firstChild);
  } else {
    container.appendChild(item);
  }
}

// Load Intruder Photo Gallery
async function loadIntruders() {
  const gallery = document.getElementById('intruder-gallery');
  try {
    const res = await authFetch('/api/security/intruders');
    if (!res.ok) return;
    const intruders = await res.json();

    if (intruders.length === 0) {
      gallery.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--text-dim); grid-column: 1 / -1;">
          🛡️ No security breaches or unauthorized logins recorded. System is secure.
        </div>
      `;
      return;
    }

    gallery.innerHTML = '';
    intruders.forEach(intruder => appendIntruderCard(intruder, false));
  } catch (err) {
    console.error('Error loading intruders:', err);
  }
}

function appendIntruderCard(intruder, prepend = true) {
  const gallery = document.getElementById('intruder-gallery');
  if (!gallery) return;

  if (gallery.children.length === 1 && gallery.children[0].textContent.includes('No security breaches')) {
    gallery.innerHTML = '';
  }

  const photoUrl = intruder.photo_path || intruder.photoPath || '/img/no-photo.png';
  const timeStr = new Date(intruder.created_at || intruder.timestamp).toLocaleString();
  const email = intruder.email_attempted || intruder.emailAttempted || 'Unknown User';
  const reason = intruder.failure_reason || intruder.failureReason || 'Failed Login';
  const ipAddress = intruder.ip_address || intruder.ipAddress || '127.0.0.1';
  const intruderId = Number(intruder.id);
  const hasLogId = Number.isSafeInteger(intruderId) && intruderId > 0;

  const card = document.createElement('div');
  card.className = 'intruder-card';
  card.innerHTML = `
    <div class="intruder-photo-wrap" role="button" tabindex="0" aria-label="View intruder photo for ${escapeHtml(email)}">
      <img src="${escapeHtml(photoUrl)}" alt="Intruder Snapshot" class="intruder-photo">
      <span class="intruder-badge">🚨 Attempt #${intruder.attempt_count || intruder.attemptCount || 1}</span>
    </div>
    <div class="intruder-body">
      <div class="intruder-email">${escapeHtml(email)}</div>
      <div class="intruder-reason">Reason: <strong>${escapeHtml(reason)}</strong></div>
      <div class="intruder-footer">
        <span>IP: ${escapeHtml(ipAddress)}</span>
        <span>${escapeHtml(timeStr)}</span>
      </div>
      ${hasLogId ? '<button type="button" class="btn btn-danger btn-sm" data-delete-intruder>Delete Record & Photo</button>' : ''}
    </div>
  `;

  const photoWrap = card.querySelector('.intruder-photo-wrap');
  const openPhoto = () => openPhotoModal(photoUrl, email, reason, ipAddress, timeStr);
  photoWrap.addEventListener('click', openPhoto);
  photoWrap.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPhoto();
    }
  });
  card.querySelector('.intruder-photo').addEventListener('error', (event) => {
    event.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect fill="#1e293b" width="200" height="150"/><text fill="#ef4444" x="100" y="78" text-anchor="middle" font-family="sans-serif" font-size="14">Photo Unavailable</text></svg>'
    )}`;
  }, { once: true });

  const deleteButton = card.querySelector('[data-delete-intruder]');
  if (deleteButton) {
    deleteButton.addEventListener('click', () => deleteIntruderRecord(intruderId, card, deleteButton));
  }

  if (prepend && gallery.firstChild) {
    gallery.insertBefore(card, gallery.firstChild);
  } else {
    gallery.appendChild(card);
  }
}

async function deleteIntruderRecord(id, card, button) {
  if (!confirm('Permanently delete this intruder record and its stored photo?')) return;

  button.disabled = true;
  try {
    const response = await authFetch(`/api/security/intruders/${id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || 'Failed to delete the intruder record and photo.', 'danger');
      return;
    }

    card.remove();
    showToast(data.message, 'success');
    const count = document.getElementById('stat-intruders');
    if (count && count.textContent !== '—') {
      count.textContent = Math.max(0, Number(count.textContent) - 1);
    }
    const gallery = document.getElementById('intruder-gallery');
    if (gallery && gallery.children.length === 0) {
      gallery.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--text-dim); grid-column: 1 / -1;">
          🛡️ No security breaches or unauthorized logins recorded. System is secure.
        </div>
      `;
    }
  } catch (err) {
    showToast(`Could not delete the intruder record: ${err.message}`, 'danger');
  } finally {
    button.disabled = false;
  }
}

// Clear Lockout
async function clearLockout(email) {
  try {
    const res = await authFetch('/api/security/clear-lockout', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      loadStats();
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Modal zoom functions
function openPhotoModal(imgUrl, email, reason, ip, time) {
  document.getElementById('modal-photo-img').src = imgUrl;
  document.getElementById('modal-photo-meta').innerHTML = `
    <strong>Target Account:</strong> ${escapeHtml(email)}<br>
    <strong>Breach Reason:</strong> <span style="color: #f87171;">${escapeHtml(reason)}</span><br>
    <strong>Origin IP Address:</strong> <code>${escapeHtml(ip)}</code><br>
    <strong>Interception Timestamp:</strong> ${escapeHtml(time)}
  `;
  document.getElementById('photo-modal').classList.add('active');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.remove('active');
}

function getDeviceName(ua = '') {
  if (!ua) return 'Desktop';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android Device';
  if (/iPhone|iPad/i.test(ua)) return 'iOS Device';
  if (/Linux/i.test(ua)) return 'Linux Machine';
  return 'Web Browser';
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', initDashboard);
