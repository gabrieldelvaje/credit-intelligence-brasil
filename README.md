# Credit Intelligence Brasil

Protótipo de validação do pipeline de dados.

## Teste inicial

A primeira fonte é a série **SGS 21084** do Banco Central do Brasil:

- Indicador: inadimplência da carteira de crédito — pessoas físicas — total
- Unidade: percentual
- Frequência: mensal
- Fonte: Banco Central do Brasil / SGS
- API: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.21084/dados?formato=json`

## Objetivo desta versão

Validar o fluxo:

`API do BCB → GitHub Actions → armazenamento local → GitHub Pages`

O pipeline preserva o último conjunto válido. Se a API estiver indisponível, os dados existentes não são apagados.

### Arquivos

- `scripts/update_data.py`: consulta, valida e mescla os dados.
- `data/inadimplencia_pf_total.csv`: histórico consolidado gerado automaticamente.
- `data/metadata.json`: metadados do último conjunto válido.
- `index.html`: visualização simples para o GitHub Pages.
- `.github/workflows/update-data.yml`: atualização automática diária e execução manual.
