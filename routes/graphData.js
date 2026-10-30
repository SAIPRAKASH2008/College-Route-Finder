const express = require('express');
const router = express.Router();
const { dbAsync } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

/**
 * GET /api/graph
 * Returns node and edge collections formatted for Vis.js Network visualization
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const stops = await dbAsync.all('SELECT * FROM stops ORDER BY id ASC');
    const edges = await dbAsync.all('SELECT * FROM edges ORDER BY id ASC');

    const nodes = stops.map(s => ({
      id: s.id,
      label: s.name,
      is_college: Boolean(s.is_college),
      latitude: s.latitude,
      longitude: s.longitude,
      shape: s.is_college ? 'hexagon' : 'dot',
      size: s.is_college ? 28 : 20,
      color: s.is_college
        ? {
            background: '#6F4E37',
            border: '#E5E4E2',
            highlight: { background: '#8D6346', border: '#FFFFFF' }
          }
        : {
            background: '#E6E0F0',
            border: '#6F4E37',
            highlight: { background: '#FFFFFF', border: '#6F4E37' }
          },
      font: {
        color: '#E5E4E2',
        size: s.is_college ? 15 : 13,
        bold: Boolean(s.is_college),
        face: 'Inter, system-ui, sans-serif'
      },
      title: `${s.name}${s.is_college ? ' [CAMPUS TERMINAL]' : ''}`
    }));

    const visEdges = edges.map(e => ({
      id: `e_${e.id}`,
      dbId: e.id,
      from: e.source_stop_id,
      to: e.dest_stop_id,
      label: `${e.distance_km} km`,
      distance: e.distance_km,
      font: {
        align: 'middle',
        size: 11,
        color: '#E5E4E2',
        background: 'rgba(38, 28, 30, 0.92)',
        strokeWidth: 0
      },
      color: { color: 'rgba(229, 228, 226, 0.45)', highlight: '#E6E0F0' },
      width: 2,
      smooth: { type: 'continuous' }
    }));

    res.json({
      nodes,
      edges: visEdges,
      stats: {
        totalNodes: stops.length,
        totalEdges: edges.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate graph data: ' + err.message });
  }
});

module.exports = router;
