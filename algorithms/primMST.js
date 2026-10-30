/**
 * Prim's Minimum Spanning Tree (MST) Algorithm
 * Connects all reachable pickup points with the minimum total road network distance.
 */
function primMST(graph, startId = null) {
  const allNodeIds = graph.getAllNodeIds();
  if (allNodeIds.length === 0) {
    return {
      mstEdges: [],
      visitedStops: [],
      totalDistance: 0,
      unreachable: []
    };
  }

  // Determine starting node (provided startId, or college, or first node)
  let start = startId ? Number(startId) : null;
  if (!start || !graph.getNode(start)) {
    const college = graph.getCollegeNode();
    start = college ? college.id : allNodeIds[0];
  }

  const inMST = new Set();
  const mstEdges = [];
  let totalDistance = 0;

  // Track candidate edges crossing cut (u in MST, v not in MST)
  // [ { u, v, distance } ]
  inMST.add(start);

  const edgeQueue = [];

  function addOutgoingEdges(nodeId) {
    const neighbors = graph.getNeighbors(nodeId);
    for (const edge of neighbors) {
      if (!inMST.has(edge.toId)) {
        edgeQueue.push({
          sourceId: nodeId,
          destId: edge.toId,
          distance: edge.distance
        });
      }
    }
  }

  addOutgoingEdges(start);

  while (edgeQueue.length > 0 && inMST.size < allNodeIds.length) {
    // Pick minimum weight edge that crosses the cut
    edgeQueue.sort((a, b) => a.distance - b.distance);
    const minEdge = edgeQueue.shift();

    if (!minEdge) break;

    // If destination is already in MST, skip to prevent cycle
    if (inMST.has(minEdge.destId)) {
      continue;
    }

    // Add destination to MST
    inMST.add(minEdge.destId);
    totalDistance += minEdge.distance;

    const sourceNode = graph.getNode(minEdge.sourceId);
    const destNode = graph.getNode(minEdge.destId);

    mstEdges.push({
      sourceId: minEdge.sourceId,
      destId: minEdge.destId,
      sourceName: sourceNode ? sourceNode.name : `Stop #${minEdge.sourceId}`,
      destName: destNode ? destNode.name : `Stop #${minEdge.destId}`,
      distance: Math.round(minEdge.distance * 100) / 100
    });

    // Add new edges from the newly added node
    addOutgoingEdges(minEdge.destId);
  }

  // Find unreachable nodes
  const unreachable = allNodeIds.filter(id => !inMST.has(id));

  return {
    startId: start,
    startName: graph.getNode(start)?.name || `Stop #${start}`,
    mstEdges,
    visitedStops: Array.from(inMST),
    totalDistance: Math.round(totalDistance * 100) / 100,
    unreachable
  };
}

module.exports = primMST;
