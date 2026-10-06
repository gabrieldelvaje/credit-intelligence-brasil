'use strict';

function initMapEvents(){
  const svg=$('#brazil-map'),tooltip=$('#map-tooltip');
  const show=(path,event)=>{const uf=path.dataset.uf,row=latestStateRows(app.metric).get(uf),m=meta(app.metric);tooltip.innerHTML=`<strong>${esc(UF_LABELS[uf]||uf)}</strong><span>${esc(row?formatValue(row.value,m):'sem dado')} · ${esc(row?month(row.date):'—')}</span>`;tooltip.hidden=false;positionTooltip(tooltip,event)};
  svg.addEventListener('pointermove',event=>{const path=event.target.closest('.state-shape');if(path)show(path,event);else tooltip.hidden=true});
  svg.addEventListener('pointerleave',()=>tooltip.hidden=true);
  svg.addEventListener('click',event=>{const path=event.target.closest('.state-shape');if(path)toggleState(path.dataset.uf)});
  svg.addEventListener('keydown',event=>{const path=event.target.closest('.state-shape');if(path&&(event.key==='Enter'||event.key===' ')){event.preventDefault();toggleState(path.dataset.uf)}});
}
function positionTooltip(el,event){const pad=12,w=el.offsetWidth||160,h=el.offsetHeight||46,x=event.clientX+13,y=event.clientY-h-12;el.style.left=`${clamp(x,pad,innerWidth-w-pad)}px`;el.style.top=`${clamp(y,pad,innerHeight-h-pad)}px`}

function initChartTooltips(){
  let tooltip=document.querySelector('.chart-tooltip');
  if(!tooltip){tooltip=document.createElement('div');tooltip.className='chart-tooltip';tooltip.hidden=true;document.body.appendChild(tooltip)}
  document.querySelectorAll('.point-hit').forEach(point=>{
    point.addEventListener('pointerenter',event=>{tooltip.innerHTML=`<strong>${esc(point.dataset.chartLabel)} · ${esc(month(point.dataset.chartDate))}</strong><span>${esc(point.dataset.chartValue)}</span>`;tooltip.hidden=false;positionTooltip(tooltip,event)});
    point.addEventListener('pointermove',event=>positionTooltip(tooltip,event));
    point.addEventListener('pointerleave',()=>tooltip.hidden=true);
  });
}

function bindEvents(){
  $('#metric-select').addEventListener('change',event=>{app.metric=event.target.value;app.selectedStates=[];renderMap();renderRanking();renderTrend();renderOutlook()});
  $('#period-select').addEventListener('change',event=>{app.period=event.target.value;renderTrend()});
  $('#clear-states').addEventListener('click',()=>{app.selectedStates=[];renderMap();renderRanking();renderTrend()});
  $('#selected-states-list').addEventListener('click',event=>{const button=event.target.closest('[data-remove-state]');if(button)toggleState(button.dataset.removeState)});
  $('#ranking-list').addEventListener('click',event=>{const row=event.target.closest('[data-rank-state]');if(row)toggleState(row.dataset.rankState)});
  $('#ranking-list').addEventListener('keydown',event=>{const row=event.target.closest('[data-rank-state]');if(row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();toggleState(row.dataset.rankState)}});
  const dialog=$('#methodology-dialog');
  $('#methodology-open').addEventListener('click',()=>dialog.showModal());
  $('#methodology-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
}

async function fetchJson(path,{required=true,fallback=null}={}){
  try{
    const response=await fetch(path,{cache:'no-cache'});
    if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);
    return await response.json();
  }catch(error){
    if(required)throw error;
    console.warn('Camada opcional indisponível:',path,error);
    return fallback;
  }
}

async function loadCore(){
  const [rows,catalog,dimCatalog,geometry,forecasts,dimMetadata]=await Promise.all([
    fetchJson('data/credit_intelligence.json'),
    fetchJson('data/catalog.json'),
    fetchJson('data/dimensions/catalog.json'),
    fetchJson('data/dimensions/br_states.geojson'),
    fetchJson('data/forecasts.json',{required:false,fallback:{}}),
    fetchJson('data/dimensions/metadata.json',{required:false,fallback:{}})
  ]);
  Object.assign(app,{rows,catalog,forecasts,geometry});
  app.dimensions={stateCredit:[],genderState:[],catalog:dimCatalog,metadata:dimMetadata};
  app.series=new Map();
  for(const row of rows){if(!app.series.has(row.key))app.series.set(row.key,[]);app.series.get(row.key).push(row)}
  for(const list of app.series.values())list.sort((a,b)=>a.date.localeCompare(b.date));
}

async function loadGeographicLayers(){
  $('#selection-help').textContent='Carregando camada estadual…';
  const [stateResult,genderResult]=await Promise.allSettled([
    fetchJson('data/dimensions/state_credit.json'),
    fetchJson('data/dimensions/gender_state.json')
  ]);
  if(stateResult.status==='fulfilled')app.dimensions.stateCredit=stateResult.value;
  if(genderResult.status==='fulfilled')app.dimensions.genderState=genderResult.value;
  const anyLoaded=app.dimensions.stateCredit.length||app.dimensions.genderState.length;
  if(anyLoaded){
    renderMap();renderRanking();renderTrend();
  }else{
    $('#map-subtitle').textContent='A camada estadual não carregou. Os indicadores nacionais continuam disponíveis.';
    $('#selection-help').textContent='Recarregue a página para tentar novamente a camada estadual.';
  }
}

function renderUpdateStatus(){
  const generated=app.dimensions.metadata?.generated_at_utc;
  if(!generated){$('#update-status').textContent='Dados oficiais · atualização automática';return}
  const dt=new Date(generated),text=new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(dt);
  $('#update-status').textContent=`Atualizado em ${text}`;
}

async function init(){
  try{
    await loadCore();
    populateMetricSelect();
    bindEvents();
    initMapEvents();
    renderKpis();
    renderMap();
    renderRanking();
    renderTrend();
    renderComposition();
    renderMacro();
    renderOutlook();
    renderUpdateStatus();
    $('#loading-screen').remove();
    loadGeographicLayers().catch(error=>console.warn('Falha na camada estadual:',error));
  }catch(error){
    console.error(error);
    $('#loading-screen').remove();
    $('#error-message').textContent=error.message||'Tente atualizar a página.';
    $('#error-screen').hidden=false;
  }
}

init();
