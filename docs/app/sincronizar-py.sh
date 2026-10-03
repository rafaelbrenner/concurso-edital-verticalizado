#!/bin/sh
# O site roda os scripts Python no navegador a partir de cópias em docs/app/py/
# (o GitHub Pages só publica a pasta docs/). Rode depois de mudar algo em scripts/.
cd "$(dirname "$0")/../.." && cp scripts/extrair_edital.py scripts/gerar_excel.py scripts/gerar_docx.py scripts/gerar_html.py docs/app/py/
