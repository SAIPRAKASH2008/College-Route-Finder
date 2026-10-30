/**
 * Common Utilities, Authentication Helpers, Socket.io, and Notifications
 * College Bus Route Optimizer & Intruder Alert Subsystem
 */

const API_BASE = '';
let socket = null;

// ==========================================
// Authentication & Storage Helpers
// ==========================================
function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function getUser() {
  const userJson = localStorage.getItem('user');
  try {
    return userJson ? JSON.parse(userJson) : null;
  } catch (e) {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/index.html';
}

function checkAuth(requireRole = null) {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    window.location.href = '/index.html';
    return false;
  }

  if (requireRole && user.role !== requireRole) {
    showToast(`Access Denied: ${requireRole} role required.`, 'danger');
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 1500);
    return false;
  }

  return true;
}

/**
 * Authenticated Fetch wrapper attaching Bearer token
 */
async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (localStorage.getItem('cookie_consent') === 'essential') {
    headers['x-consent-analytics'] = 'false';
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Session expired or invalid
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html?expired=1';
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

// ==========================================
// Toast & Desktop Notifications
// ==========================================
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'danger') icon = '⚠️';
  if (type === 'security') icon = '🚨';

  toast.innerHTML = `
    <span style="font-size: 1.2rem;">${icon}</span>
    <div style="flex: 1;">${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Web Audio API Synthesizer for instant audible alerts
function playSecurityAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3); // A4
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.4);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.7);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.75);
  } catch (e) {
    // AudioContext might require user gesture
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showDesktopNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/img/bus-icon.png'
    });
  }
}

// ==========================================
// Dynamic Navbar Generator
// ==========================================
function renderNavbar(activePage = '') {
  const user = getUser();
  const navContainer = document.getElementById('navbar-container');
  if (!navContainer) return;

  const isAdmin = user && user.role === 'ADMIN';

  navContainer.innerHTML = `
    <nav class="navbar">
      <a href="/dashboard.html" class="nav-brand">
        <div class="brand-icon">🚍</div>
        <div class="brand-text">
          <h1>CampusRoute</h1>
          <span>Optimizer & Security</span>
        </div>
      </a>

      <ul class="nav-links">
        <li>
          <a href="/dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">
            📊 Dashboard
          </a>
        </li>
        ${isAdmin ? `
          <li>
            <a href="/stops.html" class="nav-link ${activePage === 'stops' ? 'active' : ''}">
              📍 Pickup Points
            </a>
          </li>
          <li>
            <a href="/edges.html" class="nav-link ${activePage === 'edges' ? 'active' : ''}">
              🛣️ Road Distances
            </a>
          </li>
        ` : ''}
        <li>
          <a href="/route.html" class="nav-link ${activePage === 'route' ? 'active' : ''}">
            🧭 Route Finder
          </a>
        </li>
        <li>
          <a href="/saved.html" class="nav-link ${activePage === 'saved' ? 'active' : ''}">
            📁 Saved Routes
          </a>
        </li>
        ${isAdmin ? `
          <li>
            <a href="/setup-2fa.html" class="nav-link ${activePage === '2fa' ? 'active' : ''}">
              🛡️ 2FA Security
            </a>
          </li>
        ` : ''}
      </ul>

      <div class="nav-right">
        <div class="status-indicator" title="Connected to Real-time Stream">
          <span class="status-dot"></span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">LIVE</span>
        </div>

        ${user ? `
          <div class="user-profile-badge">
            <span style="font-weight: 600;">${user.name}</span>
            <span class="role-badge ${isAdmin ? 'admin' : 'user'}">${user.role}</span>
          </div>
          <button onclick="logout()" class="btn btn-secondary btn-sm" title="Log Out" aria-label="Log Out of your account">
            🚪 Logout
          </button>
        ` : `
          <a href="/index.html" class="btn btn-primary btn-sm" aria-label="Sign In to Portal">Sign In</a>
        `}
      </div>
    </nav>
  `;
}

// ==========================================
// Professional Global Footer
// ==========================================
function renderFooter() {
  let footer = document.getElementById('app-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.id = 'app-footer';
    footer.className = 'app-footer';
    document.body.appendChild(footer);
  }

  footer.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; align-items: center; text-align: center;">
      <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 1.5rem; font-size: 0.85rem;">
        <a href="/privacy-policy.html" style="color: var(--text-main); text-decoration: none;">Privacy Policy (DPDP 2023)</a>
        <span>•</span>
        <a href="/terms.html" style="color: var(--text-main); text-decoration: none;">Terms & Conditions</a>
        <span>•</span>
        <a href="/cookie-policy.html" style="color: var(--text-main); text-decoration: none;">Cookie Policy</a>
        <span>•</span>
        <a href="/refund-policy.html" style="color: var(--text-main); text-decoration: none;">Refund Policy</a>
        <span>•</span>
        <button type="button" id="btn-cookie-settings" style="background: none; border: none; color: var(--accent); cursor: pointer; text-decoration: underline; font-size: 0.85rem; padding: 0;">
          🍪 Cookie Settings
        </button>
      </div>

      <div style="font-size: 0.775rem; color: var(--text-dim); line-height: 1.6; max-width: 800px;">
        <strong>Campus Transit Operations & Bus Route Optimizer</strong><br>
        Campus Transportation Dept., University Road, India • Support & Grievance: <a href="mailto:saiprakash9813@gmail.com" style="color: var(--accent);">saiprakash9813@gmail.com</a><br>
        <span style="font-size: 0.72rem; opacity: 0.85;">
          Transit estimates are mathematical approximations based on road network graphs and Dijkstra/A* pathfinding algorithms. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color: var(--accent);">OpenStreetMap</a> contributors.
        </span>
      </div>

      <div style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.75rem; color: var(--text-dim);">
        <span class="cookie-badge-dpdp">🇮🇳 DPDP Act, 2023 Compliant</span>
        <span>•</span>
        <span>© 2026 Campus Transit System. All rights reserved.</span>
      </div>
    </div>
  `;

  const cookieSettingsButton = footer.querySelector('#btn-cookie-settings');
  cookieSettingsButton.addEventListener('click', () => showCookieConsentBanner(true));
}

// ==========================================
// Accessible Cookie Consent Banner (DPDP Act)
// ==========================================
function initCookieConsent() {
  const existingConsent = localStorage.getItem('cookie_consent');
  if (!existingConsent) {
    showCookieConsentBanner(false);
  }
}

function showCookieConsentBanner(isManual = false) {
  let existingBanner = document.getElementById('cookie-consent-banner');
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.className = 'cookie-banner-overlay';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie and Privacy Consent Preferences');

  banner.innerHTML = `
    <div class="cookie-banner-header">
      <span>🍪</span>
      <span>Cookie & Privacy Preferences</span>
      <span class="cookie-badge-dpdp" style="margin-left: auto;">DPDP Act Compliant</span>
    </div>
    <div class="cookie-banner-text">
      We use strictly necessary cookies for session authentication and terminal security. With your consent, we also collect anonymized transit analytics (IP masked) to balance route server capacity under India's Digital Personal Data Protection Act, 2023. You can choose your preference below.
    </div>
    <div class="cookie-banner-actions">
      <button type="button" class="btn btn-primary btn-sm" id="btn-cookie-accept" aria-label="Accept all cookies including analytics">
        ✅ Accept All Cookies
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-cookie-essential" aria-label="Use only strictly necessary cookies">
        🛡️ Only Essential
      </button>
      <a href="/cookie-policy.html" class="portal-switch-link" style="margin-left: auto; font-size: 0.8rem;" aria-label="Read our detailed cookie policy">
        Read Policy →
      </a>
    </div>
  `;

  document.body.appendChild(banner);

  banner.querySelector('#btn-cookie-accept').addEventListener('click', () => setCookieConsent('all'));
  banner.querySelector('#btn-cookie-essential').addEventListener('click', () => setCookieConsent('essential'));

  // Accessible focus trap to first button
  setTimeout(() => {
    const acceptBtn = document.getElementById('btn-cookie-accept');
    if (acceptBtn && isManual) acceptBtn.focus();
  }, 100);
}

function setCookieConsent(choice) {
  localStorage.setItem('cookie_consent', choice);
  document.cookie = `cookie_consent=${choice}; path=/; max-age=31536000; SameSite=Lax`;

  const banner = document.getElementById('cookie-consent-banner');
  if (banner) {
    banner.style.transition = 'all 0.3s ease-out';
    banner.style.transform = 'translateY(80px)';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 300);
  }

  showToast(`Cookie preferences saved: ${choice === 'all' ? 'All cookies active' : 'Only essential storage enabled'}.`, 'success');
}

// ==========================================
// Socket.io Real-Time Stream Initializer
// ==========================================
function initSocket() {
  if (typeof io === 'undefined') return;

  socket = io();

  const user = getUser();
  const token = getToken();

  if (user && user.role === 'ADMIN' && token) {
    socket.emit('admin:join', token);
  }

  // Only emit analytics visitor ping if user accepted all cookies
  const consent = localStorage.getItem('cookie_consent');
  if (consent !== 'essential') {
    socket.emit('visitor:ping', {
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      referrer: document.referrer
    });
  }

  // Global intruder security listener
  socket.on('security:intruder', (data) => {
    playSecurityAlertSound();
    showToast(`🚨 SECURITY ALERT: Unauthorized login attempt from IP ${data.ipAddress}!`, 'security', 8000);
    showDesktopNotification(
      '🚨 SECURITY ALERT: Unauthorized Login Detected',
      `Target: ${data.emailAttempted} | IP: ${data.ipAddress}`
    );
  });
}

// Auto-run on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  requestNotificationPermission();
  initSocket();
  renderFooter();
  initCookieConsent();
});
