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

async function load(){
  const stamp=Date.now();
  const urls=['data/credit_intelligence.json','data/catalog.json','data/forecasts.json','data/dimensions/state_credit.json','data/dimensions/gender_state.json','data/dimensions/catalog.json','data/dimensions/metadata.json','data/dimensions/br_states.geojson'];
  const responses=await Promise.all(urls.map(url=>fetch(`${url}?v=${stamp}`,{cache:'no-store'})));
  const failed=responses.findIndex(r=>!r.ok); if(failed>=0)throw new Error(`${urls[failed]}: HTTP ${responses[failed].status}`);
  const [rows,catalog,forecasts,stateCredit,genderState,dimCatalog,dimMetadata,geometry]=await Promise.all(responses.map(r=>r.json()));
  Object.assign(app,{rows,catalog,forecasts,geometry});
  app.dimensions={stateCredit,genderState,catalog:dimCatalog,metadata:dimMetadata};
  app.series=new Map();for(const row of rows){if(!app.series.has(row.key))app.series.set(row.key,[]);app.series.get(row.key).push(row)}for(const list of app.series.values())list.sort((a,b)=>a.date.localeCompare(b.date));
}

function renderUpdateStatus(){
  const generated=app.dimensions.metadata?.generated_at_utc;
  if(!generated){$('#update-status').textContent='Dados oficiais atualizados automaticamente';return}
  const dt=new Date(generated),text=new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(dt);
  $('#update-status').textContent=`Base estadual atualizada em ${text}`;
}

async function init(){
  try{
    await load();populateMetricSelect();bindEvents();initMapEvents();renderAll();renderUpdateStatus();$('#loading-screen').remove();
  }catch(error){console.error(error);$('#loading-screen').remove();$('#error-message').textContent=error.message||'Tente atualizar a página.';$('#error-screen').hidden=false}
}

init();
