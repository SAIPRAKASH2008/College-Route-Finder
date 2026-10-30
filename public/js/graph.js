/**
 * Vis.js Network Interactive Graph Visualizer & Route Highlighting
 */

let network = null;
let networkData = { nodes: null, edges: null };
let rawNodes = [];
let rawEdges = [];
let physicsEnabled = false;
let geoLayoutEnabled = false;
let highlightedNodeIds = new Set();
let highlightedEdgeIds = new Set();
let focusedNodeId = null;
let hoveredEdgeId = null;
let selectedEdgeIds = new Set();
let highlightedTourOrder = null;

const GRAPH_COLORS = {
  campus: '#f2c66d',
  stop: '#a9c5d8',
  path: '#37c6b0',
  dim: '#33414b',
  edge: 'rgba(177, 194, 205, 0.2)',
  dimEdge: 'rgba(148, 163, 184, 0.07)'
};

function isCoordinate(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function fullNodeName(node) {
  return String(node.name || node.label || `Stop ${node.id}`);
}

function escapeGraphHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function shortNodeLabel(name) {
  const words = name.length > 18 ? `${name.slice(0, 17).trimEnd()}…` : name;
  const breakAt = words.lastIndexOf(' ', 12);
  const splitAt = breakAt > 5 ? breakAt : (words.length > 12 ? 12 : -1);
  return splitAt > 0
    ? `${escapeGraphHtml(words.slice(0, splitAt))}<br>${escapeGraphHtml(words.slice(splitAt).trim())}`
    : escapeGraphHtml(words);
}

function nodeStyle(node, dimmed = false, order = null, highlighted = false) {
  const campus = Boolean(node.is_college);
  const background = dimmed
    ? GRAPH_COLORS.dim
    : (highlighted && !campus ? GRAPH_COLORS.path : (campus ? GRAPH_COLORS.campus : GRAPH_COLORS.stop));
  const border = dimmed ? '#53616a' : (highlighted ? '#e5fff9' : (campus ? '#fff1c8' : '#e5f2fa'));
  const label = order === null
    ? shortNodeLabel(fullNodeName(node))
    : `${order}. ${shortNodeLabel(fullNodeName(node))}`;

  return {
    label,
    title: fullNodeName(node),
    shape: campus ? 'hexagon' : 'dot',
    size: campus ? 25 : (highlighted ? 15 : 11),
    color: {
      background,
      border,
      highlight: { background: GRAPH_COLORS.path, border: '#e5fff9' },
      hover: { background: GRAPH_COLORS.path, border: '#e5fff9' }
    },
    borderWidth: campus ? 3 : 1.5,
    fixed: campus,
    font: {
      color: dimmed ? '#86939b' : '#eef4f7',
      size: 13,
      face: 'Inter, system-ui, sans-serif',
      bold: campus || order !== null,
      multi: 'html',
      background: 'rgba(12, 18, 24, 0.82)',
      strokeWidth: 0,
      vadjust: 14,
      align: 'center'
    },
    shadow: { enabled: !dimmed, color: 'rgba(0,0,0,0.35)', size: 7, x: 0, y: 3 }
  };
}

function nodeLabelWithConnections(node) {
  const connected = rawEdges
    .filter(edge => String(edge.from) === String(node.id) || String(edge.to) === String(node.id))
    .map(edge => {
      const otherId = String(edge.from) === String(node.id) ? edge.to : edge.from;
      const other = rawNodes.find(candidate => String(candidate.id) === String(otherId));
      return other ? `${fullNodeName(other)} (${edge.distance} km)` : null;
    })
    .filter(Boolean);

  return connected.length
    ? `${fullNodeName(node)}\nConnected roads:\n${connected.join('\n')}`
    : fullNodeName(node);
}

function edgeStyle(edge, dimmed = false, highlighted = false, showLabel = false) {
  return {
    label: showLabel ? String(edge.distanceLabel || `${edge.distance} km`) : '',
    title: `${edge.distance} km`,
    width: highlighted ? 4 : 1.5,
    color: {
      color: dimmed ? GRAPH_COLORS.dimEdge : (highlighted ? GRAPH_COLORS.path : GRAPH_COLORS.edge),
      highlight: GRAPH_COLORS.path,
      hover: GRAPH_COLORS.path
    },
    font: {
      align: 'horizontal',
      size: 12,
      color: '#e6f4f2',
      background: 'rgba(10, 20, 25, 0.9)',
      strokeWidth: 0
    },
    smooth: { enabled: false }
  };
}

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

    rawNodes = rawNodes.map(node => ({ ...node, ...nodeStyle(node) }));
    rawEdges = rawEdges.map(edge => ({ ...edge, ...edgeStyle(edge) }));

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
          gravitationalConstant: -130,
          centralGravity: 0.008,
          springLength: 230,
          springConstant: 0.035,
          damping: 0.62,
          avoidOverlap: 0.9
        },
        stabilization: { enabled: true, iterations: 500, fit: true }
      },
      interaction: {
        hover: true,
        dragNodes: true,
        zoomView: true,
        dragView: true,
        tooltipDelay: 250,
        hideEdgesOnDrag: true
      },
      nodes: { chosen: true },
      edges: { chosen: false },
      layout: { improvedLayout: true, randomSeed: 42 }
    };

    network = new vis.Network(container, networkData, options);
    const campus = rawNodes.find(node => node.is_college);
    if (campus) {
      network.moveNode(campus.id, 0, 0);
    }

    network.once('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
      physicsEnabled = false;
      updatePhysicsButton();
      network.fit({ animation: { duration: 450, easingFunction: 'easeInOutQuad' } });
    });

    network.on('hoverNode', ({ node }) => {
      const dataNode = rawNodes.find(candidate => String(candidate.id) === String(node));
      const title = dataNode ? nodeLabelWithConnections(dataNode) : '';
      if (title) networkData.nodes.update({ id: node, title });
    });
    network.on('blurNode', ({ node }) => {
      const dataNode = rawNodes.find(candidate => String(candidate.id) === String(node));
      if (dataNode) networkData.nodes.update({ id: node, title: fullNodeName(dataNode) });
    });
    network.on('hoverEdge', ({ edge }) => {
      hoveredEdgeId = edge;
      refreshGraphStyles();
    });
    network.on('blurEdge', () => {
      hoveredEdgeId = null;
      refreshGraphStyles();
    });
    network.on('selectEdge', ({ edges }) => {
      selectedEdgeIds = new Set(edges);
      refreshGraphStyles();
    });
    network.on('click', ({ nodes, edges }) => {
      if (nodes.length) {
        focusGraphNode(nodes[0]);
      } else if (edges.length) {
        selectedEdgeIds = new Set(edges);
        refreshGraphStyles();
      }
    });

    const search = document.getElementById('graph-search');
    const datalist = document.getElementById('graph-stop-options');
    if (search && datalist) {
      datalist.replaceChildren(...rawNodes.map(node => {
        const option = document.createElement('option');
        option.value = fullNodeName(node);
        return option;
      }));
      search.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          searchGraphStop();
        }
      });
    }

    const geoLayoutButton = document.getElementById('btn-geo-layout');
    if (geoLayoutButton) {
      geoLayoutButton.disabled = !rawNodes.some(node => isCoordinate(node.latitude) && isCoordinate(node.longitude));
    }

  } catch (err) {
    console.error('Error initializing network graph:', err);
  }
}

/**
 * Highlights computed path nodes and road edges on the canvas
 */
function highlightPathOnGraph(pathStopIds = [], segments = [], isMst = false, isTour = false) {
  if (!network || !networkData.nodes || !networkData.edges) return;

  highlightedNodeIds = new Set(pathStopIds.map(String));
  highlightedEdgeIds = new Set();
  selectedEdgeIds.clear();
  focusedNodeId = null;
  highlightedTourOrder = isTour ? pathStopIds : null;

  const pairs = segments.map(segment => [
    String(isMst ? segment.sourceId : (segment.fromId ?? segment.sourceId)),
    String(isMst ? segment.destId : (segment.toId ?? segment.destId))
  ]).filter(([from, to]) => from !== 'undefined' && to !== 'undefined');
  if (!isMst && pairs.length === 0) {
    for (let i = 0; i < pathStopIds.length - 1; i++) {
      pairs.push([String(pathStopIds[i]), String(pathStopIds[i + 1])]);
    }
  }

  rawEdges.forEach(edge => {
    if (pairs.some(([from, to]) =>
      (String(edge.from) === from && String(edge.to) === to) ||
      (String(edge.from) === to && String(edge.to) === from))) {
      highlightedEdgeIds.add(String(edge.id));
    }
  });
  refreshGraphStyles();

  if (pathStopIds.length > 0) {
    network.fit({
      nodes: pathStopIds,
      animation: { duration: 800, easingFunction: 'easeInOutQuad' }
    });
  }

  highlightPathOnGeoMap(pathStopIds, segments, isMst);
}

function refreshGraphStyles() {
  if (!networkData.nodes || !networkData.edges) return;

  const neighborIds = new Set();
  if (focusedNodeId !== null) {
    neighborIds.add(String(focusedNodeId));
    rawEdges.forEach(edge => {
      if (String(edge.from) === String(focusedNodeId)) neighborIds.add(String(edge.to));
      if (String(edge.to) === String(focusedNodeId)) neighborIds.add(String(edge.from));
    });
  }

  const dimView = focusedNodeId !== null || highlightedNodeIds.size > 0;
  const nodeUpdates = rawNodes.map(node => {
    const id = String(node.id);
    const inRoute = highlightedNodeIds.has(id);
    const inFocus = neighborIds.has(id);
    const dimmed = dimView && !(inRoute || inFocus);
    const order = highlightedTourOrder && highlightedNodeIds.has(id)
      ? highlightedTourOrder.map(String).indexOf(id) + 1
      : null;
    return {
      id: node.id,
      ...nodeStyle(node, dimmed, order, inRoute || String(focusedNodeId) === id)
    };
  });
  networkData.nodes.update(nodeUpdates);

  const edgeUpdates = rawEdges.map(edge => {
    const id = String(edge.id);
    const inRoute = highlightedEdgeIds.has(id);
    const inFocus = neighborIds.has(String(edge.from)) && neighborIds.has(String(edge.to));
    const dimmed = dimView && !(inRoute || inFocus);
    const selected = selectedEdgeIds.has(edge.id);
    return {
      id: edge.id,
      ...edgeStyle(edge, dimmed, inRoute, inRoute || selected || hoveredEdgeId === edge.id)
    };
  });
  networkData.edges.update(edgeUpdates);
}

function clearGraphHighlight() {
  highlightedNodeIds.clear();
  highlightedEdgeIds.clear();
  selectedEdgeIds.clear();
  focusedNodeId = null;
  highlightedTourOrder = null;
  refreshGraphStyles();
  if (geoMapRouteLayer && geoMap) {
    geoMap.removeLayer(geoMapRouteLayer);
    geoMapRouteLayer = null;
  }
}

function resetGraphView() {
  clearGraphHighlight();
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
  if (physicsEnabled) {
    network.once('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
      physicsEnabled = false;
      updatePhysicsButton();
    });
    network.stabilize(250);
  }
  updatePhysicsButton();
}

function updatePhysicsButton() {
  const btn = document.getElementById('btn-physics');
  if (btn) {
    btn.style.color = physicsEnabled ? 'var(--accent)' : 'var(--text-muted)';
    btn.title = physicsEnabled ? 'Stop layout simulation' : 'Run layout simulation';
    btn.setAttribute('aria-pressed', String(physicsEnabled));
  }
}

function focusGraphNode(nodeId) {
  focusedNodeId = nodeId;
  highlightedNodeIds.clear();
  highlightedEdgeIds.clear();
  selectedEdgeIds.clear();
  highlightedTourOrder = null;
  refreshGraphStyles();
  network.focus(nodeId, { scale: Math.max(network.getScale(), 1), animation: { duration: 450 } });
}

function searchGraphStop() {
  const input = document.getElementById('graph-search');
  if (!input || !network) return;
  const query = input.value.trim().toLocaleLowerCase();
  const node = rawNodes.find(candidate =>
    fullNodeName(candidate).toLocaleLowerCase() === query ||
    fullNodeName(candidate).toLocaleLowerCase().includes(query));
  if (!node) {
    input.setCustomValidity('No matching stop was found.');
    input.reportValidity();
    input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
    return;
  }
  input.setCustomValidity('');
  focusGraphNode(node.id);
}

function toggleGeoLayout() {
  if (!network) return;
  const nodesWithCoordinates = rawNodes.filter(node =>
    isCoordinate(node.latitude) && isCoordinate(node.longitude));
  if (!nodesWithCoordinates.length) return;

  geoLayoutEnabled = !geoLayoutEnabled;
  const campus = rawNodes.find(node => node.is_college);
  const centerLat = campus && isCoordinate(campus.latitude) ? Number(campus.latitude) : 0;
  const centerLng = campus && isCoordinate(campus.longitude) ? Number(campus.longitude) : 0;
  const scale = 9000;

  if (geoLayoutEnabled) {
    nodesWithCoordinates.forEach(node => {
      network.moveNode(node.id, (Number(node.longitude) - centerLng) * scale, (centerLat - Number(node.latitude)) * scale);
    });
  } else {
    arrangeGraphPositions();
  }

  const button = document.getElementById('btn-geo-layout');
  if (button) {
    button.setAttribute('aria-pressed', String(geoLayoutEnabled));
    button.textContent = geoLayoutEnabled ? '🌐 Geo layout: On' : '🌐 Geo layout';
  }
  network.fit({ animation: { duration: 500 } });
}

function arrangeGraphPositions() {
  if (!network || !rawNodes.length) return;
  const campus = rawNodes.find(node => node.is_college);
  const stops = rawNodes.filter(node => !node.is_college);
  if (campus) network.moveNode(campus.id, 0, 0);

  const radius = Math.max(420, stops.length * 28);
  stops.forEach((node, index) => {
    const angle = (2 * Math.PI * index / Math.max(stops.length, 1)) - Math.PI / 2;
    network.moveNode(node.id, Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function rearrangeGraph() {
  if (!network) return;
  clearGraphHighlight();
  geoLayoutEnabled = false;
  const geoButton = document.getElementById('btn-geo-layout');
  if (geoButton) {
    geoButton.setAttribute('aria-pressed', 'false');
    geoButton.textContent = '🌐 Geo layout';
  }
  arrangeGraphPositions();
  physicsEnabled = true;
  updatePhysicsButton();
  network.setOptions({
    physics: {
      enabled: true,
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -130,
        centralGravity: 0.008,
        springLength: 230,
        springConstant: 0.035,
        damping: 0.62,
        avoidOverlap: 0.9
      },
      stabilization: { enabled: true, iterations: 350, fit: true }
    }
  });
  network.once('stabilizationIterationsDone', () => {
    network.setOptions({ physics: { enabled: false } });
    physicsEnabled = false;
    updatePhysicsButton();
    network.fit({ animation: { duration: 450 } });
  });
  network.stabilize(350);
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
