const dijkstra = require('./dijkstra');

/**
 * Nearest Neighbour Heuristic
 * Computes a bus route covering all reachable stops starting from a chosen pickup point.
 * Uses shortest-path distance to transition to the nearest unvisited stop.
 */
function nearestNeighbourRoute(graph, startId, returnToCollege = true) {
  const allNodeIds = graph.getAllNodeIds();
  if (allNodeIds.length === 0) {
    return {
      path: [],
      stopNames: [],
      segments: [],
      tourStops: [],
      totalDistance: 0,
      unreachable: []
    };
  }

  let current = Number(startId);
  if (!current || !graph.getNode(current)) {
    const college = graph.getCollegeNode();
    current = college ? college.id : allNodeIds[0];
  }

  const initialStart = current;
  const unvisited = new Set(allNodeIds);
  unvisited.delete(current);

  const fullPath = [current];
  const segments = [];
  let totalDistance = 0;
  const visitedOrder = [current];

  while (unvisited.size > 0) {
    let closestNext = null;
    let shortestDist = Infinity;
    let shortestDijkstraRes = null;

    // Find the closest unvisited stop using Dijkstra
    for (const candidateId of unvisited) {
      const res = dijkstra(graph, current, candidateId);
      if (res.path.length > 0 && res.totalDistance < shortestDist) {
        shortestDist = res.totalDistance;
        closestNext = candidateId;
        shortestDijkstraRes = res;
      }
    }

    // If no unvisited stop is reachable, break
    if (closestNext === null || shortestDist === Infinity) {
      break;
    }

    // Append Dijkstra path segments to the overall tour
    for (const seg of shortestDijkstraRes.segments) {
      segments.push(seg);
      totalDistance += seg.distance;
    }

    // Append nodes in the path (excluding first which is current)
    for (let i = 1; i < shortestDijkstraRes.path.length; i++) {
      fullPath.push(shortestDijkstraRes.path[i]);
    }

    current = closestNext;
    unvisited.delete(current);
    visitedOrder.push(current);
  }

  // Optionally return to the starting node (College) to complete the circuit
  if (returnToCollege && current !== initialStart) {
    const returnRes = dijkstra(graph, current, initialStart);
    if (returnRes.path.length > 0 && returnRes.totalDistance < Infinity) {
      for (const seg of returnRes.segments) {
        segments.push(seg);
        totalDistance += seg.distance;
      }
      for (let i = 1; i < returnRes.path.length; i++) {
        fullPath.push(returnRes.path[i]);
      }
      visitedOrder.push(initialStart);
    }
  }

  const stopNames = fullPath.map(id => {
    const node = graph.getNode(id);
    return node ? node.name : `Stop #${id}`;
  });

  const unreachable = Array.from(unvisited);

  return {
    startId: initialStart,
    path: fullPath,
    stopNames,
    segments,
    tourStops: visitedOrder,
    totalDistance: Math.round(totalDistance * 100) / 100,
    unreachable
  };
}

module.exports = nearestNeighbourRoute;
