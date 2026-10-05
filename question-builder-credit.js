(() => {
  'use strict';
  const form=document.querySelector('#question-form'),input=document.querySelector('#question');
  if(!form||!input||typeof state==='undefined')return;

  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='ci-builder-toggle';toggle.setAttribute('aria-label','Montar pergunta');toggle.setAttribute('aria-expanded','false');
  toggle.innerHTML='<svg viewBox="0 0 32 32" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5 20.7 4.8a2.5 2.5 0 0 1 3.5 3.5L10.5 22 5.5 23.5Z"/><path d="m18.8 6.7 3.5 3.5"/><circle cx="8" cy="28" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="28" r="1" fill="currentColor" stroke="none"/><circle cx="24" cy="28" r="1" fill="currentColor" stroke="none"/></svg>';
  input.before(toggle);

  const backdrop=document.createElement('div');backdrop.className='ci-builder-backdrop';backdrop.hidden=true;
  const panel=document.createElement('section');panel.className='ci-builder-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.innerHTML=`
    <div class="ci-builder-head"><div><strong id="cib-title">Montar pergunta</strong><p id="cib-sub">Escolha uma análise e os indicadores.</p></div><button class="ci-builder-close" type="button" aria-label="Fechar">×</button></div>
    <div class="ci-builder-body">
      <div class="ci-builder-actions">
        <button type="button" data-action="trend" aria-pressed="true">Evolução</button>
        <button type="button" data-action="compare" aria-pressed="false">Comparar</button>
        <button type="button" data-action="correlation" aria-pressed="false">Relação</button>
        <button type="button" data-action="forecast" aria-pressed="false">Previsão</button>
      </div>
      <div class="ci-builder-fields">
        <label class="ci-builder-field"><span id="cib-ind1-label">Indicador</span><select id="cib-ind1"></select></label>
        <label class="ci-builder-field" id="cib-ind2-wrap" hidden><span id="cib-ind2-label">Segundo indicador</span><select id="cib-ind2"></select></label>
        <label class="ci-builder-field" id="cib-period-wrap"><span id="cib-period-label">Período</span><select id="cib-period"><option value="5">Últimos 5 anos</option><option value="10">Últimos 10 anos</option><option value="all">Toda a série</option><option value="latest">Valor mais recente</option></select></label>
      </div>
      <div class="ci-builder-preview"><small id="cib-preview-label">Pergunta</small><strong id="cib-preview"></strong></div>
    </div>
    <div class="ci-builder-footer"><button type="button" class="ci-builder-send" id="cib-send">Enviar pergunta ↑</button></div>`;
  document.body.append(backdrop,panel);

  const q=s=>panel.querySelector(s),actions=[...panel.querySelectorAll('[data-action]')],ind1=q('#cib-ind1'),ind2=q('#cib-ind2'),period=q('#cib-period'),preview=q('#cib-preview');
  let action='trend',open=false;

  const isEn=()=>window.creditLocale==='en';
  const display=m=>m?.[isEn()?'en':'pt']||m?.key||'';

  function populate(){
    if(!state.catalog?.length)return;
    const current1=ind1.value,current2=ind2.value;
    const options=state.catalog.map(m=>`<option value="${m.key}">${display(m)}</option>`).join('');
    ind1.innerHTML=options;ind2.innerHTML=options;
    if(state.catalog.some(m=>m.key===current1))ind1.value=current1;else ind1.value='delinquency_pf';
    if(state.catalog.some(m=>m.key===current2))ind2.value=current2;else ind2.value='selic';
    if(action==='forecast'){
      const forecastable=['delinquency_pf','delinquency_pj','delinquency_card','delinquency_revolving','delinquency_personal','delinquency_vehicle'];
      [...ind1.options].forEach(o=>o.hidden=!forecastable.includes(o.value));
      if(!forecastable.includes(ind1.value))ind1.value='delinquency_pf';
    }else [...ind1.options].forEach(o=>o.hidden=false);
  }

  function periodText(){
    if(period.value==='latest')return isEn()?'today':'hoje';
    if(period.value==='all')return isEn()?'across the full available series':'em toda a série disponível';
    return isEn()?`over the last ${period.value} years`:`nos últimos ${period.value} anos`;
  }
  function build(){
    const a=display(state.catalog.find(m=>m.key===ind1.value)),b=display(state.catalog.find(m=>m.key===ind2.value)),p=periodText();
    if(action==='forecast')return isEn()?`What is the 6-month forecast for ${a}?`:`Qual é a previsão de ${a} para os próximos 6 meses?`;
    if(action==='correlation')return isEn()?`What is the relationship between ${a} and ${b}?`:`Qual é a relação entre ${a} e ${b}?`;
    if(action==='compare')return isEn()?`Compare ${a} and ${b} ${p}.`:`Compare ${a} e ${b} ${p}.`;
    if(period.value==='latest')return isEn()?`What is the latest value for ${a}?`:`Qual é o valor mais recente de ${a}?`;
    return isEn()?`How has ${a} changed ${p}?`:`Como evoluiu ${a} ${p}?`;
  }
  function localize(){
    q('#cib-title').textContent=isEn()?'Build a question':'Montar pergunta';
    q('#cib-sub').textContent=isEn()?'Choose an analysis and the indicators.':'Escolha uma análise e os indicadores.';
    q('#cib-ind1-label').textContent=isEn()?'Indicator':'Indicador';
    q('#cib-ind2-label').textContent=isEn()?'Second indicator':'Segundo indicador';
    q('#cib-period-label').textContent=isEn()?'Period':'Período';
    q('#cib-preview-label').textContent=isEn()?'Question':'Pergunta';
    q('#cib-send').textContent=isEn()?'Ask ↑':'Enviar pergunta ↑';
    const labels=isEn()?['Trend','Compare','Relationship','Forecast']:['Evolução','Comparar','Relação','Previsão'];
    actions.forEach((b,i)=>b.textContent=labels[i]);
    const opts=[...period.options],texts=isEn()?['Last 5 years','Last 10 years','Full series','Latest value']:['Últimos 5 anos','Últimos 10 anos','Toda a série','Valor mais recente'];
    opts.forEach((o,i)=>o.textContent=texts[i]);
    populate();preview.textContent=build();
  }
  function sync(){
    actions.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.action===action)));
    q('#cib-ind2-wrap').hidden=!['compare','correlation'].includes(action);
    q('#cib-period-wrap').hidden=['correlation','forecast'].includes(action);
    populate();preview.textContent=build();
  }
  function setOpen(value){
    open=value;toggle.setAttribute('aria-expanded',String(open));
    if(open){localize();backdrop.hidden=false;requestAnimationFrame(()=>{backdrop.classList.add('is-open');panel.classList.add('is-open')})}
    else{backdrop.classList.remove('is-open');panel.classList.remove('is-open');setTimeout(()=>{if(!open)backdrop.hidden=true},430)}
  }

  actions.forEach(b=>b.addEventListener('click',()=>{action=b.dataset.action;sync()}));
  [ind1,ind2,period].forEach(el=>el.addEventListener('change',()=>{if(ind1.value===ind2.value&&['compare','correlation'].includes(action)){const alt=[...ind2.options].find(o=>o.value!==ind1.value&&!o.hidden);if(alt)ind2.value=alt.value}preview.textContent=build()}));
  toggle.addEventListener('click',()=>setOpen(!open));
  backdrop.addEventListener('click',()=>setOpen(false));
  q('.ci-builder-close').addEventListener('click',()=>setOpen(false));
  q('#cib-send').addEventListener('click',()=>{const text=build();setOpen(false);input.value=text;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)setOpen(false)});
})();