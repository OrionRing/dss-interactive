document.addEventListener('DOMContentLoaded', () => {

  // CONFIG
  const IMAGE_PATH = 'map.png';
  const MAX_COORDS = 10;
  const SAFE_MAX_ROWS = 208;
  const DEFAULT_ALPHA = 0.5;
  const DEFAULT_TEAMS = [
    { id: 'team-red', name: 'Red', color: '#e53935' },
    { id: 'team-blue', name: 'Blue', color: '#1e88e5' }
  ];

  // STATE
  let imageW = 6000, imageH = 6000;
  let gridLayer = L.layerGroup();
  let selectedPoints = [];
  let teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
  let currentTeamIndex = 0;
  let selectionAlpha = DEFAULT_ALPHA;
  let gridVisible = true;
  let currentMode = 'select';
  let coordHistory = [];
  let lookupMarker = null;

  // MAP init
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 6,
    zoomSnap: 0.25
  });

  const coordListDiv = document.getElementById('coordList');
  const coordItems = document.getElementById('coordItems');

  // preload image
  const img = new Image();
  img.src = IMAGE_PATH;
  img.onload = () => {
    imageW = img.naturalWidth;
    imageH = img.naturalHeight;

    const bounds = [[0,0],[imageH,imageW]];
    L.imageOverlay(IMAGE_PATH, bounds).addTo(map);
    map.setMaxBounds(bounds);
    map.fitBounds(bounds);

    gridLayer.addTo(map);
    updateGrid();
  };

  // UTIL
  function hexToRgba(hex, alpha=1) {
    const v = parseInt(hex.replace('#',''),16);
    const r=(v>>16)&255, g=(v>>8)&255, b=v&255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // 🔹 Faster grid density scaling
  function rowsForZoom(z) {
    if (z <= 0) return 26;
    if (z <= 0.5) return 52;
    if (z <= 1.5) return 104;
    return 208;
  }

  function pointInRect(pt, top, left, bottom, right) {
    return pt.y >= top && pt.y < bottom && pt.x >= left && pt.x < right;
  }
  function lastPointInRect(top,left,bottom,right){
    for(let i=selectedPoints.length-1;i>=0;i--){
      if(pointInRect(selectedPoints[i],top,left,bottom,right)) return {idx:i,pt:selectedPoints[i]};
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

    for (let r=0;r<rows;r++){
      for (let c=0;c<rows;c++){
        const top=r*cellH, left=c*cellW, bottom=top+cellH, right=left+cellW;
        const last=lastPointInRect(top,left,bottom,right);

        const style = {
          color:'black',
          weight:0.2, // 🔹 thinner lines
          fillOpacity:0,
          fillColor:'transparent',
          interactive:true
        };

        if (last){
          const team=teams.find(t=>t.id===last.pt.teamId);
          if(team){
            style.fillColor=hexToRgba(team.color,selectionAlpha);
            style.fillOpacity=selectionAlpha;
          }
        }

        const rect=L.rectangle([[top,left],[bottom,right]],style);
        rect.on('click',(ev)=>{
          if(currentMode!=='select') return;
          L.DomEvent.stopPropagation(ev);
          const indicesInside=[];
          for(let i=0;i<selectedPoints.length;i++){
            if(pointInRect(selectedPoints[i],top,left,bottom,right)) indicesInside.push(i);
          }
          const lastEntry=lastPointInRect(top,left,bottom,right);
          const currentTeamId=teams[currentTeamIndex].id;

          if(lastEntry && lastEntry.pt.teamId===currentTeamId){
            for(let i=indicesInside.length-1;i>=0;i--) selectedPoints.splice(indicesInside[i],1);
          } else {
            for(let i=indicesInside.length-1;i>=0;i--) selectedPoints.splice(indicesInside[i],1);
            const center={x:left+cellW/2,y:top+cellH/2,teamId:currentTeamId,time:Date.now()};
            selectedPoints.push(center);
          }
          drawGrid();
        });
        gridLayer.addLayer(rect);
      }
    }
  }

  map.on('zoomend',()=>drawGrid());

  // coords mode (click history)
  map.on('click',(e)=>{
    if(currentMode!=='coords') return;
    coordHistory.unshift({lat:e.latlng.lat,lng:e.latlng.lng});
    if(coordHistory.length>MAX_COORDS) coordHistory.pop();
    renderCoords();
  });
  function renderCoords(){
    if(coordHistory.length===0){
      coordItems.innerHTML='<i>no clicks yet</i>';
    } else {
      coordItems.innerHTML=coordHistory.map(c=>`[${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}]`).join('<br>');
    }
  }

  // CONTROLS
  const Controls=L.Control.extend({
    onAdd:function(){
      const c=L.DomUtil.create('div','leaflet-control custom-controls');
      c.style.minWidth='280px';
      c.innerHTML=`
        <div style="display:flex;gap:8px;align-items:center;">
          <div>
            <strong>Mode</strong><br>
            <button id="modeToggle">Mode: SELECT</button>
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
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
          <button id="addTeam">+ Team</button>
          <button id="renameTeam">Rename</button>
          <button id="clearTeam">Clear Team</button>
          <button id="clearAll">Clear All</button>
          <button id="toggleGrid">Hide Grid</button>
          <button id="toggleCoords">Coords</button>
          <button id="recenter">Recenter</button>
        </div>
        <div style="margin-top:8px">
          <strong>Lookup Coord</strong><br>
          <input id="coordInput" type="text" placeholder="e.g. 1200, 800" style="width:140px">
          <button id="coordLookup">Go</button>
        </div>
        <div class="small">Grid density: 26 → 52 → 104 → 208 (zoom)</div>
      `;
      L.DomEvent.disableClickPropagation(c);
      return c;
    }
  });
  map.addControl(new Controls({position:'topright'}));

  // hook controls
  setTimeout(()=>{
    const modeBtn=document.getElementById('modeToggle');
    const teamSelect=document.getElementById('teamSelect');
    const teamColor=document.getElementById('teamColor');
    const alpha=document.getElementById('alpha');
    const addTeam=document.getElementById('addTeam');
    const renameTeam=document.getElementById('renameTeam');
    const clearTeam=document.getElementById('clearTeam');
    const clearAll=document.getElementById('clearAll');
    const toggleGridBtn=document.getElementById('toggleGrid');
    const toggleCoordsBtn=document.getElementById('toggleCoords');
    const recenterBtn=document.getElementById('recenter');
    const coordInput=document.getElementById('coordInput');
    const coordLookup=document.getElementById('coordLookup');

    function populateTeams(){
      teamSelect.innerHTML='';
      teams.forEach((t,idx)=>{
        const opt=document.createElement('option');
        opt.value=idx; opt.textContent=t.name;
        teamSelect.appendChild(opt);
      });
      teamSelect.value=currentTeamIndex;
      teamColor.value=teams[currentTeamIndex].color;
    }
    populateTeams();

    modeBtn.addEventListener('click',()=>{
      currentMode=(currentMode==='select')?'coords':'select';
      modeBtn.textContent=`Mode: ${currentMode.toUpperCase()}`;
      if(currentMode==='select'){coordListDiv.style.display='none';toggleCoordsBtn.textContent='Coords';}
    });
    teamSelect.addEventListener('change',(e)=>{
      currentTeamIndex=parseInt(e.target.value);
      teamColor.value=teams[currentTeamIndex].color;
    });
    teamColor.addEventListener('input',(e)=>{
      teams[currentTeamIndex].color=e.target.value;
      drawGrid();
    });
    alpha.addEventListener('input',(e)=>{
      selectionAlpha=parseFloat(e.target.value);
      drawGrid();
    });
    addTeam.addEventListener('click',()=>{
      const name=prompt('New team name?','New Team');
      if(!name) return;
      const color=prompt('Color (hex)?','#'+Math.floor(Math.random()*16777215).toString(16));
      const id='team-'+Date.now();
      teams.push({id,name,color});
      currentTeamIndex=teams.length-1;
      populateTeams();
      drawGrid();
    });
    renameTeam.addEventListener('click',()=>{
      const newName=prompt('Rename team:',teams[currentTeamIndex].name);
      if(newName){teams[currentTeamIndex].name=newName; populateTeams();}
    });
    clearTeam.addEventListener('click',()=>{
      const teamId=teams[currentTeamIndex].id;
      for(let i=selectedPoints.length-1;i>=0;i--){if(selectedPoints[i].teamId===teamId) selectedPoints.splice(i,1);}
      drawGrid();
    });
    clearAll.addEventListener('click',()=>{selectedPoints.length=0; drawGrid();});
    toggleGridBtn.addEventListener('click',()=>{
      gridVisible=!gridVisible;
      if(gridVisible){gridLayer.addTo(map);toggleGridBtn.textContent='Hide Grid';}
      else {gridLayer.remove();toggleGridBtn.textContent='Show Grid';}
    });
    toggleCoordsBtn.addEventListener('click',()=>{
      const visible=coordListDiv.style.display!=='block';
      coordListDiv.style.display=visible?'block':'none';
      toggleCoordsBtn.textContent=visible?'Coords ✓':'Coords';
    });
    recenterBtn.addEventListener('click',()=>{
      map.fitBounds([[0,0],[imageH,imageW]]);
    });
    coordLookup.addEventListener('click',()=>{
      const val=coordInput.value.trim();
      if(!val) return;
      const parts=val.split(',').map(s=>parseFloat(s.trim()));
      if(parts.length!==2 || isNaN(parts[0]) || isNaN(parts[1])){alert('Invalid input');return;}
      const [x,y]=parts;
      if(lookupMarker) map.removeLayer(lookupMarker);
      lookupMarker=L.circleMarker([y,x],{radius:6,color:'red',fillColor:'red',fillOpacity:0.9}).addTo(map);
      map.setView([y,x], map.getZoom());
    });
  },50);

  function updateGrid(){drawGrid();}
  window._updateGrid=updateGrid;

});
