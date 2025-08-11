// script.js
// Drop this file next to index.html and your map.png

document.addEventListener('DOMContentLoaded', () => {

  // CONFIG
  const IMAGE_PATH = 'map.png';
  const MAX_COORDS = 10;
  const SAFE_MAX_ROWS = 208; // cap for density
  const DEFAULT_ALPHA = 0.5;
  const DEFAULT_TEAMS = [
    { id: 'team-red', name: 'Red', color: '#e53935' },
    { id: 'team-blue', name: 'Blue', color: '#1e88e5' }
  ];

  // STATE
  let imageW = 6000, imageH = 6000; // will be replaced by actual image size
  let gridLayer = L.layerGroup();
  let selectedPoints = []; // { x, y, teamId, time }
  let teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
  let currentTeamIndex = 0;
  let selectionAlpha = DEFAULT_ALPHA;
  let gridVisible = true;
  let currentMode = 'select'; // 'select' or 'coords'
  let coordHistory = []; // {lat, lng}

  // MAP init (we will set bounds after preload)
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 6,
    zoomSnap: 0.25
  });

  // UI references
  const coordListDiv = document.getElementById('coordList');
  const coordItems = document.getElementById('coordItems');

  // Preload image to get dimensions
  const img = new Image();
  img.src = IMAGE_PATH;
  img.onload = () => {
    imageW = img.naturalWidth;
    imageH = img.naturalHeight;

    // Set overlay with correct bounds: [ [0,0], [height,width] ]
    const bounds = [[0, 0], [imageH, imageW]];
    L.imageOverlay(IMAGE_PATH, bounds).addTo(map);
    map.setMaxBounds(bounds);
    map.fitBounds(bounds);

    gridLayer.addTo(map);
    updateGrid(); // initial draw
  };
  img.onerror = () => {
    alert(`Could not load "${IMAGE_PATH}". Make sure it's in the same folder as index.html and named exactly.`);
  };

  // UTIL helpers
  function hexToRgba(hex, alpha = 1) {
    const v = parseInt(hex.replace('#',''), 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function rowsForZoom(z) {
    if (z <= 0) return 26;
    if (z <= 1) return 52;
    if (z <= 2) return 104;
    return 208;
  }

  function pointInRect(pt, top, left, bottom, right) {
    return pt.y >= top && pt.y < bottom && pt.x >= left && pt.x < right;
  }

  function lastPointInRect(top, left, bottom, right) {
    for (let i = selectedPoints.length - 1; i >= 0; i--) {
      if (pointInRect(selectedPoints[i], top, left, bottom, right)) return { idx: i, pt: selectedPoints[i] };
    }
    return null;
  }

  // DRAW GRID
  function drawGrid() {
    gridLayer.clearLayers();
    if (!imageW || !imageH) return;

    let rows = rowsForZoom(map.getZoom());
    if (rows > SAFE_MAX_ROWS) rows = SAFE_MAX_ROWS;

    const cellH = imageH / rows;
    const cellW = imageW / rows;

    // create rectangles for interactive grid
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < rows; c++) {
        const top = r * cellH;
        const left = c * cellW;
        const bottom = top + cellH;
        const right = left + cellW;

        // check selection
        const last = lastPointInRect(top, left, bottom, right);

        const style = {
          color: 'black',
          weight: 0.2,
          fillOpacity: 0,
          fillColor: 'transparent',
          interactive: true
        };

        if (last) {
          const team = teams.find(t => t.id === last.pt.teamId);
          if (team) {
            style.fillColor = hexToRgba(team.color, selectionAlpha);
            style.fillOpacity = selectionAlpha;
          }
        }

        const rect = L.rectangle([[top, left], [bottom, right]], style);

        rect.on('click', (ev) => {
          // if not in select mode, do nothing (allow map click to handle coords)
          if (currentMode !== 'select') return;
          L.DomEvent.stopPropagation(ev); // prevent map click
          // find indices inside this rect
          const indicesInside = [];
          for (let i = 0; i < selectedPoints.length; i++) {
            if (pointInRect(selectedPoints[i], top, left, bottom, right)) indicesInside.push(i);
          }
          const lastEntry = lastPointInRect(top, left, bottom, right);
          const currentTeamId = teams[currentTeamIndex].id;

          if (lastEntry && lastEntry.pt.teamId === currentTeamId) {
            // deselect: remove all points inside
            for (let i = indicesInside.length - 1; i >= 0; i--) selectedPoints.splice(indicesInside[i], 1);
          } else {
            // remove existing points in that cell (other teams) and add center for current team
            for (let i = indicesInside.length - 1; i >= 0; i--) selectedPoints.splice(indicesInside[i], 1);
            const center = { x: left + cellW / 2, y: top + cellH / 2, teamId: currentTeamId, time: Date.now() };
            selectedPoints.push(center);
          }

          // redraw to reflect change
          drawGrid();
        });

        gridLayer.addLayer(rect);
      }
    }
  }

  // Update grid on zoom
  map.on('zoomend', () => {
    drawGrid();
  });

  // Map click for coords mode
  map.on('click', (e) => {
    if (currentMode !== 'coords') return;
    // Leaflet lat = y pixel, lng = x pixel (CRS.Simple)
    coordHistory.unshift({ lat: e.latlng.lat, lng: e.latlng.lng });
    if (coordHistory.length > MAX_COORDS) coordHistory.pop();
    renderCoords();
  });

  function renderCoords() {
    if (coordHistory.length === 0) {
      coordItems.innerHTML = '<i>no clicks yet</i>';
    } else {
      coordItems.innerHTML = coordHistory.map(c => `[${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}]`).join('<br>');
    }
  }

  // CONTROL: teams & mode (Leaflet control)
  const Controls = L.Control.extend({
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-control custom-controls');
      container.style.minWidth = '240px';

      container.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
          <div>
            <strong>Mode</strong><br>
            <button id="modeToggle" style="padding:4px 8px">Mode: SELECT</button>
          </div>
          <div style="margin-left:6px">
            <strong>Team</strong><br>
            <select id="teamSelect" style="width:120px"></select>
          </div>
        </div>
        <div style="margin-top:8px; display:flex; gap:8px; align-items:center">
          <label style="display:flex;align-items:center;gap:6px">
            Color <input id="teamColor" type="color">
          </label>
          <label style="display:flex;align-items:center;gap:6px">
            Alpha <input id="alpha" type="range" min="0.1" max="0.9" step="0.05" value="${selectionAlpha}">
          </label>
        </div>
        <div style="margin-top:8px; display:flex; gap:6px;">
          <button id="addTeam">+ Team</button>
          <button id="renameTeam">Rename</button>
          <button id="clearTeam">Clear Team</button>
          <button id="clearAll">Clear All</button>
          <button id="toggleGrid">Hide Grid</button>
          <button id="toggleCoords">Coords</button>
        </div>
        <div class="small">Grid density: 26 → 52 → 104 → 208 (zoom)</div>
      `;

      // stop clicks from propagating to map
      L.DomEvent.disableClickPropagation(container);
      return container;
    }
  });

  map.addControl(new Controls({ position: 'topright' }));

  // After control created, hook UI
  function hookupControls() {
    const modeBtn = document.getElementById('modeToggle');
    const teamSelect = document.getElementById('teamSelect');
    const teamColor = document.getElementById('teamColor');
    const alpha = document.getElementById('alpha');
    const addTeam = document.getElementById('addTeam');
    const renameTeam = document.getElementById('renameTeam');
    const clearTeam = document.getElementById('clearTeam');
    const clearAll = document.getElementById('clearAll');
    const toggleGridBtn = document.getElementById('toggleGrid');
    const toggleCoordsBtn = document.getElementById('toggleCoords');

    // populate team select
    function populateTeams() {
      teamSelect.innerHTML = '';
      teams.forEach((t, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = t.name;
        teamSelect.appendChild(opt);
      });
      teamSelect.value = currentTeamIndex;
      teamColor.value = teams[currentTeamIndex].color;
    }
    populateTeams();

    modeBtn.addEventListener('click', () => {
      currentMode = (currentMode === 'select') ? 'coords' : 'select';
      modeBtn.textContent = `Mode: ${currentMode.toUpperCase()}`;
      // hide coords panel when switching to select
      if (currentMode === 'select') {
        coordListDiv.style.display = 'none';
        toggleCoordsBtn.textContent = 'Coords';
      }
    });

    teamSelect.addEventListener('change', (e) => {
      currentTeamIndex = parseInt(e.target.value);
      teamColor.value = teams[currentTeamIndex].color;
    });

    teamColor.addEventListener('input', (e) => {
      const newHex = e.target.value;
      teams[currentTeamIndex].color = newHex;
      drawGrid();
    });

    alpha.addEventListener('input', (e) => {
      selectionAlpha = parseFloat(e.target.value);
      drawGrid();
    });

    addTeam.addEventListener('click', () => {
      const name = prompt('New team name?','New Team');
      if (!name) return;
      const color = prompt('Color (hex or css name)?', '#'+Math.floor(Math.random()*16777215).toString(16));
      const id = 'team-' + Date.now();
      teams.push({ id, name, color });
      currentTeamIndex = teams.length - 1;
      populateTeams();
      drawGrid();
    });

    renameTeam.addEventListener('click', () => {
      const newName = prompt('Rename team:', teams[currentTeamIndex].name);
      if (!newName) return;
      teams[currentTeamIndex].name = newName;
      populateTeams();
    });

    clearTeam.addEventListener('click', () => {
      const teamId = teams[currentTeamIndex].id;
      // remove selectedPoints for that team
      for (let i = selectedPoints.length - 1; i >= 0; i--) {
        if (selectedPoints[i].teamId === teamId) selectedPoints.splice(i, 1);
      }
      drawGrid();
    });

    clearAll.addEventListener('click', () => {
      selectedPoints.length = 0;
      drawGrid();
    });

    toggleGridBtn.addEventListener('click', () => {
      gridVisible = !gridVisible;
      if (gridVisible) {
        gridLayer.addTo(map);
        toggleGridBtn.textContent = 'Hide Grid';
      } else {
        gridLayer.remove();
        toggleGridBtn.textContent = 'Show Grid';
      }
    });

    toggleCoordsBtn.addEventListener('click', () => {
      const visible = coordListDiv.style.display !== 'block';
      coordListDiv.style.display = visible ? 'block' : 'none';
      toggleCoordsBtn.textContent = visible ? 'Coords ✓' : 'Coords';
    });
  }

  // Hook controls after next tick (controls were inserted synchronously above)
  setTimeout(hookupControls, 50);

  // Expose update functions
  function updateGrid() { drawGrid(); }
  window._updateGrid = updateGrid;

}); // DOMContentLoaded end
