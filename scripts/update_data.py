from __future__ import annotations

import csv
import io
import json
import math
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SERIES_DIR = DATA_DIR / "series"
RAW_DIR = DATA_DIR / "raw"
GLOBAL_CSV = DATA_DIR / "credit_intelligence.csv"
GLOBAL_JSON = DATA_DIR / "credit_intelligence.json"
CATALOG_JSON = DATA_DIR / "catalog.json"
FORECAST_JSON = DATA_DIR / "forecasts.json"
METADATA_JSON = DATA_DIR / "metadata.json"

SERIES = [
    {"key":"delinquency_pf","code":"21084","pt":"Inadimplência PF - total","en":"Household delinquency - total","unit":"%","frequency":"monthly","category":"inadimplencia","forecast":True,
     "aliases_pt":["inadimplência pf","inadimplencia pf","pessoa física","pessoas físicas","pf total"],"aliases_en":["household delinquency","consumer delinquency","individual delinquency"]},
    {"key":"delinquency_pj","code":"21083","pt":"Inadimplência PJ - total","en":"Corporate delinquency - total","unit":"%","frequency":"monthly","category":"inadimplencia","forecast":True,
     "aliases_pt":["inadimplência pj","inadimplencia pj","pessoa jurídica","pessoas jurídicas","empresas"],"aliases_en":["corporate delinquency","business delinquency"]},
    {"key":"delinquency_card","code":"21129","pt":"Inadimplência - cartão de crédito total","en":"Delinquency - total credit card","unit":"%","frequency":"monthly","category":"inadimplencia","forecast":True,
     "aliases_pt":["cartão de crédito","cartao de credito","cartão total"],"aliases_en":["credit card delinquency","total credit card"]},
    {"key":"delinquency_revolving","code":"21127","pt":"Inadimplência - cartão rotativo","en":"Delinquency - revolving credit card","unit":"%","frequency":"monthly","category":"inadimplencia","forecast":True,
     "aliases_pt":["rotativo","cartão rotativo","cartao rotativo"],"aliases_en":["revolving credit card","revolving delinquency"]},
    {"key":"delinquency_personal","code":"21120","pt":"Inadimplência - crédito pessoal","en":"Delinquency - personal credit","unit":"%","frequency":"monthly","category":"inadimplencia","forecast":True,
     "aliases_pt":["crédito pessoal","credito pessoal"],"aliases_en":["personal credit","personal loan delinquency"]},
    {"key":"delinquency_vehicle","code":"21121","pt":"Inadimplência - aquisição de veículos","en":"Delinquency - vehicle loans","unit":"%","frequency":"monthly","category":"inadimplencia","forecast":True,
     "aliases_pt":["veículos","veiculos","financiamento de veículo","financiamento de veiculo"],"aliases_en":["vehicle loans","auto loans"]},
    {"key":"household_debt","code":"29037","pt":"Endividamento das famílias","en":"Household debt-to-income","unit":"%","frequency":"monthly","category":"familias","forecast":False,
     "aliases_pt":["endividamento","endividamento das famílias"],"aliases_en":["household debt","debt to income"]},
    {"key":"household_debt_ex_housing","code":"29038","pt":"Endividamento das famílias sem crédito habitacional","en":"Household debt excluding housing","unit":"%","frequency":"monthly","category":"familias","forecast":False,
     "aliases_pt":["endividamento sem habitação","endividamento sem habitacao"],"aliases_en":["household debt excluding housing"]},
    {"key":"income_commitment","code":"29034","pt":"Comprometimento de renda das famílias","en":"Household debt-service ratio","unit":"%","frequency":"monthly","category":"familias","forecast":False,
     "aliases_pt":["comprometimento de renda","serviço da dívida","servico da divida"],"aliases_en":["debt service ratio","income commitment"]},
    {"key":"credit_balance_pf","code":"20541","pt":"Saldo de crédito - PF","en":"Credit balance - households","unit":"R$ mi","frequency":"monthly","category":"credito","forecast":False,
     "aliases_pt":["saldo de crédito pf","saldo de credito pf","carteira de crédito pf"],"aliases_en":["household credit balance"]},
    {"key":"credit_balance_pj","code":"20540","pt":"Saldo de crédito - PJ","en":"Credit balance - companies","unit":"R$ mi","frequency":"monthly","category":"credito","forecast":False,
     "aliases_pt":["saldo de crédito pj","saldo de credito pj","carteira de crédito pj"],"aliases_en":["corporate credit balance"]},
    {"key":"credit_grants_pf","code":"20633","pt":"Concessões de crédito - PF","en":"New credit - households","unit":"R$ mi","frequency":"monthly","category":"credito","forecast":False,
     "aliases_pt":["concessões pf","concessoes pf","novos créditos pf"],"aliases_en":["household credit grants","new household credit"]},
    {"key":"credit_grants_pj","code":"20632","pt":"Concessões de crédito - PJ","en":"New credit - companies","unit":"R$ mi","frequency":"monthly","category":"credito","forecast":False,
     "aliases_pt":["concessões pj","concessoes pj","novos créditos pj"],"aliases_en":["corporate credit grants","new corporate credit"]},
    {"key":"credit_interest_pf","code":"25435","pt":"Juros médios do crédito - PF","en":"Average credit interest - households","unit":"% a.m.","frequency":"monthly","category":"juros","forecast":False,
     "aliases_pt":["juros do crédito","juros do credito","juros pf","taxa de juros pf"],"aliases_en":["household credit interest","consumer credit interest"]},
    {"key":"credit_interest_pj","code":"25434","pt":"Juros médios do crédito - PJ","en":"Average credit interest - companies","unit":"% a.m.","frequency":"monthly","category":"juros","forecast":False,
     "aliases_pt":["juros pj","taxa de juros pj"],"aliases_en":["corporate credit interest"]},
    {"key":"selic","code":"432","pt":"Meta Selic","en":"Selic target rate","unit":"% a.a.","frequency":"daily","category":"macro","forecast":False,
     "aliases_pt":["selic","taxa selic"],"aliases_en":["selic","policy rate"]},
    {"key":"ipca","code":"433","pt":"IPCA - variação mensal","en":"IPCA - monthly inflation","unit":"%","frequency":"monthly","category":"macro","forecast":False,
     "aliases_pt":["ipca","inflação","inflacao"],"aliases_en":["ipca","inflation"]},
    {"key":"unemployment","code":"24369","pt":"Taxa de desocupação - PNAD Contínua","en":"Unemployment rate - PNAD Continuous","unit":"%","frequency":"monthly","category":"macro","forecast":False,
     "aliases_pt":["desemprego","desocupação","desocupacao"],"aliases_en":["unemployment","jobless rate"]},
    {"key":"real_income","code":"24380","pt":"Rendimento médio real habitual","en":"Average real usual earnings","unit":"R$","frequency":"monthly","category":"macro","forecast":False,
     "aliases_pt":["renda real","rendimento médio","rendimento medio"],"aliases_en":["real income","average earnings"]},
]

def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def api_url(code: str, start: date | None = None, end: date | None = None):
    base = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados?formato=json"
    if start and end:
        return base + "&" + urllib.parse.urlencode({
            "dataInicial": start.strftime("%d/%m/%Y"),
            "dataFinal": end.strftime("%d/%m/%Y"),
        })
    return base

def fetch_json(url: str, attempts: int = 4, timeout: int = 45):
    headers = {
        "User-Agent": "Credit-Intelligence-Brasil/1.0 (+https://github.com/gabrieldelvaje/credit-intelligence-brasil)",
        "Accept": "application/json",
    }
    last = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=timeout) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            print(f"[warn] tentativa {attempt}/{attempts}: {exc}", file=sys.stderr)
            if attempt < attempts:
                time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"API indisponível: {last}")

def fetch_series(series):
    code = series["code"]
    if series["frequency"] != "daily":
        return fetch_json(api_url(code))

    start = date(2011, 1, 1)
    today = date.today()
    payload = []
    while start <= today:
        end = min(date(start.year + 9, 12, 31), today)
        payload.extend(fetch_json(api_url(code, start, end)))
        start = end + timedelta(days=1)
    return payload

def parse_payload(payload):
    if not isinstance(payload, list):
        raise ValueError("Resposta não é lista.")
    parsed = {}
    for row in payload:
        if not isinstance(row, dict) or "data" not in row or "valor" not in row:
            raise ValueError("Registro inválido.")
        dt = datetime.strptime(str(row["data"]), "%d/%m/%Y")
        value = float(str(row["valor"]).replace(",", "."))
        if not math.isfinite(value):
            continue
        parsed[dt.strftime("%Y-%m-%d")] = value
    if len(parsed) < 6:
        raise ValueError(f"Resposta suspeita: {len(parsed)} registros.")
    return dict(sorted(parsed.items()))

def read_series(path: Path):
    if not path.exists():
        return {}
    out = {}
    with path.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            try:
                out[row["date"]] = float(row["value"])
            except Exception:
                pass
    return dict(sorted(out.items()))

def render_series_csv(rows, code):
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["date","value","source_code"])
    for dt, value in sorted(rows.items()):
        writer.writerow([dt, f"{value:.6f}".rstrip("0").rstrip("."), code])
    return buf.getvalue()

def write_if_changed(path: Path, content: str):
    previous = path.read_text(encoding="utf-8") if path.exists() else None
    if previous == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)
    return True

def month_add(iso_date, months):
    d = datetime.strptime(iso_date, "%Y-%m-%d").date()
    total = d.year * 12 + d.month - 1 + months
    return f"{total//12:04d}-{total%12+1:02d}-01"

def solve_linear(matrix, vector):
    n = len(vector)
    a = [list(map(float, matrix[i])) + [float(vector[i])] for i in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            raise ValueError("Matriz singular")
        a[col], a[pivot] = a[pivot], a[col]
        div = a[col][col]
        a[col] = [v / div for v in a[col]]
        for r in range(n):
            if r == col:
                continue
            factor = a[r][col]
            a[r] = [a[r][c] - factor * a[col][c] for c in range(n + 1)]
    return [a[i][-1] for i in range(n)]

def seasonal_trend_forecast(rows, horizon=6):
    items = [(d,v) for d,v in sorted(rows.items())]
    if len(items) < 36:
        return []
    items = items[-60:]
    xrows, y = [], []
    for i,(dt,val) in enumerate(items):
        month = int(dt[5:7])
        angle = 2 * math.pi * month / 12
        xrows.append([1.0, float(i), math.sin(angle), math.cos(angle)])
        y.append(val)
    p = len(xrows[0])
    xtx = [[sum(r[i]*r[j] for r in xrows) for j in range(p)] for i in range(p)]
    xty = [sum(r[i]*yv for r,yv in zip(xrows,y)) for i in range(p)]
    beta = solve_linear(xtx, xty)
    fitted = [sum(b*x for b,x in zip(beta,r)) for r in xrows]
    residuals = [actual-pred for actual,pred in zip(y,fitted)]
    sigma = statistics.stdev(residuals) if len(residuals) > 2 else 0.0
    last_date = items[-1][0]
    out = []
    for h in range(1, horizon+1):
        future = month_add(last_date, h)
        month = int(future[5:7])
        angle = 2 * math.pi * month / 12
        row = [1.0, float(len(items)-1+h), math.sin(angle), math.cos(angle)]
        pred = max(0.0, sum(b*x for b,x in zip(beta,row)))
        spread = 1.645 * sigma * math.sqrt(1 + h / max(12, len(items)))
        out.append({
            "date": future,
            "value": round(pred, 4),
            "low80": round(max(0.0, pred-spread), 4),
            "high80": round(pred+spread, 4),
        })
    return out

def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SERIES_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    statuses = {}
    all_rows = []
    catalog = []
    forecasts = {}
    previous_meta = {}
    if METADATA_JSON.exists():
        try:
            previous_meta = json.loads(METADATA_JSON.read_text(encoding="utf-8"))
        except Exception:
            previous_meta = {}

    for series in SERIES:
        key, code = series["key"], series["code"]
        path = SERIES_DIR / f"{key}.csv"
        raw_path = RAW_DIR / f"{key}.json"
        existing = read_series(path)
        status = {"key":key,"code":code,"status":"ok","last_attempt_utc":utc_now()}
        try:
            payload = fetch_series(series)
            remote = parse_payload(payload)
            if existing and max(remote) < max(existing):
                raise ValueError(f"resposta regrediu de {max(existing)} para {max(remote)}")
            merged = dict(existing)
            merged.update(remote)
            merged = dict(sorted(merged.items()))
            write_if_changed(path, render_series_csv(merged, code))
            write_if_changed(raw_path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
            status["last_success_utc"] = utc_now()
        except Exception as exc:
            merged = existing
            status["status"] = "fallback" if existing else "error"
            status["error"] = str(exc)
            prior = previous_meta.get("series_status", {}).get(key, {})
            if prior.get("last_success_utc"):
                status["last_success_utc"] = prior["last_success_utc"]
            print(f"[warn] {key}/{code}: {exc}", file=sys.stderr)

        if not merged:
            statuses[key] = status
            continue

        status["first_reference"] = min(merged)
        status["latest_reference"] = max(merged)
        status["rows"] = len(merged)
        status["latest_value"] = merged[max(merged)]
        statuses[key] = status

        for dt, value in merged.items():
            all_rows.append({
                "date": dt,
                "key": key,
                "value": value,
                "series_code": code,
                "category": series["category"],
                "frequency": series["frequency"],
                "unit": series["unit"],
            })

        cat = {k:v for k,v in series.items() if k != "forecast"}
        cat["first_reference"] = min(merged)
        cat["latest_reference"] = max(merged)
        cat["latest_value"] = merged[max(merged)]
        cat["rows"] = len(merged)
        catalog.append(cat)

        if series.get("forecast") and series["frequency"] == "monthly":
            try:
                forecasts[key] = {
                    "model":"trend_seasonality_ols",
                    "horizon_months":6,
                    "generated_at_utc":utc_now(),
                    "observed_through":max(merged),
                    "points":seasonal_trend_forecast(merged, 6),
                    "note_pt":"Projeção estatística de tendência + sazonalidade; não é previsão oficial.",
                    "note_en":"Statistical trend + seasonality projection; not an official forecast.",
                }
            except Exception as exc:
                forecasts[key] = {"model":"unavailable","error":str(exc),"points":[]}

    if not all_rows:
        raise RuntimeError("Nenhuma série disponível; preservando arquivos existentes.")

    all_rows.sort(key=lambda r:(r["date"], r["key"]))

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["date","key","value","series_code","category","frequency","unit"], lineterminator="\n")
    writer.writeheader()
    for row in all_rows:
        writer.writerow(row)
    write_if_changed(GLOBAL_CSV, buf.getvalue())
    write_if_changed(GLOBAL_JSON, json.dumps(all_rows, ensure_ascii=False, separators=(",",":")) + "\n")
    write_if_changed(CATALOG_JSON, json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    write_if_changed(FORECAST_JSON, json.dumps(forecasts, ensure_ascii=False, indent=2) + "\n")

    metadata = {
        "project":"Credit Intelligence Brasil",
        "generated_at_utc":utc_now(),
        "series_count":len(catalog),
        "rows":len(all_rows),
        "sources":["Banco Central do Brasil / SGS","IBGE via SGS (PNAD Contínua)"],
        "update_policy":"O workflow roda diariamente. Cada série é persistida somente quando há alteração; falhas usam a última versão válida.",
        "series_status":statuses,
    }
    write_if_changed(METADATA_JSON, json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(f"OK: {len(catalog)} séries, {len(all_rows)} observações, {len(forecasts)} previsões.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
