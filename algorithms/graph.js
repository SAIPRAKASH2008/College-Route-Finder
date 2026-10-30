/**
 * Graph data structure for the College Bus Route Optimizer
 * Weighted, Undirected Graph represented via an Adjacency List
 */
class Graph {
  constructor() {
    this.nodes = new Map(); // id -> { id, name, is_college, lat, lng }
    this.adjacency = new Map(); // id -> [ { toId, distance, edgeId } ]
  }

  addNode(stop) {
    const id = Number(stop.id);
    this.nodes.set(id, {
      id,
      name: stop.name,
      is_college: Boolean(stop.is_college),
      latitude: stop.latitude,
      longitude: stop.longitude
    });
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, []);
    }
  }

  addEdge(sourceId, destId, distance, edgeId = null) {
    const u = Number(sourceId);
    const v = Number(destId);
    const dist = parseFloat(distance);

    if (u === v || dist <= 0) return; // Prevent self-loop or invalid distance

    if (!this.adjacency.has(u)) this.adjacency.set(u, []);
    if (!this.adjacency.has(v)) this.adjacency.set(v, []);

    // Undirected graph: add both directions if not already present
    const uEdges = this.adjacency.get(u);
    if (!uEdges.some(e => e.toId === v)) {
      uEdges.push({ toId: v, distance: dist, edgeId });
    }

    const vEdges = this.adjacency.get(v);
    if (!vEdges.some(e => e.toId === u)) {
      vEdges.push({ toId: u, distance: dist, edgeId });
    }
  }

  getNode(id) {
    return this.nodes.get(Number(id));
  }

  getNeighbors(id) {
    return this.adjacency.get(Number(id)) || [];
  }

  getAllNodeIds() {
    return Array.from(this.nodes.keys());
  }

  getCollegeNode() {
    for (const [id, node] of this.nodes.entries()) {
      if (node.is_college) return node;
    }
    // Fallback to first node if none explicitly marked
    const firstId = this.getAllNodeIds()[0];
    return firstId ? this.nodes.get(firstId) : null;
  }

  /**
   * Breadth-First Search (BFS) to detect reachable stops and connected components
   */
  getReachableNodes(startId) {
    const start = Number(startId);
    const visited = new Set();
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.toId)) {
          visited.add(neighbor.toId);
          queue.push(neighbor.toId);
        }
      }
    }
    return visited;
  }

  /**
   * Returns list of stop IDs unreachable from the given startId
   */
  getUnreachableNodes(startId) {
    const reachable = this.getReachableNodes(startId);
    const all = this.getAllNodeIds();
    return all.filter(id => !reachable.has(id));
  }

  /**
   * Checks if the entire graph is fully connected
   */
  isConnected() {
    const allNodes = this.getAllNodeIds();
    if (allNodes.length <= 1) return true;
    const reachable = this.getReachableNodes(allNodes[0]);
    return reachable.size === allNodes.length;
  }
}

module.exports = Graph;
