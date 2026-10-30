const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { dbAsync } = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const intruderPhotoDirectory = path.resolve(__dirname, '../public/uploads/intruders');

/**
 * GET /api/security/intruders
 * Fetch all captured intruder alerts with photos (Admin only)
 */
router.get('/intruders', verifyToken, requireAdmin, async (req, res) => {
  try {
    const logs = await dbAsync.all('SELECT * FROM intruder_logs ORDER BY created_at DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch intruder logs: ' + err.message });
  }
});

/**
 * GET /api/security/visitors
 * Fetch live visitor activity logs (Admin only)
 */
router.get('/visitors', verifyToken, requireAdmin, async (req, res) => {
  try {
    const logs = await dbAsync.all('SELECT * FROM visitor_logs ORDER BY created_at DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch visitor logs: ' + err.message });
  }
});

/**
 * GET /api/security/stats
 * Dashboard summary statistics (Admin only)
 */
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const totalVisitors = await dbAsync.get('SELECT COUNT(*) as count FROM visitor_logs');
    const totalIntruders = await dbAsync.get('SELECT COUNT(*) as count FROM intruder_logs');
    const totalStops = await dbAsync.get('SELECT COUNT(*) as count FROM stops');
    const totalEdges = await dbAsync.get('SELECT COUNT(*) as count FROM edges');
    const totalSavedRoutes = await dbAsync.get('SELECT COUNT(*) as count FROM saved_routes');
    const lockedUsers = await dbAsync.all('SELECT email, locked_until FROM users WHERE locked_until > datetime("now")');

    res.json({
      totalVisitors: totalVisitors.count,
      totalIntruders: totalIntruders.count,
      totalStops: totalStops.count,
      totalEdges: totalEdges.count,
      totalSavedRoutes: totalSavedRoutes.count,
      lockedAccountsCount: lockedUsers.length,
      lockedUsers
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch security statistics: ' + err.message });
  }
});

/**
 * DELETE /api/security/intruders/:id
 */
router.delete('/intruders/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid intruder log ID.' });
    }

    const intruder = await dbAsync.get(
      'SELECT id, photo_path FROM intruder_logs WHERE id = ?',
      [Number(req.params.id)]
    );
    if (!intruder) {
      return res.status(404).json({ error: 'Intruder log entry not found.' });
    }

    if (intruder.photo_path) {
      const photoPath = intruder.photo_path.replace(/\\/g, '/');
      const match = photoPath.match(/^\/?uploads\/intruders\/([^/]+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Stored photo path is outside the intruder photo directory.' });
      }

      const photoFile = path.resolve(intruderPhotoDirectory, match[1]);
      if (path.dirname(photoFile) !== intruderPhotoDirectory) {
        return res.status(400).json({ error: 'Invalid stored intruder photo path.' });
      }

      try {
        await fs.unlink(photoFile);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }

    const result = await dbAsync.run('DELETE FROM intruder_logs WHERE id = ?', [intruder.id]);
    if (result.changes !== 1) {
      return res.status(500).json({ error: 'Photo was removed, but the intruder log entry could not be deleted.' });
    }
    res.json({ message: 'Intruder record and photo deleted.' });
  } catch (err) {
    console.error('Intruder photo deletion error:', err);
    res.status(500).json({ error: 'Failed to delete the intruder record and photo.' });
  }
});

/**
 * POST /api/security/clear-lockout
 * Manually release an account lockout
 */
router.post('/clear-lockout', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    await dbAsync.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?', [email]);
    res.json({ message: `Lockout cleared for ${email}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
