/* Guided credit question builder: same shell/animation contract as Sugar Cane Intelligence. */
(() => {
  'use strict';
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const send = form?.querySelector('button[type="submit"]');
  if (!form || !input || !send || typeof state === 'undefined') return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'question-builder-toggle';
  toggle.className = 'question-builder-toggle';
  toggle.title = 'Montar pergunta';
  toggle.setAttribute('aria-label', 'Montar pergunta escolhendo uma análise');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'question-builder-panel');
  toggle.innerHTML = '<svg viewBox="0 0 32 32" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5 20.7 4.8a2.5 2.5 0 0 1 3.5 3.5L10.5 22 5.5 23.5Z"/><path d="m18.8 6.7 3.5 3.5"/><circle cx="8" cy="28" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="28" r="1" fill="currentColor" stroke="none"/><circle cx="24" cy="28" r="1" fill="currentColor" stroke="none"/></svg>';
  input.before(toggle);

  const backdrop = document.createElement('div');
  backdrop.className = 'question-builder-backdrop';
  backdrop.hidden = true;

  const panel = document.createElement('section');
  panel.id = 'question-builder-panel';
  panel.className = 'question-builder-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Montar uma pergunta');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="qb-heading">
      <div><strong id="qb-title">Montar pergunta</strong><p id="qb-subtitle">Escolha a análise e os indicadores que quer consultar.</p></div>
      <button type="button" class="qb-close" aria-label="Fechar menu">×</button>
    </div>
    <div class="qb-scroll">
      <div class="qb-action-group" role="group" aria-label="Tipo de análise">
        <button type="button" class="qb-action" data-action="trend" aria-pressed="true">Evolução</button>
        <button type="button" class="qb-action" data-action="compare" aria-pressed="false">Comparar</button>
        <button type="button" class="qb-action" data-action="correlation" aria-pressed="false">Relação</button>
        <button type="button" class="qb-action" data-action="forecast" aria-pressed="false">Previsão</button>
      </div>
      <div class="qb-fields">
        <label class="qb-field"><span id="qb-ind1-label">Indicador</span><select id="qb-ind1"></select></label>
        <label class="qb-field" id="qb-ind2-field" hidden><span id="qb-ind2-label">Segundo indicador</span><select id="qb-ind2"></select></label>
        <label class="qb-field" id="qb-geo-field" hidden><span id="qb-geo-label">Geografia</span><select id="qb-geo"><option value="BR">Brasil</option><option value="AC">Acre</option><option value="AL">Alagoas</option><option value="AP">Amapá</option><option value="AM">Amazonas</option><option value="BA">Bahia</option><option value="CE">Ceará</option><option value="DF">Distrito Federal</option><option value="ES">Espírito Santo</option><option value="GO">Goiás</option><option value="MA">Maranhão</option><option value="MT">Mato Grosso</option><option value="MS">Mato Grosso do Sul</option><option value="MG">Minas Gerais</option><option value="PA">Pará</option><option value="PB">Paraíba</option><option value="PR">Paraná</option><option value="PE">Pernambuco</option><option value="PI">Piauí</option><option value="RJ">Rio de Janeiro</option><option value="RN">Rio Grande do Norte</option><option value="RS">Rio Grande do Sul</option><option value="RO">Rondônia</option><option value="RR">Roraima</option><option value="SC">Santa Catarina</option><option value="SP">São Paulo</option><option value="SE">Sergipe</option><option value="TO">Tocantins</option></select></label>
        <label class="qb-field" id="qb-sex-field" hidden><span id="qb-sex-label">Sexo</span><select id="qb-sex"><option value="total">Total</option><option value="men">Homens</option><option value="women">Mulheres</option></select></label>
        <label class="qb-field" id="qb-period-field"><span id="qb-period-label">Período</span><select id="qb-period">
          <option value="5">Últimos 5 anos</option>
          <option value="10">Últimos 10 anos</option>
          <option value="all">Toda a série disponível</option>
          <option value="latest">Valor mais recente</option>
        </select></label>
      </div>
    </div>
    <div class="qb-footer">
      <p id="qb-preview" class="qb-preview" aria-live="polite"></p>
      <p id="qb-feedback" class="qb-feedback" role="status" hidden></p>
      <button type="button" id="qb-submit" class="qb-submit"><span id="qb-submit-text">Enviar pergunta</span><span aria-hidden="true">↑</span></button>
    </div>`;
  document.body.append(backdrop, panel);

  const $ = selector => panel.querySelector(selector);
  const actions = [...panel.querySelectorAll('.qb-action')];
  const ind1 = $('#qb-ind1');
  const ind2 = $('#qb-ind2');
  const geo = $('#qb-geo');
  const sex = $('#qb-sex');
  const period = $('#qb-period');
  const preview = $('#qb-preview');
  const feedback = $('#qb-feedback');
  const submit = $('#qb-submit');
  let action = 'trend';
  let open = false;
  let panelTransitionToken = 0;

  const isEn = () => window.creditLocale === 'en';
  const display = m => m?.[isEn() ? 'en' : 'pt'] || m?.key || '';

  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = !message;
  }

  function populate() {
    if (!state.catalog?.length) return;
    const current1 = ind1.value;
    const current2 = ind2.value;
    const options = state.catalog.map(m => `<option value="${m.key}">${display(m)}</option>`).join('');
    ind1.innerHTML = options;
    ind2.innerHTML = options;
    ind1.value = state.catalog.some(m => m.key === current1) ? current1 : 'delinquency_pf';
    ind2.value = state.catalog.some(m => m.key === current2) ? current2 : 'selic';

    if (action === 'forecast') {
      const allowed = new Set(['delinquency_pf','delinquency_pj','delinquency_card','delinquency_revolving','delinquency_personal','delinquency_vehicle']);
      [...ind1.options].forEach(option => option.hidden = !allowed.has(option.value));
      if (!allowed.has(ind1.value)) ind1.value = 'delinquency_pf';
    } else {
      [...ind1.options].forEach(option => option.hidden = false);
    }
  }

  function dimensionSupport(key, dimension) {
    return !!state.dimensions?.catalog?.some(item => item.key === key && (item.dimensions || []).includes(dimension));
  }

  function geoSuffix() {
    if (geo.value === 'BR') return '';
    const name = geo.options[geo.selectedIndex]?.textContent || geo.value;
    return isEn() ? ` in ${name}` : ` em ${name}`;
  }

  function sexSuffix() {
    if (sex.value === 'men') return isEn() ? ' for men' : ' para homens';
    if (sex.value === 'women') return isEn() ? ' for women' : ' para mulheres';
    return '';
  }

  function periodText() {
    if (period.value === 'latest') return isEn() ? 'today' : 'hoje';
    if (period.value === 'all') return isEn() ? 'across the full available series' : 'em toda a série disponível';
    return isEn() ? `over the last ${period.value} years` : `nos últimos ${period.value} anos`;
  }

  function buildQuestion() {
    const a = display(state.catalog.find(m => m.key === ind1.value));
    const b = display(state.catalog.find(m => m.key === ind2.value));
    const p = periodText();
    const where = geoSuffix() + sexSuffix();

    if (action === 'forecast') return isEn()
      ? `What is the 6-month forecast for ${a}?`
      : `Qual é a previsão de ${a} para os próximos 6 meses?`;

    if (action === 'correlation') return isEn()
      ? `What is the relationship between ${a} and ${b}?`
      : `Qual é a relação entre ${a} e ${b}?`;

    if (action === 'compare') return isEn()
      ? `Compare ${a} and ${b}${where} ${p}.`
      : `Compare ${a} e ${b}${where} ${p}.`;

    if (period.value === 'latest') return isEn()
      ? `What is the latest value for ${a}${where}?`
      : `Qual é o valor mais recente de ${a}${where}?`;

    return isEn()
      ? `How has ${a} changed${where} ${p}?`
      : `Como evoluiu ${a}${where} ${p}?`;
  }

  function updatePreview() {
    preview.textContent = buildQuestion();
  }

  function localize() {
    $('#qb-title').textContent = isEn() ? 'Build a question' : 'Montar pergunta';
    $('#qb-subtitle').textContent = isEn() ? 'Choose the analysis and indicators you want to explore.' : 'Escolha a análise e os indicadores que quer consultar.';
    $('#qb-ind1-label').textContent = isEn() ? 'Indicator' : 'Indicador';
    $('#qb-ind2-label').textContent = isEn() ? 'Second indicator' : 'Segundo indicador';
    $('#qb-geo-label').textContent = isEn() ? 'Geography' : 'Geografia';
    $('#qb-sex-label').textContent = isEn() ? 'Sex' : 'Sexo';
    $('#qb-period-label').textContent = isEn() ? 'Period' : 'Período';
    geo.options[0].textContent = isEn() ? 'Brazil' : 'Brasil';
    sex.options[0].textContent = 'Total';
    sex.options[1].textContent = isEn() ? 'Men' : 'Homens';
    sex.options[2].textContent = isEn() ? 'Women' : 'Mulheres';
    $('#qb-submit-text').textContent = isEn() ? 'Ask' : 'Enviar pergunta';

    const labels = isEn() ? ['Trend','Compare','Relationship','Forecast'] : ['Evolução','Comparar','Relação','Previsão'];
    actions.forEach((button, i) => button.textContent = labels[i]);

    const labelsPeriod = isEn()
      ? ['Last 5 years','Last 10 years','Full available series','Latest value']
      : ['Últimos 5 anos','Últimos 10 anos','Toda a série disponível','Valor mais recente'];
    [...period.options].forEach((option, i) => option.textContent = labelsPeriod[i]);
    populate();
    updatePreview();
  }

  function syncFields() {
    actions.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.action === action)));
    $('#qb-ind2-field').hidden = !['compare','correlation'].includes(action);
    $('#qb-period-field').hidden = ['correlation','forecast'].includes(action);
    populate();
    const canState = dimensionSupport(ind1.value,'state') && (action !== 'compare' || dimensionSupport(ind2.value,'state'));
    const canSex = dimensionSupport(ind1.value,'gender') && (action !== 'compare' || dimensionSupport(ind2.value,'gender'));
    $('#qb-geo-field').hidden = ['correlation','forecast'].includes(action) || !canState;
    $('#qb-sex-field').hidden = ['correlation','forecast'].includes(action) || !canSex;
    if (!canState) geo.value = 'BR';
    if (!canSex) sex.value = 'total';
    if (ind1.value === ind2.value && ['compare','correlation'].includes(action)) {
      const alternative = [...ind2.options].find(option => option.value !== ind1.value && !option.hidden);
      if (alternative) ind2.value = alternative.value;
    }
    showFeedback('');
    updatePreview();
  }

  function syncPanelAnimationOrigin() {
    const panelRect = panel.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    if (!panelRect.width || !panelRect.height || !toggleRect.width || !toggleRect.height) return;

    const toggleCenterX = toggleRect.left + toggleRect.width / 2;
    const originX = Math.max(toggleRect.width / 2, Math.min(panelRect.width - toggleRect.width / 2, toggleCenterX - panelRect.left));
    const collapsedScaleX = Math.max(.025, Math.min(1, toggleRect.width / panelRect.width));
    const collapsedScaleY = Math.max(.04, Math.min(1, toggleRect.height / panelRect.height));
    const collapsedOffsetY = toggleRect.bottom - panelRect.bottom;

    panel.style.setProperty('--qb-origin-x', `${originX}px`);
    panel.style.setProperty('--qb-collapsed-scale-x', collapsedScaleX.toFixed(4));
    panel.style.setProperty('--qb-collapsed-scale-y', collapsedScaleY.toFixed(4));
    panel.style.setProperty('--qb-collapsed-offset-y', `${collapsedOffsetY.toFixed(2)}px`);
  }

  function setOpen(next, restoreFocus = true) {
    if (open === next) return;
    if (next && send.disabled) return;

    open = next;
    const token = ++panelTransitionToken;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    toggle.setAttribute('aria-expanded', String(next));
    toggle.title = next
      ? (isEn() ? 'Close question builder' : 'Fechar o menu de perguntas')
      : (isEn() ? 'Build a question' : 'Montar pergunta');

    if (next) {
      localize();
      backdrop.hidden = false;
      document.body.classList.add('question-builder-open');
      form.classList.add('question-builder-active');
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.remove('qb-panel-closing','qb-panel-opening');
      syncPanelAnimationOrigin();
      void panel.offsetWidth;
      if (!reducedMotion) panel.classList.add('qb-panel-opening');
      if (document.activeElement === input) input.blur();

      const finishOpen = () => {
        if (token !== panelTransitionToken || !open) return;
        panel.classList.remove('qb-panel-opening');
        actions.find(button => button.dataset.action === action)?.focus({preventScroll:true});
      };
      if (reducedMotion) finishOpen();
      else setTimeout(finishOpen, 560);
      return;
    }

    form.classList.remove('question-builder-active');
    panel.setAttribute('aria-hidden','true');
    panel.classList.remove('qb-panel-opening','qb-panel-closing');

    const finishClose = () => {
      if (token !== panelTransitionToken || open) return;
      panel.classList.remove('qb-panel-closing');
      document.body.classList.remove('question-builder-open');
      backdrop.hidden = true;
      if (restoreFocus) toggle.focus({preventScroll:true});
    };

    if (reducedMotion) return finishClose();
    void panel.offsetWidth;
    panel.classList.add('qb-panel-closing');
    setTimeout(finishClose, 540);
  }

  actions.forEach(button => button.addEventListener('click', () => {
    action = button.dataset.action;
    syncFields();
  }));

  [ind1, ind2, geo, sex, period].forEach(control => control.addEventListener('change', syncFields));
  toggle.addEventListener('click', () => setOpen(!open));
  backdrop.addEventListener('click', () => setOpen(false));
  $('.qb-close').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  });
  window.addEventListener('resize', () => { if (open) syncPanelAnimationOrigin(); });
  form.addEventListener('submit', () => setOpen(false, false), true);
  document.querySelector('#new-chat')?.addEventListener('click', () => setOpen(false, false), true);

  submit.addEventListener('click', () => {
    if (!state.ready) {
      showFeedback(isEn() ? 'Wait for the dataset to finish loading.' : 'Aguarde a base de dados terminar de carregar.');
      return;
    }
    const text = buildQuestion();
    input.value = text;
    setOpen(false, false);
    form.requestSubmit();
  });

  window.addEventListener('credit:locale-changed',()=>{
    localize();
    syncFields();
  });
  window.addEventListener('credit:data-ready',()=>{
    populate();
    syncFields();
  });

  localize();
  syncFields();
})();