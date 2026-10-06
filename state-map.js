(() => {
  'use strict';

  const form=document.querySelector('#question-form');
  const submit=form?.querySelector('button[type="submit"]');
  if(!form||!submit||typeof state==='undefined')return;

  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.id='state-map-toggle';
  toggle.className='state-map-toggle';
  toggle.setAttribute('aria-label','Abrir mapa por estado');
  toggle.setAttribute('aria-expanded','false');
  toggle.innerHTML='<img src="IMG_3724.png" alt="" aria-hidden="true">';
  submit.before(toggle);

  const backdrop=document.createElement('div');
  backdrop.className='state-map-backdrop';
  backdrop.hidden=true;

  const panel=document.createElement('section');
  panel.className='state-map-panel';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-hidden','true');
  panel.hidden=true;
  panel.innerHTML=`
    <div class="state-map-head">
      <div>
        <h2 id="state-map-title">Mapa por estado</h2>
        <p id="state-map-subtitle">Escolha um indicador para comparar estados.</p>
      </div>
      <button type="button" class="state-map-close" aria-label="Fechar">×</button>
    </div>
    <div class="state-map-controls">
      <label>
        <span id="state-map-indicator-label">Indicador</span>
        <select id="state-map-indicator"></select>
      </label>
      <div class="state-map-selection">
        <span id="state-map-selection-label">Comparar estados</span>
        <div id="state-map-selected" class="state-map-selected"></div>
      </div>
    </div>
    <div class="state-map-body">
      <div class="state-map-figure">
        <div class="state-map-loading" id="state-map-loading">Carregando malha do Brasil…</div>
        <svg id="state-map-svg" viewBox="0 0 620 620" role="img" aria-label="Mapa do Brasil por estado"></svg>
        <div class="state-map-legend" id="state-map-legend"></div>
        <div class="state-map-hover" id="state-map-hover" hidden></div>
      </div>
      <div class="state-map-side">
        <div class="state-map-summary" id="state-map-summary"></div>
        <div class="state-map-comparison" id="state-map-comparison"></div>
      </div>
    </div>
  `;
  document.body.append(backdrop,panel);

  const indicator=panel.querySelector('#state-map-indicator');
  const svg=panel.querySelector('#state-map-svg');
  const loading=panel.querySelector('#state-map-loading');
  const legend=panel.querySelector('#state-map-legend');
  const hover=panel.querySelector('#state-map-hover');
  const selectedBox=panel.querySelector('#state-map-selected');
  const summary=panel.querySelector('#state-map-summary');
  const comparison=panel.querySelector('#state-map-comparison');
  const close=panel.querySelector('.state-map-close');

  let geometry=null;
  let geometryPromise=null;
  let selected=[];
  let open=false;

  const isEn=()=>window.creditLocale==='en';
  const stateCapable=()=>state.dimensions.catalog.filter(item=>(item.dimensions||[]).includes('state'));

  function displayMeta(item){
    const m=meta(item.key)||item;
    return label(m)||item.key;
  }

  function populateIndicators(){
    const pool=stateCapable();
    const current=indicator.value||'delinquency_pf';
    indicator.innerHTML=pool.map(item=>'<option value="'+esc(item.key)+'">'+esc(displayMeta(item))+'</option>').join('');
    if(pool.some(item=>item.key===current))indicator.value=current;
    else if(pool.some(item=>item.key==='delinquency_pf'))indicator.value='delinquency_pf';
  }

  function latestStateRows(key){
    const source=dimSupports(key,'gender')
      ? state.dimensions.genderState.filter(r=>r.key===key&&r.gender==='total'&&r.uf!=='BR')
      : state.dimensions.stateCredit.filter(r=>r.key===key);
    const latest=new Map();
    for(const row of source){
      const prev=latest.get(row.uf);
      if(!prev||row.date>prev.date)latest.set(row.uf,row);
    }
    return latest;
  }

  async function loadGeometry(){
    if(geometry)return geometry;
    if(geometryPromise)return geometryPromise;
    geometryPromise=fetch('data/dimensions/br_states.geojson?v='+Date.now(),{cache:'no-store'})
      .then(r=>{if(!r.ok)throw new Error('Malha estadual ainda não publicada.');return r.json()})
      .then(g=>{geometry=g;return g})
      .catch(error=>{
        loading.textContent=(isEn()?'Could not load the Brazil map: ':'Não foi possível carregar o mapa do Brasil: ')+error.message;
        throw error;
      });
    return geometryPromise;
  }

  function allCoordinates(geometry){
    const coords=[];
    const walk=value=>{
      if(!Array.isArray(value))return;
      if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){coords.push(value);return}
      value.forEach(walk);
    };
    for(const feature of geometry.features||[])walk(feature.geometry?.coordinates);
    return coords;
  }

  function buildProjection(geometry){
    const coords=allCoordinates(geometry);
    // GeoJSON longitudes arrive in degrees while Mercator Y is expressed
    // in radians. Convert longitude to radians too, otherwise the map is
    // compressed vertically into an almost-flat line.
    const lonX=lon=>lon*Math.PI/180;
    const mercY=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
    const xs=coords.map(c=>lonX(c[0])),ys=coords.map(c=>mercY(c[1]));
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const pad=28,W=620,H=620;
    const scale=Math.min((W-pad*2)/(maxX-minX),(H-pad*2)/(maxY-minY));
    const usedW=(maxX-minX)*scale,usedH=(maxY-minY)*scale;
    const offsetX=(W-usedW)/2,offsetY=(H-usedH)/2;
    return ([lon,lat])=>[
      offsetX+(lonX(lon)-minX)*scale,
      offsetY+(maxY-mercY(lat))*scale
    ];
  }

  function geometryPath(geom,project){
    if(!geom)return'';
    const polygons=geom.type==='Polygon'?[geom.coordinates]:geom.type==='MultiPolygon'?geom.coordinates:[];
    return polygons.map(poly=>poly.map(ring=>ring.map((coord,i)=>{
      const [x,y]=project(coord);
      return (i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2);
    }).join(' ')+' Z').join(' ')).join(' ');
  }

  function heatAlpha(value,min,max){
    if(!Number.isFinite(value))return .06;
    if(max<=min)return .55;
    return .13+((value-min)/(max-min))*.77;
  }

  function renderSelected(){
    selectedBox.innerHTML=selected.length
      ? selected.map((uf,i)=>'<button type="button" class="is-series-'+(i+1)+'" data-remove-uf="'+uf+'">'+esc(UF_LABELS[uf]||uf)+' <span>×</span></button>').join('')
      : '<small>'+ (isEn()?'None selected':'Nenhum selecionado') +'</small>';
  }

  function renderComparison(key){
    comparison.innerHTML='';
    if(selected.length<2){
      comparison.innerHTML='<p class="state-map-hint">'+(isEn()?'Select two states on the map to compare their history.':'Selecione dois estados no mapa para comparar a série histórica.')+'</p>';
      return;
    }
    const m=dimMeta(key,geographicRows(key,selected[0])[0]?.unit);
    const sets=selected.map(uf=>({label:UF_LABELS[uf]||uf,points:geographicRows(key,uf),meta:m}));
    comparison.innerHTML=chart(sets,isEn()?'State comparison':'Comparação entre estados',m);
  }

  function renderMap(){
    if(!geometry||!state.ready)return;
    const key=indicator.value||'delinquency_pf';
    const latest=latestStateRows(key);
    const values=[...latest.values()].map(r=>r.value).filter(Number.isFinite);
    const min=Math.min(...values),max=Math.max(...values);
    const m=dimMeta(key,[...latest.values()][0]?.unit);
    const project=buildProjection(geometry);

    svg.innerHTML=(geometry.features||[]).map(feature=>{
      const uf=feature.properties?.uf;
      const row=latest.get(uf);
      const alpha=heatAlpha(row?.value,min,max);
      const selectedIndex=selected.indexOf(uf);
      const selectedClass=selectedIndex===0?' is-selected is-selected-1':selectedIndex===1?' is-selected is-selected-2':'';
      const dimmedClass=selected.length&&selectedIndex<0?' is-dimmed':'';
      const path=geometryPath(feature.geometry,project);
      return '<path class="state-map-shape'+selectedClass+dimmedClass+'" data-uf="'+esc(uf)+'" d="'+path+'" style="--state-heat:'+alpha.toFixed(3)+'" tabindex="0"><title>'+esc((UF_LABELS[uf]||uf)+(row?' · '+formatValue(row.value,m):''))+'</title></path>';
    }).join('');

    loading.hidden=true;
    const sample=[...latest.values()].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
    legend.innerHTML='<span>'+esc(formatValue(min,m))+'</span><i></i><span>'+esc(formatValue(max,m))+'</span>';
    summary.innerHTML='<span>'+(isEn()?'Latest reference':'Última referência')+'</span><strong>'+esc(sample?monthFmt(sample.date):'—')+'</strong><small>'+esc(label(m))+'</small>';
    renderSelected();
    renderComparison(key);
  }

  function selectState(uf){
    if(!uf)return;
    if(selected.includes(uf))selected=selected.filter(x=>x!==uf);
    else if(selected.length<2)selected=[...selected,uf];
    else selected=[selected[1],uf];
    renderMap();
  }

  function localize(){
    toggle.setAttribute('aria-label',isEn()?'Open state map':'Abrir mapa por estado');
    panel.querySelector('#state-map-title').textContent=isEn()?'Map by state':'Mapa por estado';
    panel.querySelector('#state-map-subtitle').textContent=isEn()?'Choose an indicator to compare states.':'Escolha um indicador para comparar estados.';
    panel.querySelector('#state-map-indicator-label').textContent=isEn()?'Indicator':'Indicador';
    panel.querySelector('#state-map-selection-label').textContent=isEn()?'Compare states':'Comparar estados';
    close.setAttribute('aria-label',isEn()?'Close':'Fechar');
    populateIndicators();
    if(geometry&&state.ready)renderMap();
  }

  async function setOpen(next){
    if(open===next)return;
    open=next;
    toggle.setAttribute('aria-expanded',String(open));
    if(open){
      const builder=document.querySelector('#question-builder-toggle[aria-expanded="true"]');
      if(builder)builder.click();
      localize();
      panel.hidden=false;
      backdrop.hidden=false;
      panel.setAttribute('aria-hidden','false');
      document.body.classList.add('state-map-open');
      requestAnimationFrame(()=>panel.classList.add('is-open'));
      loading.hidden=false;
      try{await loadGeometry();renderMap()}catch(_){}
    }else{
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden','true');
      document.body.classList.remove('state-map-open');
      setTimeout(()=>{if(!open){panel.hidden=true;backdrop.hidden=true}},340);
    }
  }

  toggle.addEventListener('click',()=>setOpen(!open));
  close.addEventListener('click',()=>setOpen(false));
  backdrop.addEventListener('click',()=>setOpen(false));
  indicator.addEventListener('change',()=>{selected=[];renderMap()});
  selectedBox.addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-uf]');
    if(button)selectState(button.dataset.removeUf);
  });
  svg.addEventListener('click',event=>{
    const shape=event.target.closest('.state-map-shape');
    if(shape)selectState(shape.dataset.uf);
  });
  svg.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('.state-map-shape')){
      event.preventDefault();
      selectState(event.target.dataset.uf);
    }
  });
  svg.addEventListener('pointermove',event=>{
    const shape=event.target.closest('.state-map-shape');
    if(!shape){hover.hidden=true;return}
    const key=indicator.value;
    const row=latestStateRows(key).get(shape.dataset.uf);
    const m=dimMeta(key,row?.unit);
    hover.hidden=false;
    hover.innerHTML='<strong>'+esc(UF_LABELS[shape.dataset.uf]||shape.dataset.uf)+'</strong><span>'+esc(row?formatValue(row.value,m):'—')+'</span>';
    const box=panel.querySelector('.state-map-figure').getBoundingClientRect();
    hover.style.left=Math.max(8,Math.min(box.width-150,event.clientX-box.left+12))+'px';
    hover.style.top=Math.max(8,event.clientY-box.top-48)+'px';
  });
  svg.addEventListener('pointerleave',()=>{hover.hidden=true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open)setOpen(false)});
  document.querySelector('#question-builder-toggle')?.addEventListener('click',()=>{if(open)setOpen(false)});
  window.addEventListener('credit:locale-changed',localize);
  window.addEventListener('credit:data-ready',()=>{populateIndicators();if(open&&geometry)renderMap()});

  localize();
})();