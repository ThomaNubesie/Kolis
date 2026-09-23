#!/usr/bin/env python3
"""Crop the destination photos for the on-demand Facebook flyer.

    python3 scripts/build_flyer_photos.py [SRC_DIR]

SRC_DIR (default ~/Downloads/LoadQ-Scenic-Originals) holds the clean Wikimedia Commons
originals — the photographs behind the flyer series, without the flyer text burned in.
Writes two crops per destination for app/flyer/[key]/route.tsx:
  public/flyer/<slug>.jpg       1030x900   the photo panel of the wide Facebook flyer
  public/flyer/tall/<slug>.jpg  1080x1100  the photo band of the tall TikTok flyer

Only share-alike-free photos (CC0 / public domain / CC BY) belong here, the same rule as the
flyers: a share-alike background arguably makes the flyer a derivative work. The credit is
drawn onto the flyer from loadq_flyer_assets.photo_by / photo_lic.

FOCUS moves the crop horizontally (0 left, 1 right) for photos whose subject sits off-centre.
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request

from PIL import Image, ImageOps

SIZES = {"": (1030, 900), "tall": (1080, 1100)}
SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/LoadQ-Scenic-Originals")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "flyer")
SB = "https://kzjptcpjpwlxfofzhyku.supabase.co"

FOCUS = {"Château Frontenac": 0.34}
FOCUS_Y = {"Château Frontenac (or)": 0.0, "Château Frontenac": 0.25}


def slug(key: str) -> str:
    # Must match flyerSlug() in app/flyer/[key]/route.tsx.
    s = unicodedata.normalize("NFD", key)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def main() -> None:
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    req = urllib.request.Request(
        f"{SB}/rest/v1/loadq_flyer_assets?select=key&active=eq.true&order=key",
        headers={"apikey": key or "", "Authorization": f"Bearer {key or ''}"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))

    os.makedirs(OUT, exist_ok=True)
    for r in rows:
        s = slug(r["key"])
        src = os.path.join(SRC, s + ".jpg")
        if not os.path.exists(src):
            print(f"missing {r['key']} ({src})")
            continue
        img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        fx = FOCUS.get(r["key"], 0.5)
        fy = FOCUS_Y.get(r["key"], 0.5)
        for sub, (w, h) in SIZES.items():
            if img.width / img.height > w / h:
                cw, ch = round(img.height * w / h), img.height
            else:
                cw, ch = img.width, round(img.width * h / w)
            x = round((img.width - cw) * fx)
            y = round((img.height - ch) * fy)
            out = img.crop((x, y, x + cw, y + ch)).resize((w, h), Image.LANCZOS)
            d = os.path.join(OUT, sub)
            os.makedirs(d, exist_ok=True)
            dst = os.path.join(d, f"{s}.jpg")
            out.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
            print(f"wrote  public/flyer/{sub + '/' if sub else ''}{s}.jpg  {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    main()
