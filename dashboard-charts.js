'use strict';

function slicePeriod(rows){
  if(app.period==='all')return rows;
  return rows.slice(-Number(app.period));
}
function lineChart(sets,m,{forecast=false}={}){
  const valid=sets.map(s=>({...s,points:slicePeriod((s.points||[]).filter(p=>Number.isFinite(p.value)&&p.date))})).filter(s=>s.points.length);
  if(!valid.length)return '<div class="ranking-empty">Selecione um estado para ver a série histórica.</div>';
  const W=920,H=320,P={l:52,r:18,t:18,b:38},dates=[...new Set(valid.flatMap(s=>s.points.map(p=>p.date)))].sort(),all=valid.flatMap(s=>s.points.map(p=>p.value)),min0=Math.min(...all),max0=Math.max(...all),padding=(max0-min0||1)*.12,min=min0-padding,max=max0+padding,span=max-min;
  const x=d=>P.l+(dates.indexOf(d)/Math.max(1,dates.length-1))*(W-P.l-P.r),y=v=>P.t+(1-(v-min)/span)*(H-P.t-P.b);
  const grid=[0,.25,.5,.75,1].map(f=>{const v=max-f*span,yy=P.t+f*(H-P.t-P.b);return `<line class="grid" x1="${P.l}" y1="${yy}" x2="${W-P.r}" y2="${yy}"/><text class="axis-label" x="${P.l-8}" y="${yy+3}" text-anchor="end">${esc(axisFormat(v,m))}</text>`}).join('');
  const paths=valid.map((s,i)=>{const d=s.points.map((p,j)=>`${j?'L':'M'} ${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '),last=s.points.at(-1);return `<path class="series series-${i+1}${s.forecast?' forecast':''}" d="${d}" style="stroke:${COLORS[i]||'#666'}"/>${last?`<circle class="latest-dot" cx="${x(last.date)}" cy="${y(last.value)}" r="4.5" fill="${COLORS[i]||'#666'}"/>`:''}${s.points.map(p=>`<circle class="point-hit" data-chart-label="${esc(s.label)}" data-chart-date="${esc(p.date)}" data-chart-value="${esc(formatValue(p.value,m))}" cx="${x(p.date)}" cy="${y(p.value)}" r="7"><title>${esc(s.label)} · ${esc(month(p.date))}: ${esc(formatValue(p.value,m))}</title></circle>`).join('')}`}).join('');
  const tickCount=Math.min(6,dates.length),tickIndexes=[...new Set(Array.from({length:tickCount},(_,i)=>Math.round(i*(dates.length-1)/Math.max(1,tickCount-1))))],ticks=tickIndexes.map(i=>`<text class="axis-label" x="${x(dates[i])}" y="${H-12}" text-anchor="${i===0?'start':i===dates.length-1?'end':'middle'}">${esc(shortDate(dates[i]))}</text>`).join('');
  return `<svg class="history-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico histórico">${grid}${paths}${ticks}</svg>`;
}
function axisFormat(v,m){const unit=m.unit||'';if(unit.includes('R$ mi'))return compact(v);if(unit==='R$')return `R$ ${compact(v)}`;if(unit.includes('%'))return `${num(v,1)}%`;return compact(v)}
function shortDate(iso){return new Intl.DateTimeFormat(locale,{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(iso.slice(0,10)+'T12:00:00Z')).replace('.','')}

function renderTrend(){
  const m=meta(app.metric),legend=$('#trend-legend'),note=$('#trend-note');
  let sets=[];
  if(app.selectedStates.length){
    sets=app.selectedStates.map(uf=>({label:UF_LABELS[uf]||uf,points:stateSeries(app.metric,uf)}));
    $('#trend-title').textContent=`Comparação estadual · ${label(app.metric)}`;
    $('#trend-subtitle').textContent=app.selectedStates.map(uf=>UF_LABELS[uf]||uf).join(' × ');
    note.textContent=/delinquency|problem_assets/.test(app.metric)?'Recorte estadual: SCR.data/Banco Central. As definições estaduais derivadas do SCR não são uma simples desagregação da série SGS nacional.':'Recorte estadual conforme a fonte oficial indicada na metodologia.';
  }else{
    const national=nationalSeries(app.metric);
    if(national.length)sets=[{label:'Brasil',points:national}];
    $('#trend-title').textContent=`Evolução · ${label(app.metric)}`;
    $('#trend-subtitle').textContent=national.length?'Brasil · série nacional oficial':'Selecione um estado no mapa para ver a evolução.';
    note.textContent=national.length?'Passe pelos pontos para consultar valores. O período pode ser alterado no filtro superior.':'Este indicador não possui uma série nacional diretamente comparável; use a seleção estadual.';
  }
  legend.innerHTML=sets.map((s,i)=>`<span class="legend-item"><i style="background:${COLORS[i]}"></i>${esc(s.label)}</span>`).join('');
  $('#trend-chart').innerHTML=lineChart(sets,m);
  initChartTooltips();
}

function renderComposition(){
  const rows=COMPOSITION_KEYS.map(key=>({key,m:meta(key),row:latestNational(key)})).filter(x=>x.row).sort((a,b)=>b.row.value-a.row.value),max=rows[0]?.row.value||1;
  $('#composition-chart').innerHTML=rows.map(({key,m,row})=>`<div class="composition-row"><span class="composition-name">${esc(shortLabel(key))}</span><span class="composition-track"><span class="composition-fill" style="display:block;width:${clamp(row.value/max*100,2,100).toFixed(1)}%"></span></span><strong class="composition-value">${esc(formatValue(row.value,m))}</strong></div>`).join('');
}

function renderMacro(){
  $('#macro-grid').innerHTML=MACRO_KEYS.map(key=>{const m=meta(key),rows=nationalSeries(key),last=rows.at(-1);return `<article class="macro-item"><span class="macro-label">${esc(shortLabel(key))}</span><strong>${esc(last?formatValue(last.value,m):'—')}</strong>${sparkline(rows)}<span class="macro-ref">${esc(last?month(last.date):'—')}</span></article>`}).join('');
}

function renderOutlook(){
  const forecast=app.forecasts[app.metric],m=meta(app.metric),observed=latestNational(app.metric),content=$('#outlook-content');
  $('#outlook-title').textContent=`Próximos 6 meses · ${shortLabel(app.metric)}`;
  if(!forecast?.points?.length||!observed){
    $('#outlook-subtitle').textContent='Disponível para séries selecionadas de inadimplência.';
    content.innerHTML='<p class="outlook-empty">Este indicador não possui projeção de curto prazo. O painel mantém projeções somente onde a rotina estatística está definida.</p>';
    return;
  }
  const end=forecast.points.at(-1);
  $('#outlook-subtitle').textContent='Projeção estatística nacional · tendência + sazonalidade.';
  content.innerHTML=`<div class="outlook-flow"><div class="outlook-node"><span>Observado · ${esc(month(observed.date))}</span><strong>${esc(formatValue(observed.value,m))}</strong></div><span class="outlook-arrow">→</span><div class="outlook-node"><span>Projetado · ${esc(month(end.date))}</span><strong>${esc(formatValue(end.value,m))}</strong></div></div><div class="outlook-range">Faixa estatística de 80%: <strong>${esc(formatValue(end.low80,m))} – ${esc(formatValue(end.high80,m))}</strong>. Não é previsão oficial.</div>`;
}

function renderAll(){renderKpis();renderMap();renderRanking();renderTrend();renderComposition();renderMacro();renderOutlook();}

