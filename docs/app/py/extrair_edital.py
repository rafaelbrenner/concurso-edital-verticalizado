#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrai o conteúdo programático de um edital para JSON canônico, com SELEÇÃO DE CARGO.

Editais de concurso normalmente trazem: CONHECIMENTOS GERAIS (comuns a todos) +
CONHECIMENTOS ESPECÍFICOS por cargo/especialidade. Este script detecta os cargos e
monta a saída como: Gerais + Específicos do cargo escolhido.

Uso:
  # 1) listar cargos detectados
  python3 extrair_edital.py edital.pdf --listar

  # 2) gerar JSON de um cargo (por número ou trecho do nome)
  python3 extrair_edital.py edital.pdf --cargo "Sem especialidade" --out edital.json
  python3 extrair_edital.py edital.pdf --cargo 1 --out edital.json

  # .md verticalizado (formato da skill `verticalizar-edital`): extração exata, cargo único
  python3 extrair_edital.py edital.md --out edital.json
"""
import argparse, json, re, sys, unicodedata
from pathlib import Path

DISC_MD  = re.compile(r'^#\s+(\d+)\.\s+(.+\S)\s*$')
ASSUNTO  = re.compile(r'^#{2,3}\s+(\d+(?:\.\d+)*)\s+(.+\S)\s*$')
NUMITEM  = re.compile(r'^\s*[-*•]?\s*(\d+(?:\.\d+)*)[\).]?\s+(.+\S)\s*$')
META     = re.compile(r'^\*\*(.+?):\*\*\s*(.*\S)\s*$')
TITLE_H1 = re.compile(r'^#\s+(.+\S)\s*$')
META_MAP = {"órgão": "orgao", "orgao": "orgao", "banca": "banca", "cargo": "cargo",
            "data do edital": "data_edital", "data": "data_edital", "concurso": "concurso"}

PAGE_NOISE = re.compile(r'TRIBUNAL DE JUSTI|CONCURSO P[ÚU]BLICO|^\s*\d{1,3}\s*$|^\s*P[áa]gina\s+\d+', re.I)
ITEM_MARK  = re.compile(r'(?<![\w./º°§])(\d{1,2}(?:\.\d{1,2}){0,3})\s+(?=[A-ZÀ-Ý]|[a-z]-[A-Za-z])')
PRECEDE_BAD = re.compile(r'(\bn[ºo°]\.?|lei|decreto|resolu|s[úu]mula|\bart|§|inciso|\bn\b)\s*$', re.I)

HEADER_WORDS = {"CARGO", "GRUPO", "NIVEL", "SUPERIOR", "MEDIO", "SEM", "COM", "E", "DA", "DE",
                "DO", "DOS", "DAS", "ESPECIALIDADE", "ANALISTA", "TECNICO", "JUDICIARIO",
                "ASSISTENCIAL", "JUDICIAL", "GESTAO", "TECNOLOGIA", "INFORMACAO", "OFICIAL"}
SECTION_SKIP = ("ANEXO", "CONTEUDO PROGRAM")
DASH_ONLY  = re.compile(r'^[\s–\-—]+$')
ESPEC_WORD = re.compile(r'\bESPECIALIDADE\b')
TITLE_SMALL = {"de", "da", "do", "dos", "das", "e", "em", "a", "o", "com", "para"}
TITLE_ACRO  = {"TIC", "TI", "IA"}


def _fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").upper()


def _add(disc, numero, texto):
    disc["itens"].append({"numero": numero, "nivel": numero.count(".") + 1, "texto": texto.strip()})


def _is_caps_line(s):
    letters = [c for c in s if c.isalpha()]
    return len(letters) >= 3 and (sum(c.isupper() for c in letters) / len(letters)) > 0.85


def _is_caps_header(s):
    s = s.strip()
    if len(s) < 3 or len(s) > 75 or s[0].isdigit():
        return False
    return _is_caps_line(s)


def _is_section(s):
    u = _fold(s)
    return any(k in u for k in SECTION_SKIP)


def _is_header_fragment(s):
    # tokens em CAPS: descarta texto corrido ("do", "e", "Judiciário.") que
    # coincide com HEADER_WORDS só depois de normalizado
    toks = re.findall(r"[A-Za-zÀ-ÿ]+", s)
    return bool(toks) and all(t.isupper() and _fold(t) in HEADER_WORDS for t in toks)


def _is_cargo_header(s, U):
    # cabeçalho de cargo: linha em CAPS com CARGO/ESPECIALIDADE como palavra inteira.
    # Evita casar texto corrido ("...na especialidade", "diversas especialidades").
    return (_is_caps_line(s) and (U.startswith("CARGO") or ESPEC_WORD.search(U))) \
        or _is_header_fragment(s)


def _title(n):
    out = []
    for i, w in enumerate(n.split()):
        core = _fold(re.sub(r"[^\wÀ-ÿ]", "", w))
        if core in TITLE_ACRO:
            out.append(w.upper())
        elif i > 0 and w.lower() in TITLE_SMALL:
            out.append(w.lower())
        else:
            out.append("/".join(p.capitalize() for p in w.split("/")))
    return " ".join(out)


def _cargo_name(buf_text):
    u = _fold(buf_text)
    if "ESPECIALIDADE" in u:
        after = re.split(r'(?i)especialidade\s*:?\s*', buf_text)[-1].strip(" –-:.")
        if after and _fold(after) not in ("", "SEM", "COM"):
            return after
    if "SEM ESPECIALIDADE" in u:
        return "Sem especialidade"
    return None


def _tokenize_items(blob):
    blob = re.sub(r'\s+', ' ', blob).strip()
    marks = []
    for m in ITEM_MARK.finditer(blob):
        if PRECEDE_BAD.search(blob[max(0, m.start() - 14):m.start()]):
            continue
        marks.append((m.start(), m.end(), m.group(1)))
    itens = []
    for i, (s, e, num) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(blob)
        texto = blob[e:end].strip(" .;–-")
        if texto:
            itens.append({"numero": num, "nivel": num.count(".") + 1, "texto": texto})
    return itens


DISC_INLINE = re.compile(
    r'((?:[A-ZÀ-Ý][A-ZÀ-Ý/\-]*)(?:[ ,]+(?:[A-ZÀ-Ý][A-ZÀ-Ý/\-]*|E|DO|DA|DE|DOS|DAS)){0,15}):\s+(?=1\b)'
)


def parse_cebraspe(text):
    """Editais estilo CEBRASPE: seção OBJETOS DE AVALIAÇÃO com disciplinas em blocos
    corridos no formato 'NOME EM CAPS: 1 Item. 1.1 Subitem. ...' (cargo único)."""
    blob = re.sub(r'\s+', ' ', text).strip()
    marks = list(DISC_INLINE.finditer(blob))
    disciplinas = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(blob)
        nome = re.sub(r'\s+', ' ', m.group(1)).strip(" :–-")
        itens = _tokenize_items(blob[m.end():end])
        if itens:
            disciplinas.append({"nome": nome, "itens": itens})
    return disciplinas


CARGO_HDR   = re.compile(r'^CARGO(\s*\d+\s*:.*)?$')
CARGO_LABEL = re.compile(r'^CARGO\s*(\d+)\s*:\s*(?:ANALISTA LEGISLATIVO\s*[–-]\s*)?(?:ESPECIALIDADE\s*:\s*)?', re.I)
ASSINATURA  = re.compile(r'\n[ \t]*[A-ZÀ-Ý][A-ZÀ-Ý ]{5,}[ \t]*\n\s*Presidente\b')


def _cebraspe_block(blob, nome_implicito):
    """Disciplinas inline de um bloco; itens antes da 1ª disciplina viram disciplina implícita."""
    blob = re.sub(r'\s+', ' ', blob).strip()
    m = DISC_INLINE.search(blob)
    head = blob[:m.start()] if m else blob
    out = []
    itens = _tokenize_items(head)
    if itens:
        out.append({"nome": nome_implicito, "itens": itens})
    if m:
        out += parse_cebraspe(blob[m.start():])
    return out


def parse_cebraspe_cargos(text):
    """Editais CEBRASPE com vários cargos: 'CONHECIMENTOS BÁSICOS' (comuns) seguido de
    'CONHECIMENTOS ESPECÍFICOS' com blocos 'CARGO N: ... – ESPECIALIDADE: X – ÁREA: Y'.
    O cabeçalho do cargo pode quebrar em várias linhas em CAPS; termina na 1ª linha que
    não é CAPS (início de disciplina inline) ou que começa com número (itens diretos)."""
    m = ASSINATURA.search(text)
    if m:
        text = text[:m.start()]
    gerais_txt, cargos, cur, hdr = [], [], None, None
    for raw in text.splitlines():
        s = raw.strip()
        if not s:
            continue
        U = _fold(s)
        if "CONHECIMENTOS BASICOS" in U or "CONHECIMENTOS GERAIS" in U:
            cur, hdr = gerais_txt, None; continue
        if "CONHECIMENTOS ESPEC" in U:
            cur, hdr = None, None; continue
        if CARGO_HDR.match(U):
            hdr = [s]; continue
        if hdr is not None:
            if (DASH_ONLY.match(s) or _is_caps_line(s)) and not re.match(r'\d+(\.\d+)*\s', s):
                hdr.append(s); continue
            label = re.sub(r'\s+', ' ', " ".join(hdr))
            num = CARGO_LABEL.match(label)
            nome = CARGO_LABEL.sub("", label).strip(" –-:")
            cur = []
            cargos.append({"nome": f"Cargo {num.group(1)} – {_title(nome)}" if num else _title(nome),
                           "area": _title(re.split(r'(?i)[ÁA]REA\s*:\s*', nome)[-1].strip(" –-:")),
                           "txt": cur})
            hdr = None
        if cur is not None:
            cur.append(s)
    gerais = _cebraspe_block(" ".join(gerais_txt), "Conhecimentos Básicos")
    for c in cargos:
        c["disciplinas"] = _cebraspe_block(" ".join(c.pop("txt")), c.pop("area"))
    return gerais, [c for c in cargos if c["disciplinas"]]


def parse_markdown(text):
    meta, disciplinas, cur, started = {}, [], None, False
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        d = DISC_MD.match(line)
        if d:
            started = True
            cur = {"nome": d.group(2).strip(), "itens": []}
            disciplinas.append(cur)
            continue
        if not started:
            m = META.match(line)
            if m:
                k = META_MAP.get(m.group(1).strip().lower())
                if k:
                    meta[k] = m.group(2).strip()
                continue
            t = TITLE_H1.match(line)
            if t and "concurso" not in meta:
                meta["concurso"] = re.sub(r'\s*[—-]\s*Edital Verticalizado\s*$', '', t.group(1)).strip()
            continue
        a = ASSUNTO.match(line)
        if a and cur is not None:
            _add(cur, a.group(1), a.group(2)); continue
        n = NUMITEM.match(line)
        if n and cur is not None:
            _add(cur, n.group(1), n.group(2)); continue
    return meta, disciplinas, []   # md: cargo único (sem segmentação)


def parse_estruturado(text):
    """Editais reais: separa CONHECIMENTOS GERAIS (comuns) dos blocos por cargo."""
    lines = [s.strip() for s in text.splitlines() if s.strip() and not PAGE_NOISE.search(s.strip())]
    gerais, cargos = [], []
    mode, cur_list, cur_disc, buf, hdr = "pre", None, None, [], []
    # pend: cargo recém-aberto pode ter o nome na linha seguinte ("name" = cabeçalho
    # terminou em "ESPECIALIDADE:"; "cont" = linha do cabeçalho cheia, nome pode continuar)
    cur_cargo, pend = None, None

    def flush_disc():
        nonlocal buf
        if cur_disc is not None and buf:
            cur_disc["itens"] = _tokenize_items(" ".join(buf))
        buf = []

    def new_disc(name):
        nonlocal cur_disc
        flush_disc()
        cur_disc = {"nome": name, "itens": []}
        if cur_list is not None:
            cur_list.append(cur_disc)

    def start_cargo(name):
        nonlocal cur_list, cur_disc, cur_cargo
        flush_disc(); cur_disc = None
        c = {"nome": name or f"Especialidade {len(cargos) + 1}", "auto": not name, "disciplinas": []}
        cargos.append(c)
        cur_cargo = c
        cur_list = c["disciplinas"]

    for s in lines:
        U = _fold(s)
        if "CONHECIMENTOS GERAIS" in U:
            flush_disc(); cur_disc = None; cur_list = gerais; cur_cargo = None
            mode, hdr, pend = "gerais", [], None; continue
        if "CONHECIMENTOS ESPEC" in U:
            flush_disc(); cur_disc = None; cur_list = None; cur_cargo = None
            mode, hdr, pend = "espec", [], None; continue
        if mode == "espec":
            if _is_cargo_header(s, U) or (hdr and DASH_ONLY.match(s)):
                hdr.append(s); continue
            if hdr:
                nome = _cargo_name(" ".join(hdr))
                start_cargo(nome)
                pend = "name" if not nome else ("cont" if len(hdr[-1]) >= 55 else None)
                hdr = []
            if pend:
                if _is_caps_header(s) and not _is_section(s):
                    nome = s.strip(" :–-")
                    cur_cargo["nome"] = nome if pend == "name" else f"{cur_cargo['nome']} {nome}"
                    cur_cargo["auto"] = False
                    pend = None
                    continue
                pend = None
        if _is_caps_header(s) and not _is_section(s):
            new_disc(s.strip(" :–-")); continue
        if cur_disc is None and cur_cargo is not None and not cur_cargo["disciplinas"]:
            # bloco começa direto nos itens (sem cabeçalho de disciplina):
            # disciplina implícita com o nome do cargo
            new_disc(cur_cargo["nome"])
        if cur_disc is not None:
            buf.append(s)
    flush_disc()

    gerais = [d for d in gerais if d["itens"]]
    for c in cargos:
        c["disciplinas"] = [d for d in c["disciplinas"] if d["itens"]]
    cargos = [c for c in cargos if c["disciplinas"]]

    def _weak(c):
        f = _fold(c["nome"])
        if "SEM ESPECIALIDADE" in f:
            return False
        return c["auto"] or "ESPECIALIDADE" in f or "GRUPO" in f \
            or any(ch.isdigit() for ch in c["nome"])
    for c in cargos:
        if _weak(c) and c["disciplinas"]:
            c["nome"] = c["disciplinas"][0]["nome"]
        if c["nome"].isupper():
            c["nome"] = _title(c["nome"])
        c.pop("auto", None)
    return gerais, cargos


def extract(path):
    suf = path.suffix.lower()
    if suf == ".md":
        meta, disciplinas, _ = parse_markdown(path.read_text(encoding="utf-8"))
        return meta, disciplinas, []          # gerais = todas; sem cargos
    if suf == ".pdf":
        import pymupdf as fitz
        full = "\n".join(p.get_text() for p in fitz.open(str(path)))
        def _find_heading(key):
            # cabeçalhos vêm em CAPS no edital; procurar case-sensitive evita casar
            # com menções em minúsculas ("...os objetos de avaliação constam...")
            i = full.find(key)
            return i if i != -1 else full.upper().find(key)

        cebraspe = False
        idx = _find_heading("CONTEÚDO PROGRAM")
        if idx == -1:
            idx = _find_heading("OBJETOS DE AVALIA")
            cebraspe = idx != -1
        if idx == -1:
            idx = _find_heading("CONHECIMENTOS ESPEC")
        section = full[idx:] if idx != -1 else full
        corte = r'\bANEXO\s+I\b' if cebraspe else r'\bANEXO\s+II\b'
        m = re.search(corte, section.upper())
        if m and m.start() > 200:
            section = section[:m.start()]
        sys.stderr.write("[aviso] extração de PDF é heurística — confira o resumo.\n")
        if cebraspe and re.search(r'^\s*CARGO\s*\d+\s*:', section, re.M):
            return {}, *parse_cebraspe_cargos(section)
        gerais, cargos = parse_estruturado(section)
        if not gerais and not cargos:
            gerais = parse_cebraspe(section)   # fallback: layout CEBRASPE, cargo único
        return {}, gerais, cargos
    meta, g, c = {}, *parse_estruturado(path.read_text(encoding="utf-8", errors="ignore"))
    return meta, g, c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", "-o")
    ap.add_argument("--cargo", help="número (1..N) ou trecho do nome do cargo")
    ap.add_argument("--listar", action="store_true", help="só listar cargos detectados")
    for k in ("concurso", "orgao", "banca", "cargo_nome", "data_edital"):
        ap.add_argument(f"--{k}")
    args = ap.parse_args()

    p = Path(args.input)
    if not p.exists():
        sys.exit(f"ERRO: arquivo não encontrado: {p}")
    meta, gerais, cargos = extract(p)

    n_g = sum(len(d["itens"]) for d in gerais)
    if cargos:
        print(f"CONHECIMENTOS GERAIS/BÁSICOS (comuns): {len(gerais)} disciplinas, {n_g} itens")
        print(f"\nCARGOS / ESPECIALIDADES detectados ({len(cargos)}):")
        for i, c in enumerate(cargos, 1):
            ni = sum(len(d['itens']) for d in c['disciplinas'])
            print(f"  [{i}] {c['nome']}  —  {len(c['disciplinas'])} disc. específicas, {ni} itens")
    elif gerais:
        print(f"CARGO ÚNICO detectado: {len(gerais)} disciplinas, {n_g} itens")
        for d in gerais:
            print(f"  {len(d['itens']):4d}  {d['nome']}")

    # selecionar cargo
    chosen = None
    if cargos and args.cargo:
        if args.cargo.isdigit() and 1 <= int(args.cargo) <= len(cargos):
            chosen = cargos[int(args.cargo) - 1]
        else:
            alvo = _fold(args.cargo)
            for c in cargos:
                if alvo in _fold(c["nome"]):
                    chosen = c; break
        if chosen is None:
            sys.exit(f"ERRO: cargo '{args.cargo}' não encontrado. Rode com --listar.")

    if args.listar or (cargos and not args.cargo):
        if cargos and not args.cargo and not args.listar:
            print("\n→ Reexecute com --cargo <nº|nome> --out edital.json para gerar a planilha desse cargo.")
        return

    # bloco: "basicos" (comuns a todos os cargos) ou "especificos" (do cargo escolhido)
    disciplinas = [dict(d, bloco="basicos") for d in gerais] + \
                  [dict(d, bloco="especificos") for d in (chosen["disciplinas"] if chosen else [])]
    if not chosen:  # cargo único / .md: sem divisão
        for d in disciplinas:
            d.pop("bloco")
    data = {
        "concurso": args.concurso or meta.get("concurso", ""),
        "orgao": args.orgao or meta.get("orgao", ""),
        "banca": args.banca or meta.get("banca", ""),
        "cargo": args.cargo_nome or (chosen["nome"] if chosen else meta.get("cargo", "")),
        "data_edital": args.data_edital or meta.get("data_edital", ""),
        "disciplinas": disciplinas,
    }
    if not args.out:
        sys.exit("ERRO: informe --out para gravar o JSON.")
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tot = sum(len(d["itens"]) for d in disciplinas)
    print(f"\nOK -> {args.out}")
    print(f"Cargo: {data['cargo'] or '(único)'} | Disciplinas: {len(disciplinas)} | Itens: {tot}")


if __name__ == "__main__":
    main()
