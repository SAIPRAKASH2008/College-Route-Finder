const { dbAsync } = require('../config/db');
const { getClientIp } = require('./rateLimiter');

// Helper to anonymize IP address under DPDP Act / privacy guidelines
function anonymizeIp(ip) {
  if (!ip) return '0.0.0.0';
  if (ip === '::1' || ip === '127.0.0.1') return '127.0.0.0';
  if (ip.includes('.')) {
    // IPv4: mask last octet (e.g. 192.168.1.100 -> 192.168.1.0)
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  } else if (ip.includes(':')) {
    // IPv6: keep first 3 segments
    const parts = ip.split(':');
    return parts.slice(0, 3).join(':') + '::0';
  }
  return '127.0.0.0';
}

async function trackVisitor(req, res, next) {
  // Check cookie consent preferences
  const cookieHeader = req.headers.cookie || '';
  const consentAnalyticsHeader = req.headers['x-consent-analytics'];

  // If user explicitly refused analytics/tracking cookies, skip tracking
  if (consentAnalyticsHeader === 'false' || cookieHeader.includes('cookie_consent=essential')) {
    return next();
  }

  // We only track HTML page loads or explicit visitor pings to avoid noise
  const isHtml = req.headers.accept && req.headers.accept.includes('text/html');
  const isVisitorApi = req.path === '/api/visitor/ping';

  if (isHtml || isVisitorApi) {
    const rawIp = getClientIp(req);
    const ip = anonymizeIp(rawIp); // Anonymized IP for privacy compliance
    const userAgent = (req.headers['user-agent'] || 'Unknown Browser').substring(0, 200);
    const page = (req.query.page || req.path || '/').substring(0, 100);
    const referrer = (req.headers['referer'] || req.headers['referrer'] || 'Direct').substring(0, 150);

    // Store asynchronously without blocking response
    dbAsync.run(
      'INSERT INTO visitor_logs (page, ip_address, user_agent, referrer) VALUES (?, ?, ?, ?)',
      [page, ip, userAgent, referrer]
    ).catch(err => console.error('Error logging visitor:', err.message));

    // Emit live WebSocket notification to admin room
    const io = req.app.get('io');
    if (io) {
      const visitorEvent = {
        page,
        ip,
        userAgent,
        referrer,
        timestamp: new Date().toISOString()
      };
      io.to('admin-room').emit('visitor:arrive', visitorEvent);
    }
  }

  next();
}

module.exports = trackVisitor;

