# Credit Intelligence Brasil

Plataforma estática para explorar crédito, inadimplência, endividamento e contexto macroeconômico do Brasil.

## Arquitetura

```
APIs oficiais (BCB/SGS + IBGE via SGS)
        ↓
GitHub Actions
        ↓
validação + persistência do último estado válido
        ↓
CSV / JSON consolidados
        ↓
GitHub Pages
        ↓
chat analítico no navegador
```

O pipeline roda diariamente. Se uma API falhar, uma série regredir ou vier vazia, a última versão válida é preservada. Cada atualização válida também fica registrada no histórico do Git.

## Indicadores da V1

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

## Previsões

As seis séries de inadimplência recebem uma projeção de seis meses baseada em tendência linear + sazonalidade anual, com faixa estatística de 80%. A projeção é experimental e não representa previsão oficial do Banco Central.

## Arquivos gerados

- `data/credit_intelligence.json`: base consolidada para o site.
- `data/credit_intelligence.csv`: versão tabular consolidada.
- `data/catalog.json`: catálogo dos indicadores.
- `data/forecasts.json`: projeções de curto prazo.
- `data/series/*.csv`: uma série por arquivo.
- `data/raw/*.json`: última resposta bruta válida de cada API.
- `data/metadata.json`: saúde e atualização das fontes.

## Interface

A experiência de chat reutiliza a estrutura visual da **Sugar Cane Intelligence**: animações de envio e carregamento, respostas em etapas, sugestões dinâmicas, claro/escuro, português/inglês e construtor guiado de perguntas. A identidade deste projeto usa o azul `#0736FE`.

## Atualização

O workflow `.github/workflows/update-data.yml` roda diariamente e pode ser acionado manualmente no GitHub Actions.
