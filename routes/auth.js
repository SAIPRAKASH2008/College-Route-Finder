const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { dbAsync, encryptSecret, decryptSecret } = require('../config/db');
const { JWT_SECRET, verifyToken, requireAdmin } = require('../middleware/auth');
const { checkLockout, recordFailedAttempt, resetFailedAttempts, getClientIp } = require('../middleware/rateLimiter');
const { sendIntruderAlert } = require('../config/email');

// Helper to save base64 photo to disk
function saveBase64Photo(base64Data) {
  if (!base64Data || typeof base64Data !== 'string') return null;
  try {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const dataBuffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(base64Data, 'base64');
    const filename = `intruder_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const uploadsDir = path.resolve(__dirname, '../public/uploads/intruders');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const fullPath = path.join(uploadsDir, filename);
    fs.writeFileSync(fullPath, dataBuffer);
    return `/uploads/intruders/${filename}`;
  } catch (err) {
    console.error('Error saving intruder photo:', err.message);
    return null;
  }
}

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await dbAsync.get('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbAsync.run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), passwordHash, 'USER']
    );

    res.status(201).json({
      message: 'Registration successful! You can now log in.',
      userId: result.lastID
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

/**
 * POST /api/auth/login
 * Handles Admin 2FA verification & Intruder capture
 */
router.post('/login', checkLockout, async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';
  const { email, password, totpCode, photoData, portalRole } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await dbAsync.get('SELECT * FROM users WHERE email = ?', [cleanEmail]);

    // Handle failure logic: intruder capture & notification
    async function handleLoginFailure(reason) {
      const { attempts, isLocked } = await recordFailedAttempt(cleanEmail, ip);

      // Save intruder photo if captured by webcam
      let photoPath = null;
      let fullDiskPhotoPath = null;
      if (photoData) {
        photoPath = saveBase64Photo(photoData);
        if (photoPath) {
          fullDiskPhotoPath = path.resolve(__dirname, '../public', photoPath.replace(/^\//, ''));
        }
      }

      // Record intruder log in SQLite
      const logResult = await dbAsync.run(
        'INSERT INTO intruder_logs (email_attempted, failure_reason, ip_address, user_agent, photo_path, attempt_count) VALUES (?, ?, ?, ?, ?, ?)',
        [cleanEmail, reason, ip, userAgent, photoPath, attempts]
      );

      // Trigger Nodemailer email alert
      sendIntruderAlert({
        emailAttempted: cleanEmail,
        failureReason: reason,
        ipAddress: ip,
        userAgent,
        attemptCount: attempts,
        photoPath: fullDiskPhotoPath,
        timestamp: new Date().toISOString()
      }).catch(err => console.error('Alert error:', err));

      // Push real-time intruder alert to Admin via Socket.io
      const io = req.app.get('io');
      if (io) {
        io.to('admin-room').emit('security:intruder', {
          id: logResult.lastID,
          emailAttempted: cleanEmail,
          failureReason: reason,
          ipAddress: ip,
          userAgent,
          photoPath,
          attemptCount: attempts,
          timestamp: new Date().toISOString()
        });
      }

      let errorMsg = `Invalid credentials. Attempt ${attempts} of ${process.env.MAX_FAILED_ATTEMPTS || 5}.`;
      if (isLocked) {
        errorMsg = `Security Alert: Too many failed attempts. Terminal locked for ${process.env.LOCKOUT_TIME_MINUTES || 15} minutes.`;
      } else if (reason.includes('2FA')) {
        errorMsg = `Invalid 2FA Authenticator code. Attempt ${attempts} of ${process.env.MAX_FAILED_ATTEMPTS || 5}.`;
      }

      return res.status(401).json({
        error: errorMsg,
        reason,
        attemptCount: attempts,
        isLocked,
        requiresPhotoCapture: true
      });
    }

    if (!user) {
      return await handleLoginFailure('User not found');
    }

    // Enforce role separation for dedicated portals
    if (portalRole === 'ADMIN' && user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Student account detected. Students do not require 2FA — please sign in via the Student Login.',
        portalMismatch: true,
        suggestedRole: 'USER'
      });
    }

    if (portalRole === 'USER' && user.role === 'ADMIN') {
      return res.status(403).json({
        error: 'Staff & Administrator account detected. Staff 2FA is required — please sign in via the Staff & Admin Portal.',
        portalMismatch: true,
        suggestedRole: 'ADMIN'
      });
    }

    // Verify Password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return await handleLoginFailure('Incorrect password');
    }

    // Accounts can sign in with their password until 2FA has been enrolled.
    if (user.role === 'ADMIN' && user.is_2fa_enabled) {
      if (!totpCode && user.is_2fa_enabled) {
        return res.status(403).json({
          error: 'Staff 2FA Google Authenticator code is required.',
          requires2FA: true
        });
      }

      const decryptedSecret = decryptSecret(user.totp_secret);
      if (!decryptedSecret) {
        return res.status(500).json({ error: 'Server could not decrypt 2FA secret key.' });
      }

      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token: totpCode.trim(),
        window: 2 // Allow 60 seconds clock drift
      });

      if (!verified) {
        return await handleLoginFailure('Invalid 2FA TOTP code');
      }
    }

    // Login Succeeded: Reset failed counters
    await resetFailedAttempts(cleanEmail, ip);

    // Issue JWT
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_2fa_enabled: Boolean(user.is_2fa_enabled)
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_2fa_enabled: Boolean(user.is_2fa_enabled)
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login process error: ' + err.message });
  }
});

/**
 * POST /api/auth/2fa/enrollment/start
 * Starts first-time 2FA enrollment after verifying an admin's credentials.
 */
router.post('/2fa/enrollment/start', checkLockout, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const user = await dbAsync.get(
      'SELECT id, name, email, password_hash, role, is_2fa_enabled FROM users WHERE email = ?',
      [cleanEmail]
    );
    const passwordValid = user && await bcrypt.compare(password, user.password_hash);

    if (!passwordValid || user.role !== 'ADMIN') {
      if (!passwordValid) await recordFailedAttempt(cleanEmail, getClientIp(req));
      return res.status(401).json({ error: 'Invalid staff/admin email or password.' });
    }

    if (user.is_2fa_enabled) {
      return res.status(409).json({
        error: '2FA is already enabled. Sign in with your authenticator code to manage your settings.'
      });
    }

    const secret = speakeasy.generateSecret({
      name: `College Bus Route Optimizer (${user.email})`,
      issuer: 'College Bus Route Optimizer'
    });
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    const setupToken = jwt.sign(
      { userId: user.id, scope: '2fa-enrollment', secret: secret.base32 },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      setupToken,
      secret: secret.base32,
      qrCodeDataUrl,
      instructions: 'Scan this QR code using Google Authenticator, Authy, or 1Password.'
    });
  } catch (err) {
    console.error('2FA enrollment start error:', err);
    res.status(500).json({ error: 'Failed to start 2FA setup.' });
  }
});

/**
 * POST /api/auth/2fa/enrollment/verify
 * Activates first-time 2FA enrollment using its short-lived setup token.
 */
router.post('/2fa/enrollment/verify', checkLockout, async (req, res) => {
  const { email, setupToken, token } = req.body;
  if (!email || !setupToken || !token || !/^\d{6}$/.test(String(token))) {
    return res.status(400).json({ error: 'Email, setup session, and a 6-digit code are required.' });
  }

  try {
    const enrollment = jwt.verify(setupToken, JWT_SECRET);
    if (enrollment.scope !== '2fa-enrollment' || !enrollment.userId || !enrollment.secret) {
      return res.status(401).json({ error: 'Invalid or expired 2FA setup session. Start setup again.' });
    }

    const user = await dbAsync.get(
      'SELECT id, email, role, is_2fa_enabled FROM users WHERE id = ? AND email = ?',
      [enrollment.userId, email.trim().toLowerCase()]
    );
    if (!user || user.role !== 'ADMIN') {
      return res.status(401).json({ error: 'Invalid or expired 2FA setup session. Start setup again.' });
    }
    if (user.is_2fa_enabled) {
      return res.status(409).json({ error: '2FA is already enabled for this account.' });
    }

    const verified = speakeasy.totp.verify({
      secret: enrollment.secret,
      encoding: 'base32',
      token: String(token),
      window: 2
    });
    if (!verified) {
      await recordFailedAttempt(user.email, getClientIp(req));
      return res.status(400).json({ error: 'Invalid verification code. Check your authenticator app and try again.' });
    }

    const updateResult = await dbAsync.run(
      'UPDATE users SET totp_secret = ?, is_2fa_enabled = 1 WHERE id = ? AND is_2fa_enabled = 0',
      [encryptSecret(enrollment.secret), user.id]
    );
    if (updateResult.changes !== 1) {
      return res.status(409).json({ error: '2FA was changed for this account. Start setup again.' });
    }

    res.json({
      success: true,
      message: 'Google Authenticator 2FA is enabled. Use your password and authenticator code to sign in.'
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid or expired 2FA setup session. Start setup again.' });
    }
    console.error('2FA enrollment verification error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA setup.' });
  }
});

/**
 * GET /api/auth/2fa/setup
 * Generates TOTP secret and QR code for Google Authenticator (Admin only)
 */
router.get('/2fa/setup', verifyToken, requireAdmin, async (req, res) => {
  try {
    const user = await dbAsync.get('SELECT email, name FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate Speakeasy TOTP Secret
    const secret = speakeasy.generateSecret({
      name: `College Bus Route Optimizer (${user.email})`,
      issuer: 'College Bus Route Optimizer'
    });

    // Generate QR Code data URL
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
      instructions: 'Scan this QR code using Google Authenticator, Authy, or 1Password on your mobile device.'
    });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to generate 2FA setup: ' + err.message });
  }
});

/**
 * POST /api/auth/2fa/verify
 * Validates the initial 6-digit TOTP code and activates 2FA for the admin
 */
router.post('/2fa/verify', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { secret, token } = req.body;
    if (!secret || !token) {
      return res.status(400).json({ error: 'Secret and 6-digit verification code are required.' });
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: token.trim(),
      window: 2
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code. Please check your authenticator app.' });
    }

    // Encrypt secret before storing in DB
    const encryptedSecret = encryptSecret(secret);

    await dbAsync.run(
      'UPDATE users SET totp_secret = ?, is_2fa_enabled = 1 WHERE id = ?',
      [encryptedSecret, req.user.id]
    );

    res.json({
      success: true,
      message: 'Google Authenticator 2FA activated successfully! You must now enter this code on future logins.'
    });
  } catch (err) {
    console.error('2FA verification error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA: ' + err.message });
  }
});

/**
 * POST /api/auth/2fa/disable
 * Disables 2FA (Admin only)
 */
router.post('/2fa/disable', verifyToken, requireAdmin, async (req, res) => {
  try {
    await dbAsync.run(
      'UPDATE users SET totp_secret = NULL, is_2fa_enabled = 0 WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, message: 'Two-factor authentication disabled.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable 2FA: ' + err.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await dbAsync.get('SELECT id, name, email, role, is_2fa_enabled, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
