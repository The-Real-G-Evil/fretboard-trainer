"""Erzeugt aus ANLEITUNG.md eine eigenstaendige HTML-Seite fuer den Installer.

Aufruf: python installer/build_docs.py <ziel.html>
Benoetigt das Python-Paket "markdown" (pip install markdown).
"""

import base64
import pathlib
import re
import sys

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent

CSS = """
:root { color-scheme: light dark; --accent: #c98a00; --border: #d0d4dc; --dim: #5d6472; --bg-code: #f2f3f6; }
@media (prefers-color-scheme: dark) { :root { --accent: #f0b429; --border: #2e3340; --dim: #9097a6; --bg-code: #232731; } }
body { font-family: "Segoe UI", system-ui, sans-serif; font-size: 15px; line-height: 1.55; max-width: 920px;
       margin: 0 auto; padding: 24px 20px 64px; }
@media (prefers-color-scheme: dark) { body { background: #111318; color: #e6e8ee; } }
h1 { font-size: 28px; margin-bottom: 4px; }
h2 { margin-top: 40px; padding-bottom: 6px; border-bottom: 2px solid var(--accent); }
h3 { margin-top: 26px; }
a { color: var(--accent); }
code { background: var(--bg-code); padding: 1px 5px; border-radius: 4px; font-size: 13px; }
table { border-collapse: collapse; margin: 12px 0; }
th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: var(--bg-code); }
hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
img { max-width: 140px; background: #fff; padding: 6px; border-radius: 4px; }
"""


def main() -> None:
    target = pathlib.Path(sys.argv[1])
    text = (ROOT / "ANLEITUNG.md").read_text(encoding="utf-8")
    body = markdown.markdown(text, extensions=["tables", "toc", "sane_lists"], output_format="html")
    # Bilder einbetten, damit die Seite fuer sich allein funktioniert
    def inline(m: re.Match) -> str:
        data = base64.b64encode((ROOT / m.group(1)).read_bytes()).decode()
        return f'src="data:image/png;base64,{data}"'
    body = re.sub(r'src="([^"]+\.png)"', inline, body)
    html = ("<!doctype html>\n<html lang=\"de\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            "<title>Fretboard Trainer – Anleitung</title>\n"
            f"<style>{CSS}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8")
    print(f"Anleitung: {target}")


if __name__ == "__main__":
    main()
