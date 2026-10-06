from __future__ import annotations

import gzip
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "dimensions" / "br_states.geojson"

MESH_URL = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
    "?intrarregiao=UF&formato=application/vnd.geo+json&qualidade=minima"
)
STATES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome"
UA = "Credit-Intelligence-Brasil/1.0 (+https://github.com/gabrieldelvaje/credit-intelligence-brasil)"


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as response:
        raw = response.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8"))


def main():
    geo = fetch_json(MESH_URL)
    states = fetch_json(STATES_URL)

    by_id = {str(item["id"]): item for item in states}
    by_sigla = {item["sigla"].upper(): item for item in states}

    features = geo.get("features", [])
    if len(features) != 27:
        raise RuntimeError(f"Expected 27 state features, found {len(features)}")

    normalized = []
    seen = set()

    for feature in features:
        props = feature.get("properties") or {}
        candidates = [
            feature.get("id"),
            props.get("codarea"),
            props.get("id"),
            props.get("codigo"),
            props.get("CD_UF"),
            props.get("cd_uf"),
            props.get("geocodigo"),
        ]

        state = None
        for raw in candidates:
            if raw is None:
                continue
            text = str(raw).strip()
            if text in by_id:
                state = by_id[text]
                break
            upper = text.upper()
            if upper in by_sigla:
                state = by_sigla[upper]
                break

        if state is None:
            # Last-resort scan through property values.
            for raw in props.values():
                text = str(raw).strip()
                if text in by_id:
                    state = by_id[text]
                    break
                upper = text.upper()
                if upper in by_sigla:
                    state = by_sigla[upper]
                    break

        if state is None:
            raise RuntimeError(f"Could not identify state feature properties: {props}")

        uf = state["sigla"].upper()
        seen.add(uf)
        normalized.append({
            "type": "Feature",
            "id": str(state["id"]),
            "properties": {
                "uf": uf,
                "name": state["nome"],
                "ibge_id": int(state["id"]),
            },
            "geometry": feature.get("geometry"),
        })

    if len(seen) != 27:
        raise RuntimeError(f"Expected 27 unique UFs, found {len(seen)}")

    out = {
        "type": "FeatureCollection",
        "source": "IBGE Geographic Mesh API",
        "features": normalized,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n"
    if OUT.exists() and OUT.read_text(encoding="utf-8") == content:
        print("Geometry unchanged.")
        return

    OUT.write_text(content, encoding="utf-8")
    print(f"OK: {len(normalized)} state geometries written to {OUT}")


if __name__ == "__main__":
    main()
