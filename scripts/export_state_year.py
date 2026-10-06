from __future__ import annotations

import json
import sys
from pathlib import Path

from update_dimensions import STATE_KEYS, aggregate_scr_year


def build_rows(year: int):
    agg, months = aggregate_scr_year(year)
    reverse = {}
    for key, (client, bucket, measure) in STATE_KEYS.items():
        reverse.setdefault((client, bucket), []).append((key, measure))

    rows = []
    for (dt, uf, client, bucket), values in sorted(agg.items()):
        for key, measure in reverse.get((client, bucket), []):
            active = values["active"]
            if measure == "balance":
                value = active / 1_000_000
                unit = "R$ mi"
            elif measure == "delinquency":
                if active <= 0:
                    continue
                value = values["delinq"] / active * 100
                unit = "%"
            elif measure == "problem":
                if active <= 0:
                    continue
                value = values["problem"] / active * 100
                unit = "%"
            else:
                continue
            rows.append({
                "date": dt,
                "uf": uf,
                "key": key,
                "value": round(value, 6),
                "unit": unit,
                "source": "BCB SCR.data v2",
            })
    return rows, months


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: export_state_year.py YEAR OUTPUT.json")
    year = int(sys.argv[1])
    output = Path(sys.argv[2])
    output.parent.mkdir(parents=True, exist_ok=True)
    rows, months = build_rows(year)
    if not rows:
        raise RuntimeError(f"No rows for {year}")
    output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"OK {year}: {len(rows)} rows, {months[0]} to {months[-1]}")


if __name__ == "__main__":
    main()
