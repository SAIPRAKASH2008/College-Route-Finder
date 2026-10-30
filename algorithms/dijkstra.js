/**
 * Dijkstra's Shortest Path Algorithm
 * Calculates shortest route between source stop and target stop
 */
function dijkstra(graph, sourceId, targetId) {
  const src = Number(sourceId);
  const dst = Number(targetId);

  const nodeIds = graph.getAllNodeIds();
  const distances = new Map();
  const previous = new Map();
  const unvisited = new Set(nodeIds);

  // Initialize distances
  for (const id of nodeIds) {
    distances.set(id, Infinity);
    previous.set(id, null);
  }
  distances.set(src, 0);

  // Edge case: start is same as destination
  if (src === dst) {
    const node = graph.getNode(src);
    return {
      path: [src],
      stopNames: [node ? node.name : `Stop #${src}`],
      segments: [],
      totalDistance: 0,
      unreachable: []
    };
  }

  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    let current = null;
    let minDistance = Infinity;

    for (const id of unvisited) {
      const dist = distances.get(id);
      if (dist < minDistance) {
        minDistance = dist;
        current = id;
      }
    }

    // If smallest distance is infinity, remaining nodes are unreachable
    if (current === null || minDistance === Infinity) {
      break;
    }

    // If reached destination, early exit
    if (current === dst) {
      break;
    }

    unvisited.delete(current);

    // Examine neighbors
    const neighbors = graph.getNeighbors(current);
    for (const edge of neighbors) {
      if (unvisited.has(edge.toId)) {
        const alt = distances.get(current) + edge.distance;
        if (alt < distances.get(edge.toId)) {
          distances.set(edge.toId, alt);
          previous.set(edge.toId, current);
        }
      }
    }
  }

  // Check if destination was reached
  if (distances.get(dst) === Infinity) {
    return {
      path: [],
      stopNames: [],
      segments: [],
      totalDistance: Infinity,
      unreachable: [dst],
      message: `Destination stop is unreachable from starting stop.`
    };
  }

  // Reconstruct path from dst to src
  const path = [];
  let curr = dst;
  while (curr !== null) {
    path.unshift(curr);
    curr = previous.get(curr);
  }

  // Build segments and stop names
  const stopNames = path.map(id => {
    const n = graph.getNode(id);
    return n ? n.name : `Stop #${id}`;
  });

  const segments = [];
  let totalDistance = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const fromId = path[i];
    const toId = path[i + 1];
    const edge = graph.getNeighbors(fromId).find(e => e.toId === toId);
    const dist = edge ? edge.distance : 0;
    totalDistance += dist;
    segments.push({
      fromId,
      toId,
      fromName: stopNames[i],
      toName: stopNames[i + 1],
      distance: Math.round(dist * 100) / 100
    });
  }

  return {
    path,
    stopNames,
    segments,
    totalDistance: Math.round(totalDistance * 100) / 100,
    unreachable: []
  };
}

module.exports = dijkstra;
