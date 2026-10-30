/**
 * Authentication and Separate Portal Logic (Student/Staff vs. Transport Administrator)
 * With Biometric Intruder Detection & Google Authenticator 2FA
 */

let videoStream = null;
let currentPortal = 'USER'; // 'USER' (Student/Staff) or 'ADMIN' (Transport Coordinator)

const videoElem = document.getElementById('webcam-feed');
const canvasElem = document.getElementById('snapshot-canvas');
const cameraStatusBadge = document.getElementById('camera-status');
const enableCameraButton = document.getElementById('btn-enable-camera');
const loginAlert = document.getElementById('login-alert');
const loginForm = document.getElementById('login-form');
const btnLogin = document.getElementById('btn-login');

// Switch between Student/Staff and Administrator portal modes
function switchPortal(role) {
  currentPortal = role;
  const portalRoleInput = document.getElementById('portal-role');
  if (portalRoleInput) portalRoleInput.value = role;

  const tabStudent = document.getElementById('tab-student');
  const tabAdmin = document.getElementById('tab-admin');
  if (tabStudent) tabStudent.setAttribute('aria-selected', String(role === 'USER'));
  if (tabAdmin) tabAdmin.setAttribute('aria-selected', String(role === 'ADMIN'));
  const iconBox = document.getElementById('portal-icon-box');
  const badge = document.getElementById('portal-badge');
  const heading = document.getElementById('portal-heading');
  const subtitle = document.getElementById('portal-subtitle');
  const securityNotice = document.getElementById('security-notice');
  const totpGroup = document.getElementById('totp-group');
  const labelEmail = document.getElementById('label-email');
  const inputEmail = document.getElementById('login-email');
  const btnLoginText = document.getElementById('btn-login-text');
  const portalFooter = document.getElementById('portal-footer');

  if (loginAlert) loginAlert.style.display = 'none';

  if (role === 'ADMIN') {
    // STAFF & ADMIN PORTAL MODE (2FA REQUIRED)
    if (tabStudent) tabStudent.className = 'portal-tab-btn';
    if (tabAdmin) tabAdmin.className = 'portal-tab-btn active';
    if (iconBox) {
      iconBox.innerHTML = '🛡️';
      iconBox.style.background = 'linear-gradient(135deg, #6F4E37, #8D6346)';
      iconBox.style.borderColor = 'rgba(229, 228, 226, 0.35)';
      iconBox.style.boxShadow = '0 4px 16px rgba(111, 78, 55, 0.45)';
    }
    if (badge) {
      badge.textContent = 'Staff & Administrator Terminal • 2FA Required';
      badge.className = 'portal-badge portal-badge-admin';
    }
    if (heading) heading.textContent = 'Staff & Administrator Clearance';
    if (subtitle) subtitle.textContent = 'Faculty, transport coordinators & administrators (2FA authentication enforced)';
    if (securityNotice) securityNotice.style.display = 'flex';
    if (totpGroup) totpGroup.style.display = 'block';
    if (labelEmail) labelEmail.textContent = 'Staff / Administrator Email';
    if (inputEmail) inputEmail.placeholder = 'staff@college.edu or admin@college.edu';
    if (btnLogin) {
      btnLogin.style.background = 'linear-gradient(135deg, #6F4E37, #8D6346)';
      btnLogin.style.borderColor = 'rgba(229, 228, 226, 0.35)';
    }
    if (btnLoginText) btnLoginText.textContent = '🔐 Authenticate Staff / Admin (2FA)';
    if (portalFooter) {
      portalFooter.innerHTML = 'Transport department staff? <a href="/setup-2fa.html" style="color: var(--accent); text-decoration: none; font-weight: 600;">2FA Configuration</a>';
    }

  } else {
    // STUDENT PORTAL MODE (NO 2FA REQUIRED)
    if (tabStudent) tabStudent.className = 'portal-tab-btn active student-active';
    if (tabAdmin) tabAdmin.className = 'portal-tab-btn';
    if (iconBox) {
      iconBox.innerHTML = '🎓';
      iconBox.style.background = 'linear-gradient(135deg, #4A3E4E, #68576F)';
      iconBox.style.borderColor = 'rgba(230, 224, 240, 0.35)';
      iconBox.style.boxShadow = '0 4px 16px rgba(104, 87, 111, 0.45)';
    }
    if (badge) {
      badge.textContent = 'Student Transit Portal • No 2FA Required';
      badge.className = 'portal-badge portal-badge-student';
    }
    if (heading) heading.textContent = 'Student Sign In';
    if (subtitle) subtitle.textContent = 'Access bus routes, nearest stops & live travel times (No 2FA required)';
    if (securityNotice) securityNotice.style.display = 'none';
    if (totpGroup) totpGroup.style.display = 'none';
    if (labelEmail) labelEmail.textContent = 'Student Email Address';
    if (inputEmail) inputEmail.placeholder = 'student@college.edu';
    if (btnLogin) {
      btnLogin.style.background = 'linear-gradient(135deg, #5A4760, #796082)';
      btnLogin.style.borderColor = 'rgba(230, 224, 240, 0.3)';
    }
    if (btnLoginText) btnLoginText.textContent = '🎓 Sign In as Student (No 2FA)';
    if (portalFooter) {
      portalFooter.innerHTML = "Don't have an account? <a href=\"/register.html\" style=\"color: var(--accent); text-decoration: none; font-weight: 600;\">Register Student Account</a>";
    }

    // Stop webcam stream when in student mode
    stopWebcam();
  }
}

// Stop webcam to release camera hardware
function stopWebcam() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  if (videoElem) {
    videoElem.srcObject = null;
  }
  if (cameraStatusBadge) {
    cameraStatusBadge.className = 'camera-status-badge off';
    cameraStatusBadge.textContent = '● Camera: Off — optional';
  }
  if (enableCameraButton) {
    enableCameraButton.disabled = false;
    enableCameraButton.textContent = 'Enable Camera for Security Capture';
  }
}

// Initialize Camera on Admin Login
async function initWebcam() {
  if (videoStream) return true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (cameraStatusBadge) {
      cameraStatusBadge.className = 'camera-status-badge off';
      cameraStatusBadge.textContent = '● Camera: Not supported in this browser';
    }
    return false;
  }

  if (enableCameraButton) {
    enableCameraButton.disabled = true;
    enableCameraButton.textContent = 'Waiting for camera permission...';
  }
  if (cameraStatusBadge) {
    cameraStatusBadge.textContent = '● Camera: Waiting for permission';
  }

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: false
    });

    if (videoElem) {
      videoElem.srcObject = videoStream;
      await videoElem.play();
    }

    if (cameraStatusBadge) {
      cameraStatusBadge.className = 'camera-status-badge';
      cameraStatusBadge.textContent = '● Camera: Enabled for failed-login alerts';
    }
    if (enableCameraButton) {
      enableCameraButton.textContent = 'Camera Enabled';
    }
    return true;
  } catch (err) {
    console.warn('Webcam permission not granted or device unavailable:', err.message);
    stopWebcam();
    if (cameraStatusBadge) {
      cameraStatusBadge.className = 'camera-status-badge off';
      cameraStatusBadge.textContent = '● Camera: Off — access denied or unavailable';
    }
    if (enableCameraButton) {
      enableCameraButton.disabled = false;
      enableCameraButton.textContent = 'Try Camera Again';
    }
    return false;
  }
}

if (enableCameraButton) {
  enableCameraButton.addEventListener('click', initWebcam);
}

// Capture current webcam frame as base64 JPEG
function captureWebcamSnapshot() {
  if (!videoElem || !canvasElem || !videoStream) return null;
  
  try {
    const ctx = canvasElem.getContext('2d');
    if (videoElem.readyState >= videoElem.HAVE_CURRENT_DATA) {
      canvasElem.width = videoElem.videoWidth || 640;
      canvasElem.height = videoElem.videoHeight || 480;
      ctx.drawImage(videoElem, 0, 0, canvasElem.width, canvasElem.height);
      return canvasElem.toDataURL('image/jpeg', 0.85);
    }
  } catch (e) {
    console.error('Error snapping photo:', e);
  }
  return null;
}

// Login form handler
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const totpElem = document.getElementById('login-totp');
    const totpCode = (totpElem && totpElem.value) ? totpElem.value.trim() : null;

    loginAlert.style.display = 'none';
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span>⏳ Verifying Credentials...</span>';

    // Capture snapshot of person at the terminal if in Admin mode
    const photoData = currentPortal === 'ADMIN' ? captureWebcamSnapshot() : null;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          totpCode,
          photoData,
          portalRole: currentPortal
        })
      });

      const data = await response.json();

      if (!response.ok) {
        loginAlert.style.display = 'flex';

        // Check if user entered credentials for the wrong portal
        if (data.portalMismatch) {
          loginAlert.className = 'alert alert-warning';
          const targetRole = data.suggestedRole === 'ADMIN' ? 'ADMIN' : 'USER';
          const targetPortalName = targetRole === 'ADMIN' ? 'Staff & Administrator (2FA)' : 'Student (No 2FA)';
          loginAlert.replaceChildren();

          const icon = document.createElement('span');
          icon.textContent = 'ℹ️';
          const content = document.createElement('div');
          const message = document.createElement('strong');
          message.textContent = data.error || 'Please use the correct sign-in portal.';
          const action = document.createElement('div');
          action.style.marginTop = '0.5rem';
          const switchButton = document.createElement('button');
          switchButton.type = 'button';
          switchButton.className = 'btn btn-secondary btn-sm';
          switchButton.textContent = `➡️ Switch to ${targetPortalName} Login`;
          switchButton.addEventListener('click', () => handlePortalMismatch(targetRole));

          action.appendChild(switchButton);
          content.append(message, action);
          loginAlert.append(icon, content);
          return;
        }

        // Standard Login Failure: show error, play intruder sound if configured
        loginAlert.className = 'alert alert-danger';
        loginAlert.innerHTML = `<span>⚠️</span><div>${data.error || 'Authentication failed.'}</div>`;

        if (data.requires2FA && totpElem) {
          totpElem.focus();
          totpElem.style.borderColor = 'var(--accent)';
        }

        if (data.isLocked) {
          loginAlert.innerHTML = `<span>🚨</span><div><strong>SECURITY LOCKOUT:</strong> ${data.error}</div>`;
        }

        if (data.attemptCount && data.attemptCount > 0) {
          playSecurityAlertSound();
        }

        return;
      }

      // Login Succeeded!
      setToken(data.token);
      setUser(data.user);

      showToast(`Welcome back, ${data.user.name || 'User'}!`, 'success');
      stopWebcam();

      setTimeout(() => {
        if (data.user.role === 'ADMIN') {
          window.location.href = '/dashboard.html';
        } else {
          // Direct students straight to the bus route optimizer
          window.location.href = '/route.html';
        }
      }, 600);

    } catch (err) {
      loginAlert.style.display = 'flex';
      loginAlert.className = 'alert alert-danger';
      loginAlert.innerHTML = `<span>⚠️</span><div>Network or server error: ${err.message}</div>`;
    } finally {
      btnLogin.disabled = false;
      const isStudent = currentPortal === 'USER';
      btnLogin.innerHTML = isStudent 
        ? '<span>🎓 Sign In as Student (No 2FA)</span>'
        : '<span>🔐 Authenticate Staff / Admin (2FA)</span>';
    }
  });
}

function handlePortalMismatch(suggestedRole) {
  if (document.getElementById('tab-' + (suggestedRole === 'ADMIN' ? 'admin' : 'student'))) {
    switchPortal(suggestedRole);
  } else {
    window.location.href = suggestedRole === 'ADMIN' ? '/admin-login.html' : '/student-login.html';
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  const tabStudent = document.getElementById('tab-student');
  const tabAdmin = document.getElementById('tab-admin');
  if (tabStudent) tabStudent.addEventListener('click', () => switchPortal('USER'));
  if (tabAdmin) tabAdmin.addEventListener('click', () => switchPortal('ADMIN'));

  const params = new URLSearchParams(window.location.search);
  if (params.get('expired')) {
    if (loginAlert) {
      loginAlert.style.display = 'flex';
      loginAlert.className = 'alert alert-warning';
      loginAlert.innerHTML = '<span>ℹ️</span><div>Your session has expired. Please log in again.</div>';
    }
  }

  // Detect portal from body attribute (dedicated pages) or query param
  const bodyPortal = document.body.dataset.portal;
  const roleParam = params.get('role');

  if (bodyPortal === 'ADMIN' || (roleParam && roleParam.toLowerCase() === 'admin')) {
    switchPortal('ADMIN');
  } else {
    switchPortal('USER');
  }
});
