const express = require('express');
const router = express.Router();
const { dbAsync } = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/edges
 * List all edges with joined stop details (all authenticated users)
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        e.id, 
        e.source_stop_id, 
        e.dest_stop_id, 
        e.distance_km, 
        e.created_at,
        s1.name as source_name,
        s1.is_college as source_is_college,
        s2.name as dest_name,
        s2.is_college as dest_is_college
      FROM edges e
      JOIN stops s1 ON e.source_stop_id = s1.id
      JOIN stops s2 ON e.dest_stop_id = s2.id
      ORDER BY e.id DESC
    `;
    const edges = await dbAsync.all(query);
    res.json(edges);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve edges: ' + err.message });
  }
});

/**
 * POST /api/edges
 * Add an edge between two stops with distance in km (Admin only)
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { source_stop_id, dest_stop_id, distance_km } = req.body;

    const u = parseInt(source_stop_id, 10);
    const v = parseInt(dest_stop_id, 10);
    const dist = parseFloat(distance_km);

    if (!u || !v) {
      return res.status(400).json({ error: 'Source and destination stops must be specified.' });
    }

    if (u === v) {
      return res.status(400).json({ error: 'Self-loops are not allowed. Source and destination must be distinct stops.' });
    }

    if (isNaN(dist) || dist <= 0) {
      return res.status(400).json({ error: 'Distance must be a positive number greater than 0.' });
    }

    // Verify both stops exist
    const stop1 = await dbAsync.get('SELECT id, name FROM stops WHERE id = ?', [u]);
    const stop2 = await dbAsync.get('SELECT id, name FROM stops WHERE id = ?', [v]);

    if (!stop1 || !stop2) {
      return res.status(404).json({ error: 'One or both of the selected stops do not exist.' });
    }

    // Undirected check: check if (u, v) or (v, u) exists
    const existing = await dbAsync.get(
      'SELECT id FROM edges WHERE (source_stop_id = ? AND dest_stop_id = ?) OR (source_stop_id = ? AND dest_stop_id = ?)',
      [u, v, v, u]
    );

    if (existing) {
      return res.status(400).json({
        error: `A road connection already exists between "${stop1.name}" and "${stop2.name}". You can edit the existing connection instead.`
      });
    }

    const result = await dbAsync.run(
      'INSERT INTO edges (source_stop_id, dest_stop_id, distance_km) VALUES (?, ?, ?)',
      [u, v, dist]
    );

    res.status(201).json({
      message: 'Road connection added successfully',
      edgeId: result.lastID,
      edge: {
        id: result.lastID,
        source_stop_id: u,
        dest_stop_id: v,
        source_name: stop1.name,
        dest_name: stop2.name,
        distance_km: dist
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create edge: ' + err.message });
  }
});

/**
 * PUT /api/edges/:id
 * Edit an existing edge (Admin only)
 */
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { source_stop_id, dest_stop_id, distance_km } = req.body;

    const u = parseInt(source_stop_id, 10);
    const v = parseInt(dest_stop_id, 10);
    const dist = parseFloat(distance_km);

    if (!u || !v) {
      return res.status(400).json({ error: 'Source and destination stops are required.' });
    }

    if (u === v) {
      return res.status(400).json({ error: 'Self-loops are not allowed.' });
    }

    if (isNaN(dist) || dist <= 0) {
      return res.status(400).json({ error: 'Distance must be a positive number greater than 0.' });
    }

    // Check duplicate
    const existing = await dbAsync.get(
      'SELECT id FROM edges WHERE id != ? AND ((source_stop_id = ? AND dest_stop_id = ?) OR (source_stop_id = ? AND dest_stop_id = ?))',
      [id, u, v, v, u]
    );

    if (existing) {
      return res.status(400).json({ error: 'A road connection already exists between these two stops.' });
    }

    await dbAsync.run(
      'UPDATE edges SET source_stop_id = ?, dest_stop_id = ?, distance_km = ? WHERE id = ?',
      [u, v, dist, id]
    );

    res.json({ message: 'Edge updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update edge: ' + err.message });
  }
});

/**
 * DELETE /api/edges/:id
 * Delete an edge (Admin only)
 */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const edge = await dbAsync.get('SELECT id FROM edges WHERE id = ?', [id]);
    if (!edge) {
      return res.status(404).json({ error: 'Edge not found.' });
    }

    await dbAsync.run('DELETE FROM edges WHERE id = ?', [id]);
    res.json({ message: 'Road connection deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete edge: ' + err.message });
  }
});

module.exports = router;
