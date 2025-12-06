// --- CONFIGURATION & CONSTANTS ---
// const MIN_LAT = 35.0405; 
// const MAX_LAT = 35.1445; 
// const MIN_LON = -106.6800; 
// const MAX_LON = -106.5123; 

const MIN_LAT = 35.071352;
const MAX_LAT = 35.148002;
const MIN_LON = -106.721807;
const MAX_LON = -106.504432;


const CENTER_LAT = (MIN_LAT + MAX_LAT) / 2;
const CENTER_LON = (MIN_LON + MAX_LON) / 2;

// Road speeds in mph (approximate)
const SPEEDS = {
  'motorway': 30, 'trunk': 25, 'primary': 20, 'secondary': 15,
  'tertiary': 12, 'residential': 8, 'service': 5
};

// --- GLOBAL STATE ---
const state = {
  nodes: {}, 
  residentialNodes: [], 
  commercialNodes: [],
  agents: [], 
  queue: [], // Pathfinding queue
  
  // Simulation Settings
  multiplier: 100,       // Time speed multiplier
  algorithm: 'astar',    // Current pathfinding strategy
  
  // Features
  sharedDeparture: true, // If true, agents wait for batch release
  trafficEffect: 1,      // Percentage slowdown per neighbor (1%)
  cycling: false,         // <-- FIXED: Starts OFF, enabled only after load
  showPaths: true,       // Toggle visual path lines
  
  // Batch Settings
  autoBatch: true,       // <-- DEFAULT: ON
  batchSize: 50,         
  
  // Statistics Tracking
  stats: {
    totalPathCount: 0,
    accumulatedCalcTime: 0,
    accumulatedTripTime: 0
  },
  
  // Run History (Snapshotting stats)
  history: [],
  viewIndex: -1
};


// --- UI COLLAPSE CONTROL ---

function togglePanel() {
    const panel = document.getElementById('ui-panel');
    
    // Toggle the 'collapsed' class
    panel.classList.toggle('collapsed');

    // Optionally, save the state to localStorage if you want it to persist
    const isCollapsed = panel.classList.contains('collapsed');
    localStorage.setItem('panelCollapsed', isCollapsed);
}

// Check local storage on page load to restore state (optional)
document.addEventListener('DOMContentLoaded', () => {
    // Get the panel element after the DOM is ready
    const panel = document.getElementById('ui-panel');

    // Check if a saved state exists
    const savedState = localStorage.getItem('panelCollapsed');
    
    // If the saved state is 'true', apply the collapsed class
    if (savedState === 'true' && panel) {
        panel.classList.add('collapsed');
    }
});

// --- HISTORY & STATS SYSTEM ---

function updateHistoryUI() {
  const label = document.getElementById('hist-label');
  const prevBtn = document.getElementById('hist-prev');
  const nextBtn = document.getElementById('hist-next');

  prevBtn.disabled = state.history.length === 0 || state.viewIndex === 0;
  nextBtn.disabled = state.viewIndex === -1;

  if (state.viewIndex === -1) {
    label.innerText = "LIVE RUN (" + state.algorithm.toUpperCase() + ")";
    label.classList.add('live');
    updateStatsDisplay(state.stats); 
  } else {
    const run = state.history[state.viewIndex];
    label.innerText = `RUN ${state.viewIndex + 1}: ${run.algo.toUpperCase()}`;
    label.classList.remove('live');
    updateStatsDisplay(run.stats);
  }
}

function changeHistory(dir) {
  if (state.viewIndex === -1 && dir === -1) {
    if (state.history.length > 0) state.viewIndex = state.history.length - 1;
  } else {
    state.viewIndex += dir;
  }
  // Clamp index (-1 is Live)
  if (state.viewIndex >= state.history.length) state.viewIndex = -1; 
  if (state.viewIndex < -1) state.viewIndex = -1;

  updateHistoryUI();
}

function saveCurrentRun() {
  if (state.stats.totalPathCount > 0) {
    state.history.push({
      algo: state.algorithm,
      stats: { ...state.stats } 
    });
  }
}

function updateStatsDisplay(statsData) {
  if (statsData.totalPathCount > 0) {
      const avgCalc = statsData.accumulatedCalcTime / statsData.totalPathCount;
      const avgTrip = (statsData.accumulatedTripTime / statsData.totalPathCount) / 60; // Convert to Minutes
      
      document.getElementById('stat-calc').innerText = avgCalc.toFixed(2) + " ms";
      document.getElementById('stat-trip').innerText = avgTrip.toFixed(0) + " min";
  } else {
      document.getElementById('stat-calc').innerText = "0.00 ms";
      document.getElementById('stat-trip').innerText = "0 min";
  }
}

// --- ALGORITHM SWITCHING ---

function setAlgorithm(algoName) {
  saveCurrentRun(); // Save previous stats before switching
  state.algorithm = algoName;
  
  // Reset Stats for new run
  state.stats.totalPathCount = 0;
  state.stats.accumulatedCalcTime = 0;
  state.stats.accumulatedTripTime = 0;
  state.viewIndex = -1;

  const algoText = document.querySelector(`#algo-select option[value="${algoName}"]`).innerText;
  document.getElementById('collapsed-label').innerText = "Algo: " + algoText.split('(')[0].trim();
  
  // console.log("Algorithm switched to:", algoName);
  updateHistoryUI();

  // Force recalculation by clearing cache
  state.agents.forEach(a => {
    a.cachedPath = null;
    // Wake up idling agents if in Cycle mode
    if (state.cycling && !a.state.includes('MOVING') && !a.state.includes('FLASH') && !a.state.includes('READY')) {
        a.state = 'QUEUED';
        a.target = (a.target === 'WORK') ? 'HOME' : 'WORK';
        state.queue.push(a);
    }
  });
}

// --- UI CONTROLS ---

function toggleSharedDeparture(isChecked) {
  state.sharedDeparture = isChecked;
  const autoReleaseCheck = document.getElementById('auto-release-check');

  if (!isChecked) {
    // Dependency Logic: If Shared Departure is OFF, disable Auto-Release.
    state.autoBatch = false;
    if (autoReleaseCheck) {
        autoReleaseCheck.checked = false;
        autoReleaseCheck.disabled = true; 
    }
    
    // Release any agents waiting in the READY state (non-shared departure)
    state.agents.forEach(a => {
      if (a.state === 'READY') {
        a.state = 'FLASHING';
        a.flashTimer = 1.0;
      }
    });
  } else {
    // Re-enable the Auto-Release checkbox
    if (autoReleaseCheck) {
        autoReleaseCheck.disabled = false;
    }
  }
}

function toggleShowPaths(isChecked) { state.showPaths = isChecked; }

function toggleAutoBatch(isChecked) {
  state.autoBatch = isChecked;
}

function setBatchSize(val) { state.batchSize = Math.max(1, parseInt(val)); }

function releaseBatch() {
  let releasedCount = 0;
  state.agents.forEach(a => {
    if (a.state === 'READY') {
      a.state = 'FLASHING';
      releasedCount++;
    }
  });
  // if (releasedCount > 0) console.log(`Batch Release: ${releasedCount} agents.`);
}

// Cycle Mode: Infinite Loop
function kickstartCycle() {
    // console.log("Kicking off cycle...");
    state.agents.forEach(a => {
      // Find idle agents
      if (!a.state.includes('MOVING') && !a.state.includes('FLASH') && !a.state.includes('READY')) {
        // Stagger start times
        setTimeout(() => {
           if (!a.state.includes('MOVING')) {
               a.state = 'QUEUED'; 
               a.target = (Math.random() > 0.5) ? 'WORK' : 'HOME';
               state.queue.push(a);
           }
        }, Math.random() * 2000); // Wait up to 2 seconds
      }
    });
}

function toggleCycle() {
  state.cycling = !state.cycling;
  const btn = document.getElementById('btn-cycle');
  
  if (state.cycling) {
    btn.innerText = "Cycle: ON";
    btn.classList.add('active');
    kickstartCycle();
  } else {
    btn.innerText = "Cycle: OFF";
    btn.classList.remove('active');
  }
}

function updateTraffic(val) {
  state.trafficEffect = parseFloat(val);
  document.getElementById('traffic-val').innerText = state.trafficEffect + "%";
}

function toggleModal() {
  const m = document.getElementById('info-modal');
  m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
}

function setSpeed(mult) {
  state.multiplier = mult;
  document.querySelectorAll('.btn').forEach(b => {
    if(b.onclick && b.onclick.toString().includes('setSpeed')) {
        b.classList.toggle('active', b.innerText.includes(mult >= 1000 ? '1k' : mult + 'x'));
    }
  });
}

function forceCommute(target) {
  state.agents.forEach(a => {
    if (target === 'WORK' && a.state === 'HOME') {
      a.state = 'QUEUED'; a.target = 'WORK'; state.queue.push(a);
    } else if (target === 'HOME' && a.state === 'WORK') {
      a.state = 'QUEUED'; a.target = 'HOME'; state.queue.push(a);
    }
  });
}

// --- MAP INIT ---

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [CENTER_LON, CENTER_LAT], 
  zoom: 12.0, 
  pitch: 0, 
  bearing: 0, 
  dragRotate: false, 
  minZoom: 11,
  maxBounds: [[MIN_LON, MIN_LAT], [MAX_LON, MAX_LAT]]
});

// Canvas Setup
const canvas = document.getElementById('car-canvas');
const heatCanvas = document.getElementById('heatmap-canvas');
const ctx = canvas.getContext('2d');
const hCtx = heatCanvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  heatCanvas.width = canvas.width;
  heatCanvas.height = canvas.height;
  ctx.scale(dpr, dpr);
  hCtx.scale(dpr, dpr);
}
window.addEventListener('resize', resize);
resize();

// --- DATA LOADER ---

// FIX: Increased timeout to ensure the progress bar update is visually rendered
function updateLoadStatus(text, percent) {
  const textEl = document.getElementById('loading-text');
  const barEl = document.getElementById('loading-bar');
  if(textEl) textEl.innerText = text;
  if(barEl) barEl.style.width = percent + '%';
  return new Promise(resolve => setTimeout(resolve, 50)); // Guarantees 50ms display time
}

// Named function for initialization logic
const initializeSimulation = async () => {
  await updateLoadStatus("Connecting to Overpass API...", 10);
  
  const bbox = `${MIN_LAT},${MIN_LON},${MAX_LAT},${MAX_LON}`;
  // Fetch Roads and Landuse Polygons
  const query = `[out:json][timeout:25];(
    way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service"](${bbox});
    way["landuse"~"residential|commercial|retail|industrial"](${bbox});
    relation["landuse"~"residential|commercial|retail|industrial"](${bbox});
  );out body;>;out skel qt;`;

  try {
    await updateLoadStatus("Downloading Map Data...", 25);
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) });
    const data = await res.json();
    await processGraph(data);
  } catch (err) { 
    console.error(err);
    document.getElementById('loading-text').innerText = "Load Error. Check Console."; 
    document.getElementById('loading-bar').style.backgroundColor = "#ff0000";
  }
};

// Fix: Attach listener OR run immediately to prevent the loading bar race condition.
if (map.loaded()) {
    initializeSimulation();
} else {
    map.on('load', initializeSimulation);
}


async function processGraph(osm) {
  await updateLoadStatus(`Parsing ${osm.elements.length} OSM Elements...`, 40);

  const tempNodes = {};
  const polygons = [];
  
  // 1. Parse Nodes
  let nodeCount = 0;
  osm.elements.forEach(el => { 
      if (el.type === 'node') {
          tempNodes[el.id] = [el.lon, el.lat]; 
          nodeCount++;
      }
  });
  await updateLoadStatus(`Mapped ${nodeCount} Coordinate Nodes...`, 55);
  
  // 🚨 FIXED: Yield to allow progress bar to update before building graph
  await new Promise(r => setTimeout(r, 0)); 

  // 2. Build Graph & Zones
  let wayCount = 0;
  let zoneCount = 0;

  osm.elements.forEach(el => {
    if (el.type === 'way' && el.nodes) {
      // Landuse Zones
      if (el.tags && el.tags.landuse) {
        const polyNodes = el.nodes.map(n => tempNodes[n]).filter(n => n);
        if (polyNodes.length > 2) {
            polygons.push({ type: el.tags.landuse, geometry: polyNodes });
            zoneCount++;
        }
      }
      // Roads
      if (el.tags && el.tags.highway) {
        const speed = SPEEDS[el.tags.highway] || 10;
        wayCount++;
        for (let i=0; i<el.nodes.length-1; i++) {
          const u = el.nodes[i]; const v = el.nodes[i+1];
          if (!tempNodes[u] || !tempNodes[v]) continue;
          
          const p1 = tempNodes[u]; const p2 = tempNodes[v];
          // Calc Distance
          const dx = p1[0] - p2[0]; const dy = p1[1] - p2[1];
          const distDeg = Math.sqrt(dx*dx + dy*dy);
          const distMeters = distDeg * 111000; 

          addNode(u, tempNodes[u]); addNode(v, tempNodes[v]);
          
          // Cost = Distance / Speed (Time)
          state.nodes[u].neighbors.push({ id: v, cost: distMeters/speed, dist: distMeters, speed: speed });
          state.nodes[v].neighbors.push({ id: u, cost: distMeters/speed, dist: distMeters, speed: speed });
        }
      }
    }
  });

  await updateLoadStatus(`Built Network: ${wayCount} Roads, ${zoneCount} Zones...`, 75);

  const nodeKeys = Object.keys(state.nodes);
  if (nodeKeys.length === 0) return;

  // 3. Classify Nodes (Spatial Check against Zones)
  await updateLoadStatus("Classifying Residential vs Commercial (slow)...", 85);
  
  // Collect all unique candidate nodes
  let resCandidates = [];
  let comCandidates = [];

  const chunkSize = 500;
  for (let i = 0; i < nodeKeys.length; i += chunkSize) {
      const chunk = nodeKeys.slice(i, i + chunkSize);
      chunk.forEach(k => {
          const node = state.nodes[k];
          const pt = [node.x, node.y];
          let isRes = false;
          let isCom = false;

          for (let poly of polygons) {
              if (isPointInPoly(pt, poly.geometry)) {
                  if (poly.type === 'residential') isRes = true;
                  if (poly.type === 'commercial' || poly.type === 'retail' || poly.type === 'industrial') isCom = true;
              }
          }

          if (isRes) resCandidates.push(k);
          if (isCom) comCandidates.push(k);
      });
      // 🚨 FIXED: Yield after processing a chunk to allow UI update
      await new Promise(r => setTimeout(r, 0));
  }
  
  // --- SPATIAL SUBSAMPLING: Limit density hotspots (like cul-de-sacs) ---
  const MAX_CANDIDATE_NODES = 5000;

  function shuffleAndSample(arr, max) {
      if (arr.length <= max) return arr;
      // Simple partial Fisher-Yates shuffle
      for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.slice(0, max);
  }

  resCandidates = shuffleAndSample(resCandidates, MAX_CANDIDATE_NODES);
  comCandidates = shuffleAndSample(comCandidates, MAX_CANDIDATE_NODES);
  
  // Reset arrays
  state.residentialNodes = [];
  state.commercialNodes = [];

  // --- FINAL WEIGHTING (Repeating the entire array to maintain uniform density) ---
  const RESIDENTIAL_WEIGHT = 15;
  const COMMERCIAL_WEIGHT = 20;

  // Add the base nodes (weight = 1)
  state.residentialNodes.push(...resCandidates);
  state.commercialNodes.push(...comCandidates);
  
  // Add weighted copies of the entire list (for a total weight of 15x or 20x)
  for (let j = 0; j < RESIDENTIAL_WEIGHT - 1; j++) {
      state.residentialNodes.push(...resCandidates);
  }
  for (let j = 0; j < COMMERCIAL_WEIGHT - 1; j++) {
      state.commercialNodes.push(...comCandidates);
  }
  
  // 4. Final Render & Init
  await updateLoadStatus("Rendering Layers...", 90);
  addZoneLayers(polygons); 
  
  await updateLoadStatus("Generating 1000 Agents...", 95);
  initAgents(1000);
  
  await updateLoadStatus("Simulation Ready.", 100);
  
  const loadingEl = document.getElementById('loading');
  loadingEl.classList.add('hidden'); 
  setTimeout(() => loadingEl.style.display = 'none', 500);

  state.cycling = true; 
  document.getElementById('btn-cycle').innerText = "Cycle: ON";
  document.getElementById('btn-cycle').classList.add('active');
  kickstartCycle();

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function addZoneLayers(polygons) {
  const geojson = { 
    type: 'FeatureCollection', 
    features: polygons.map(p => ({ 
      type: 'Feature', 
      properties: { type: p.type }, 
      geometry: { type: 'Polygon', coordinates: [p.geometry] } 
    })) 
  };
  
  if (map.getSource('zones')) map.removeSource('zones');
  
  map.addSource('zones', { type: 'geojson', data: geojson });
  map.addLayer({
    id: 'zones-fill', type: 'fill', source: 'zones',
    paint: { 
      'fill-color': [
        'match', ['get', 'type'], 
        'residential', 'rgba(76, 175, 80, 0.2)', 
        'commercial', 'rgba(33, 150, 243, 0.3)', 
        'retail', 'rgba(33, 150, 243, 0.3)', 
        'industrial', 'rgba(255, 152, 0, 0.2)', 
        'rgba(0,0,0,0)'
      ], 
      'fill-outline-color': 'rgba(255,255,255,0.1)' 
    }
  }, 'watername_ocean');
}

function isPointInPoly(pt, poly) {
  let x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    let xi = poly[i][0], yi = poly[i][1];
    let xj = poly[j][0], yj = poly[j][1];
    let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function addNode(id, coords) {
  if (!state.nodes[id]) state.nodes[id] = { id: id, x: coords[0], y: coords[1], neighbors: [] };
}

function initAgents(count) {
  state.agents = [];
  state.queue = [];
  
  if (state.residentialNodes.length === 0) return;

  for(let i=0; i<count; i++) {
    const home = state.residentialNodes[Math.floor(Math.random() * state.residentialNodes.length)];
    const work = state.commercialNodes[Math.floor(Math.random() * state.commercialNodes.length)];
    
    // Assign Personality Colors
    // Work: Blue/Cyan range
    const workBaseHue = 180 + Math.random() * 60; 
    // Home: Green range
    const homeBaseHue = 80 + Math.random() * 70;

    state.agents.push({
      id: i, home, work, current: home, 
      path: [], 
      cachedPath: null, // Optimization cache
      totalPathDist: 0,
      travelDist: 0,
      state: 'HOME', // HOME, QUEUED, READY, FLASHING, MOVING_WORK, WORK, MOVING_HOME
      flashTimer: 0, 
      failCount: 0,
      
      workBaseHue, 
      homeBaseHue, 
      speedMod: 1.0,

      pos: { x: state.nodes[home].x, y: state.nodes[home].y }
    });
  }
}

// --- MAIN SIMULATION LOOP ---

let lastTime = 0;

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  const safeDt = Math.min(dt, 0.1); // Cap dt to prevent jumps on lag

  updateAgents(safeDt);
  render();
  requestAnimationFrame(loop);
}

// Reverse path utility for "Home" trips reusing cache
function reversePath(originalPath) {
  if (!originalPath || originalPath.length === 0) return [];
  
  const nodes = [...originalPath].reverse();
  const newPath = [];
  
  newPath.push({ 
    id: nodes[0].id, 
    distAtEnd: 0, 
    speed: nodes[0].speed 
  });

  let totalDist = 0;

  for (let i = 0; i < nodes.length - 1; i++) {
    const u = state.nodes[nodes[i].id];
    const v = state.nodes[nodes[i+1].id];
    
    const dx = u.x - v.x;
    const dy = u.y - v.y;
    const dist = Math.sqrt(dx*dx + dy*dy) * 111000; 
    
    totalDist += dist;
    const speed = nodes[i+1].speed || 10; 

    newPath.push({
      id: v.id,
      distAtEnd: totalDist,
      speed: speed
    });
  }
  return newPath;
}

function updateAgents(dt) {
  const startTime = performance.now();
  const TIME_BUDGET_MS = 5; // Max time to spend pathfinding per frame

  // 1. PATHFINDING PROCESSING (Time-Sliced)
  while (state.queue.length > 0 && (performance.now() - startTime < TIME_BUDGET_MS)) {
    const agent = state.queue.shift();
    const dest = (agent.target === 'WORK') ? agent.work : agent.home;
    const detailedDebug = state.agents.length <= 10;
    
    const result = Pathfinder.findPath(agent.current, dest, detailedDebug);
    
    if (result) {
      // Success
      agent.path = result.path; 
      agent.cachedPath = result.path; 
      
      agent.totalPathDist = result.totalDist;
      agent.travelDist = 0;
      agent.pathIdx = 0; 
      agent.failCount = 0;

      // Debug Tendrils
      if (detailedDebug && result.visited) agent.thoughtCloud = result.visited;
      else agent.thoughtCloud = null;

      // Stats Update
      state.stats.totalPathCount++;
      state.stats.accumulatedCalcTime += result.calcTime;
      state.stats.accumulatedTripTime += result.totalTime;

      // Transition to Departure Waiting
      if (state.sharedDeparture) {
        agent.state = 'READY'; 
        agent.flashTimer = 1.0; 
      } else {
        agent.state = 'FLASHING';
        agent.flashTimer = 1.0;
      }
    } else {
      // Failure (Island or Disconnect)
      agent.failCount++;
      if (agent.failCount < 5) {
        // Retry with new destination
        if (agent.target === 'WORK') agent.work = state.commercialNodes[Math.floor(Math.random() * state.commercialNodes.length)];
        else agent.home = state.residentialNodes[Math.floor(Math.random() * state.residentialNodes.length)];
        state.queue.push(agent); 
      } else {
        // Give up
        agent.current = agent.home; 
        agent.failCount = 0;
        agent.state = 'HOME'; 
      }
    }
  }

  // 2. BATCH RELEASE LOGIC
  let readyCount = 0;
  if (state.sharedDeparture) {
      readyCount = state.agents.filter(a => a.state === 'READY').length;
      
      // Auto-Batch Trigger
      if (state.autoBatch && readyCount >= state.batchSize) {
          releaseBatch();
          readyCount = 0; 
      }
      // Fallback: If Queue is empty, release remainder
      if (state.queue.length === 0 && readyCount > 0) {
          state.agents.forEach(a => { if (a.state === 'READY') a.state = 'FLASHING'; });
          readyCount = 0;
      }
  }

  // 3. UI UPDATES
  const counterEl = document.getElementById('shared-counter');
  if (counterEl) {
      if (state.sharedDeparture) {
        const totalBatch = readyCount + state.queue.length;
        counterEl.innerText = totalBatch > 0 ? `(${readyCount} / ${totalBatch})` : "";
      } else {
        counterEl.innerText = "";
      }
  }
  
  // Live Stats Update
  if (state.viewIndex === -1) {
    updateStatsDisplay(state.stats);
  }

  // 4. TRAFFIC PHYSICS (SPATIAL HASHING)
  const trafficMap = new Map();
  const GRID_CELL = 0.0015; // Grid size roughly 150m

  if (state.trafficEffect > 0) {
    state.agents.forEach(a => {
      if (a.state.includes('MOVING')) {
        const gx = Math.floor(a.pos.x / GRID_CELL);
        const gy = Math.floor(a.pos.y / GRID_CELL);
        const key = `${gx},${gy}`;
        trafficMap.set(key, (trafficMap.get(key) || 0) + 1);
      }
    });
  }

  let movingCount = 0;

  // 5. AGENT MOVEMENT
  state.agents.forEach(a => {
    
    if (a.state === 'READY') return; 

    // Handle Flashing Animation before moving
    if (a.state === 'FLASHING') {
      a.flashTimer -= dt; 
      if (a.flashTimer <= 0) {
        a.state = (a.target === 'WORK') ? 'MOVING_WORK' : 'MOVING_HOME';
        a.thoughtCloud = null; 
      }
      return; 
    }

    if (!a.state.includes('MOVING')) return;
    movingCount++;
    
    // Check Arrival
    if (a.pathIdx >= a.path.length - 1) {
       a.current = a.path[a.path.length-1].id;
       a.state = (a.state === 'MOVING_WORK') ? 'WORK' : 'HOME';
       
       // Cycle Mode Logic
       if (state.cycling) {
           const isDebug = state.agents.length <= 10;
           
           if (isDebug) {
               // Debug: Force Recalc
               a.target = (a.target === 'WORK') ? 'HOME' : 'WORK';
               a.state = 'QUEUED';
               a.cachedPath = null;
               state.queue.push(a);
           } else if (a.cachedPath) {
               // Optimized: Reuse Cache for immediate return trip
               a.target = (a.target === 'WORK') ? 'HOME' : 'WORK'; 
               a.path = reversePath(a.cachedPath); 
               a.cachedPath = a.path; 
               a.totalPathDist = a.path[a.path.length-1].distAtEnd;
               a.travelDist = 0;
               a.pathIdx = 0;
               a.state = (a.target === 'WORK') ? 'MOVING_WORK' : 'MOVING_HOME';
           } else {
               // Fallback: No cache, force recalc
               a.target = (a.target === 'WORK') ? 'HOME' : 'WORK';
               a.state = 'QUEUED';
               state.queue.push(a);
           }
       }
       return;
    }

    const currentSeg = a.path[a.pathIdx+1]; 
    
    // Apply Traffic Penalty
    let targetSpeed = 1.0;
    if (state.trafficEffect > 0) {
        const gx = Math.floor(a.pos.x / GRID_CELL);
        const gy = Math.floor(a.pos.y / GRID_CELL);
        const key = `${gx},${gy}`;
        const neighbors = trafficMap.get(key) || 1;
        
        if (neighbors > 1) {
            // Formula: 1.0 - (Neighbors * Effect%)
            const penalty = (neighbors - 1) * (state.trafficEffect / 100);
            targetSpeed = Math.max(0.1, 1.0 - penalty); // Min speed 10%
        }
    }
    
    // Inertia: Smooth speed changes
    a.speedMod = (a.speedMod * 0.95) + (targetSpeed * 0.05);

    // Calc Distance Delta
    const moveDist = currentSeg.speed * a.speedMod * state.multiplier * dt;
    a.travelDist += moveDist;

    // Advance Path Index
    while (a.pathIdx < a.path.length - 1 && a.travelDist >= a.path[a.pathIdx+1].distAtEnd) {
      a.pathIdx++;
    }

    // Interpolate Position
    if (a.pathIdx >= a.path.length - 1) {
      a.current = a.path[a.path.length-1].id;
    } else {
        const nodeA = state.nodes[a.path[a.pathIdx].id];
        const nodeB = state.nodes[a.path[a.pathIdx+1].id];
        
        const startDist = a.path[a.pathIdx].distAtEnd;
        const endDist = a.path[a.pathIdx+1].distAtEnd;
        const segLen = endDist - startDist;
        
        const t = (a.travelDist - startDist) / segLen;
        
        a.pos.x = nodeA.x + (nodeB.x - nodeA.x) * t;
        a.pos.y = nodeA.y + (nodeB.y - nodeA.y) * t;
    }
  });

  document.getElementById('stat-moving').innerText = movingCount;
  document.getElementById('queue-bar').style.width = Math.min(100, (state.queue.length/50)*100) + '%';
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
}

// --- RENDERER ---

function render() {
  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  ctx.clearRect(0, 0, w, h);
  hCtx.clearRect(0, 0, w, h);
  const transform = map.transform;

  // 1. GRID HEATMAP (Background Layer)
  const gridSize = 40; 
  const grid = new Map(); 

  state.agents.forEach(a => {
    const p = transform.locationPoint({lng: a.pos.x, lat: a.pos.y});
    if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) return;
    const gx = Math.floor(p.x / gridSize);
    const gy = Math.floor(p.y / gridSize);
    const key = `${gx},${gy}`;
    grid.set(key, (grid.get(key) || 0) + 1);
  });

  hCtx.globalCompositeOperation = 'lighter';
  for (let [key, count] of grid) {
    const [gx, gy] = key.split(',').map(Number);
    const cx = gx * gridSize + gridSize/2;
    const cy = gy * gridSize + gridSize/2;
    const alpha = Math.min(0.6, count * 0.05);
    const rad = hCtx.createRadialGradient(cx, cy, 0, cx, cy, gridSize * 1.5);
    rad.addColorStop(0, `rgba(0, 229, 255, ${alpha})`); 
    rad.addColorStop(0.5, `rgba(33, 150, 243, ${alpha * 0.5})`); 
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    hCtx.fillStyle = rad;
    hCtx.beginPath();
    hCtx.arc(cx, cy, gridSize * 1.5, 0, Math.PI*2);
    hCtx.fill();
  }
  hCtx.globalCompositeOperation = 'source-over';

  // 2. THOUGHT TENDRILS (Debug Layer)
  ctx.beginPath();
  ctx.strokeStyle = '#FFC107'; 
  ctx.lineWidth = 1.5; 

  state.agents.forEach(a => {
    if (a.state === 'FLASHING' && a.thoughtCloud && a.thoughtCloud.length > 0) {
       const progress = Math.min(1.0, 1.0 - Math.max(0, a.flashTimer));
       const totalNodes = a.thoughtCloud.length;
       const countToDraw = Math.floor(totalNodes * progress);
       
       for(let i = 0; i < countToDraw; i++) {
         const data = a.thoughtCloud[i]; 
         if(!data.parent) continue; 
         const node = state.nodes[data.id];
         const parent = state.nodes[data.parent];
         if(!node || !parent) continue;
         const pNode = transform.locationPoint({lng: node.x, lat: node.y});
         const pParent = transform.locationPoint({lng: parent.x, lat: parent.y});
         if ((pNode.x < 0 && pParent.x < 0) || (pNode.x > w && pParent.x > w)) continue;
         ctx.moveTo(pParent.x, pParent.y);
         ctx.lineTo(pNode.x, pNode.y);
       }
    }
  });
  ctx.stroke(); 

  // 3. PATH LINES (Cyan/Green)
  if (state.showPaths) {
      const isDebug = state.agents.length <= 10;
      let workEndPoints = []; 
      let homeEndPoints = [];
      ctx.beginPath();
      
      // Draw Paths
      state.agents.forEach(a => {
         const movingWork = (a.target === 'WORK');
         const shouldDraw = (a.state === 'FLASHING') || (isDebug && a.state.includes('MOVING'));
         
         if (shouldDraw && a.path.length > 0) {
             const startIdx = a.state.includes('MOVING') ? a.pathIdx : 0;
             for(let i=startIdx; i<a.path.length; i++) { 
               const n = state.nodes[a.path[i].id];
               const p = transform.locationPoint({lng: n.x, lat: n.y});
               if (i===startIdx) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
             }
             
             // Collect Endpoints for Stars
             const lastN = state.nodes[a.path[a.path.length-1].id];
             const lastP = transform.locationPoint({lng: lastN.x, lat: lastN.y});
             if (movingWork) workEndPoints.push(lastP); else homeEndPoints.push(lastP);
         }
      });
      
      // Stroke Work Paths
      ctx.strokeStyle = "rgba(0, 229, 255, 0.8)"; 
      ctx.shadowColor = "rgba(0, 229, 255, 1.0)"; 
      ctx.shadowBlur = 10; 
      ctx.lineWidth = 2;
      ctx.stroke(); 

      // Render Stars
      ctx.shadowBlur = 0; 
      ctx.fillStyle = "#bfdcffff";
      workEndPoints.forEach(p => drawStar(ctx, p.x, p.y, 5, 6, 3));

      ctx.fillStyle = "#e6ffe4ff";
      homeEndPoints.forEach(p => drawStar(ctx, p.x, p.y, 5, 6, 3));
  }

  // 4. AGENTS (Cars)
  ctx.lineWidth = 2;
  state.agents.forEach(a => {
    const p = transform.locationPoint({lng: a.pos.x, lat: a.pos.y});
    if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) return;

    ctx.beginPath();
    
    // MOVING
    if (a.state.includes('MOVING')) {
      ctx.globalAlpha = 1.0;
      ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
      
      let finalHue;
      const trafficThreshold = 0.90;

      if (a.speedMod < trafficThreshold) {
          // TRAFFIC: Fade from Orange (30) to Red (0)
          finalHue = 30 * (a.speedMod / trafficThreshold);
          if(finalHue < 0) finalHue = 0;
      } else {
          // SMOOTH: Personality Color
          finalHue = (a.state === 'MOVING_WORK') ? a.workBaseHue : a.homeBaseHue;
      }
      
      const color = `hsl(${finalHue}, 100%, 50%)`;
      ctx.fillStyle = color; 
      ctx.shadowBlur = 4; 
      ctx.shadowColor = color;
      ctx.fill();

    } else if (a.state === 'FLASHING') {
      ctx.globalAlpha = Math.max(0, a.flashTimer);
      ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = '#FFF'; ctx.shadowBlur = 5; ctx.shadowColor = '#FFF';
      ctx.fill();
    } else if (a.state === 'READY') {
      ctx.globalAlpha = 0.8;
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2);
      ctx.fillStyle = '#FFF'; ctx.shadowBlur = 5; ctx.shadowColor = '#FFF';
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.5;
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2);
      ctx.shadowBlur = 4;
      const hue = (a.state === 'HOME' || a.state === 'QUEUED') ? a.homeBaseHue : a.workBaseHue;
      const color = `hsl(${hue}, 80%, 35%)`; 
      ctx.shadowColor = color;
      ctx.fillStyle = color; 
      ctx.fill();
    }
  });
  ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
}

// --- POP SLIDER UTILS ---
// Logarithmic slider to allow fine control at low pops
function getPopFromSlider(val) {
  if (val <= 333) {
    return Math.max(1, Math.floor(1 + (val / 333) * 9));
  } else {
    return Math.floor(11 + ((val - 333) / 2667) * 2989);
  }
}

const agentSlider = document.getElementById('agent-slider');
agentSlider.addEventListener('input', (e) => {
  const pop = getPopFromSlider(parseInt(e.target.value));
  document.getElementById('pop-val').innerText = pop;
});
agentSlider.addEventListener('change', (e) => {
  const pop = getPopFromSlider(parseInt(e.target.value));
  initAgents(pop);
  
  if (state.cycling) {
      state.cycling = false;
      const btn = document.getElementById('btn-cycle');
      btn.innerText = "Cycle: OFF"; 
      btn.classList.remove('active'); 
  }
});

function resetSimulation() {
    // 1. Get current population from slider value
    const sliderValue = parseInt(document.getElementById('agent-slider').value);
    const currentPop = getPopFromSlider(sliderValue);
    
    // 2. Re-initialize all agents (creates new home/work assignments)
    initAgents(currentPop);
    
    // 3. Clear Queue and Reset Stats
    state.queue = [];
    state.stats.totalPathCount = 0;
    state.stats.accumulatedCalcTime = 0;
    state.stats.accumulatedTripTime = 0;
    state.viewIndex = -1; // Reset to Live Run
    updateHistoryUI();
    
    if (!state.cycling) {
        state.cycling = true; 
        const btn = document.getElementById('btn-cycle');
        btn.innerText = "Cycle: ON";
        btn.classList.add('active');
        // If the main animation loop was paused for some reason, ensure it's running
        if (!state.isLooping) {
            kickstartCycle();
            lastTime = performance.now();
            requestAnimationFrame(loop);
        } else {
            // If the loop is already running, just start the new cycle
            kickstartCycle();
        }
    } else {
        // If the cycle was already ON, just kickstart the new population
        kickstartCycle();
    }
    
    // console.log(`Simulation reset and cycle started for ${currentPop} new agents.`);
}