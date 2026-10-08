# Credit Intelligence Brasil

Dashboard estático e interativo para explorar crédito, inadimplência, endividamento e contexto macroeconômico do Brasil com dados oficiais do Banco Central e do IBGE.

## Arquitetura

```text
APIs oficiais (BCB/SGS + BCB/SCR.data + IBGE/SIDRA)
        ↓
GitHub Actions
        ↓
validação + persistência do último estado válido
        ↓
CSV / JSON consolidados
        ↓
GitHub Pages
        ↓
dashboard interativo no navegador
```

O pipeline roda automaticamente. Se uma API falhar, uma série regredir ou vier vazia, a última versão válida é preservada. Cada atualização válida também fica registrada no histórico do Git.

## Estudo de caso e decisões de negócio

A aba **Estudo de caso** apresenta o problema analítico, os indicadores mais recentes calculados no navegador, o raciocínio por trás da arquitetura e a evolução da investigação:

1. **Descrever:** acompanhar as séries nacionais e suas variações em 12 meses.
2. **Diagnosticar:** comparar UFs e modalidades, respeitando o conceito e a referência de cada dado.
3. **Explorar cenários:** exibir projeções simples para seis meses como hipóteses, não como decisões automatizadas.

**Pergunta orientadora:** onde há sinais de pressão no crédito brasileiro e quais recortes devem ser investigados antes de uma recomendação?

**Público potencial:** profissionais de risco, análise econômica e inteligência de negócio que precisam contextualizar indicadores agregados. Trata-se de um projeto de portfólio, sem implantação empresarial ou impacto financeiro alegado.

### Registro das decisões e trade-offs

| Decisão | Alternativa e motivação | Limitação assumida |
| --- | --- | --- |
| SGS para séries nacionais; SCR.data para geografia | Usar dados oficiais em vez de amostras simuladas | A taxa estadual derivada não é decomposição direta da taxa nacional |
| GitHub Actions + JSON/CSV estático | Evitar chamadas remotas a cada visita ao site | Informação atualizada pelo pipeline, não em tempo real |
| Preservar última atualização válida | Evitar que indisponibilidade de API quebre o dashboard | Requer exibir claramente a data da referência |
| Comparar no máximo três UFs | Garantir legibilidade visual e foco analítico | Não substitui estudos econométricos |
| Tendência + sazonalidade | Cenário transparente no lugar de um modelo complexo sem validação suficiente | Não há acurácia fora de amostra demonstrada; projeções não são oficiais |

### Limites das conclusões

- Não concluir causalidade apenas por co-movimento de Selic, IPCA, desemprego e inadimplência.
- Não somar taxas de modalidades e não comparar percentuais de denominadores distintos como equivalentes.
- Não equiparar a série SGS nacional à agregação das taxas SCR.data das UFs.
- Não tratar cenários de curto prazo como decisões de concessão ou score individual.
- As variações e datas exibidas na aba são computadas da base carregada; não foram fixadas manualmente.

## Dashboard

A interface foi desenhada como um relatório de BI, sem camada de chat. A página reúne:

- KPIs nacionais com variação em 12 meses e sparklines;
- mapa coroplético clicável das 27 UFs;
- comparação de até três estados;
- ranking estadual conectado ao mapa;
- séries históricas com filtro de período;
- comparação das principais modalidades de inadimplência;
- contexto macroeconômico (Selic, IPCA, desemprego e renda real);
- projeções estatísticas de seis meses para séries selecionadas de inadimplência.

A seleção de estados no mapa ou no ranking atualiza a série histórica. O indicador do mapa pode ser alterado entre métricas de inadimplência, risco, carteira e mercado de trabalho quando a fonte oficial oferece recorte estadual.

## Indicadores nacionais

### Inadimplência
- PF total — SGS 21084
- PJ total — SGS 21083
- cartão de crédito total — SGS 21129
- cartão rotativo — SGS 21127
- crédito pessoal — SGS 21120
- aquisição de veículos — SGS 21121

### Famílias
- endividamento — SGS 29037
- endividamento sem crédito habitacional — SGS 29038
- comprometimento de renda — SGS 29034

### Crédito e juros
- saldo PF — SGS 20541
- saldo PJ — SGS 20540
- concessões PF — SGS 20633
- concessões PJ — SGS 20632
- juros médios PF — SGS 25435
- juros médios PJ — SGS 25434

### Contexto macroeconômico
- meta Selic — SGS 432
- IPCA mensal — SGS 433
- desemprego / PNAD Contínua — SGS 24369
- rendimento médio real habitual — SGS 24380

## Dimensões geográficas

### Unidade da Federação

O projeto usa o **SCR.data Versão 2** do Banco Central para criar uma camada estadual mensal. Os arquivos anuais são baixados durante o GitHub Action, agregados e convertidos em uma base analítica compacta.

Há recorte por UF para:

- inadimplência PF e PJ;
- inadimplência de cartão de crédito;
- cartão rotativo;
- crédito pessoal;
- financiamento de veículos;
- carteira ativa PF e PJ;
- ativo problemático PF e PJ.

A taxa estadual de inadimplência é calculada como `carteira_inadimplencia / carteira_ativa × 100`, com saldo em atraso acima de 90 dias. É uma métrica derivada do SCR e não deve ser interpretada como simples desagregação da série SGS nacional.

### Mercado de trabalho

Desemprego e rendimento real por UF vêm diretamente da **PNAD Contínua / SIDRA / IBGE**. A base mantém as categorias de sexo publicadas pelo IBGE; o dashboard usa a categoria Total na camada geográfica.

Arquivos dimensionais principais:

- `data/dimensions/state_credit.json` e `.csv`;
- `data/dimensions/gender_state.json` e `.csv`;
- `data/dimensions/br_states.geojson`;
- `data/dimensions/catalog.json`;
- `data/dimensions/metadata.json`.

## Projeções

As seis séries de inadimplência recebem uma projeção de seis meses baseada em tendência linear + sazonalidade anual, com faixa estatística de 80%. A projeção é experimental e não representa previsão oficial do Banco Central.

## Arquivos gerados

- `data/credit_intelligence.json`: base consolidada para o dashboard;
- `data/credit_intelligence.csv`: versão tabular consolidada;
- `data/catalog.json`: catálogo dos indicadores;
- `data/forecasts.json`: projeções de curto prazo;
- `data/series/*.csv`: uma série por arquivo;
- `data/raw/*.json`: última resposta bruta válida de cada API;
- `data/metadata.json`: saúde e atualização das fontes.

## Atualização automática

- `.github/workflows/update-data.yml`: indicadores nacionais;
- `.github/workflows/update-dimensions.yml`: recortes por UF e sexo;
- `.github/workflows/update-map-geometry.yml`: malha geográfica das UFs;
- `.github/workflows/validate-site.yml`: valida sintaxe e integridade da base após mudanças.
