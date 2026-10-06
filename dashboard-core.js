'use strict';

const $ = selector => document.querySelector(selector);
const locale = 'pt-BR';
const COLORS = ['#0736fe','#d85a5a','#13866f'];
const UF_LABELS = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
const FALLBACK_META = {
  problem_assets_pf:{key:'problem_assets_pf',pt:'Ativo problemático - PF',unit:'%'},
  problem_assets_pj:{key:'problem_assets_pj',pt:'Ativo problemático - PJ',unit:'%'}
};
const KPI_KEYS = ['delinquency_pf','delinquency_pj','credit_balance_pf','household_debt','credit_interest_pf','selic'];
const MACRO_KEYS = ['selic','ipca','unemployment','real_income'];
const COMPOSITION_KEYS = ['delinquency_revolving','delinquency_card','delinquency_vehicle','delinquency_personal','delinquency_pf'];
const PREFERRED_MAP_KEYS = ['delinquency_pf','delinquency_pj','delinquency_card','delinquency_revolving','delinquency_personal','delinquency_vehicle','problem_assets_pf','problem_assets_pj','credit_balance_pf','credit_balance_pj','unemployment','real_income'];

const app = {
  rows:[], catalog:[], forecasts:{}, geometry:null,
  dimensions:{stateCredit:[],genderState:[],catalog:[],metadata:{}},
  series:new Map(), selectedStates:[], metric:'delinquency_pf', period:'60'
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value,digits=2) => new Intl.NumberFormat(locale,{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const compact = value => new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(value);
const month = iso => iso ? new Intl.DateTimeFormat(locale,{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(iso.slice(0,10)+'T12:00:00Z')).replace('.','') : '—';
const dateLabel = iso => iso ? new Intl.DateTimeFormat(locale,{month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(iso.slice(0,10)+'T12:00:00Z')) : '—';
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

function meta(key){return app.catalog.find(x=>x.key===key)||app.dimensions.catalog.find(x=>x.key===key)||FALLBACK_META[key]||{key,pt:key,unit:''}}
function label(key){return meta(key).pt||key}
function nationalSeries(key){return app.series.get(key)||[]}
function supports(key,dimension){return app.dimensions.catalog.some(item=>item.key===key&&(item.dimensions||[]).includes(dimension))}
function stateSource(key){return supports(key,'gender')?app.dimensions.genderState.filter(r=>r.key===key&&r.gender==='total'&&r.uf!=='BR'):app.dimensions.stateCredit.filter(r=>r.key===key)}
function stateSeries(key,uf){return stateSource(key).filter(r=>r.uf===uf).sort((a,b)=>a.date.localeCompare(b.date))}
function latestStateRows(key){const map=new Map();for(const row of stateSource(key)){const prev=map.get(row.uf);if(!prev||row.date>prev.date)map.set(row.uf,row)}return map}
function latestNational(key){return nationalSeries(key).at(-1)||null}

function formatValue(value,m=meta('')){
  if(!Number.isFinite(Number(value))) return '—';
  value=Number(value);
  const unit=m.unit||'';
  if(unit.includes('R$ mi')){
    if(Math.abs(value)>=1_000_000) return `R$ ${num(value/1_000_000,2)} tri`;
    if(Math.abs(value)>=1_000) return `R$ ${num(value/1_000,1)} bi`;
    return `R$ ${num(value,0)} mi`;
  }
  if(unit==='R$') return `R$ ${new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(value)}`;
  if(unit.includes('% a.a.')) return `${num(value,2)}% a.a.`;
  if(unit.includes('% a.m.')) return `${num(value,2)}% a.m.`;
  if(unit.includes('%')) return `${num(value,2)}%`;
  return `${num(value,2)}${unit?' '+unit:''}`;
}

function delta12m(rows,m){
  if(rows.length<2)return null;
  const last=rows.at(-1);
  const target=new Date(last.date.slice(0,10)+'T12:00:00Z'); target.setUTCFullYear(target.getUTCFullYear()-1);
  let prev=null;
  for(const r of rows){if(new Date(r.date.slice(0,10)+'T12:00:00Z')<=target)prev=r;else break}
  if(!prev)prev=rows[Math.max(0,rows.length-13)];
  if(!prev||!Number.isFinite(prev.value)||!Number.isFinite(last.value))return null;
  const rate=(m.unit||'').includes('%');
  return rate?{value:last.value-prev.value,text:`${last.value-prev.value>=0?'+':''}${num(last.value-prev.value,2)} p.p.`}:{value:last.value-prev.value,text:`${last.value/prev.value-1>=0?'+':''}${num((last.value/prev.value-1)*100,1)}%`};
}

function sparkline(rows){
  const points=rows.filter(r=>Number.isFinite(r.value)).slice(-28);
  if(points.length<2)return '';
  const W=180,H=34,p=2,values=points.map(r=>r.value),min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,1e-9);
  const xy=points.map((r,i)=>[p+i*(W-p*2)/(points.length-1),H-p-(r.value-min)/span*(H-p*2)]);
  const d=xy.map((v,i)=>(i?'L':'M')+v[0].toFixed(1)+' '+v[1].toFixed(1)).join(' ');
  const area=d+` L ${xy.at(-1)[0].toFixed(1)} ${H} L ${xy[0][0].toFixed(1)} ${H} Z`;
  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="spark-area" d="${area}"/><path d="${d}"/></svg>`;
}

function renderKpis(){
  $('#kpi-grid').innerHTML=KPI_KEYS.map(key=>{
    const m=meta(key),rows=nationalSeries(key),last=rows.at(-1),d=delta12m(rows,m);
    const direction=d?.value>0?'up':d?.value<0?'down':'neutral';
    return `<article class="kpi-card">
      <div class="kpi-label"><span>${esc(shortLabel(key))}</span><span>${esc(last?month(last.date):'—')}</span></div>
      <strong>${esc(last?formatValue(last.value,m):'—')}</strong>
      <div class="kpi-meta"><span>12 meses</span><span class="delta ${direction}">${esc(d?.text||'—')}</span></div>
      ${sparkline(rows)}
    </article>`;
  }).join('');
}

function shortLabel(key){return ({delinquency_pf:'Inadimplência PF',delinquency_pj:'Inadimplência PJ',credit_balance_pf:'Carteira PF',household_debt:'Endividamento',credit_interest_pf:'Juros PF',selic:'Selic',ipca:'IPCA',unemployment:'Desemprego',real_income:'Renda real'})[key]||label(key)}

function populateMetricSelect(){
  const select=$('#metric-select');
  const available=new Set(app.dimensions.catalog.filter(x=>(x.dimensions||[]).includes('state')).map(x=>x.key));
  const groups={
    'Inadimplência e risco':PREFERRED_MAP_KEYS.filter(k=>available.has(k)&&(/delinquency|problem_assets/.test(k))),
    'Carteira de crédito':PREFERRED_MAP_KEYS.filter(k=>available.has(k)&&k.startsWith('credit_balance')),
    'Mercado de trabalho':PREFERRED_MAP_KEYS.filter(k=>available.has(k)&&['unemployment','real_income'].includes(k))
  };
  select.innerHTML=Object.entries(groups).filter(([,keys])=>keys.length).map(([name,keys])=>`<optgroup label="${esc(name)}">${keys.map(k=>`<option value="${esc(k)}">${esc(label(k))}</option>`).join('')}</optgroup>`).join('');
  if(!available.has(app.metric))app.metric=[...available][0]||'delinquency_pf';
  select.value=app.metric;
}

