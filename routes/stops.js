const express = require('express');
const router = express.Router();
const { dbAsync } = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/stops
 * List all pickup points (all authenticated users)
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const stops = await dbAsync.all('SELECT * FROM stops ORDER BY is_college DESC, name ASC');
    res.json(stops);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stops: ' + err.message });
  }
});

/**
 * POST /api/stops
 * Add a new pickup point (Admin only)
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, latitude, longitude, is_college } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Stop name is required.' });
    }

    const trimmedName = name.trim();

    // Check duplicate
    const existing = await dbAsync.get('SELECT id FROM stops WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing) {
      return res.status(400).json({ error: 'A stop with this name already exists.' });
    }

    const isCollegeVal = is_college ? 1 : 0;

    // If marking as college, ensure no other stop is marked as college
    if (isCollegeVal === 1) {
      await dbAsync.run('UPDATE stops SET is_college = 0 WHERE is_college = 1');
    }

    const result = await dbAsync.run(
      'INSERT INTO stops (name, latitude, longitude, is_college) VALUES (?, ?, ?, ?)',
      [trimmedName, latitude || null, longitude || null, isCollegeVal]
    );

    const newStop = await dbAsync.get('SELECT * FROM stops WHERE id = ?', [result.lastID]);
    res.status(201).json({ message: 'Pickup point created successfully', stop: newStop });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create stop: ' + err.message });
  }
});

/**
 * PUT /api/stops/:id
 * Edit a pickup point (Admin only)
 */
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, latitude, longitude, is_college } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Stop name is required.' });
    }

    const trimmedName = name.trim();

    // Check duplicate with different ID
    const duplicate = await dbAsync.get('SELECT id FROM stops WHERE LOWER(name) = LOWER(?) AND id != ?', [trimmedName, id]);
    if (duplicate) {
      return res.status(400).json({ error: 'Another stop with this name already exists.' });
    }

    const isCollegeVal = is_college ? 1 : 0;

    if (isCollegeVal === 1) {
      await dbAsync.run('UPDATE stops SET is_college = 0 WHERE is_college = 1 AND id != ?', [id]);
    }

    await dbAsync.run(
      'UPDATE stops SET name = ?, latitude = ?, longitude = ?, is_college = ? WHERE id = ?',
      [trimmedName, latitude || null, longitude || null, isCollegeVal, id]
    );

    const updatedStop = await dbAsync.get('SELECT * FROM stops WHERE id = ?', [id]);
    res.json({ message: 'Pickup point updated successfully', stop: updatedStop });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stop: ' + err.message });
  }
});

/**
 * DELETE /api/stops/:id
 * Delete a pickup point and its connected edges (Admin only)
 */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const stop = await dbAsync.get('SELECT * FROM stops WHERE id = ?', [id]);
    if (!stop) {
      return res.status(404).json({ error: 'Pickup point not found.' });
    }

    // Cascade delete edges connected to this stop
    await dbAsync.run('DELETE FROM edges WHERE source_stop_id = ? OR dest_stop_id = ?', [id, id]);

    // Delete the stop
    await dbAsync.run('DELETE FROM stops WHERE id = ?', [id]);

    res.json({ message: `Pickup point "${stop.name}" and all connected road edges were deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete stop: ' + err.message });
  }
});

module.exports = router;
