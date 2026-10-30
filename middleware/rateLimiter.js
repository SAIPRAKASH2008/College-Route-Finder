const { dbAsync } = require('../config/db');
require('dotenv').config();

const MAX_FAILED_ATTEMPTS = parseInt(process.env.MAX_FAILED_ATTEMPTS || '5', 10);
const LOCKOUT_TIME_MINUTES = parseInt(process.env.LOCKOUT_TIME_MINUTES || '15', 10);

// In-memory tracker for IP-based lockout
const ipAttempts = new Map(); // ip -> { count: number, lockedUntil: Date }

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    '127.0.0.1'
  );
}

async function checkLockout(req, res, next) {
  const ip = getClientIp(req);
  const now = new Date();

  // 1. Check IP lockout
  if (ipAttempts.has(ip)) {
    const ipData = ipAttempts.get(ip);
    if (ipData.lockedUntil && ipData.lockedUntil > now) {
      const remainingMinutes = Math.ceil((ipData.lockedUntil - now) / (60 * 1000));
      return res.status(429).json({
        error: `Security Lockout: Too many failed login attempts from this terminal. Try again in ${remainingMinutes} minute(s).`,
        locked: true,
        remainingMinutes
      });
    } else if (ipData.lockedUntil && ipData.lockedUntil <= now) {
      // Lockout expired
      ipAttempts.delete(ip);
    }
  }

  // 2. Check User DB lockout if email provided
  const email = req.body?.email;
  if (email) {
    try {
      const user = await dbAsync.get('SELECT failed_attempts, locked_until FROM users WHERE email = ?', [email]);
      if (user && user.locked_until) {
        const lockedUntil = new Date(user.locked_until);
        if (lockedUntil > now) {
          const remainingMinutes = Math.ceil((lockedUntil - now) / (60 * 1000));
          return res.status(429).json({
            error: `Account Locked: 5 consecutive failed attempts detected. Temporarily locked for security. Try again in ${remainingMinutes} minute(s).`,
            locked: true,
            remainingMinutes
          });
        } else {
          // Lockout expired: reset failed attempts
          await dbAsync.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?', [email]);
        }
      }
    } catch (e) {
      console.error('Error checking user lockout:', e);
    }
  }

  next();
}

async function recordFailedAttempt(email, ip) {
  const now = new Date();

  // Track IP
  let ipData = ipAttempts.get(ip) || { count: 0, lockedUntil: null };
  ipData.count += 1;

  if (ipData.count >= MAX_FAILED_ATTEMPTS) {
    ipData.lockedUntil = new Date(now.getTime() + LOCKOUT_TIME_MINUTES * 60 * 1000);
    console.log(`🔒 IP ${ip} has been locked out until ${ipData.lockedUntil}`);
  }
  ipAttempts.set(ip, ipData);

  // Track User in DB
  let userAttemptCount = ipData.count;
  if (email) {
    try {
      const user = await dbAsync.get('SELECT failed_attempts FROM users WHERE email = ?', [email]);
      if (user) {
        userAttemptCount = (user.failed_attempts || 0) + 1;
        let lockedUntil = null;
        if (userAttemptCount >= MAX_FAILED_ATTEMPTS) {
          lockedUntil = new Date(now.getTime() + LOCKOUT_TIME_MINUTES * 60 * 1000).toISOString();
        }
        await dbAsync.run(
          'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE email = ?',
          [userAttemptCount, lockedUntil, email]
        );
      }
    } catch (e) {
      console.error('Error recording failed attempt in DB:', e);
    }
  }

  return {
    attempts: userAttemptCount,
    isLocked: userAttemptCount >= MAX_FAILED_ATTEMPTS
  };
}

async function resetFailedAttempts(email, ip) {
  if (ip && ipAttempts.has(ip)) {
    ipAttempts.delete(ip);
  }
  if (email) {
    try {
      await dbAsync.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?', [email]);
    } catch (e) {
      console.error('Error resetting failed attempts:', e);
    }
  }
}

module.exports = {
  checkLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  getClientIp
};
