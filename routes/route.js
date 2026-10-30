const express = require('express');
const router = express.Router();
const { dbAsync } = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const Graph = require('../algorithms/graph');
const dijkstra = require('../algorithms/dijkstra');
const primMST = require('../algorithms/primMST');
const nearestNeighbourRoute = require('../algorithms/nearestNeighbour');

/**
 * Helper to build in-memory Graph instance from database
 */
async function buildGraphFromDb() {
  const stops = await dbAsync.all('SELECT * FROM stops');
  const edges = await dbAsync.all('SELECT * FROM edges');

  const graph = new Graph();
  for (const s of stops) {
    graph.addNode(s);
  }
  for (const e of edges) {
    graph.addEdge(e.source_stop_id, e.dest_stop_id, e.distance_km, e.id);
  }

  return { graph, stops, edges };
}

/**
 * POST /api/route/compute
 * Runs Dijkstra, Prim's MST, or Nearest Neighbour
 */
router.post('/compute', verifyToken, async (req, res) => {
  try {
    const { startId, endId, algorithm, returnToCollege } = req.body;

    const { graph, stops, edges } = await buildGraphFromDb();

    if (stops.length < 2) {
      return res.status(400).json({ error: 'At least 2 pickup points must exist in the network to compute routes.' });
    }

    if (edges.length === 0) {
      return res.status(400).json({ error: 'No road connections (edges) have been defined yet. Please add edges first.' });
    }

    const algo = (algorithm || 'DIJKSTRA').toUpperCase();
    let result = null;

    if (algo === 'DIJKSTRA') {
      if (!startId || !endId) {
        return res.status(400).json({ error: 'Start stop and destination stop are both required for Dijkstra shortest path.' });
      }
      result = dijkstra(graph, startId, endId);
      result.algorithm = 'DIJKSTRA';
    } else if (algo === 'MST') {
      result = primMST(graph, startId);
      result.algorithm = 'MST';
    } else if (algo === 'NEAREST_NEIGHBOUR' || algo === 'NN') {
      result = nearestNeighbourRoute(graph, startId, returnToCollege !== false);
      result.algorithm = 'NEAREST_NEIGHBOUR';
    } else {
      return res.status(400).json({ error: `Unsupported algorithm "${algo}". Choose DIJKSTRA, MST, or NEAREST_NEIGHBOUR.` });
    }

    // Attach algorithm benchmark comparison metrics
    // For comparing with other algorithms
    const college = graph.getCollegeNode();
    const effectiveStart = startId || (college ? college.id : stops[0].id);

    const mstBench = primMST(graph, effectiveStart);
    const nnBench = nearestNeighbourRoute(graph, effectiveStart, true);

    result.comparison = {
      mstTotalDistance: mstBench.totalDistance,
      nearestNeighbourTotalDistance: nnBench.totalDistance,
      totalStopsCount: stops.length,
      connectedStopsCount: graph.getReachableNodes(effectiveStart).size
    };

    res.json(result);
  } catch (err) {
    console.error('Route calculation error:', err);
    res.status(500).json({ error: 'Route calculation failed: ' + err.message });
  }
});

/**
 * POST /api/route/save
 * Save computed route (Admin only)
 */
router.post('/save', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { route_name, algorithm, route_path, total_distance } = req.body;

    if (!route_name || !algorithm || !route_path) {
      return res.status(400).json({ error: 'Route name, algorithm, and path data are required.' });
    }

    const pathJson = typeof route_path === 'string' ? route_path : JSON.stringify(route_path);
    const dist = parseFloat(total_distance) || 0;

    const result = await dbAsync.run(
      'INSERT INTO saved_routes (route_name, algorithm, route_path, total_distance, created_by) VALUES (?, ?, ?, ?, ?)',
      [route_name.trim(), algorithm, pathJson, dist, req.user.id]
    );

    res.status(201).json({
      message: 'Route saved successfully!',
      routeId: result.lastID
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save route: ' + err.message });
  }
});

/**
 * GET /api/route/saved
 * List all saved routes (all authenticated users)
 */
router.get('/saved', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        r.id,
        r.route_name,
        r.algorithm,
        r.route_path,
        r.total_distance,
        r.created_at,
        u.name as creator_name
      FROM saved_routes r
      LEFT JOIN users u ON r.created_by = u.id
      ORDER BY r.id DESC
    `;
    const routes = await dbAsync.all(query);

    // Parse route_path JSON safely
    const parsedRoutes = routes.map(r => {
      let pathData = null;
      try {
        pathData = JSON.parse(r.route_path);
      } catch (e) {
        pathData = r.route_path;
      }
      return {
        ...r,
        route_path: pathData
      };
    });

    res.json(parsedRoutes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load saved routes: ' + err.message });
  }
});

/**
 * DELETE /api/route/saved/:id
 * Delete a saved route (Admin only)
 */
router.delete('/saved/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await dbAsync.run('DELETE FROM saved_routes WHERE id = ?', [id]);
    res.json({ message: 'Saved route deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete saved route: ' + err.message });
  }
});

module.exports = router;
