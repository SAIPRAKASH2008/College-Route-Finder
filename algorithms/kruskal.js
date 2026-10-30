/**
 * Kruskal's Minimum Spanning Tree algorithm
 * Returns the route between two stops along the minimum spanning forest.
 */
function kruskalRoute(graph, startId, endId) {
  const allNodeIds = graph.getAllNodeIds();
  const start = Number(startId);
  const end = Number(endId);

  if (!graph.getNode(start) || !graph.getNode(end)) {
    return {
      path: [],
      stopNames: [],
      segments: [],
      totalDistance: null,
      unreachable: []
    };
  }

  const parent = new Map(allNodeIds.map(id => [id, id]));
  const rank = new Map(allNodeIds.map(id => [id, 0]));
  const tree = new Map(allNodeIds.map(id => [id, []]));
  const edges = [];

  for (const sourceId of allNodeIds) {
    for (const edge of graph.getNeighbors(sourceId)) {
      if (sourceId < edge.toId) {
        edges.push({
          sourceId,
          destId: edge.toId,
          distance: edge.distance,
          edgeId: edge.edgeId
        });
      }
    }
  }

  function find(id) {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root);
    }

    let current = id;
    while (parent.get(current) !== root) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }

    return root;
  }

  function union(firstId, secondId) {
    let firstRoot = find(firstId);
    let secondRoot = find(secondId);
    if (firstRoot === secondRoot) return false;

    const firstRank = rank.get(firstRoot);
    const secondRank = rank.get(secondRoot);
    if (firstRank < secondRank) {
      [firstRoot, secondRoot] = [secondRoot, firstRoot];
    }

    parent.set(secondRoot, firstRoot);
    if (firstRank === secondRank) {
      rank.set(firstRoot, rank.get(firstRoot) + 1);
    }
    return true;
  }

  edges.sort((a, b) =>
    a.distance - b.distance || a.sourceId - b.sourceId || a.destId - b.destId
  );

  const mstEdges = [];
  let networkTotalDistance = 0;
  for (const edge of edges) {
    if (!union(edge.sourceId, edge.destId)) continue;

    tree.get(edge.sourceId).push({ toId: edge.destId, distance: edge.distance, edgeId: edge.edgeId });
    tree.get(edge.destId).push({ toId: edge.sourceId, distance: edge.distance, edgeId: edge.edgeId });
    networkTotalDistance += edge.distance;

    const sourceNode = graph.getNode(edge.sourceId);
    const destNode = graph.getNode(edge.destId);
    mstEdges.push({
      sourceId: edge.sourceId,
      destId: edge.destId,
      sourceName: sourceNode.name,
      destName: destNode.name,
      distance: Math.round(edge.distance * 100) / 100
    });
  }

  const previous = new Map([[start, null]]);
  const previousEdge = new Map();
  const queue = [start];
  for (let index = 0; index < queue.length && !previous.has(end); index++) {
    const current = queue[index];
    for (const edge of tree.get(current)) {
      if (previous.has(edge.toId)) continue;
      previous.set(edge.toId, current);
      previousEdge.set(edge.toId, edge);
      queue.push(edge.toId);
    }
  }

  if (!previous.has(end)) {
    return {
      startId: start,
      endId: end,
      path: [],
      stopNames: [],
      segments: [],
      totalDistance: null,
      unreachable: graph.getUnreachableNodes(start),
      mstEdges,
      networkTotalDistance: Math.round(networkTotalDistance * 100) / 100,
      message: 'Destination stop is unreachable from starting stop.'
    };
  }

  const path = [];
  for (let current = end; current !== null; current = previous.get(current)) {
    path.unshift(current);
  }

  const stopNames = path.map(id => graph.getNode(id).name);
  const segments = [];
  let totalDistance = 0;
  for (let index = 0; index < path.length - 1; index++) {
    const fromId = path[index];
    const toId = path[index + 1];
    const edge = previousEdge.get(toId);
    totalDistance += edge.distance;
    segments.push({
      fromId,
      toId,
      fromName: stopNames[index],
      toName: stopNames[index + 1],
      distance: Math.round(edge.distance * 100) / 100
    });
  }

  return {
    startId: start,
    endId: end,
    path,
    stopNames,
    segments,
    totalDistance: Math.round(totalDistance * 100) / 100,
    unreachable: graph.getUnreachableNodes(start),
    mstEdges,
    networkTotalDistance: Math.round(networkTotalDistance * 100) / 100
  };
}

module.exports = kruskalRoute;
