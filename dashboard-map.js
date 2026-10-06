'use strict';

function allCoordinates(geometry){
  const coords=[];const walk=value=>{if(!Array.isArray(value))return;if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){coords.push(value);return}value.forEach(walk)};
  (geometry.features||[]).forEach(f=>walk(f.geometry?.coordinates));return coords;
}
function buildProjection(geometry){
  const coords=allCoordinates(geometry),lonX=lon=>lon*Math.PI/180,mercY=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const xs=coords.map(c=>lonX(c[0])),ys=coords.map(c=>mercY(c[1])),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),pad=22,W=620,H=620;
  const scale=Math.min((W-pad*2)/(maxX-minX),(H-pad*2)/(maxY-minY)),usedW=(maxX-minX)*scale,usedH=(maxY-minY)*scale,offsetX=(W-usedW)/2,offsetY=(H-usedH)/2;
  return ([lon,lat])=>[offsetX+(lonX(lon)-minX)*scale,offsetY+(maxY-mercY(lat))*scale];
}
function geometryPath(geom,project){
  const polygons=geom?.type==='Polygon'?[geom.coordinates]:geom?.type==='MultiPolygon'?geom.coordinates:[];
  return polygons.map(poly=>poly.map(ring=>ring.map((coord,i)=>{const [x,y]=project(coord);return `${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`}).join(' ')+' Z').join(' ')).join(' ');
}
function mixBlue(t){
  const a=[232,236,255],b=[7,54,254],q=clamp(t,0,1),c=a.map((v,i)=>Math.round(v+(b[i]-v)*q));return `rgb(${c.join(',')})`;
}

function renderMap(){
  const map=latestStateRows(app.metric),values=[...map.values()].map(r=>Number(r.value)).filter(Number.isFinite),m=meta(app.metric);
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,1e-9),project=buildProjection(app.geometry);
  $('#map-title').textContent=`${label(app.metric)} por estado`;
  $('#map-subtitle').textContent='Clique no mapa para comparar até três UFs.';
  $('#brazil-map').innerHTML=(app.geometry.features||[]).map(feature=>{
    const uf=feature.properties?.uf,row=map.get(uf),t=Number.isFinite(row?.value)?(row.value-min)/span:0,idx=app.selectedStates.indexOf(uf),dimmed=app.selectedStates.length&&idx<0;
    return `<path class="state-shape${idx>=0?` is-selected is-selected-${idx+1}`:''}${dimmed?' is-dimmed':''}" data-uf="${esc(uf)}" d="${geometryPath(feature.geometry,project)}" fill="${mixBlue(.08+.92*t)}" tabindex="0" aria-label="${esc((UF_LABELS[uf]||uf)+(row?' '+formatValue(row.value,m):' sem dado'))}"><title>${esc(UF_LABELS[uf]||uf)} · ${esc(row?formatValue(row.value,m):'sem dado')}</title></path>`;
  }).join('');
  $('#map-legend').innerHTML=values.length?`<span>${esc(formatValue(min,m))}</span><i></i><span>${esc(formatValue(max,m))}</span>`:'';
  renderStateSelection();
}

function renderStateSelection(){
  const latest=latestStateRows(app.metric),m=meta(app.metric),box=$('#selected-states-list');
  box.innerHTML=app.selectedStates.length?app.selectedStates.map((uf,i)=>{const row=latest.get(uf);return `<button class="state-chip" type="button" data-remove-state="${uf}" style="border-color:${COLORS[i]}"><strong>${esc(UF_LABELS[uf]||uf)}</strong><span>${esc(row?formatValue(row.value,m):'sem dado')}</span><b>×</b></button>`}).join(''):'<span class="selection-help">Nenhum estado selecionado.</span>';
  $('#clear-states').disabled=!app.selectedStates.length;
  $('#selection-help').textContent=app.selectedStates.length===3?'Limite de três estados atingido.':'Selecione até 3 estados no mapa ou no ranking.';
}

function toggleState(uf){
  const index=app.selectedStates.indexOf(uf);
  if(index>=0)app.selectedStates.splice(index,1); else if(app.selectedStates.length<3)app.selectedStates.push(uf); else return;
  renderMap();renderRanking();renderTrend();
}

function renderRanking(){
  const latest=latestStateRows(app.metric),m=meta(app.metric),rows=[...latest.entries()].map(([uf,row])=>({uf,...row})).filter(r=>Number.isFinite(r.value)).sort((a,b)=>b.value-a.value),max=rows[0]?.value||1;
  $('#ranking-title').textContent=`Maiores valores · ${label(app.metric)}`;
  $('#ranking-reference').textContent=rows[0]?month(rows[0].date):'—';
  $('#ranking-list').innerHTML=rows.length?rows.slice(0,10).map((r,i)=>`<div class="rank-row${app.selectedStates.includes(r.uf)?' is-selected':''}" data-rank-state="${r.uf}" role="button" tabindex="0" aria-label="Selecionar ${esc(UF_LABELS[r.uf]||r.uf)}">
    <span class="rank-number">${String(i+1).padStart(2,'0')}</span>
    <div class="rank-main"><div class="rank-name">${esc(UF_LABELS[r.uf]||r.uf)}</div><div class="rank-track"><div class="rank-fill" style="width:${clamp(r.value/max*100,2,100).toFixed(1)}%"></div></div></div>
    <strong class="rank-value">${esc(formatValue(r.value,m))}</strong>
  </div>`).join(''):'<div class="ranking-empty">Sem dados estaduais para este indicador.</div>';
}

