from __future__ import annotations

import csv
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_JSON = ROOT / "data" / "dimensions" / "state_credit.json"
STATE_CSV = ROOT / "data" / "dimensions" / "state_credit.csv"
META_JSON = ROOT / "data" / "dimensions" / "metadata.json"


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: merge_state_history.py BACKFILL_DIR")
    folder = Path(sys.argv[1])

    rows = []
    if STATE_JSON.exists():
        rows.extend(json.loads(STATE_JSON.read_text(encoding="utf-8")))
    for path in sorted(folder.glob("state_*.json")):
        rows.extend(json.loads(path.read_text(encoding="utf-8")))

    merged = {}
    for row in rows:
        merged[(row["date"], row["uf"], row["key"])] = row
    out = sorted(merged.values(), key=lambda r: (r["date"], r["uf"], r["key"]))
    if not out:
        raise RuntimeError("No state rows to merge")

    STATE_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["date","uf","key","value","unit","source"], lineterminator="\n")
    writer.writeheader()
    writer.writerows(out)
    STATE_CSV.write_text(buf.getvalue(), encoding="utf-8")

    meta = json.loads(META_JSON.read_text(encoding="utf-8")) if META_JSON.exists() else {}
    status = meta.setdefault("status", {}).setdefault("state_credit", {})
    status.update({
        "status": "ok",
        "rows": len(out),
        "first_reference": min(r["date"] for r in out),
        "latest_reference": max(r["date"] for r in out),
        "months_loaded": sorted({r["date"] for r in out}),
        "historical_backfill_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    META_JSON.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"OK merged: {len(out)} state rows, {status['first_reference']} to {status['latest_reference']}")


if __name__ == "__main__":
    main()
