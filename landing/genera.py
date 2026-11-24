#!/usr/bin/env python3
"""Genera las imágenes de la landing de Ares con flux-3-image-klein."""
import httpx, base64, sys, pathlib

KEY = "ci_live_52142c2a12cdf50f00892828acf9d389e8d33a0382c4436e"
BASE = "https://api.cheaperinference.com/v1"
OUT = pathlib.Path("/home/rizutov/ares-react/landing/assets")
OUT.mkdir(parents=True, exist_ok=True)

ESTILO = (
    "Photorealistic documentary photography, natural light, warm color grade with "
    "deep green accents, shallow depth of field, 35mm look, Mexican small-business "
    "setting, no text, no logos, no watermarks"
)

IMAGENES = {
    "hero-tienda.jpg": (
        ESTILO + ". Scene: inside a small Mexican corner grocery store in the morning, "
        "a confident shop owner in a dark green apron behind a wooden counter, holding a "
        "tablet showing a simple sales dashboard, shelves stocked with colorful packaged "
        "goods and crates of fresh produce behind him, warm sunlight streaming through "
        "the open doorway."
    ),
    "mayorista-almacen.jpg": (
        ESTILO + ". Scene: inside a clean wholesale supply warehouse, a supplier worker "
        "with a hand truck stacked with cardboard boxes and sacks of dry goods loading "
        "a white delivery van, big industrial door open with daylight beams and soft "
        "dust motes, shelves of inventory in the background."
    ),
    "reparto-calle.jpg": (
        ESTILO + ". Scene: a delivery rider on a motorcycle with an insulated delivery "
        "box, riding through a sunny Mexican neighborhood street with colorful facades, "
        "motion feel, golden hour light, green accents in the scenery."
    ),
}

def gen(nombre: str, prompt: str, size: str = "1536x1024") -> bool:
    with httpx.Client(timeout=300) as c:
        r = c.post(
            f"{BASE}/images/generations",
            headers={"Authorization": f"Bearer {KEY}"},
            json={"model": "flux-3-image-klein", "prompt": prompt, "n": 1, "size": size},
        )
    if r.status_code != 200:
        print(f"[{nombre}] HTTP {r.status_code}: {r.text[:200]}")
        return False
    d = r.json()["data"][0]
    if "b64_json" in d:
        (OUT / nombre).write_bytes(base64.b64decode(d["b64_json"]))
    elif "url" in d:
        (OUT / nombre).write_bytes(httpx.get(d["url"], timeout=120).content)
    else:
        print(f"[{nombre}] respuesta sin imagen: {list(d)}")
        return False
    print(f"[{nombre}] ok ({(OUT / nombre).stat().st_size // 1024} KB)")
    return True

if __name__ == "__main__":
    fallas = [n for n, p in IMAGENES.items() if not gen(n, p)]
    sys.exit(1 if fallas else 0)
