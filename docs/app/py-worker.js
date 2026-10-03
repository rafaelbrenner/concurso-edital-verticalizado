// Python no navegador (Pyodide): roda os mesmos scripts da pasta scripts/
// (cópias em py/) para extrair o edital e gerar xlsx/docx/painel.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js');

const ARQS = ['extrair_edital.py', 'gerar_excel.py', 'gerar_docx.py', 'gerar_html.py'];
let pronto = null, libs = null;

function iniciar() {
  return pronto ??= (async () => {
    const py = await loadPyodide();
    py.FS.mkdir('/work');
    await Promise.all(ARQS.map(async f => {
      const r = await fetch('py/' + f);
      if (!r.ok) throw new Error('não achei py/' + f);
      py.FS.writeFile('/work/' + f, new Uint8Array(await r.arrayBuffer()));
    }));
    py.runPython("import sys; sys.path.insert(0, '/work')");
    return py;
  })();
}

const EXTRAIR = `
import sys, types, json, importlib
from pathlib import Path
class _Pag:
    def __init__(s, t): s.t = t
    def get_text(s): return s.t
_m = types.ModuleType('pymupdf'); _m.open = lambda p: [_Pag(t) for t in PAGINAS]
sys.modules['pymupdf'] = _m
import extrair_edital; importlib.reload(extrair_edital)
_, gerais, cargos = extrair_edital.extract(Path('/work/edital.pdf'))
json.dumps({'gerais': gerais, 'cargos': cargos}, ensure_ascii=False)
`;

const GERAR = {
  xlsx: ['gerar_excel', '/work/saida.xlsx'],
  docx: ['gerar_docx', '/work/saida.docx'],
  html: ['gerar_html', '/work/saida.html'],
};

onmessage = async ({ data: { id, cmd, args } }) => {
  try {
    const py = await iniciar();
    let result, transfer = [];
    if (cmd === 'iniciar') result = true;
    else if (cmd === 'extrair') {
      py.globals.set('PAGINAS', py.toPy(args.paginas));
      result = JSON.parse(py.runPython(EXTRAIR));
    } else if (cmd === 'gerar') {
      const [mod, out] = GERAR[args.tipo];
      if (args.tipo !== 'html') {
        libs ??= (async () => {
          await py.loadPackage('micropip');
          await py.pyimport('micropip').install(['openpyxl', 'python-docx']);
        })();
        await libs;
      }
      py.FS.writeFile('/work/entrada.json', JSON.stringify(args.edital));
      py.runPython(`
import json, ${mod}
${mod}.LOGO = ''
${mod}.build(json.load(open('/work/entrada.json', encoding='utf-8')), '${out}')`);
      result = py.FS.readFile(out);
      transfer = [result.buffer];
    }
    postMessage({ id, ok: true, result }, transfer);
  } catch (e) {
    postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
