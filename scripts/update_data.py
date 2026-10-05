from __future__ import annotations

import csv
import io
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SERIES_CODE = "21084"\n# Initial validation: this file change intentionally triggers the first workflow run.
SERIES_NAME = "Inadimplência da carteira de crédito - Pessoas físicas - Total"
UNIT = "Percentual"
SOURCE = "Banco Central do Brasil - SGS"
API_URL = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{SERIES_CODE}/dados?formato=json"

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
CSV_PATH = DATA_DIR / "inadimplencia_pf_total.csv"
RAW_PATH = RAW_DIR / f"sgs_{SERIES_CODE}.json"
METADATA_PATH = DATA_DIR / "metadata.json"


def fetch_json(url: str, attempts: int = 4, timeout: int = 30):
    headers = {
        "User-Agent": "Credit-Intelligence-Brasil/0.1 (+https://github.com/gabrieldelvaje/credit-itelligence-brasil)",
        "Accept": "application/json",
    }
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=timeout) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            last_error = exc
            print(f"Tentativa {attempt}/{attempts} falhou: {exc}", file=sys.stderr)
            if attempt < attempts:
                time.sleep(2 ** (attempt - 1))

    raise RuntimeError(f"API indisponível após {attempts} tentativas: {last_error}")


def parse_remote(payload) -> dict[str, float]:
    if not isinstance(payload, list):
        raise ValueError("Resposta da API não é uma lista.")

    parsed: dict[str, float] = {}

    for row in payload:
        if not isinstance(row, dict) or "data" not in row or "valor" not in row:
            raise ValueError("Resposta da API contém registro inválido.")

        dt = datetime.strptime(str(row["data"]), "%d/%m/%Y")
        value = float(str(row["valor"]).replace(",", "."))
        parsed[dt.strftime("%Y-%m-%d")] = value

    if len(parsed) < 12:
        raise ValueError(f"Resposta suspeita: apenas {len(parsed)} registros.")

    return dict(sorted(parsed.items()))


def load_existing() -> dict[str, float]:
    if not CSV_PATH.exists():
        return {}

    rows: dict[str, float] = {}
    with CSV_PATH.open("r", encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            rows[row["date"]] = float(row["value"])
    return dict(sorted(rows.items()))


def render_csv(rows: dict[str, float]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["date", "value", "source_code"])
    for date, value in sorted(rows.items()):
        writer.writerow([date, f"{value:.2f}", SERIES_CODE])
    return buffer.getvalue()


def write_if_changed(path: Path, content: str) -> bool:
    previous = path.read_text(encoding="utf-8") if path.exists() else None
    if previous == content:
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(content, encoding="utf-8")
    temp.replace(path)
    return True


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    existing = load_existing()

    try:
        payload = fetch_json(API_URL)
        remote = parse_remote(payload)
    except Exception as exc:
        if existing:
            print(
                "AVISO: a API falhou ou retornou dados inválidos. "
                "Mantendo o último conjunto válido já armazenado.",
                file=sys.stderr,
            )
            print(str(exc), file=sys.stderr)
            return 0
        raise

    remote_last = max(remote)
    if existing:
        existing_last = max(existing)
        if remote_last < existing_last:
            print(
                f"AVISO: resposta remota está mais antiga ({remote_last}) que a base local "
                f"({existing_last}). Mantendo a base local.",
                file=sys.stderr,
            )
            return 0

    # Upsert: preserva todo o histórico já salvo e aplica novos valores/revisões da API.
    consolidated = dict(existing)
    consolidated.update(remote)
    consolidated = dict(sorted(consolidated.items()))

    csv_content = render_csv(consolidated)
    csv_changed = write_if_changed(CSV_PATH, csv_content)

    # Mantém a última resposta bruta válida. O histórico de versões também fica preservado pelo Git.
    raw_content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    raw_changed = write_if_changed(RAW_PATH, raw_content)

    metadata = {
        "series_code": SERIES_CODE,
        "series_name": SERIES_NAME,
        "unit": UNIT,
        "source": SOURCE,
        "api_url": API_URL,
        "first_reference": min(consolidated),
        "latest_reference": max(consolidated),
        "rows": len(consolidated),
        "last_dataset_change_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")
        if csv_changed
        else None,
        "fallback_policy": "Se a API falhar ou regredir, a última base válida é preservada."
    }

    # Se não houve alteração dos dados, preserva a data anterior para evitar commits diários sem necessidade.
    if not csv_changed and METADATA_PATH.exists():
        try:
            previous_meta = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
            metadata["last_dataset_change_utc"] = previous_meta.get("last_dataset_change_utc")
        except json.JSONDecodeError:
            pass

    metadata_content = json.dumps(metadata, ensure_ascii=False, indent=2) + "\n"
    metadata_changed = write_if_changed(METADATA_PATH, metadata_content)

    print(
        f"OK: série {SERIES_CODE}; {len(consolidated)} registros; "
        f"{min(consolidated)} a {max(consolidated)}; "
        f"csv_changed={csv_changed}; raw_changed={raw_changed}; metadata_changed={metadata_changed}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
