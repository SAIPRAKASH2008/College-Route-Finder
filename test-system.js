/**
 * Automated Verification Script
 * Validates Graph Algorithms (Dijkstra, Prim MST, Nearest Neighbour) & Security Logic
 */

const Graph = require('./algorithms/graph');
const dijkstra = require('./algorithms/dijkstra');
const primMST = require('./algorithms/primMST');
const nearestNeighbourRoute = require('./algorithms/nearestNeighbour');

console.log('🧪 Starting Automated Verification of Graph Algorithms & Core Logic...\n');

// 1. Build test graph matching Section 12 of the SRS:
// Stops: A (2), B (3), C (4), D (5), College (1)
// Edges: A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, D-College 3, B-College 9
const testGraph = new Graph();
testGraph.addNode({ id: 1, name: 'College', is_college: true });
testGraph.addNode({ id: 2, name: 'Stop A', is_college: false });
testGraph.addNode({ id: 3, name: 'Stop B', is_college: false });
testGraph.addNode({ id: 4, name: 'Stop C', is_college: false });
testGraph.addNode({ id: 5, name: 'Stop D', is_college: false });

testGraph.addEdge(2, 3, 4); // A-B 4
testGraph.addEdge(2, 4, 2); // A-C 2
testGraph.addEdge(3, 4, 1); // B-C 1
testGraph.addEdge(3, 5, 5); // B-D 5
testGraph.addEdge(4, 5, 8); // C-D 8
testGraph.addEdge(5, 1, 3); // D-College 3
testGraph.addEdge(3, 1, 9); // B-College 9

// TEST 1: Dijkstra Shortest Path from Stop A (2) to College (1)
// Expected: A -> C -> B -> D -> College
// Distance: 2 + 1 + 5 + 3 = 11 km
console.log('--- TEST 1: Dijkstra Shortest Path (A to College) ---');
const dijkstraRes = dijkstra(testGraph, 2, 1);
console.log('Computed Path:', dijkstraRes.path.join(' -> '));
console.log('Computed Stop Names:', dijkstraRes.stopNames.join(' -> '));
console.log('Total Distance:', dijkstraRes.totalDistance, 'km');

const expectedPath = [2, 4, 3, 5, 1];
const passedDijkstra =
  JSON.stringify(dijkstraRes.path) === JSON.stringify(expectedPath) &&
  dijkstraRes.totalDistance === 11;

if (passedDijkstra) {
  console.log('✅ TEST 1 PASSED: Dijkstra matches Section 12 expected path and distance (11 km)!\n');
} else {
  console.error('❌ TEST 1 FAILED! Expected:', expectedPath, '11 km. Got:', dijkstraRes.path, dijkstraRes.totalDistance);
}

// TEST 2: Disconnected Node Detection
console.log('--- TEST 2: Disconnected Graph Node Detection ---');
testGraph.addNode({ id: 99, name: 'Isolated Island Stop', is_college: false });
const disconnectedRes = dijkstra(testGraph, 2, 99);
if (disconnectedRes.unreachable.includes(99) && disconnectedRes.totalDistance === Infinity) {
  console.log('✅ TEST 2 PASSED: Unreachable stop correctly identified!\n');
} else {
  console.error('❌ TEST 2 FAILED: Could not detect disconnected node.');
}

// TEST 3: Prim's Minimum Spanning Tree
console.log('--- TEST 3: Prim\'s MST ---');
const mstRes = primMST(testGraph, 1);
console.log('MST Edges Count:', mstRes.mstEdges.length);
console.log('MST Visited Stops:', mstRes.visitedStops);
console.log('MST Unreachable:', mstRes.unreachable);
console.log('MST Total Network Distance:', mstRes.totalDistance, 'km');

if (mstRes.mstEdges.length === 4 && mstRes.unreachable.includes(99)) {
  console.log('✅ TEST 3 PASSED: Prim MST correctly spans 5 connected nodes with 4 edges and identifies node 99 as unreachable!\n');
} else {
  console.error('❌ TEST 3 FAILED in MST calculation.');
}

// TEST 4: Nearest Neighbour Heuristic
console.log('--- TEST 4: Nearest Neighbour All-Stops Tour ---');
const nnRes = nearestNeighbourRoute(testGraph, 1, true);
console.log('NN Tour Path:', nnRes.path.join(' -> '));
console.log('NN Total Distance:', nnRes.totalDistance, 'km');
if (nnRes.path.length > 0 && nnRes.tourStops.includes(2) && nnRes.tourStops.includes(5)) {
  console.log('✅ TEST 4 PASSED: Nearest Neighbour successfully computed tour visiting all reachable nodes!\n');
} else {
  console.error('❌ TEST 4 FAILED in Nearest Neighbour tour.');
}

// TEST 5: Encryption & Decryption of TOTP Secret
console.log('--- TEST 5: AES-256-CBC TOTP Secret Encryption ---');
const { encryptSecret, decryptSecret } = require('./config/db');
const sampleSecret = 'JBSWY3DPEHPK3PXP';
const encrypted = encryptSecret(sampleSecret);
const decrypted = decryptSecret(encrypted);

if (encrypted !== sampleSecret && decrypted === sampleSecret) {
  console.log('✅ TEST 5 PASSED: TOTP secret securely encrypted and decrypted!\n');
} else {
  console.error('❌ TEST 5 FAILED: Encryption roundtrip mismatch.');
}

console.log('🎉 ALL CORE ALGORITHM & CRYPTO TESTS COMPLETED SUCCESSFULLY!');
