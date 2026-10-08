'use strict';

/**
 * Síntese executiva calculada exclusivamente a partir das séries carregadas.
 * Este módulo não consulta APIs, não altera a base e não cria métricas fictícias.
 */
function renderCaseStudy(){
  const target=$('#case-signals');
  const keys=[
    ['delinquency_pf','Inadimplência PF','SGS 21084'],
    ['delinquency_pj','Inadimplência PJ','SGS 21083'],
    ['delinquency_revolving','Cartão rotativo','SGS 21127']
  ];

  target.innerHTML=keys.map(([key,title,source])=>{
    const series=nationalSeries(key);
    const last=latestNational(key);
    const delta=delta12m(series,meta(key));
    const change=delta?delta.text:'Comparação indisponível';
    const status=delta ? (delta.value>0?'is-up':delta.value<0?'is-down':'is-flat') : 'is-flat';
    return `<article class="case-signal">
      <div class="case-signal-top"><span>${esc(title)}</span><small>${esc(source)}</small></div>
      <strong>${esc(last?formatValue(last.value,meta(key)):'—')}</strong>
      <div class="case-signal-foot"><span class="${status}">${esc(change)}</span><span>${esc(last?month(last.date):'Sem data')}</span></div>
      <span class="case-signal-note">Variação em 12 meses · ${esc(delta?'pontos percentuais':'sem base comparável')}</span>
    </article>`;
  }).join('');

  const pf=latestNational('delinquency_pf');
  const difference=delta12m(nationalSeries('delinquency_pf'),meta('delinquency_pf'));
  const reading=$('#case-reading');
  if(!pf||!difference){
    reading.innerHTML='<span class="case-reading-label">LEITURA ANALÍTICA</span><p>Sem série nacional comparável para uma leitura anual. Consulte a página de risco para analisar os períodos disponíveis.</p>';
    return;
  }
  const direction=difference.value>0
    ? 'avançou'
    : difference.value<0
      ? 'recuou'
      : 'permaneceu estável';
  const nextStep=difference.value>0
    ? 'O próximo passo é verificar modalidades e recortes estaduais, sem pressupor uma causa para o aumento.'
    : difference.value<0
      ? 'O recuo nacional não significa redução uniforme em todas as modalidades ou UFs.'
      : 'A estabilidade agregada pode esconder comportamentos diferentes entre modalidades e UFs.';
  reading.innerHTML=`<span class="case-reading-label">LEITURA ANALÍTICA</span>
    <p>Na série nacional SGS 21084, a inadimplência PF ${direction} em 12 meses (${esc(difference.text)}) até ${esc(month(pf.date))}. ${esc(nextStep)}</p>
    <small>Leitura descritiva, não causal. As taxas do SCR.data estadual têm definição própria e não são desdobramentos diretos da série SGS.</small>`;
}
