/**
 * Vis.js Network Interactive Graph Visualizer & Route Highlighting
 */

let network = null;
let networkData = { nodes: null, edges: null };
let rawNodes = [];
let rawEdges = [];
let physicsEnabled = true;

async function initNetworkGraph() {
  const container = document.getElementById('network-canvas');
  if (!container) return;

  try {
    const res = await authFetch('/api/graph');
    if (!res.ok) return;
    const data = await res.json();

    rawNodes = data.nodes;
    rawEdges = data.edges;

    if (typeof vis === 'undefined') {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); text-align: center; padding: 2rem;">
          <div>
            <p style="font-size: 1.1rem; color: #ffffff; margin-bottom: 0.5rem;">Interactive Network View</p>
            <p>Graph library loaded (${data.stats.totalNodes} stops, ${data.stats.totalEdges} road edges ready).</p>
          </div>
        </div>
      `;
      return;
    }

    const nodesDataSet = new vis.DataSet(rawNodes);
    const edgesDataSet = new vis.DataSet(rawEdges);

    networkData = {
      nodes: nodesDataSet,
      edges: edgesDataSet
    };

    const options = {
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -70,
          centralGravity: 0.015,
          springLength: 140,
          springConstant: 0.08,
          damping: 0.4
        },
        stabilization: { iterations: 150 }
      },
      interaction: {
        hover: true,
        dragNodes: true,
        zoomView: true,
        dragView: true,
        tooltipDelay: 200
      },
      nodes: {
        borderWidth: 2,
        shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 10, x: 2, y: 4 }
      },
      edges: {
        font: { align: 'middle', size: 11, background: 'rgba(15, 23, 42, 0.85)', color: '#94a3b8' },
        smooth: { type: 'continuous' }
      }
    };

    network = new vis.Network(container, networkData, options);

  } catch (err) {
    console.error('Error initializing network graph:', err);
  }
}

/**
 * Highlights computed path nodes and road edges on the canvas
 */
function highlightPathOnGraph(pathStopIds = [], segments = [], isMst = false) {
  if (!network || !networkData.nodes || !networkData.edges) return;

  // 1. Reset all nodes & edges to normal default styling
  resetGraphStyles();

  const pathSet = new Set(pathStopIds.map(Number));

  // 2. Highlight traversed nodes
  const updatedNodes = [];
  networkData.nodes.forEach(node => {
    if (pathSet.has(Number(node.id))) {
      updatedNodes.push({
        id: node.id,
        color: {
          background: node.is_college ? '#6F4E37' : '#8D6346',
          border: '#E5E4E2',
          highlight: { background: '#E6E0F0', border: '#FFFFFF' }
        },
        size: node.is_college ? 32 : 24,
        font: { color: '#FFFFFF', size: 14, bold: true }
      });
    }
  });
  networkData.nodes.update(updatedNodes);

  // 3. Highlight edges in path or MST
  const updatedEdges = [];

  if (isMst) {
    // For MST, highlight all MST edges
    const mstEdgePairs = segments.map(s => [Number(s.sourceId), Number(s.destId)]);

    networkData.edges.forEach(edge => {
      const from = Number(edge.from);
      const to = Number(edge.to);
      const inMst = mstEdgePairs.some(([u, v]) => (u === from && v === to) || (u === to && v === from));

      if (inMst) {
        updatedEdges.push({
          id: edge.id,
          color: { color: '#E5E4E2', highlight: '#FFFFFF' },
          width: 5,
          font: { color: '#E5E4E2', bold: true, background: 'rgba(111, 78, 55, 0.45)' }
        });
      }
    });
  } else {
    // For Dijkstra or Nearest Neighbour, highlight sequential segments
    const segmentPairs = [];
    for (let i = 0; i < pathStopIds.length - 1; i++) {
      segmentPairs.push([Number(pathStopIds[i]), Number(pathStopIds[i + 1])]);
    }

    networkData.edges.forEach(edge => {
      const from = Number(edge.from);
      const to = Number(edge.to);
      const inPath = segmentPairs.some(([u, v]) => (u === from && v === to) || (u === to && v === from));

      if (inPath) {
        updatedEdges.push({
          id: edge.id,
          color: { color: '#6F4E37', highlight: '#8D6346' },
          width: 5,
          font: { color: '#E6E0F0', bold: true, background: 'rgba(111, 78, 55, 0.55)' }
        });
      }
    });
  }

  networkData.edges.update(updatedEdges);

  // 4. Smoothly focus canvas view onto the path nodes
  if (pathStopIds.length > 0) {
    network.fit({
      nodes: pathStopIds,
      animation: { duration: 800, easingFunction: 'easeInOutQuad' }
    });
  }

  // 5. Also highlight on geographic map
  highlightPathOnGeoMap(pathStopIds, segments, isMst);
}

function resetGraphStyles() {
  if (!networkData.nodes || !networkData.edges) return;

  const resetNodes = rawNodes.map(n => ({
    id: n.id,
    color: n.color,
    size: n.size,
    font: n.font
  }));
  networkData.nodes.update(resetNodes);

  const resetEdges = rawEdges.map(e => ({
    id: e.id,
    color: e.color,
    width: 2,
    font: e.font
  }));
  networkData.edges.update(resetEdges);
}

function resetGraphView() {
  resetGraphStyles();
  if (network) {
    network.fit({ animation: { duration: 600 } });
  }
}

function zoomIn() {
  if (!network) return;
  const scale = network.getScale();
  network.moveTo({ scale: scale * 1.25, animation: { duration: 250 } });
}

function zoomOut() {
  if (!network) return;
  const scale = network.getScale();
  network.moveTo({ scale: scale * 0.8, animation: { duration: 250 } });
}

function fitGraph() {
  if (network) network.fit({ animation: { duration: 500 } });
}

function togglePhysics() {
  if (!network) return;
  physicsEnabled = !physicsEnabled;
  network.setOptions({ physics: { enabled: physicsEnabled } });
  const btn = document.getElementById('btn-physics');
  if (btn) btn.style.color = physicsEnabled ? 'var(--accent)' : 'var(--text-muted)';
}

/* ==========================================================================
   Real Geographic Map Controller (Leaflet + Google Maps Coordinates)
   ========================================================================== */
let currentCanvasMode = 'topology';
let geoMap = null;
let geoMapMarkers = [];
let geoMapEdgeLines = [];
let geoMapRouteLayer = null;

function setCanvasMode(mode) {
  currentCanvasMode = mode;
  const netCanvas = document.getElementById('network-canvas');
  const geoCanvas = document.getElementById('geomap-canvas');
  const btnTopology = document.getElementById('btn-mode-topology');
  const btnGeo = document.getElementById('btn-mode-geomap');
  const floatingControls = document.querySelector('.canvas-floating-controls');
  const legend = document.querySelector('.canvas-legend');

  if (mode === 'topology') {
    if (netCanvas) netCanvas.style.display = 'block';
    if (geoCanvas) geoCanvas.style.display = 'none';
    if (btnTopology) btnTopology.className = 'btn btn-sm btn-primary';
    if (btnGeo) btnGeo.className = 'btn btn-sm btn-secondary';
    if (floatingControls) floatingControls.style.display = 'flex';
    if (legend) legend.style.display = 'flex';
  } else {
    if (netCanvas) netCanvas.style.display = 'none';
    if (geoCanvas) geoCanvas.style.display = 'block';
    if (btnTopology) btnTopology.className = 'btn btn-sm btn-secondary';
    if (btnGeo) btnGeo.className = 'btn btn-sm btn-primary';
    if (floatingControls) floatingControls.style.display = 'none';
    if (legend) legend.style.display = 'none';

    initGeoMap();
    if (geoMap) {
      setTimeout(() => {
        geoMap.invalidateSize();
      }, 100);
    }
  }
}

function initGeoMap() {
  if (geoMap || typeof L === 'undefined') return;

  const container = document.getElementById('geomap-canvas');
  if (!container) return;

  // Center around College or Bangalore
  const college = rawNodes.find(n => n.is_college && n.latitude && n.longitude);
  const centerLat = college ? college.latitude : 12.9716;
  const centerLng = college ? college.longitude : 77.5946;

  geoMap = L.map('geomap-canvas', {
    zoomControl: true
  }).setView([centerLat, centerLng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors | Google Maps Coordinates'
  }).addTo(geoMap);

  // Plot road network edges
  rawEdges.forEach(e => {
    const u = rawNodes.find(n => n.id === e.from);
    const v = rawNodes.find(n => n.id === e.to);
    if (u && v && u.latitude && u.longitude && v.latitude && v.longitude) {
      const line = L.polyline([[u.latitude, u.longitude], [v.latitude, v.longitude]], {
        color: 'rgba(148, 163, 184, 0.45)',
        weight: 2,
        dashArray: '5, 5'
      }).addTo(geoMap);
      line.bindTooltip(`${e.distance} km`, { sticky: true });
      geoMapEdgeLines.push(line);
    }
  });

  // Plot stops
  const bounds = [];
  rawNodes.forEach(node => {
    if (!node.latitude || !node.longitude) return;
    bounds.push([node.latitude, node.longitude]);

    const isCollege = Boolean(node.is_college);
    const marker = L.circleMarker([node.latitude, node.longitude], {
      radius: isCollege ? 9 : 7,
      fillColor: isCollege ? '#6F4E37' : '#E6E0F0',
      color: isCollege ? '#E5E4E2' : '#6F4E37',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    }).addTo(geoMap);

    marker.bindPopup(`
      <div style="font-family: 'Inter', system-ui, sans-serif; color: #1F171A; padding: 0.25rem;">
        <strong style="font-size: 0.95rem; display: block; margin-bottom: 0.25rem; color: #6F4E37;">
          ${isCollege ? '👑 ' : '📍 '}${node.label}
        </strong>
        <div style="font-size: 0.75rem; color: #554448; font-family: monospace; margin-bottom: 0.5rem;">
          GPS: ${node.latitude}, ${node.longitude}
        </div>
        <a href="https://www.google.com/maps?q=${node.latitude},${node.longitude}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #6F4E37; color: #E5E4E2; padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.75rem; text-decoration: none; font-weight: 600;">
          🗺️ Open in Google Maps ↗
        </a>
      </div>
    `);

    geoMapMarkers.push(marker);
  });

  if (bounds.length > 0) {
    geoMap.fitBounds(bounds, { padding: [30, 30] });
  }
}

function highlightPathOnGeoMap(pathStopIds = [], segments = [], isMst = false) {
  if (!geoMap) {
    initGeoMap();
  }
  if (!geoMap) return;

  if (geoMapRouteLayer) {
    geoMap.removeLayer(geoMapRouteLayer);
    geoMapRouteLayer = null;
  }

  const routeGroup = L.featureGroup();

  if (isMst) {
    // MST edges
    segments.forEach(seg => {
      const u = rawNodes.find(n => n.id === seg.sourceId);
      const v = rawNodes.find(n => n.id === seg.destId);
      if (u && v && u.latitude && u.longitude && v.latitude && v.longitude) {
        L.polyline([[u.latitude, u.longitude], [v.latitude, v.longitude]], {
          color: '#E5E4E2',
          weight: 4,
          opacity: 0.95
        }).addTo(routeGroup);
      }
    });
  } else {
    // Sequential route path
    const coords = [];
    pathStopIds.forEach(id => {
      const node = rawNodes.find(n => n.id === Number(id));
      if (node && node.latitude && node.longitude) {
        coords.push([node.latitude, node.longitude]);
      }
    });

    if (coords.length > 1) {
      L.polyline(coords, {
        color: '#6F4E37',
        weight: 5,
        opacity: 0.95
      }).addTo(routeGroup);
    }
  }

  routeGroup.addTo(geoMap);
  geoMapRouteLayer = routeGroup;

  const bounds = routeGroup.getBounds();
  if (bounds && bounds.isValid()) {
    geoMap.fitBounds(bounds, { padding: [40, 40] });
  }
}

document.addEventListener('DOMContentLoaded', initNetworkGraph);

