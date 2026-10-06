const $=s=>document.querySelector(s);
const state={rows:[],catalog:[],forecasts:{},series:new Map(),dimensions:{stateCredit:[],genderState:[],catalog:[]},ready:false,theme:localStorage.getItem('ci-theme')||'light'};
window.creditLocale=localStorage.getItem('ci-locale')||'pt';

const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const numFmt=(v,d=2)=>new Intl.NumberFormat(window.creditLocale==='en'?'en-US':'pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const monthFmt=iso=>new Intl.DateTimeFormat(window.creditLocale==='en'?'en-US':'pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T00:00:00Z')).replace('.','');
const t=(pt,en)=>window.creditLocale==='en'?en:pt;

const copy={
  pt:{title:'O que você quer saber sobre crédito e inadimplência?',subtitle:'Consulte crédito, inadimplência e contexto macroeconômico, com recortes por estado e sexo quando disponíveis.',placeholder:'Pergunte sobre inadimplência, crédito, juros ou previsão...',loading:'Carregando base de crédito',loadingSmall:'Banco Central + IBGE.',by:'Desenvolvido por Gabriel Delvaje'},
  en:{title:'What do you want to know about credit and delinquency?',subtitle:'Explore credit, delinquency and the macroeconomic context, with state and sex breakdowns where available.',placeholder:'Ask about delinquency, credit, interest rates or forecasts...',loading:'Loading credit data',loadingSmall:'Central Bank + IBGE.',by:'Developed by Gabriel Delvaje'}
};

function label(meta){return meta?.[window.creditLocale==='en'?'en':'pt']||meta?.key||''}
function formatValue(v,meta){
  if(!Number.isFinite(v))return '—';
  const unit=meta?.unit||'',d=unit.includes('R$')?0:2;
  return `${numFmt(v,d)} ${unit}`.trim();
}
function meta(key){
  return state.catalog.find(x=>x.key===key)
    || state.dimensions.catalog.find(x=>x.key===key)
    || ({problem_assets_pf:{key:'problem_assets_pf',pt:'Ativo problemático - PF',en:'Problem assets - households',unit:'%'},
         problem_assets_pj:{key:'problem_assets_pj',pt:'Ativo problemático - PJ',en:'Problem assets - companies',unit:'%'}}[key]);
}
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
function identify(q){
  const n=norm(q),found=[];
  const pool=[...state.catalog,...state.dimensions.catalog.filter(d=>!state.catalog.some(m=>m.key===d.key))];
  for(const m of pool)if(aliasesFor(m).some(a=>n.includes(a)))found.push(m.key);
  return[...new Set(found)];
}
function pearson(a,b){if(a.length<4||a.length!==b.length)return null;const ma=a.reduce((s,x)=>s+x,0)/a.length,mb=b.reduce((s,x)=>s+x,0)/b.length;let top=0,da=0,db=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;top+=x*y;da+=x*x;db+=y*y}return da&&db?top/Math.sqrt(da*db):null}
function align(k1,k2,lag=0){const a=seriesRows(k1),b=seriesRows(k2),mb=new Map(b.map(r=>[r.date.slice(0,7),r.value])),out=[];for(let i=0;i<a.length;i++){const j=i-lag;if(j<0)continue;const bv=mb.get(a[j].date.slice(0,7));if(Number.isFinite(bv))out.push([a[i].value,bv])}return out}


const UF_NAMES={
  AC:['acre'],AL:['alagoas'],AP:['amapa','amapá'],AM:['amazonas'],BA:['bahia'],CE:['ceara','ceará'],
  DF:['distrito federal','brasilia','brasília'],ES:['espirito santo','espírito santo'],GO:['goias','goiás'],
  MA:['maranhao','maranhão'],MT:['mato grosso'],MS:['mato grosso do sul'],MG:['minas gerais'],
  PA:['para','pará'],PB:['paraiba','paraíba'],PR:['parana','paraná'],PE:['pernambuco'],PI:['piaui','piauí'],
  RJ:['rio de janeiro'],RN:['rio grande do norte'],RS:['rio grande do sul'],RO:['rondonia','rondônia'],
  RR:['roraima'],SC:['santa catarina'],SP:['sao paulo','são paulo'],SE:['sergipe'],TO:['tocantins']
};
const UF_LABELS={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};

function statesIn(question){
  const nq=norm(question),found=[];
  for(const [uf,names] of Object.entries(UF_NAMES)){
    if(uf==='PA'){
      if(/\bpará\b/i.test(question))found.push(uf);
      continue;
    }
    if(names.some(name=>nq.includes(norm(name))))found.push(uf);
  }
  for(const uf of Object.keys(UF_NAMES)){
    const re=new RegExp('(?:^|[^A-Za-zÀ-ÿ])'+uf+'(?:$|[^A-Za-zÀ-ÿ])');
    if(re.test(question)&&!found.includes(uf))found.push(uf);
  }
  return found;
}
function genderIn(question){
  const n=norm(question),out=[];
  if(/\b(homens|homem|masculino|men|male)\b/.test(n))out.push('men');
  if(/\b(mulheres|mulher|feminino|women|female)\b/.test(n))out.push('women');
  return out;
}
function dimSupports(key,dimension){
  return state.dimensions.catalog.some(x=>x.key===key&&(x.dimensions||[]).includes(dimension));
}
function stateRows(key,uf){
  return state.dimensions.stateCredit.filter(r=>r.key===key&&(!uf||r.uf===uf)).sort((a,b)=>a.date.localeCompare(b.date));
}
function genderRows(key,uf,gender){
  return state.dimensions.genderState.filter(r=>r.key===key&&(!uf||r.uf===uf)&&(!gender||r.gender===gender)).sort((a,b)=>a.date.localeCompare(b.date));
}
function geographicRows(key,uf){
  if(dimSupports(key,'gender')){
    return genderRows(key,uf,'total');
  }
  return stateRows(key,uf);
}
function dimMeta(key,unit){
  const m=meta(key)||{key,pt:key,en:key};
  return {...m,unit:unit||m.unit};
}
function stateTrendAnswer(key,uf,q){
  const all=geographicRows(key,uf),m=dimMeta(key,all[0]?.unit);
  let rows=sliceRange(all,q);
  if(!yearsIn(q)[0]&&!/histor|serie completa|série completa|full series|toda a serie|toda a série/.test(norm(q)))rows=rows.slice(-24);
  if(!rows.length)return `<div class="error">${t('Não encontrei esse indicador para '+(UF_LABELS[uf]||uf)+'.','I could not find this indicator for '+(UF_LABELS[uf]||uf)+'.')}</div>`;
  const first=rows[0],last=rows.at(-1),delta=last.value-first.value,isRate=(m.unit||'').includes('%');
  const deltaText=isRate?`${delta>=0?'+':''}${numFmt(delta,2)} p.p.`:`${delta>=0?'+':''}${numFmt((last.value/first.value-1)*100,1)}%`;
  const source=all[0]?.source||'—';
  return `<h2 class="result-title">${esc(label(m))} — ${esc(UF_LABELS[uf]||uf)}</h2><p class="answer">${t('O valor mais recente é','The latest value is')} <strong>${esc(formatValue(last.value,m))}</strong> (${esc(monthFmt(last.date))}). ${t('No período exibido, a variação foi','Over the displayed period, the change was')} <strong>${esc(deltaText)}</strong>.</p>${cards([{label:t('Último valor','Latest value'),value:formatValue(last.value,m),small:monthFmt(last.date)},{label:t('Estado','State'),value:UF_LABELS[uf]||uf},{label:t('Fonte','Source'),value:source}])}${chart([{label:UF_LABELS[uf]||uf,points:rows,meta:m}],`${label(m)} — ${UF_LABELS[uf]||uf}`,m)}`;
}
function compareStatesAnswer(key,ufs,q){
  const m=dimMeta(key,geographicRows(key,ufs[0])[0]?.unit);
  const sets=ufs.slice(0,2).map(uf=>({label:UF_LABELS[uf]||uf,points:sliceRange(geographicRows(key,uf),q)})).filter(x=>x.points.length);
  if(sets.length<2)return stateTrendAnswer(key,ufs[0],q);
  const last=sets.map(s=>({label:s.label,row:s.points.at(-1)}));
  return `<h2 class="result-title">${t('Comparação entre estados','State comparison')} — ${esc(label(m))}</h2><p class="answer"><strong>${esc(last[0].label)}</strong>: ${esc(formatValue(last[0].row.value,m))} · <strong>${esc(last[1].label)}</strong>: ${esc(formatValue(last[1].row.value,m))}.</p>${cards(last.map(x=>({label:x.label,value:formatValue(x.row.value,m),small:monthFmt(x.row.date)})))}${chart(sets.map(s=>({...s,meta:m})),t('Evolução por estado','Trend by state'),m)}`;
}
function requestedRankCount(q){
  const n=norm(q);
  if(/\b(todos|todas|all)\b/.test(n))return 27;
  const digit=n.match(/(?:top\s*)?(\d{1,2})(?:\s*(?:estados|states|ufs))?/);
  if(digit)return Math.max(1,Math.min(27,+digit[1]));
  const words={cinco:5,five:5,dez:10,ten:10,quinze:15,fifteen:15,vinte:20,twenty:20};
  for(const [word,value] of Object.entries(words))if(new RegExp('\\b'+word+'\\b').test(n))return value;
  return 5;
}
function rankingBars(rows,m){
  if(!rows.length)return'';
  const max=Math.max(...rows.map(r=>r.value),1e-9);
  return '<div class="ranking-bar-chart"><div class="ranking-chart-heading"><strong>'+t('Ranking estadual','State ranking')+'</strong><span>'+esc(monthFmt(rows[0].date))+'</span></div><div class="ranking-bars">'
    +rows.map((r,i)=>{
      const pct=Math.max(2,Math.min(100,r.value/max*100));
      return '<div class="ranking-bar-row'+(i===0?' is-leader':'')+'"><div class="ranking-bar-meta"><span class="ranking-bar-rank">'+(i+1)+'</span><span class="ranking-bar-name">'+esc(UF_LABELS[r.uf]||r.uf)+'</span><span class="ranking-bar-value">'+esc(formatValue(r.value,m))+'</span></div><div class="ranking-bar-track"><div class="ranking-bar-fill'+(i===0?' is-leader':'')+'" style="width:'+pct.toFixed(2)+'%"></div></div></div>';
    }).join('')+'</div></div>';
}
function stateRankingAnswer(key,ascending=false,q=''){
  const rows=dimSupports(key,'gender')
    ? state.dimensions.genderState.filter(r=>r.key===key&&r.gender==='total'&&r.uf!=='BR')
    : state.dimensions.stateCredit.filter(r=>r.key===key);
  const m=dimMeta(key,rows[0]?.unit);
  const latestByUf=new Map();
  for(const r of rows){const prev=latestByUf.get(r.uf);if(!prev||r.date>prev.date)latestByUf.set(r.uf,r)}
  const ranked=[...latestByUf.entries()].map(([uf,r])=>({uf,...r})).sort((a,b)=>ascending?a.value-b.value:b.value-a.value);
  if(!ranked.length)return `<div class="error">${t('Ainda não há recorte estadual disponível para esse indicador.','State-level data is not available for this indicator yet.')}</div>`;

  const requested=requestedRankCount(q);
  const visible=ranked.slice(0,requested);
  const bars=visible.slice(0,Math.min(5,visible.length));
  const top=visible[0];
  const extraTable=requested>5
    ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>'+t('Estado','State')+'</th><th>'+t('Valor','Value')+'</th><th>'+t('Referência','Reference')+'</th></tr></thead><tbody>'+visible.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(UF_LABELS[r.uf]||r.uf)+'</td><td class="number">'+esc(formatValue(r.value,m))+'</td><td>'+esc(monthFmt(r.date))+'</td></tr>').join('')+'</tbody></table></div>'
    : '';

  return `<h2 class="result-title">${ascending?t('Estados com menor valor','States with the lowest value'):t('Estados com maior valor','States with the highest value')} — ${esc(label(m))}</h2><p class="answer"><strong>${esc(UF_LABELS[top.uf]||top.uf)}</strong> ${t('aparece no topo do ranking com','ranks first at')} <strong>${esc(formatValue(top.value,m))}</strong> (${esc(monthFmt(top.date))}). ${requested===5?t('Por padrão, mostro os cinco primeiros estados.','By default, I show the top five states.') : t('O ranking abaixo mostra os '+requested+' estados solicitados.','The ranking below shows the '+requested+' requested states.')}</p>${rankingBars(bars,m)}${extraTable}`;
}
function genderStateAnswer(key,uf,genders,q){
  const m=dimMeta(key,genderRows(key,uf,genders[0])[0]?.unit);
  const chosen=genders.length?genders:['men','women'];
  const labels={men:t('Homens','Men'),women:t('Mulheres','Women'),total:t('Total','Total')};
  const sets=chosen.map(g=>({label:labels[g],points:sliceRange(genderRows(key,uf,g),q)})).filter(s=>s.points.length);
  if(!sets.length)return `<div class="error">${t('Não encontrei esse recorte de sexo para o indicador e estado informados.','I could not find this sex breakdown for the selected indicator and state.')}</div>`;
  const last=sets.map(s=>({label:s.label,row:s.points.at(-1)}));
  const where=uf?(UF_LABELS[uf]||uf):t('Brasil','Brazil');
  return `<h2 class="result-title">${esc(label(m))} — ${esc(where)}</h2><p class="answer">${last.map(x=>`<strong>${esc(x.label)}</strong>: ${esc(formatValue(x.row.value,m))}`).join(' · ')}.</p>${cards(last.map(x=>({label:x.label,value:formatValue(x.row.value,m),small:monthFmt(x.row.date)})))}${chart(sets.map(s=>({...s,meta:m})),`${label(m)} — ${where}`,m)}<p class="answer"><small>${t('O IBGE publica esta dimensão como Sexo (Total, Homens e Mulheres). O projeto não infere identidade de gênero.','IBGE publishes this dimension as Sex (Total, Men and Women). The project does not infer gender identity.')}</small></p>`;
}
function dimensionUnavailable(key,dimension){
  const m=meta(key);
  if(dimension==='gender')return `<div class="error">${t('A fonte oficial deste indicador não publica recorte por sexo. O filtro de sexo está disponível para desemprego e rendimento real via PNAD Contínua/IBGE.','The official source for this indicator does not publish a sex breakdown. Sex filters are available for unemployment and real earnings through PNAD Continuous/IBGE.')}</div>`;
  return `<div class="error">${t('A fonte oficial deste indicador não publica recorte estadual compatível com esta métrica.','The official source for this indicator does not publish a compatible state-level breakdown.')}</div>`;
}

function cards(items){return'<div class="kpis">'+items.map(x=>`<div class="kpi"><span>${esc(x.label)}</span><strong>${esc(x.value)}</strong>${x.small?`<small>${esc(x.small)}</small>`:''}</div>`).join('')+'</div>'}
function table(points,m,limit=18){const rows=[...points].slice(-limit).reverse();return`<div class="table-wrap"><table class="data-table"><thead><tr><th>${t('Referência','Reference')}</th><th>${esc(label(m))}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(monthFmt(r.date))}</td><td class="number">${esc(formatValue(r.value,m))}</td></tr>`).join('')}</tbody></table></div>`}
function chart(sets,title,chartMeta=null){
  const W=760,H=292,P={l:50,r:20,t:26,b:42};
  const validSets=sets.map(s=>({...s,points:(s.points||[]).filter(p=>Number.isFinite(p.value)&&p.date)})).filter(s=>s.points.length);
  if(validSets.reduce((n,s)=>n+s.points.length,0)<2)return '';

  const yearlySets=validSets.map(s=>{
    const byYear=new Map();
    for(const p of s.points){
      const year=String(p.date).slice(0,4);
      const prev=byYear.get(year);
      if(!prev||String(p.date)>String(prev.date))byYear.set(year,p);
    }
    return {...s,points:[...byYear.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([year,p])=>({...p,sourceDate:p.date,date:year+'-01-01'}))};
  });

  const payloadFor=layerSets=>({
    dates:[...new Set(layerSets.flatMap(s=>s.points.map(p=>p.date)))].sort(),
    series:layerSets.map(s=>({
      label:s.label,
      points:s.points.map(p=>{
        const m=s.meta||chartMeta||{};
        const sourceDate=p.sourceDate||p.date;
        return {date:p.date,sourceDate,dateLabel:monthFmt(sourceDate),valueLabel:formatValue(p.value,m)};
      })
    }))
  });

  const renderLayer=(layerSets,granularity,hidden)=>{
    const all=layerSets.flatMap(s=>s.points.map(p=>p.value)).filter(Number.isFinite);
    const min=Math.min(...all),max=Math.max(...all),span=Math.max(1e-9,max-min);
    const dates=[...new Set(layerSets.flatMap(s=>s.points.map(p=>p.date)))].sort();
    const x=d=>P.l+(dates.indexOf(d)/Math.max(1,dates.length-1))*(W-P.l-P.r);
    const y=v=>P.t+(1-(v-min)/span)*(H-P.t-P.b);
    const ticks=[0,.25,.5,.75,1].map(f=>{
      const v=min+span*(1-f),yy=P.t+f*(H-P.t-P.b);
      return '<line class="grid" x1="'+P.l+'" y1="'+yy+'" x2="'+(W-P.r)+'" y2="'+yy+'"/><text class="axis" x="'+(P.l-8)+'" y="'+(yy+4)+'" text-anchor="end">'+numFmt(v,1)+'</text>';
    }).join('');
    const paths=layerSets.map((s,i)=>{
      const d=s.points.map((p,j)=>(j?'L ':'M ')+x(p.date).toFixed(1)+' '+y(p.value).toFixed(1)).join(' ');
      return '<path class="ci-series ci-series-'+(i+1)+'" d="'+d+'"/>';
    }).join('');
    const first=dates[0],last=dates.at(-1);
    const left=granularity==='year'?String(first).slice(0,4):monthFmt(first);
    const right=granularity==='year'?String(last).slice(0,4):monthFmt(last);
    return '<g class="ci-chart-layer" data-granularity-layer="'+granularity+'" style="'+(hidden?'display:none':'')+'">'+ticks+paths+'<text class="axis" x="'+P.l+'" y="'+(H-11)+'">'+esc(left)+'</text><text class="axis" x="'+(W-P.r)+'" y="'+(H-11)+'" text-anchor="end">'+esc(right)+'</text></g>';
  };

  const defaultGranularity=Math.max(...validSets.map(s=>s.points.length))>48?'year':'month';
  const payload=encodeURIComponent(JSON.stringify({year:payloadFor(yearlySets),month:payloadFor(validSets)}));
  const legends=validSets.map((s,i)=>'<span><i class="ci-key ci-key-'+(i+1)+'"></i>'+esc(s.label)+'</span>').join('');
  const yearLayer=renderLayer(yearlySets,'year',defaultGranularity!=='year');
  const monthLayer=renderLayer(validSets,'month',defaultGranularity!=='month');
  const methodHidden=defaultGranularity==='year'?'':' hidden';

  return '<div class="chart ci-history-chart" data-chart-payload="'+esc(payload)+'" data-chart-width="'+W+'" data-plot-left="'+P.l+'" data-plot-right="'+P.r+'">'
    +'<div class="ci-chart-heading"><div><strong>'+esc(title)+'</strong><div class="ci-legend">'+legends+'</div></div>'
    +'<label class="ci-granularity-control"><span>'+t('Visualizar','View')+'</span><select class="ci-granularity-select" aria-label="'+t('Granularidade do gráfico','Chart granularity')+'">'
    +'<option value="year"'+(defaultGranularity==='year'?' selected':'')+'>'+t('Anos','Years')+'</option>'
    +'<option value="month"'+(defaultGranularity==='month'?' selected':'')+'>'+t('Meses','Months')+'</option></select></label></div>'
    +'<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(title)+'">'+yearLayer+monthLayer
    +'<line class="ci-chart-crosshair" x1="0" y1="'+P.t+'" x2="0" y2="'+(H-P.b)+'" style="display:none"/>'
    +'<rect class="ci-chart-hit-area" x="'+P.l+'" y="'+P.t+'" width="'+(W-P.l-P.r)+'" height="'+(H-P.t-P.b)+'" fill="transparent" tabindex="0"/></svg>'
    +'<small class="ci-chart-method"'+methodHidden+'>'+t('Anos: um ponto por ano, usando a última observação disponível daquele ano.','Years: one point per year, using the last available observation for that year.')+'</small></div>';
}
function capability(){
  return`<div class="sci-capability-overview"><h2 class="result-title">${t('O que eu consigo analisar','What I can analyze')}</h2><p class="answer">${t('A base combina séries oficiais de crédito e macroeconomia. Você pode consultar valores atuais, evolução histórica, comparar indicadores, ranquear modalidades de inadimplência, explorar correlações e ver projeções estatísticas de curto prazo.','The database combines official credit and macroeconomic series. You can query current values, historical trends, compare indicators, rank delinquency categories, explore correlations and view short-term statistical projections.')}</p><ul><li>${t('Inadimplência PF, PJ, cartão, rotativo, crédito pessoal e veículos.','Household, corporate, credit card, revolving, personal credit and vehicle-loan delinquency.')}</li><li>${t('Endividamento e comprometimento de renda das famílias.','Household debt and debt-service ratio.')}</li><li>${t('Saldo, concessões e juros médios do crédito.','Credit balances, new lending and average interest rates.')}</li><li>${t('Selic, IPCA, desemprego e renda real.','Selic, IPCA, unemployment and real income.')}</li><li>${t('Comparações e rankings por estado para crédito e inadimplência; desemprego e renda por estado e sexo.','State comparisons and rankings for credit and delinquency; unemployment and income by state and sex.')}</li></ul></div>`
}
function ranking(){
  const keys=['delinquency_card','delinquency_revolving','delinquency_personal','delinquency_vehicle'],rows=keys.map(k=>({m:meta(k),r:latest(k)})).filter(x=>x.r).sort((a,b)=>b.r.value-a.r.value),winner=rows[0];
  return`<h2 class="result-title">${t('Modalidades com maior inadimplência','Highest delinquency categories')}</h2><p class="answer">${t('Na leitura mais recente de cada série,','Using the latest observation available for each series,')} <strong>${esc(label(winner.m))}</strong> ${t('aparece no topo, com','ranks first at')} <strong>${esc(formatValue(winner.r.value,winner.m))}</strong>.</p>${cards(rows.map(x=>({label:label(x.m),value:formatValue(x.r.value,x.m),small:monthFmt(x.r.date)})))}<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>${t('Modalidade','Category')}</th><th>${t('Valor','Value')}</th><th>${t('Referência','Reference')}</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(label(x.m))}</td><td class="number">${esc(formatValue(x.r.value,x.m))}</td><td>${esc(monthFmt(x.r.date))}</td></tr>`).join('')}</tbody></table></div>`
}
function trendAnswer(key,q){
  const m=meta(key);
  let rows=seriesRows(key);
  const [fromYear,toYear]=yearsIn(q),n=norm(q);
  if(fromYear||toYear)rows=sliceRange(rows,q);
  else if(!/histor|serie completa|série completa|full series|toda a serie|toda a série/.test(n))rows=rows.slice(-36);
  if(!m||!rows.length)return `<div class="error">${t('Não encontrei dados para esse recorte.','I could not find data for that selection.')}</div>`;
  const first=rows[0],last=rows.at(-1),change=last.value-first.value,yearAgo=rows.length>12?rows.at(-13):first,yoyDelta=last.value-yearAgo.value;
  const isRate=(m.unit||'').includes('%');
  const deltaText=isRate?`${numFmt(Math.abs(change),2)} p.p.`:formatValue(Math.abs(change),m);
  const yoyText=isRate?`${yoyDelta>=0?'+':''}${numFmt(yoyDelta,2)} p.p.`:`${((last.value/yearAgo.value)-1)>=0?'+':''}${numFmt(((last.value/yearAgo.value)-1)*100,1)}%`;
  const direction=change>0?t('subiu','increased'):change<0?t('caiu','decreased'):t('ficou estável','was stable');
  return `<h2 class="result-title">${esc(label(m))}</h2><p class="answer">${t('O último valor disponível é','The latest available value is')} <strong>${esc(formatValue(last.value,m))}</strong> (${esc(monthFmt(last.date))}). ${t('No período exibido, o indicador','Over the displayed period, the indicator')} <strong>${direction}</strong> ${esc(deltaText)}.</p>${cards([{label:t('Último valor','Latest value'),value:formatValue(last.value,m),small:monthFmt(last.date)},{label:t('Variação 12 meses','12-month change'),value:yoyText},{label:t('Início do recorte','Start of range'),value:formatValue(first.value,m),small:monthFmt(first.date)}])}${chart([{label:label(m),points:rows,meta:m}],label(m),m)}`
}
function compareAnswer(keys,q){
  const ms=keys.slice(0,2).map(meta),sets=keys.slice(0,2).map((k,i)=>({label:label(ms[i]),points:sliceRange(seriesRows(k),q)})).filter(s=>s.points.length);if(sets.length<2)return trendAnswer(keys[0],q);
  const last=sets.map((s,i)=>({m:ms[i],r:s.points.at(-1)}));
  return`<h2 class="result-title">${t('Comparação de indicadores','Indicator comparison')}</h2><p class="answer">${t('Nos dados mais recentes disponíveis,','In the latest available data,')} <strong>${esc(label(last[0].m))}</strong> ${t('está em','is at')} <strong>${esc(formatValue(last[0].r.value,last[0].m))}</strong> ${t('e','and')} <strong>${esc(label(last[1].m))}</strong> ${t('em','is at')} <strong>${esc(formatValue(last[1].r.value,last[1].m))}</strong>.</p>${cards(last.map(x=>({label:label(x.m),value:formatValue(x.r.value,x.m),small:monthFmt(x.r.date)})))}${chart(sets.map((s,i)=>({...s,meta:ms[i]})),t('Evolução comparada','Comparison over time'),ms[0])}`
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
  return`<h2 class="result-title">${t('Projeção de curto prazo','Short-term projection')} — ${esc(label(m))}</h2><p class="answer">${t('O último valor observado é','The latest observed value is')} <strong>${esc(formatValue(last.value,m))}</strong>. ${t('O modelo de tendência + sazonalidade projeta','The trend + seasonality model projects')} <strong>${esc(formatValue(end.value,m))}</strong> ${t('para','for')} <strong>${esc(monthFmt(end.date))}</strong>.</p>${cards([{label:t('Observado','Observed'),value:formatValue(last.value,m),small:monthFmt(last.date)},{label:t('Projeção 6 meses','6-month forecast'),value:formatValue(end.value,m),small:monthFmt(end.date)},{label:t('Faixa 80%','80% interval'),value:`${formatValue(end.low80,m)} – ${formatValue(end.high80,m)}`}])}${chart([{label:t('Observado + projeção','Observed + forecast'),points:combined,meta:m}],t('Histórico recente e projeção','Recent history and forecast'),m)}<p class="answer"><small>${esc(window.creditLocale==='en'?f.note_en:f.note_pt)}</small></p>`
}
function answer(q){
  const n=norm(q);
  if(/o que voce pode fazer|o que você pode fazer|what can you do|capabilities/.test(n))return capability();

  const keys=identify(q);
  const key=keys[0]||'delinquency_pf';
  const ufs=statesIn(q);
  const genders=genderIn(q);
  const asksState=/\b(estado|estados|uf|ufs|state|states)\b/.test(n)||ufs.length>0;
  const asksGender=genders.length>0||/\b(sexo|genero|gênero|gender|sex)\b/.test(n);
  const asksRankingState=asksState&&/(maior|maiores|menor|menores|ranking|rank|which state|which states|top)/.test(n);

  if(asksGender){
    if(!dimSupports(key,'gender'))return dimensionUnavailable(key,'gender');
    if(!ufs.length){
      const hasBR=state.dimensions.genderState.some(r=>r.key===key&&r.uf==='BR');
      if(!hasBR)return `<div class="error">${t('Para este recorte por sexo, informe também um estado. Ex.: “compare homens e mulheres em São Paulo”.','For this sex breakdown, please also specify a state. Example: “compare men and women in São Paulo”.')}</div>`;
    }
    return genderStateAnswer(key,ufs[0]||'BR',genders.length?genders:['men','women'],q);
  }

  if(asksState){
    if(!dimSupports(key,'state'))return dimensionUnavailable(key,'state');
    if(asksRankingState&&!ufs.length)return stateRankingAnswer(key,/menor|menores|lowest/.test(n),q);
    if(ufs.length>=2)return compareStatesAnswer(key,ufs,q);
    if(ufs.length===1)return stateTrendAnswer(key,ufs[0],q);
    return stateRankingAnswer(key,false,q);
  }

  if(/maior inadimplencia|maior inadimplência|highest delinquency|qual modalidade|which credit category/.test(n))return ranking();
  if(/previs|projec|projeç|forecast|predict/.test(n))return forecastAnswer(key);
  if(/correl|relacao|relação|relationship|impact|selic.*inadimpl|inadimpl.*selic|desemprego.*inadimpl|inadimpl.*desemprego/.test(n)){
    let pair=keys;if(pair.length<2){if(n.includes('selic'))pair=['delinquency_pf','selic'];else if(n.includes('desemprego'))pair=['delinquency_pf','unemployment'];else if(n.includes('inflacao')||n.includes('inflação'))pair=['delinquency_pf','ipca']}return correlationAnswer(pair)
  }
  if(keys.length>=2||/compar|versus|\bvs\b/.test(n))return compareAnswer(keys.length>=2?keys:['delinquency_pf','delinquency_pj'],q);
  return trendAnswer(key,q);
}
function updateLocaleUI(){
  const lang=window.creditLocale,c=copy[lang];
  document.documentElement.lang=lang==='en'?'en':'pt-BR';
  $('#hero-title').textContent=c.title;
  $('#hero-subtitle').textContent=c.subtitle;
  $('#question').placeholder=c.placeholder;
  $('#loading-title').textContent=c.loading;
  $('#loading-small').textContent=c.loadingSmall;
  $('#brand-by').textContent=c.by;
  $('#locale-toggle').textContent=lang==='en'?'PT':'EN';
  $('#locale-toggle').setAttribute('aria-label',lang==='en'?'Mudar para português':'Switch to English');
  $('#locale-toggle').setAttribute('title',lang==='en'?'Mudar para português':'Switch to English');
  $('#new-chat').setAttribute('aria-label',lang==='en'?'New chat':'Novo chat');
  $('#new-chat').setAttribute('title',lang==='en'?'New chat':'Novo chat');
  $('#theme-toggle').setAttribute('aria-label',lang==='en'?'Switch theme':'Alternar tema');
  document.querySelectorAll('[data-q-pt]').forEach(btn=>btn.textContent=lang==='en'?btn.dataset.qEn:btn.dataset.qPt);
  const dataLink=document.querySelector('.data-link');
  if(dataLink)dataLink.textContent=lang==='en'?'Data':'Dados';

  const modalCopy=lang==='en'?{
    eyebrow:'ABOUT THE DATA',
    title:'Data and methodology',
    intro:'The platform combines official sources to answer questions about credit, delinquency and the macroeconomic context without mixing incompatible granularities.',
    nationalTag:'BRAZIL',
    nationalTitle:'National series',
    nationalText:'Credit, delinquency, household debt, interest rates, Selic and inflation come from official Central Bank series. Unemployment and income are also included in the national layer.',
    stateTag:'27 STATES',
    stateTitle:'Credit by state',
    stateText:'The monthly state layer uses Central Bank SCR.data. State delinquency is calculated as balances more than 90 days past due divided by the active credit portfolio.',
    sexTag:'SEX',
    sexTitle:'Men and women',
    sexText:'For unemployment and earnings, IBGE PNAD Continuous allows comparisons for Total, Men and Women in Brazil and all 27 states. The project does not infer gender where the source does not publish this dimension.',
    updateTitle:'Automatic updates',
    updateText:'GitHub Actions checks the official sources, validates responses and preserves the last valid version if an API fails. The state history currently begins in July 2012.',
    github:'View data on GitHub ↗',
    close:'Close'
  }:{
    eyebrow:'SOBRE A BASE',
    title:'Dados e metodologia',
    intro:'A plataforma combina fontes oficiais para responder perguntas sobre crédito, inadimplência e contexto macroeconômico sem misturar granularidades incompatíveis.',
    nationalTag:'BRASIL',
    nationalTitle:'Séries nacionais',
    nationalText:'Indicadores de crédito, inadimplência, endividamento, juros, Selic e inflação vêm de séries oficiais do Banco Central. Desemprego e renda também entram na camada nacional.',
    stateTag:'27 UFs',
    stateTitle:'Crédito por estado',
    stateText:'O recorte mensal por estado usa o SCR.data do Banco Central. A inadimplência estadual é calculada com carteira em atraso acima de 90 dias sobre a carteira ativa.',
    sexTag:'SEXO',
    sexTitle:'Homens e mulheres',
    sexText:'Para desemprego e rendimento, a PNAD Contínua do IBGE permite comparar Total, Homens e Mulheres no Brasil e nas 27 UFs. O projeto não infere gênero onde a fonte não publica essa dimensão.',
    updateTitle:'Atualização automática',
    updateText:'GitHub Actions consulta as fontes oficiais, valida os retornos e preserva a última versão válida se alguma API falhar. O histórico estadual disponível começa em julho de 2012.',
    github:'Ver dados no GitHub ↗',
    close:'Fechar'
  };
  const ids={
    'data-info-eyebrow':'eyebrow','data-info-title':'title','data-info-intro':'intro',
    'data-info-national-tag':'nationalTag','data-info-national-title':'nationalTitle','data-info-national-text':'nationalText',
    'data-info-state-tag':'stateTag','data-info-state-title':'stateTitle','data-info-state-text':'stateText',
    'data-info-sex-tag':'sexTag','data-info-sex-title':'sexTitle','data-info-sex-text':'sexText',
    'data-info-update-title':'updateTitle','data-info-update-text':'updateText','data-info-github':'github','data-info-dismiss':'close'
  };
  for(const [id,key] of Object.entries(ids)){const el=document.getElementById(id);if(el)el.textContent=modalCopy[key]}
  const close=document.getElementById('data-info-close');
  if(close)close.setAttribute('aria-label',modalCopy.close);

  window.dispatchEvent(new CustomEvent('credit:locale-changed',{detail:{locale:lang}}));
}
async function load(){
  const box=$('#loading-card');box.classList.add('is-visible');
  try{
    const stamp=Date.now();
    const [dr,cr,fr,sr,gr,dcr]=await Promise.all([
      fetch(`data/credit_intelligence.json?v=${stamp}`,{cache:'no-store'}),
      fetch(`data/catalog.json?v=${stamp}`,{cache:'no-store'}),
      fetch(`data/forecasts.json?v=${stamp}`,{cache:'no-store'}),
      fetch(`data/dimensions/state_credit.json?v=${stamp}`,{cache:'no-store'}).catch(()=>null),
      fetch(`data/dimensions/gender_state.json?v=${stamp}`,{cache:'no-store'}).catch(()=>null),
      fetch(`data/dimensions/catalog.json?v=${stamp}`,{cache:'no-store'}).catch(()=>null)
    ]);
    if(!dr.ok||!cr.ok||!fr.ok)throw Error(t('Arquivos de dados ainda não publicados.','Data files have not been published yet.'));
    state.rows=await dr.json();
    state.catalog=await cr.json();
    state.forecasts=await fr.json();
    state.dimensions.stateCredit=sr?.ok?await sr.json():[];
    state.dimensions.genderState=gr?.ok?await gr.json():[];
    state.dimensions.catalog=dcr?.ok?await dcr.json():[];
    state.series=new Map();
    for(const r of state.rows){if(!state.series.has(r.key))state.series.set(r.key,[]);state.series.get(r.key).push(r)}
    for(const rows of state.series.values())rows.sort((a,b)=>a.date.localeCompare(b.date));
    state.ready=true;
    box.classList.remove('is-visible');
    window.dispatchEvent(new CustomEvent('credit:data-ready'));
  }catch(e){box.innerHTML=`<div><strong>${esc(t('Não foi possível carregar a base.','Could not load the data.'))}</strong><small>${esc(e.message)}</small></div>`;box.classList.add('is-visible')}
}
function initChartInteractions(){
  let tooltip=document.querySelector('.historical-chart-tooltip');
  if(!tooltip){
    tooltip=document.createElement('div');
    tooltip.className='historical-chart-tooltip';
    tooltip.hidden=true;
    document.body.appendChild(tooltip);
  }
  const hide=chart=>{
    tooltip.hidden=true;
    const crosshair=chart?.querySelector('.ci-chart-crosshair');
    if(crosshair)crosshair.style.display='none';
  };
  const position=(event,target)=>{
    const rect=target.getBoundingClientRect();
    const x=event?.clientX||rect.left+rect.width/2;
    const y=event?.clientY||rect.top+rect.height/2;
    const width=tooltip.offsetWidth||170,height=tooltip.offsetHeight||80,pad=10;
    tooltip.style.left=Math.min(window.innerWidth-width-pad,Math.max(pad,x+14))+'px';
    tooltip.style.top=Math.min(window.innerHeight-height-pad,Math.max(pad,y-height-14))+'px';
  };
  const showAt=(target,event)=>{
    const chart=target.closest('.ci-history-chart');
    if(!chart)return;
    let payload;
    try{payload=JSON.parse(decodeURIComponent(chart.dataset.chartPayload||''))}catch(_){return}
    const granularity=chart.querySelector('.ci-granularity-select')?.value||chart.dataset.defaultGranularity||'month';
    const layer=payload[granularity];
    if(!layer?.dates?.length)return;
    const rect=target.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,((event?.clientX||rect.left)-rect.left)/Math.max(1,rect.width)));
    const index=Math.max(0,Math.min(layer.dates.length-1,Math.round(ratio*(layer.dates.length-1))));
    const date=layer.dates[index];
    const entries=layer.series.map(series=>({series,point:series.points.find(p=>p.date===date)})).filter(x=>x.point);
    if(!entries.length)return;
    const dateLabel=entries[0].point.dateLabel;
    tooltip.innerHTML='<strong>'+esc(dateLabel)+'</strong>'+entries.map(({series,point})=>'<span><b>'+esc(series.label)+'</b> · '+esc(point.valueLabel)+'</span>').join('');
    tooltip.hidden=false;
    position(event,target);

    const W=+chart.dataset.chartWidth||760,left=+chart.dataset.plotLeft||50,right=+chart.dataset.plotRight||20;
    const x=left+(index/Math.max(1,layer.dates.length-1))*(W-left-right);
    const crosshair=chart.querySelector('.ci-chart-crosshair');
    if(crosshair){crosshair.setAttribute('x1',x);crosshair.setAttribute('x2',x);crosshair.style.display='';}
  };

  document.addEventListener('change',event=>{
    const target=event.target;
    if(!(target instanceof HTMLSelectElement)||!target.matches('.ci-granularity-select'))return;
    const chart=target.closest('.ci-history-chart');
    if(!chart)return;
    const value=target.value;
    chart.querySelectorAll('.ci-chart-layer').forEach(layer=>{layer.style.display=layer.dataset.granularityLayer===value?'':'none'});
    const method=chart.querySelector('.ci-chart-method');
    if(method)method.hidden=value!=='year';
    hide(chart);
  });
  document.addEventListener('pointermove',event=>{
    const target=event.target;
    if(target instanceof Element&&target.matches('.ci-chart-hit-area'))showAt(target,event);
  });
  document.addEventListener('pointerleave',event=>{
    const target=event.target;
    if(target instanceof Element&&target.matches('.ci-chart-hit-area'))hide(target.closest('.ci-history-chart'));
  },true);
  document.addEventListener('pointerdown',event=>{
    const target=event.target;
    if(target instanceof Element&&target.matches('.ci-chart-hit-area'))showAt(target,event);
  });
  document.addEventListener('focusout',event=>{
    const target=event.target;
    if(target instanceof Element&&target.matches('.ci-chart-hit-area'))hide(target.closest('.ci-history-chart'));
  });
}
function init(){
  document.documentElement.dataset.theme=state.theme;updateLocaleUI();
  initChartInteractions();
  $('#theme-toggle').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;localStorage.setItem('ci-theme',state.theme)});
  $('#locale-toggle').addEventListener('click',()=>{
    window.creditLocale=window.creditLocale==='pt'?'en':'pt';
    localStorage.setItem('ci-locale',window.creditLocale);
    updateLocaleUI();
  });
  const newChat=()=>{$('#conversation').replaceChildren();$('#home-hero').hidden=false;$('#question').focus()};
  $('#new-chat').addEventListener('click',newChat);
  $('#new-chat').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();newChat();}});

  const dataOpen=document.getElementById('data-info-open');
  const dataModal=document.getElementById('data-info-modal');
  const dataBackdrop=document.getElementById('data-info-backdrop');
  const dataClose=document.getElementById('data-info-close');
  const dataDismiss=document.getElementById('data-info-dismiss');
  let dataPreviousFocus=null;
  const setDataModal=open=>{
    if(!dataModal||!dataBackdrop)return;
    if(open){
      dataPreviousFocus=document.activeElement;
      dataModal.hidden=false;
      dataBackdrop.hidden=false;
      dataModal.setAttribute('aria-hidden','false');
      document.body.classList.add('data-info-open');
      requestAnimationFrame(()=>dataClose?.focus({preventScroll:true}));
    }else{
      dataModal.setAttribute('aria-hidden','true');
      dataModal.hidden=true;
      dataBackdrop.hidden=true;
      document.body.classList.remove('data-info-open');
      if(dataPreviousFocus instanceof HTMLElement)dataPreviousFocus.focus({preventScroll:true});
    }
  };
  dataOpen?.addEventListener('click',()=>setDataModal(true));
  dataClose?.addEventListener('click',()=>setDataModal(false));
  dataDismiss?.addEventListener('click',()=>setDataModal(false));
  dataBackdrop?.addEventListener('click',()=>setDataModal(false));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&dataModal&&!dataModal.hidden){
      event.preventDefault();
      setDataModal(false);
    }
  });

  load();
}
init();
