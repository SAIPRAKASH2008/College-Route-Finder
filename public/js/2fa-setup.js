/**
 * Google Authenticator (2FA) enrollment and account management
 */

let currentSecret = null;
let enrollmentToken = null;
let enrollmentEmail = null;

async function init2FAPage() {
  const user = getUser();
  const isAuthenticatedAdmin = Boolean(getToken() && user && user.role === 'ADMIN');
  const credentialCard = document.getElementById('credential-setup-card');
  const setupCard = document.getElementById('authenticated-setup-card');
  const backLink = document.getElementById('setup-back-link');

  if (isAuthenticatedAdmin) {
    if (!checkAuth('ADMIN')) return;
    credentialCard.style.display = 'none';
    setupCard.style.display = 'block';
    backLink.href = '/dashboard.html';
    backLink.textContent = '← Back to Dashboard';
    renderNavbar('2fa');

    const statusCard = document.getElementById('status-card');
    const btnDisable = document.getElementById('btn-disable-2fa');
    if (user.is_2fa_enabled) statusCard.style.display = 'block';

    await loadQRCode();
    setupAuthenticatedVerification();
    setupDisable2FA(btnDisable, statusCard);
    return;
  }

  document.getElementById('navbar-container').style.display = 'none';
  document.getElementById('btn-disable-2fa').style.display = 'none';
  document.getElementById('credential-form').addEventListener('submit', startCredentialEnrollment);
  document.getElementById('verify-form').addEventListener('submit', verifyCredentialEnrollment);
  document.getElementById('btn-copy-secret').addEventListener('click', copySecretKey);
}

async function startCredentialEnrollment(event) {
  event.preventDefault();
  const emailInput = document.getElementById('enroll-email');
  const passwordInput = document.getElementById('enroll-password');
  const submitButton = document.getElementById('btn-start-enrollment');
  const alert = document.getElementById('credential-alert');
  const email = emailInput.value.trim();

  submitButton.disabled = true;
  submitButton.textContent = 'Verifying account...';
  alert.style.display = 'none';

  try {
    const response = await fetch('/api/auth/2fa/enrollment/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: passwordInput.value })
    });
    const data = await response.json();

    if (!response.ok) {
      showSetupAlert(alert, data.error || 'Could not verify this staff/admin account.', 'danger');
      return;
    }

    enrollmentEmail = email;
    enrollmentToken = data.setupToken;
    currentSecret = data.secret;
    document.getElementById('qr-image').src = data.qrCodeDataUrl;
    document.getElementById('secret-text').textContent = currentSecret;
    passwordInput.value = '';
    document.getElementById('credential-setup-card').style.display = 'none';
    document.getElementById('authenticated-setup-card').style.display = 'block';
    showSetupAlert(
      document.getElementById('verify-alert'),
      'Scan the QR code, then enter the current 6-digit code to enable 2FA.',
      'info'
    );
    document.getElementById('verify-code').focus();
  } catch (err) {
    showSetupAlert(alert, `Could not start 2FA setup: ${err.message}`, 'danger');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Verify Account & Set Up 2FA';
  }
}

async function verifyCredentialEnrollment(event) {
  event.preventDefault();
  const codeInput = document.getElementById('verify-code');
  const button = document.getElementById('btn-activate');
  const alert = document.getElementById('verify-alert');
  const code = codeInput.value.trim();

  if (!enrollmentToken || !enrollmentEmail) {
    showSetupAlert(alert, 'Your setup session has expired. Verify your email and password to start again.', 'danger');
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    showSetupAlert(alert, 'Please enter a valid 6-digit code.', 'danger');
    return;
  }

  button.disabled = true;
  button.textContent = 'Verifying code...';
  alert.style.display = 'none';

  try {
    const response = await fetch('/api/auth/2fa/enrollment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: enrollmentEmail, setupToken: enrollmentToken, token: code })
    });
    const data = await response.json();

    if (!response.ok) {
      showSetupAlert(alert, data.error || 'Failed to verify the authenticator code.', 'danger');
      return;
    }

    showSetupAlert(alert, data.message, 'success');
    document.getElementById('status-card').style.display = 'block';
    document.getElementById('btn-disable-2fa').style.display = 'none';
    document.getElementById('verify-form').style.display = 'none';
    document.getElementById('qr-image').removeAttribute('src');
    document.getElementById('secret-text').textContent = '2FA enabled';
    currentSecret = null;
    enrollmentToken = null;
    codeInput.value = '';
    const loginLink = document.createElement('a');
    loginLink.href = '/admin-login.html';
    loginLink.className = 'btn btn-secondary';
    loginLink.textContent = 'Continue to Staff & Admin Login';
    alert.appendChild(loginLink);
  } catch (err) {
    showSetupAlert(alert, `Could not verify the authenticator code: ${err.message}`, 'danger');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>🛡️ Activate 2FA Protection</span>';
  }
}

function setupAuthenticatedVerification() {
  const verifyForm = document.getElementById('verify-form');
  const verifyAlert = document.getElementById('verify-alert');
  const btnActivate = document.getElementById('btn-activate');

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = document.getElementById('verify-code').value.trim();
    if (!/^\d{6}$/.test(token)) {
      showSetupAlert(verifyAlert, 'Please enter a valid 6-digit code.', 'danger');
      return;
    }

    btnActivate.disabled = true;
    btnActivate.textContent = 'Verifying code...';
    verifyAlert.style.display = 'none';

    try {
      const response = await authFetch('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ secret: currentSecret, token })
      });
      const data = await response.json();
      if (!response.ok) {
        showSetupAlert(verifyAlert, data.error || 'Failed to verify code.', 'danger');
        return;
      }

      showSetupAlert(verifyAlert, data.message, 'success');
      showToast('2FA activated successfully!', 'success');
      setUser({ ...getUser(), is_2fa_enabled: true });
      document.getElementById('status-card').style.display = 'block';
      document.getElementById('verify-code').value = '';
    } catch (err) {
      showSetupAlert(verifyAlert, err.message, 'danger');
    } finally {
      btnActivate.disabled = false;
      btnActivate.innerHTML = '<span>🛡️ Activate 2FA Protection</span>';
    }
  });

  document.getElementById('btn-copy-secret').addEventListener('click', copySecretKey);
}

function setupDisable2FA(button, statusCard) {
  if (!button) return;

  button.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disable Two-Factor Authentication? Your account will only be protected by password.')) {
      return;
    }

    try {
      const response = await authFetch('/api/auth/2fa/disable', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Failed to disable 2FA.', 'danger');
        return;
      }

      showToast('2FA has been disabled.', 'info');
      setUser({ ...getUser(), is_2fa_enabled: false });
      statusCard.style.display = 'none';
      await loadQRCode();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });
}

async function loadQRCode() {
  try {
    const response = await authFetch('/api/auth/2fa/setup');
    const data = await response.json();
    if (!response.ok) {
      showToast(`Could not load 2FA setup: ${data.error}`, 'danger');
      return;
    }

    currentSecret = data.secret;
    document.getElementById('qr-image').src = data.qrCodeDataUrl;
    document.getElementById('secret-text').textContent = data.secret;
  } catch (err) {
    showToast(`Could not load 2FA setup: ${err.message}`, 'danger');
  }
}

async function copySecretKey() {
  if (!currentSecret) return;
  try {
    await navigator.clipboard.writeText(currentSecret);
    showToast('Secret key copied to clipboard.', 'success');
  } catch (err) {
    showToast(`Could not copy the secret key: ${err.message}`, 'danger');
  }
}

function showSetupAlert(element, message, type) {
  element.className = `alert alert-${type}`;
  element.style.display = 'flex';
  element.replaceChildren();
  const icon = document.createElement('span');
  icon.textContent = type === 'success' ? '✅' : type === 'info' ? 'ℹ️' : '⚠️';
  const text = document.createElement('div');
  text.textContent = message;
  element.append(icon, text);
}

document.addEventListener('DOMContentLoaded', init2FAPage);
