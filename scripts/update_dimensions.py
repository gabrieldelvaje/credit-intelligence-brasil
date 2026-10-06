from __future__ import annotations

import csv
import io
import json
import math
import sys
import time
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "dimensions"
OUT.mkdir(parents=True, exist_ok=True)

STATE_JSON = OUT / "state_credit.json"
STATE_CSV = OUT / "state_credit.csv"
GENDER_JSON = OUT / "gender_state.json"
GENDER_CSV = OUT / "gender_state.csv"
CATALOG_JSON = OUT / "catalog.json"
META_JSON = OUT / "metadata.json"

UA = "Mozilla/5.0 Credit-Intelligence-Brasil/1.0 (+https://github.com/gabrieldelvaje/credit-intelligence-brasil)"

UF_BY_IBGE = {
    "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO",
    "21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA",
    "31":"MG","32":"ES","33":"RJ","35":"SP",
    "41":"PR","42":"SC","43":"RS",
    "50":"MS","51":"MT","52":"GO","53":"DF",
}

STATE_KEYS = {
    "delinquency_pf": ("PF", "total", "delinquency"),
    "delinquency_pj": ("PJ", "total", "delinquency"),
    "delinquency_card": ("PF", "credit_card", "delinquency"),
    "delinquency_revolving": ("PF", "revolving_card", "delinquency"),
    "delinquency_personal": ("PF", "personal_credit", "delinquency"),
    "delinquency_vehicle": ("PF", "vehicles", "delinquency"),
    "credit_balance_pf": ("PF", "total", "balance"),
    "credit_balance_pj": ("PJ", "total", "balance"),
    "problem_assets_pf": ("PF", "total", "problem"),
    "problem_assets_pj": ("PJ", "total", "problem"),
}

DIM_CATALOG = [
    {"key":"delinquency_pf","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"delinquency_pj","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"delinquency_card","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"delinquency_revolving","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"delinquency_personal","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"delinquency_vehicle","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"credit_balance_pf","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"R$ mi"},
    {"key":"credit_balance_pj","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"R$ mi"},
    {"key":"problem_assets_pf","pt":"Ativo problemático - PF","en":"Problem assets - households","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"problem_assets_pj","pt":"Ativo problemático - PJ","en":"Problem assets - companies","dimensions":["state"],"source":"BCB SCR.data v2","frequency":"monthly","unit":"%"},
    {"key":"unemployment","dimensions":["state","gender"],"source":"IBGE PNAD Contínua / SIDRA 6396","frequency":"quarterly","unit":"%"},
    {"key":"real_income","dimensions":["state","gender"],"source":"IBGE PNAD Contínua / SIDRA 5436","frequency":"quarterly","unit":"R$"},
]

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def fetch_bytes(url, attempts=4, timeout=240):
    last = None
    for n in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent":UA, "Accept":"*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if r.status != 200:
                    raise RuntimeError(f"HTTP {r.status}")
                return r.read()
        except Exception as exc:
            last = exc
            print(f"[warn] fetch {url} attempt {n+1}/{attempts}: {exc}", file=sys.stderr)
            if n+1 < attempts:
                time.sleep(2 ** n)
    raise RuntimeError(f"Could not fetch {url}: {last}")

def fetch_json(url):
    return json.loads(fetch_bytes(url, timeout=120).decode("utf-8"))

def pt_number(value):
    value = str(value or "").strip().replace(".", "").replace(",", ".")
    try:
        x = float(value)
        return x if math.isfinite(x) else 0.0
    except Exception:
        return 0.0

def bucket_for(submodalidade):
    s = (submodalidade or "").casefold()
    if "crédito rotativo vinculado a cartão" in s or "credito rotativo vinculado a cartao" in s:
        return "revolving_card"
    if "cartão de crédito" in s or "cartao de credito" in s:
        return "credit_card"
    if "crédito pessoal" in s or "credito pessoal" in s:
        return "personal_credit"
    if "veículos automotores" in s or "veiculos automotores" in s:
        return "vehicles"
    return None

def aggregate_scr_year(year):
    url = f"https://www.bcb.gov.br/pda/desig/scrdata_{year}.zip"
    raw = fetch_bytes(url)
    z = zipfile.ZipFile(io.BytesIO(raw))
    agg = defaultdict(lambda: {"active":0.0, "delinq":0.0, "problem":0.0})
    months = []

    for name in sorted(z.namelist()):
        if not name.lower().endswith(".csv"):
            continue
        with z.open(name) as binary:
            text = io.TextIOWrapper(binary, encoding="utf-8-sig", errors="replace", newline="")
            reader = csv.DictReader(text, delimiter=";")
            local_date = None
            for row in reader:
                dt = str(row.get("data_base","")).strip()
                uf = str(row.get("uf","")).strip().upper()
                client = str(row.get("cliente","")).strip().upper()
                if len(uf) != 2 or client not in {"PF","PJ"} or not dt:
                    continue
                local_date = dt
                active = pt_number(row.get("carteira_ativa"))
                delinq = pt_number(row.get("carteira_inadimplencia"))
                problem = pt_number(row.get("ativo_problematico"))

                targets = ["total"]
                b = bucket_for(row.get("submodalidade"))
                if b:
                    targets.append(b)

                for bucket in targets:
                    rec = agg[(dt,uf,client,bucket)]
                    rec["active"] += active
                    rec["delinq"] += delinq
                    rec["problem"] += problem
            if local_date:
                months.append(local_date)

    if not agg:
        raise RuntimeError(f"SCR.data {year}: no rows")
    return agg, sorted(set(months))

def build_state_credit():
    current_year = datetime.now().year
    years = [current_year - 1, current_year]
    combined = defaultdict(lambda: {"active":0.0, "delinq":0.0, "problem":0.0})
    loaded_months = []

    for year in years:
        try:
            agg, months = aggregate_scr_year(year)
        except Exception as exc:
            # At the start of a year, an annual ZIP may not exist yet.
            print(f"[warn] SCR.data {year}: {exc}", file=sys.stderr)
            continue
        for k,v in agg.items():
            combined[k]["active"] += v["active"]
            combined[k]["delinq"] += v["delinq"]
            combined[k]["problem"] += v["problem"]
        loaded_months.extend(months)

    if not combined:
        raise RuntimeError("No SCR.data dimensional records available")

    rows = []
    reverse = defaultdict(list)
    for key,(client,bucket,measure) in STATE_KEYS.items():
        reverse[(client,bucket)].append((key,measure))

    for (dt,uf,client,bucket), values in sorted(combined.items()):
        mappings = reverse.get((client,bucket), [])
        if not mappings:
            continue
        active = values["active"]
        for key,measure in mappings:
            if measure == "balance":
                value = active / 1_000_000
            elif measure == "delinquency":
                value = (values["delinq"] / active * 100) if active > 0 else None
            elif measure == "problem":
                value = (values["problem"] / active * 100) if active > 0 else None
            else:
                continue
            if value is None or not math.isfinite(value):
                continue
            rows.append({
                "date":dt,
                "uf":uf,
                "key":key,
                "value":round(value,6),
                "unit":"R$ mi" if measure=="balance" else "%",
                "source":"BCB SCR.data v2",
            })
    if len(rows) < 100:
        raise RuntimeError(f"Suspicious SCR aggregate: {len(rows)} rows")
    return rows, sorted(set(loaded_months))

def quarter_date(code):
    s = str(code)
    year = int(s[:4])
    q = int(s[-1])
    return f"{year:04d}-{q*3:02d}-01"

def parse_sidra(table, variable, key, unit):
    url = f"https://apisidra.ibge.gov.br/values/t/{table}/n3/all/v/{variable}/p/all/c2/all"
    payload = fetch_json(url)
    if not isinstance(payload,list) or len(payload) < 10:
        raise RuntimeError(f"SIDRA {table}: invalid response")
    rows = []
    gender_map = {"6794":"total","4":"men","5":"women"}
    for r in payload[1:]:
        uf = UF_BY_IBGE.get(str(r.get("D1C","")))
        gender = gender_map.get(str(r.get("D4C","")))
        raw = str(r.get("V","")).strip().replace(",",".")
        if not uf or not gender or raw in {"","-","..","...","X"}:
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        if not math.isfinite(value):
            continue
        rows.append({
            "date":quarter_date(r.get("D3C")),
            "uf":uf,
            "gender":gender,
            "key":key,
            "value":value,
            "unit":unit,
            "source":f"IBGE SIDRA {table}",
        })
    if len(rows) < 1000:
        raise RuntimeError(f"SIDRA {table}: suspicious row count {len(rows)}")
    return rows

def build_gender_state():
    rows = []
    rows += parse_sidra("6396","4099","unemployment","%")
    rows += parse_sidra("5436","5933","real_income","R$")
    rows.sort(key=lambda r:(r["date"],r["key"],r["uf"],r["gender"]))
    return rows

def write_json(path, obj):
    content = json.dumps(obj, ensure_ascii=False, separators=(",",":")) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.write_text(content, encoding="utf-8")
    return True

def write_csv(path, rows, fields):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    content = buf.getvalue()
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.write_text(content, encoding="utf-8")
    return True

def load_existing(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def main():
    status = {}
    existing_state = load_existing(STATE_JSON)
    existing_gender = load_existing(GENDER_JSON)

    try:
        state_rows, scr_months = build_state_credit()
        write_json(STATE_JSON, state_rows)
        write_csv(STATE_CSV, state_rows, ["date","uf","key","value","unit","source"])
        status["state_credit"] = {
            "status":"ok","rows":len(state_rows),
            "first_reference":min(r["date"] for r in state_rows),
            "latest_reference":max(r["date"] for r in state_rows),
            "months_loaded":scr_months,
            "last_success_utc":now(),
        }
    except Exception as exc:
        print(f"[warn] state_credit: {exc}", file=sys.stderr)
        if existing_state:
            state_rows = existing_state
            status["state_credit"] = {"status":"fallback","rows":len(state_rows),"error":str(exc)}
        else:
            state_rows = []
            status["state_credit"] = {"status":"error","error":str(exc)}

    try:
        gender_rows = build_gender_state()
        write_json(GENDER_JSON, gender_rows)
        write_csv(GENDER_CSV, gender_rows, ["date","uf","gender","key","value","unit","source"])
        status["gender_state"] = {
            "status":"ok","rows":len(gender_rows),
            "first_reference":min(r["date"] for r in gender_rows),
            "latest_reference":max(r["date"] for r in gender_rows),
            "last_success_utc":now(),
        }
    except Exception as exc:
        print(f"[warn] gender_state: {exc}", file=sys.stderr)
        if existing_gender:
            gender_rows = existing_gender
            status["gender_state"] = {"status":"fallback","rows":len(gender_rows),"error":str(exc)}
        else:
            gender_rows = []
            status["gender_state"] = {"status":"error","error":str(exc)}

    if not state_rows and not gender_rows:
        raise RuntimeError("No dimensional data available and no valid fallback")

    write_json(CATALOG_JSON, DIM_CATALOG)
    write_json(META_JSON, {
        "generated_at_utc":now(),
        "sources":{
            "state_credit":"Banco Central do Brasil - SCR.data Versão 2",
            "gender_state":"IBGE - PNAD Contínua trimestral / SIDRA",
        },
        "methodology":{
            "state_delinquency":"carteira_inadimplencia / carteira_ativa * 100; carteira_inadimplencia é o saldo com atraso acima de 90 dias no SCR.data.",
            "state_problem_assets":"ativo_problematico / carteira_ativa * 100.",
            "gender":"A dimensão publicada pelo IBGE é Sexo: Total, Homens e Mulheres. O projeto não infere identidade de gênero a partir desses dados.",
        },
        "coverage":{
            "state_credit":"UF; PF/PJ; total e modalidades selecionadas compatíveis com os indicadores nacionais.",
            "gender_state":"UF x sexo para taxa de desocupação e rendimento médio real habitual.",
        },
        "status":status,
    })

    print("OK dimensions:", json.dumps(status, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
