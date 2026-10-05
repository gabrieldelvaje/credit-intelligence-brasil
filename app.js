const $=s=>document.querySelector(s);
const state={rows:[],catalog:[],forecasts:{},series:new Map(),ready:false,theme:localStorage.getItem('ci-theme')||'light'};
window.creditLocale=localStorage.getItem('ci-locale')||'pt';

const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const numFmt=(v,d=2)=>new Intl.NumberFormat(window.creditLocale==='en'?'en-US':'pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const monthFmt=iso=>new Intl.DateTimeFormat(window.creditLocale==='en'?'en-US':'pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T00:00:00Z')).replace('.','');
const t=(pt,en)=>window.creditLocale==='en'?en:pt;

const copy={
  pt:{title:'O que você quer saber sobre crédito e inadimplência?',subtitle:'Consulte inadimplência, endividamento, crédito, juros e contexto macroeconômico do Brasil.',placeholder:'Pergunte sobre inadimplência, crédito, juros ou previsão...',loading:'Carregando base de crédito',loadingSmall:'Banco Central + indicadores do IBGE via SGS.',by:'Desenvolvido por Gabriel Delvaje'},
  en:{title:'What do you want to know about credit and delinquency?',subtitle:'Explore delinquency, household debt, credit, interest rates and Brazil’s macroeconomic context.',placeholder:'Ask about delinquency, credit, interest rates or forecasts...',loading:'Loading credit data',loadingSmall:'Central Bank + IBGE indicators via SGS.',by:'Developed by Gabriel Delvaje'}
};

function label(meta){return meta?.[window.creditLocale==='en'?'en':'pt']||meta?.key||''}
function formatValue(v,meta){
  if(!Number.isFinite(v))return '—';
  const unit=meta?.unit||'',d=unit.includes('R$')?0:2;
  return `${numFmt(v,d)} ${unit}`.trim();
}
function meta(key){return state.catalog.find(x=>x.key===key)}
function seriesRows(key){
  const rows=state.series.get(key)||[],m=meta(key);
  if(!rows.length||m?.frequency!=='daily')return rows;
  const byMonth=new Map();for(const r of rows)byMonth.set(r.date.slice(0,7),r);
  return [...byMonth.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function latest(key){return seriesRows(key).at(-1)||null}
function yearsIn(q){
  const ys=[...q.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map(x=>+x[1]);
  if(ys.length>=2)return[Math.min(...ys),Math.max(...ys)];
  if(ys.length===1)return[ys[0],ys[0]];
  const m=norm(q).match(/(?:ultimos|últimos|last)\s+(\d{1,2})\s+(?:anos|years)/);
  if(m){const last=new Date().getUTCFullYear();return[last-(+m[1])+1,last]}
  return[null,null];
}
function sliceRange(rows,q){const[a,b]=yearsIn(q);return !a&&!b?rows:rows.filter(r=>{const y=+r.date.slice(0,4);return(!a||y>=a)&&(!b||y<=b)})}
function aliasesFor(m){return[m.pt,m.en,...(m.aliases_pt||[]),...(m.aliases_en||[])].map(norm).filter(Boolean).sort((a,b)=>b.length-a.length)}
function identify(q){const n=norm(q),found=[];for(const m of state.catalog)if(aliasesFor(m).some(a=>n.includes(a)))found.push(m.key);return[...new Set(found)]}
function pearson(a,b){if(a.length<4||a.length!==b.length)return null;const ma=a.reduce((s,x)=>s+x,0)/a.length,mb=b.reduce((s,x)=>s+x,0)/b.length;let top=0,da=0,db=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;top+=x*y;da+=x*x;db+=y*y}return da&&db?top/Math.sqrt(da*db):null}
function align(k1,k2,lag=0){const a=seriesRows(k1),b=seriesRows(k2),mb=new Map(b.map(r=>[r.date.slice(0,7),r.value])),out=[];for(let i=0;i<a.length;i++){const j=i-lag;if(j<0)continue;const bv=mb.get(a[j].date.slice(0,7));if(Number.isFinite(bv))out.push([a[i].value,bv])}return out}

function cards(items){return'<div class="kpis">'+items.map(x=>`<div class="kpi"><span>${esc(x.label)}</span><strong>${esc(x.value)}</strong>${x.small?`<small>${esc(x.small)}</small>`:''}</div>`).join('')+'</div>'}
function table(points,m,limit=18){const rows=[...points].slice(-limit).reverse();return`<div class="table-wrap"><table class="data-table"><thead><tr><th>${t('Referência','Reference')}</th><th>${esc(label(m))}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(monthFmt(r.date))}</td><td class="number">${esc(formatValue(r.value,m))}</td></tr>`).join('')}</tbody></table></div>`}
function chart(sets,title){
  const all=sets.flatMap(s=>s.points.map(p=>p.value)).filter(Number.isFinite);if(all.length<2)return'';
  const W=760,H=280,P={l:48,r:20,t:24,b:38},min=Math.min(...all),max=Math.max(...all),span=Math.max(1e-9,max-min);
  const dates=[...new Set(sets.flatMap(s=>s.points.map(p=>p.date)))].sort(),x=d=>P.l+(dates.indexOf(d)/Math.max(1,dates.length-1))*(W-P.l-P.r),y=v=>P.t+(1-(v-min)/span)*(H-P.t-P.b);
  const paths=sets.map((s,i)=>`<path class="ci-series ci-series-${i+1}" d="${s.points.map((p,j)=>`${j?'L':'M'} ${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')}"/>`).join('');
  const ticks=[0,.25,.5,.75,1].map(f=>{const v=min+span*(1-f),yy=P.t+f*(H-P.t-P.b);return`<line class="grid" x1="${P.l}" y1="${yy}" x2="${W-P.r}" y2="${yy}"/><text class="axis" x="${P.l-8}" y="${yy+4}" text-anchor="end">${numFmt(v,1)}</text>`}).join('');
  const legends=sets.map((s,i)=>`<span><i class="ci-key ci-key-${i+1}"></i>${esc(s.label)}</span>`).join('');
  return`<div class="chart"><strong>${esc(title)}</strong><div class="ci-legend">${legends}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${ticks}${paths}<text class="axis" x="${P.l}" y="${H-9}">${esc(monthFmt(dates[0]))}</text><text class="axis" x="${W-P.r}" y="${H-9}" text-anchor="end">${esc(monthFmt(dates.at(-1)))}</text></svg></div>`
}
function capability(){
  return`<div class="sci-capability-overview"><h2 class="result-title">${t('O que eu consigo analisar','What I can analyze')}</h2><p class="answer">${t('A base combina séries oficiais de crédito e macroeconomia. Você pode consultar valores atuais, evolução histórica, comparar indicadores, ranquear modalidades de inadimplência, explorar correlações e ver projeções estatísticas de curto prazo.','The database combines official credit and macroeconomic series. You can query current values, historical trends, compare indicators, rank delinquency categories, explore correlations and view short-term statistical projections.')}</p><ul><li>${t('Inadimplência PF, PJ, cartão, rotativo, crédito pessoal e veículos.','Household, corporate, credit card, revolving, personal credit and vehicle-loan delinquency.')}</li><li>${t('Endividamento e comprometimento de renda das famílias.','Household debt and debt-service ratio.')}</li><li>${t('Saldo, concessões e juros médios do crédito.','Credit balances, new lending and average interest rates.')}</li><li>${t('Selic, IPCA, desemprego e renda real.','Selic, IPCA, unemployment and real income.')}</li></ul></div>`
}
function ranking(){
  const keys=['delinquency_card','delinquency_revolving','delinquency_personal','delinquency_vehicle'],rows=keys.map(k=>({m:meta(k),r:latest(k)})).filter(x=>x.r).sort((a,b)=>b.r.value-a.r.value),winner=rows[0];
  return`<h2 class="result-title">${t('Modalidades com maior inadimplência','Highest delinquency categories')}</h2><p class="answer">${t('Na leitura mais recente de cada série,','Using the latest observation available for each series,')} <strong>${esc(label(winner.m))}</strong> ${t('aparece no topo, com','ranks first at')} <strong>${esc(formatValue(winner.r.value,winner.m))}</strong>.</p>${cards(rows.map(x=>({label:label(x.m),value:formatValue(x.r.value,x.m),small:monthFmt(x.r.date)})))}<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>${t('Modalidade','Category')}</th><th>${t('Valor','Value')}</th><th>${t('Referência','Reference')}</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(label(x.m))}</td><td class="number">${esc(formatValue(x.r.value,x.m))}</td><td>${esc(monthFmt(x.r.date))}</td></tr>`).join('')}</tbody></table></div>`
}
function trendAnswer(key,q){
  const m=meta(key),rows=sliceRange(seriesRows(key),q);if(!m||!rows.length)return`<div class="error">${t('Não encontrei dados para esse recorte.','I could not find data for that selection.')}</div>`;
  const first=rows[0],last=rows.at(-1),change=last.value-first.value,yearAgo=rows.length>12?rows.at(-13):first,yoy=last.value-yearAgo.value,direction=change>0?t('subiu','increased'):change<0?t('caiu','decreased'):t('ficou estável','was stable');
  return`<h2 class="result-title">${esc(label(m))}</h2><p class="answer">${t('O último valor disponível é','The latest available value is')} <strong>${esc(formatValue(last.value,m))}</strong> (${esc(monthFmt(last.date))}). ${t('No período selecionado, o indicador','Over the selected period, the indicator')} <strong>${direction}</strong> ${esc(formatValue(Math.abs(change),m))}.</p>${cards([{label:t('Último valor','Latest value'),value:formatValue(last.value,m),small:monthFmt(last.date)},{label:t('Variação 12 meses','12-month change'),value:`${yoy>=0?'+':''}${numFmt(yoy,2)} p.p.`},{label:t('Início do recorte','Start of range'),value:formatValue(first.value,m),small:monthFmt(first.date)}])}${chart([{label:label(m),points:rows}],label(m))}${table(rows,m)}`
}
function compareAnswer(keys,q){
  const ms=keys.slice(0,2).map(meta),sets=keys.slice(0,2).map((k,i)=>({label:label(ms[i]),points:sliceRange(seriesRows(k),q)})).filter(s=>s.points.length);if(sets.length<2)return trendAnswer(keys[0],q);
  const last=sets.map((s,i)=>({m:ms[i],r:s.points.at(-1)}));
  return`<h2 class="result-title">${t('Comparação de indicadores','Indicator comparison')}</h2><p class="answer">${t('Nos dados mais recentes disponíveis,','In the latest available data,')} <strong>${esc(label(last[0].m))}</strong> ${t('está em','is at')} <strong>${esc(formatValue(last[0].r.value,last[0].m))}</strong> ${t('e','and')} <strong>${esc(label(last[1].m))}</strong> ${t('em','is at')} <strong>${esc(formatValue(last[1].r.value,last[1].m))}</strong>.</p>${cards(last.map(x=>({label:label(x.m),value:formatValue(x.r.value,x.m),small:monthFmt(x.r.date)})))}${chart(sets,t('Evolução comparada','Comparison over time'))}`
}
function correlationAnswer(keys){
  if(keys.length<2)return`<div class="error">${t('Informe dois indicadores para analisar a relação.','Please specify two indicators to analyze their relationship.')}</div>`;
  const[a,b]=keys.slice(0,2),lags=[0,3,6,12],results=lags.map(l=>{const pairs=align(a,b,l);return{lag:l,n:pairs.length,r:pearson(pairs.map(x=>x[0]),pairs.map(x=>x[1]))}}).filter(x=>Number.isFinite(x.r));if(!results.length)return`<div class="error">${t('Não há observações coincidentes suficientes.','There are not enough overlapping observations.')}</div>`;
  const best=[...results].sort((x,y)=>Math.abs(y.r)-Math.abs(x.r))[0],ma=meta(a),mb=meta(b),strength=Math.abs(best.r)>=.7?t('forte','strong'):Math.abs(best.r)>=.4?t('moderada','moderate'):t('fraca','weak');
  return`<h2 class="result-title">${t('Relação entre indicadores','Relationship between indicators')}</h2><p class="answer">${t('A correlação histórica mais alta entre','The strongest historical correlation between')} <strong>${esc(label(ma))}</strong> ${t('e','and')} <strong>${esc(label(mb))}</strong> ${t('entre as defasagens testadas foi','across the tested lags was')} <strong>r = ${numFmt(best.r,2)}</strong>, ${strength}, ${best.lag?`${t('com defasagem de','with a lag of')} ${best.lag} ${t('meses','months')}`:t('sem defasagem','with no lag')}.</p>${cards(results.map(x=>({label:x.lag?`${x.lag} ${t('meses','months')}`:t('Sem defasagem','No lag'),value:`r = ${numFmt(x.r,2)}`,small:`n = ${x.n}`})))}<p class="answer"><small>${t('Correlação não implica causalidade; o resultado é descritivo e depende do período comum das séries.','Correlation does not imply causation; this is descriptive and depends on the overlapping period of the series.')}</small></p>`
}
function forecastAnswer(key){
  const m=meta(key),f=state.forecasts[key],observed=seriesRows(key);if(!f?.points?.length)return`<div class="error">${t('Ainda não há projeção disponível para esse indicador.','No forecast is available for this indicator yet.')}</div>`;
  const last=observed.at(-1),end=f.points.at(-1),combined=[...observed.slice(-24),...f.points.map(p=>({date:p.date,value:p.value}))];
  return`<h2 class="result-title">${t('Projeção de curto prazo','Short-term projection')} — ${esc(label(m))}</h2><p class="answer">${t('O último valor observado é','The latest observed value is')} <strong>${esc(formatValue(last.value,m))}</strong>. ${t('O modelo de tendência + sazonalidade projeta','The trend + seasonality model projects')} <strong>${esc(formatValue(end.value,m))}</strong> ${t('para','for')} <strong>${esc(monthFmt(end.date))}</strong>.</p>${cards([{label:t('Observado','Observed'),value:formatValue(last.value,m),small:monthFmt(last.date)},{label:t('Projeção 6 meses','6-month forecast'),value:formatValue(end.value,m),small:monthFmt(end.date)},{label:t('Faixa 80%','80% interval'),value:`${formatValue(end.low80,m)} – ${formatValue(end.high80,m)}`}])}${chart([{label:t('Observado + projeção','Observed + forecast'),points:combined}],t('Histórico recente e projeção','Recent history and forecast'))}<p class="answer"><small>${esc(window.creditLocale==='en'?f.note_en:f.note_pt)}</small></p>`
}
function answer(q){
  const n=norm(q);if(/o que voce pode fazer|o que você pode fazer|what can you do|capabilities/.test(n))return capability();
  const keys=identify(q);
  if(/maior inadimplencia|maior inadimplência|highest delinquency|qual modalidade|which credit category/.test(n))return ranking();
  if(/previs|projec|projeç|forecast|predict/.test(n))return forecastAnswer(keys[0]||'delinquency_pf');
  if(/correl|relacao|relação|relationship|impact|selic.*inadimpl|inadimpl.*selic|desemprego.*inadimpl|inadimpl.*desemprego/.test(n)){
    let pair=keys;if(pair.length<2){if(n.includes('selic'))pair=['delinquency_pf','selic'];else if(n.includes('desemprego'))pair=['delinquency_pf','unemployment'];else if(n.includes('inflacao')||n.includes('inflação'))pair=['delinquency_pf','ipca']}return correlationAnswer(pair)
  }
  if(keys.length>=2||/compar|versus|\bvs\b/.test(n))return compareAnswer(keys.length>=2?keys:['delinquency_pf','delinquency_pj'],q);
  return trendAnswer(keys[0]||'delinquency_pf',q);
}
function updateLocaleUI(){
  const c=copy[window.creditLocale];document.documentElement.lang=window.creditLocale==='en'?'en':'pt-BR';
  $('#hero-title').textContent=c.title;$('#hero-subtitle').textContent=c.subtitle;$('#question').placeholder=c.placeholder;$('#loading-title').textContent=c.loading;$('#loading-small').textContent=c.loadingSmall;$('#brand-by').textContent=c.by;$('#locale-toggle').textContent=window.creditLocale==='en'?'PT':'EN';
  document.querySelectorAll('[data-q-pt]').forEach(btn=>btn.textContent=window.creditLocale==='en'?btn.dataset.qEn:btn.dataset.qPt);
}
async function load(){
  const box=$('#loading-card');box.classList.add('is-visible');
  try{
    const stamp=Date.now(),[dr,cr,fr]=await Promise.all([fetch(`data/credit_intelligence.json?v=${stamp}`,{cache:'no-store'}),fetch(`data/catalog.json?v=${stamp}`,{cache:'no-store'}),fetch(`data/forecasts.json?v=${stamp}`,{cache:'no-store'})]);
    if(!dr.ok||!cr.ok||!fr.ok)throw Error(t('Arquivos de dados ainda não publicados.','Data files have not been published yet.'));
    state.rows=await dr.json();state.catalog=await cr.json();state.forecasts=await fr.json();state.series=new Map();
    for(const r of state.rows){if(!state.series.has(r.key))state.series.set(r.key,[]);state.series.get(r.key).push(r)}for(const rows of state.series.values())rows.sort((a,b)=>a.date.localeCompare(b.date));
    state.ready=true;box.classList.remove('is-visible');
  }catch(e){box.innerHTML=`<div><strong>${esc(t('Não foi possível carregar a base.','Could not load the data.'))}</strong><small>${esc(e.message)}</small></div>`;box.classList.add('is-visible')}
}
function init(){
  document.documentElement.dataset.theme=state.theme;updateLocaleUI();
  $('#theme-toggle').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;localStorage.setItem('ci-theme',state.theme)});
  $('#locale-toggle').addEventListener('click',()=>{window.creditLocale=window.creditLocale==='pt'?'en':'pt';localStorage.setItem('ci-locale',window.creditLocale);updateLocaleUI()});
  $('#new-chat').addEventListener('click',()=>{$('#conversation').replaceChildren();$('#home-hero').hidden=false;$('#question').focus()});
  load();
}
init();
