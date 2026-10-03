import { firebaseStore, demoStore, aplicarCaminhos } from './store.js';

// ------------------------------------------------------------------ constantes (as mesmas da planilha)
const STATUS = ['A estudar', 'Estudando', 'Estudado', 'Revisão 1', 'Revisão 2', 'Revisão 3'];
const INCID = ['Sem dado', 'Alta', 'Média', 'Baixa'];
const PRIOR = ['', 'Alta', 'Média', 'Baixa'];
const TIPOS = ['Decoreba', 'Raciocínio'];
const META = 0.70;
const FASES = [{ k: 'f1', nome: 'Fase 1', datas: true }, { k: 'f2', nome: 'Fase 2', datas: true },
               { k: 'f3', nome: 'Questões Fase 3', datas: false }];
const VOLTAS = ['#F4A6A6', '#9FC5E8', '#B6D7A8', '#D5C4F0', '#FFE599', '#D9D9D9'];
const BLOCOS = { basicos: 'Conhecimentos Básicos', especificos: 'Conhecimentos Específicos' };
const ABAS = [['itens', 'Itens'], ['resumo', 'Resumo'], ['ciclos', 'Ciclos'], ['exportar', 'Exportar'], ['dados', 'Dados']];
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.296/build/';

// ------------------------------------------------------------------ utilidades
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) if (f != null && f !== false) el.append(f instanceof Node ? f : String(f));
  return el;
}
const $ = s => document.querySelector(s);
const hoje = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ddmm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
const ddmmaaaa = iso => iso ? ddmm(iso) + '/' + iso.slice(0, 4) : '';
const pct = (c, r) => r > 0 ? c / r : null;
const fmtPct = v => v == null ? '—' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const corAcerto = v => v == null ? '' : v >= META ? 'ok' : 'ruim';
const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
const TITLE_SMALL = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'a', 'o', 'com', 'para', 'à', 'ao']);
const nomeCurto = n => n === n.toUpperCase()
  ? n.toLowerCase().split(/\s+/).map((w, i) => i && TITLE_SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)).join(' ') : n;
const nomeCargo = n => nomeCurto(n.replace(/^cargo\s*\d+\s*[–—-]\s*/i, ''));
const tipoSugerido = n => /INGLESA|DIVULGA|RACIOC|L[ÓO]GICA|MATEM|ESTAT/.test(n.toUpperCase()) ? 'Raciocínio' : 'Decoreba';
const chave = (di, ii) => `i${di}_${ii}`;
const feito = p => !!p && (p.st === 'Estudado' || (p.st || '').startsWith('Revisão'));
function estavel(v) {
  if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
let toastT;
function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (erro ? ' erro' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', erro ? 6000 : 2500);
}
function baixar(nome, dados, tipo) {
  const url = URL.createObjectURL(new Blob([dados], { type: tipo }));
  const a = h('a', { href: url, download: nome }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const nomeArquivo = ed => (ed.cargo || ed.concurso || 'edital').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'edital';

// ------------------------------------------------------------------ Python (worker)
let worker, pedidos = new Map(), seq = 0;
function py(cmd, args) {
  worker ??= (() => {
    const w = new Worker('py-worker.js');
    w.onmessage = ({ data }) => {
      const p = pedidos.get(data.id); pedidos.delete(data.id);
      data.ok ? p.res(data.result) : p.rej(new Error(data.error));
    };
    return w;
  })();
  return new Promise((res, rej) => { const id = ++seq; pedidos.set(id, { res, rej }); worker.postMessage({ id, cmd, args }); });
}

async function textoDoPdf(arquivo) {
  const pdfjs = await import(PDFJS + 'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    paginas.push(tc.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join(''));
  }
  return paginas;
}

// ------------------------------------------------------------------ estado
const S = {
  store: null, user: null, ed: null, edId: null, edJson: '', parar: null,
  abertas: new Set(), itemAberto: null, filtro: { q: '', st: '' }, novo: null,
};

async function salvar(patch) {
  aplicarCaminhos(S.ed, structuredClone(patch));
  S.ed.atualizado = new Date().toISOString();
  patch = { ...patch, atualizado: S.ed.atualizado };
  S.edJson = estavel(S.ed);
  try { await S.store.atualizar(S.edId, patch); }
  catch (e) { toast('Não salvou: ' + (e.code || e.message), true); }
}

// ------------------------------------------------------------------ estatísticas
function estat(ed) {
  const discs = ed.disciplinas.map((d, di) => {
    const s = { nome: d.nome, bloco: d.bloco || '', itens: d.itens.length, feitos: 0, f: FASES.map(() => ({ c: 0, r: 0 })) };
    d.itens.forEach((_, ii) => {
      const p = ed.p?.[chave(di, ii)];
      if (feito(p)) s.feitos++;
      FASES.forEach((f, k) => { s.f[k].c += num(p?.[f.k]?.c) || 0; s.f[k].r += num(p?.[f.k]?.r) || 0; });
    });
    s.tc = s.f.reduce((a, x) => a + x.c, 0); s.tr = s.f.reduce((a, x) => a + x.r, 0);
    return s;
  });
  const soma = lista => {
    const t = { itens: 0, feitos: 0, f: FASES.map(() => ({ c: 0, r: 0 })), tc: 0, tr: 0 };
    for (const s of lista) {
      t.itens += s.itens; t.feitos += s.feitos; t.tc += s.tc; t.tr += s.tr;
      s.f.forEach((x, k) => { t.f[k].c += x.c; t.f[k].r += x.r; });
    }
    return t;
  };
  return { discs, soma };
}
const diasAte = iso => iso ? Math.round((new Date(iso + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 864e5) : null;

// ------------------------------------------------------------------ rotas
function rota() {
  const [, a, id, aba] = location.hash.split('/');
  return { pagina: a || '', id, aba: aba || 'itens' };
}
window.addEventListener('hashchange', () => render());

function render() {
  const app = $('#app');
  const ativo = document.activeElement, foco = ativo?.dataset?.path;
  let cursor = null; try { cursor = ativo.selectionStart; } catch {}
  const y = scrollY;
  renderConta();
  if (!S.user) { app.replaceChildren(telaLogin()); return; }
  const r = rota();
  if (r.pagina === 'e' && r.id) {
    if (S.edId !== r.id) { abrirEdital(r.id); app.replaceChildren(h('p', { class: 'carregando' }, 'Abrindo edital…')); return; }
    if (!S.ed) return;
    app.replaceChildren(telaEdital(r.aba));
  } else {
    fecharEdital();
    app.replaceChildren(r.pagina === 'novo' ? telaNovo() : telaInicio());
  }
  const el = foco && document.querySelector(`[data-path="${foco}"]`);
  if (el) { el.focus(); try { if (cursor != null) el.setSelectionRange(cursor, cursor); } catch {} }
  if (r.pagina === 'e') scrollTo(0, y);
}

function renderConta() {
  const c = $('#conta');
  c.replaceChildren(S.user ? h('span', { class: 'conta-in' },
    S.store.demo && h('span', { class: 'pill demo' }, 'demonstração'),
    h('span', { class: 'email' }, S.user.email),
    h('button', { class: 'btn fantasma peq', onclick: () => S.store.logout() }, 'Sair')) : '');
}

// ------------------------------------------------------------------ login
function telaLogin(msg) {
  const erro = h('p', { class: 'erro-txt' }, msg || '');
  return h('section', { class: 'login' },
    h('h1', {}, 'Seu edital vira plano de estudo'),
    h('p', { class: 'mut' }, 'Envie o PDF do edital uma vez. Depois é só marcar o estudo: itens, fases, questões e ciclos ficam salvos na sua conta e aparecem em qualquer aparelho.'),
    h('button', { class: 'btn prim grande', onclick: async () => {
      erro.textContent = '';
      try { await S.store.login(); }
      catch (e) {
        erro.textContent = e.code === 'auth/unauthorized-domain'
          ? 'Este endereço ainda não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).'
          : 'Não foi possível entrar: ' + (e.code || e.message);
      }
    } }, 'Entrar com Google'),
    erro);
}

// ------------------------------------------------------------------ início
function telaInicio() {
  const lista = h('div', { class: 'cards' }, h('p', { class: 'carregando' }, 'Carregando seus editais…'));
  S.store.listar().then(eds => {
    eds.sort((a, b) => (b.atualizado || '').localeCompare(a.atualizado || ''));
    lista.replaceChildren(...eds.map(cardEdital),
      h('a', { class: 'card novo', href: '#/novo' }, h('b', {}, '+ Novo edital'), h('span', { class: 'mut' }, 'Enviar o PDF do edital')));
  }).catch(e => {
    lista.replaceChildren(e.code === 'permission-denied'
      ? h('div', { class: 'aviso' }, h('b', {}, 'Esta conta não tem acesso.'),
          h('p', {}, `Você entrou como ${S.user.email}. Peça a quem administra o site para incluir este e-mail, ou saia e entre com outra conta.`))
      : h('div', { class: 'aviso' }, 'Erro ao carregar: ' + (e.code || e.message)));
  });
  return h('section', {}, h('h1', {}, 'Meus editais'), lista);
}

function cardEdital(ed) {
  const { discs, soma } = estat(ed); const t = soma(discs);
  const dias = diasAte(ed.dataProva);
  return h('a', { class: 'card', href: `#/e/${ed.id}` },
    h('b', {}, ed.concurso || 'Edital sem nome'),
    h('span', { class: 'mut' }, ed.cargo || ''),
    barra(t.itens ? t.feitos / t.itens : 0),
    h('span', { class: 'linha-info' }, `${t.feitos}/${t.itens} itens estudados`,
      dias != null && dias >= 0 ? h('span', { class: 'pill' }, dias === 0 ? 'prova hoje' : `faltam ${dias} dias`) : ''));
}
const barra = v => h('div', { class: 'barra' }, h('i', { style: { width: Math.round(v * 100) + '%' } }));

// ------------------------------------------------------------------ novo edital
function telaNovo() {
  S.novo ??= { etapa: 'arquivo' };
  const n = S.novo;
  const corpo = h('div', {});
  const sec = h('section', { class: 'estreito' }, h('a', { href: '#/', class: 'voltar', onclick: () => { S.novo = null; } }, '← Meus editais'),
    h('h1', {}, 'Novo edital'), corpo);

  if (n.etapa === 'arquivo' || n.etapa === 'lendo') {
    const status = h('p', { class: 'status' }, n.msg || '');
    const inp = h('input', { type: 'file', accept: '.pdf,application/pdf,.json', id: 'arq', disabled: n.etapa === 'lendo',
      onchange: () => inp.files[0] && lerArquivo(inp.files[0]) });
    corpo.append(
      h('p', { class: 'mut' }, 'Envie o PDF do edital. A leitura acontece no seu aparelho: o PDF não é enviado para lugar nenhum, só o conteúdo programático é salvo na sua conta.'),
      h('label', { class: 'soltar' + (n.etapa === 'lendo' ? ' ocupado' : ''), for: 'arq' },
        h('b', {}, n.etapa === 'lendo' ? 'Lendo o edital…' : 'Escolher o PDF do edital'),
        h('span', { class: 'mut' }, 'Também aceita um edital.json gerado pela ferramenta'), inp),
      status,
      h('p', { class: 'mut peq' }, 'A extração foi feita e testada para editais do Cebraspe. Em outras bancas, confira as disciplinas antes de salvar.'));
    return sec;
  }

  // etapa 'conferir'
  const cargos = n.cargos || [];
  if (cargos.length) {
    corpo.append(h('h2', {}, '1. Escolha o cargo'),
      h('div', { class: 'opcoes' }, cargos.map((c, i) => h('label', { class: 'opcao' + (n.cargo === i ? ' sel' : '') },
        h('input', { type: 'radio', name: 'cargo', checked: n.cargo === i, onchange: () => {
          n.cargo = i; n.meta.cargo = nomeCargo(c.nome); render(); } }),
        h('span', {}, h('b', {}, `${i + 1}. ${c.nome}`), h('small', { class: 'mut' },
          ` — ${c.disciplinas.length} disciplinas específicas, ${c.disciplinas.reduce((a, d) => a + d.itens.length, 0)} itens`))))));
  }
  const discs = montarDisciplinas(n);
  corpo.append(h('h2', {}, (cargos.length ? '2. ' : '1. ') + 'Dados do concurso'));
  const campo = (k, rot, tipo = 'text', ph = '') => h('label', { class: 'campo' }, h('span', {}, rot),
    h('input', { type: tipo, value: n.meta[k] || '', placeholder: ph, oninput: e => { n.meta[k] = e.target.value; } }));
  corpo.append(h('div', { class: 'grade2' },
    campo('concurso', 'Concurso', 'text', 'Ex.: Câmara dos Deputados 2026 – Analista'),
    campo('orgao', 'Órgão'), campo('banca', 'Banca', 'text', 'Ex.: Cebraspe'),
    campo('cargo', 'Cargo / área'), campo('data_edital', 'Edital', 'text', 'Ex.: Edital nº 1, de 2/10/2026'),
    campo('dataProva', 'Data da prova', 'date')));
  corpo.append(h('h2', {}, (cargos.length ? '3. ' : '2. ') + 'Confira o conteúdo'));
  if (cargos.length && n.cargo == null) corpo.append(h('p', { class: 'aviso' }, 'Escolha o cargo acima para ver as disciplinas específicas.'));
  corpo.append(h('ul', { class: 'conferir' }, discs.map(d => h('li', {},
    d.bloco ? h('span', { class: 'pill ' + d.bloco }, d.bloco === 'basicos' ? 'Básicos' : 'Específicos') : '',
    h('span', {}, d.nome), h('b', {}, d.itens.length)))));
  const total = discs.reduce((a, d) => a + d.itens.length, 0);
  corpo.append(h('p', { class: 'mut' }, `${discs.length} disciplinas, ${total} itens.`),
    h('div', { class: 'acoes' },
      h('button', { class: 'btn fantasma', onclick: () => { S.novo = null; render(); } }, 'Escolher outro arquivo'),
      h('button', { class: 'btn prim', disabled: !discs.length || (cargos.length && n.cargo == null), onclick: async e => {
        e.target.disabled = true;
        const agora = new Date().toISOString();
        const dados = { ...n.meta, disciplinas: discs, p: {}, tipos: {}, ciclos: [], criado: agora, atualizado: agora };
        try {
          const id = await S.store.criar(JSON.parse(JSON.stringify(dados)));
          S.novo = null; location.hash = `#/e/${id}`;
        } catch (err) { e.target.disabled = false; toast('Não salvou: ' + (err.code || err.message), true); }
      } }, 'Salvar edital')));
  return sec;
}

function montarDisciplinas(n) {
  // mesma regra do extrair_edital.py: comuns = básicos; do cargo escolhido = específicos
  if (n.json) return n.json;
  const esc = n.cargo != null ? n.cargos[n.cargo].disciplinas : [];
  const out = [...n.gerais.map(d => ({ ...d, bloco: 'basicos' })), ...esc.map(d => ({ ...d, bloco: 'especificos' }))];
  if (!n.cargos.length) out.forEach(d => delete d.bloco);
  return out.map(d => ({ ...d, itens: d.itens.map(({ numero, nivel, texto }) => ({ numero: numero ?? '', nivel: nivel ?? 1, texto: texto ?? '' })) }));
}

async function lerArquivo(arq) {
  const n = S.novo;
  const passo = msg => { n.msg = msg; const s = $('.status'); if (s) s.textContent = msg; };
  n.etapa = 'lendo'; render();
  try {
    if (/\.json$/i.test(arq.name)) {
      const d = JSON.parse(await arq.text());
      if (!Array.isArray(d.disciplinas)) throw new Error('o arquivo não tem a lista "disciplinas"');
      Object.assign(n, { etapa: 'conferir', json: d.disciplinas, cargos: [], gerais: [],
        meta: { concurso: d.concurso || '', orgao: d.orgao || '', banca: d.banca || '', cargo: d.cargo || '', data_edital: d.data_edital || '', dataProva: d.dataProva || '' } });
      render(); return;
    }
    passo('Lendo o texto do PDF…');
    const pyPronto = py('iniciar');           // carrega o Python enquanto o PDF é lido
    const paginas = await textoDoPdf(arq);
    passo(`PDF com ${paginas.length} páginas. Preparando o Python (só na primeira vez demora)…`);
    await pyPronto;
    passo('Separando disciplinas e itens…');
    const { gerais, cargos } = await py('extrair', { paginas });
    if (!gerais.length && !cargos.length)
      throw new Error('não encontrei o conteúdo programático neste PDF. Ele é o edital completo (com os objetos de avaliação)?');
    const banca = paginas.slice(0, 3).join(' ').match(/CEBRASPE|FGV|FCC|VUNESP|CESGRANRIO|IBFC|QUADRIX|IDECAN|AOCP/i)?.[0] || '';
    Object.assign(n, { etapa: 'conferir', gerais, cargos, cargo: cargos.length === 1 ? 0 : null,
      meta: { concurso: '', orgao: '', banca: banca && (banca.toUpperCase() === 'CEBRASPE' ? 'Cebraspe' : banca.toUpperCase()),
              cargo: cargos.length === 1 ? nomeCargo(cargos[0].nome) : '', data_edital: '', dataProva: '' } });
  } catch (e) {
    Object.assign(n, { etapa: 'arquivo', msg: 'Não deu certo: ' + e.message });
  }
  render();
}

// ------------------------------------------------------------------ edital aberto
function abrirEdital(id) {
  fecharEdital();
  S.edId = id;
  S.parar = S.store.observar(id, (dados, pendente) => {
    if (S.edId !== id) return;
    if (!dados) { toast('Este edital não existe mais.', true); fecharEdital(); location.hash = '#/'; return; }
    if (pendente) return;                       // eco das nossas próprias gravações
    const j = estavel(dados);
    if (j === S.edJson) return;
    S.ed = dados; S.edJson = j; render();
  }, e => { toast('Erro ao abrir: ' + (e.code || e.message), true); location.hash = '#/'; });
}
function fecharEdital() {
  if (S.parar) S.parar(); S.parar = null; S.ed = null; S.edId = null; S.edJson = '';
  S.abertas.clear(); S.itemAberto = null;
}

function telaEdital(aba) {
  const ed = S.ed;
  const dias = diasAte(ed.dataProva);
  return h('section', {},
    h('a', { href: '#/', class: 'voltar' }, '← Meus editais'),
    h('div', { class: 'cab-edital' },
      h('div', {}, h('h1', {}, ed.concurso || 'Edital'), h('p', { class: 'mut' }, [ed.cargo, ed.banca].filter(Boolean).join(' · '))),
      dias != null && dias >= 0 ? h('div', { class: 'contagem' }, h('b', {}, dias), h('span', {}, dias === 1 ? 'dia para a prova' : 'dias para a prova')) : ''),
    h('nav', { class: 'abas' }, ABAS.map(([k, rot]) => h('a', { href: `#/e/${S.edId}/${k}`, class: aba === k ? 'sel' : '' }, rot))),
    ({ itens: abaItens, resumo: abaResumo, ciclos: abaCiclos, exportar: abaExportar, dados: abaDados }[aba] || abaItens)());
}

// ---------------- aba Itens
function abaItens() {
  const ed = S.ed, { discs } = estat(ed);
  const f = S.filtro;
  const q = f.q.trim().toLowerCase();
  const passa = (p, it) => (!f.st || (p?.st || 'A estudar') === f.st) && (!q || it.texto.toLowerCase().includes(q));
  const filtrando = !!(q || f.st);
  const cont = h('div', {});
  let blocoAnt = null;
  ed.disciplinas.forEach((d, di) => {
    const idx = d.itens.map((it, ii) => [it, ii]).filter(([it, ii]) => passa(ed.p?.[chave(di, ii)], it));
    if (filtrando && !idx.length) return;
    if ((d.bloco || '') !== blocoAnt) { blocoAnt = d.bloco || ''; if (d.bloco) cont.append(h('h2', { class: 'bloco' }, BLOCOS[d.bloco])); }
    const s = discs[di];
    const aberta = filtrando || S.abertas.has(di);
    const corpo = h('div', { class: 'itens' });
    const det = h('details', { class: 'disc', open: aberta, ontoggle: () => {
      if (det.open) { if (!filtrando) S.abertas.add(di); if (!corpo.childElementCount) corpo.append(...idx.map(([it, ii]) => linhaItem(di, ii, it))); }
      else if (!filtrando) S.abertas.delete(di);
    } },
      h('summary', {},
        h('span', { class: 'disc-nome' }, nomeCurto(d.nome)),
        h('span', { class: 'disc-info' }, `${s.feitos}/${s.itens}`, barra(s.itens ? s.feitos / s.itens : 0),
          h('span', { class: 'acerto ' + corAcerto(pct(s.tc, s.tr)), title: 'acerto em todas as fases' }, fmtPct(pct(s.tc, s.tr))))),
      corpo);
    if (aberta) corpo.append(...idx.map(([it, ii]) => linhaItem(di, ii, it)));
    cont.append(det);
  });
  if (!cont.childElementCount) cont.append(h('p', { class: 'mut' }, 'Nenhum item com esse filtro.'));
  return h('div', {},
    h('div', { class: 'filtros' },
      h('input', { type: 'search', placeholder: 'Buscar no conteúdo…', value: f.q, 'data-path': 'filtro-q',
        oninput: e => { f.q = e.target.value; clearTimeout(S.tBusca); S.tBusca = setTimeout(render, 250); } }),
      h('select', { onchange: e => { f.st = e.target.value; render(); } },
        h('option', { value: '' }, 'Todos os status'), STATUS.map(st => h('option', { value: st, selected: f.st === st }, st))),
      h('span', { class: 'mut peq' }, `Meta de acerto: ${META * 100}%`)),
    cont);
}

function linhaItem(di, ii, it) {
  const k = chave(di, ii);
  const p = () => S.ed.p?.[k] || {};
  const st = p().st || 'A estudar';
  const aberto = S.itemAberto === k;
  const resumo = h('span', { class: 'fases-mini' });
  const pintaResumo = () => resumo.replaceChildren(...FASES.map((f, i) => {
    const v = pct(num(p()[f.k]?.c) || 0, num(p()[f.k]?.r) || 0);
    return h('span', { class: 'fm ' + corAcerto(v), title: f.nome }, `F${i + 1} ${fmtPct(v)}`);
  }));
  pintaResumo();
  const sel = h('select', { class: 'st st-' + STATUS.indexOf(st), 'data-path': `p.${k}.st`, 'aria-label': 'Status',
    onclick: e => e.stopPropagation(),
    onchange: e => { salvar({ [`p.${k}.st`]: e.target.value }); e.target.className = 'st st-' + STATUS.indexOf(e.target.value); atualizaDisc(); } },
    STATUS.map(s => h('option', { selected: s === st }, s)));
  const linha = h('div', { class: 'item n' + Math.min(it.nivel || 1, 4) + (aberto ? ' aberto' : '') },
    h('div', { class: 'item-lin', role: 'button', tabindex: 0,
      onclick: () => { S.itemAberto = aberto ? null : k; render(); },
      onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) e.currentTarget.click(); } },
      h('span', { class: 'num' }, it.numero), h('span', { class: 'txt' }, it.texto), resumo, sel));
  if (aberto) linha.append(painelItem(k, p, () => { pintaResumo(); atualizaDisc(); }));
  return linha;
}

function atualizaDisc() {
  // atualiza só os números do cabeçalho das disciplinas (sem redesenhar a lista)
  const { discs } = estat(S.ed);
  document.querySelectorAll('details.disc').forEach(det => {
    const nome = det.querySelector('.disc-nome').textContent;
    const s = discs.find(x => nomeCurto(x.nome) === nome); if (!s) return;
    const info = det.querySelector('.disc-info');
    info.replaceChildren(`${s.feitos}/${s.itens}`, barra(s.itens ? s.feitos / s.itens : 0),
      h('span', { class: 'acerto ' + corAcerto(pct(s.tc, s.tr)) }, fmtPct(pct(s.tc, s.tr))));
  });
}

function painelItem(k, p, depois) {
  const base = `p.${k}`;
  const sel = (campo, rot, opts) => h('label', { class: 'campo' }, h('span', {}, rot),
    h('select', { 'data-path': `${base}.${campo}`, onchange: e => { salvar({ [`${base}.${campo}`]: e.target.value || undefined }); depois(); } },
      opts.map(o => h('option', { value: o, selected: (p()[campo] || opts[0]) === o }, o || '—'))));
  const fases = FASES.map(f => {
    const v = () => p()[f.k] || {};
    const pctEl = h('span', { class: 'pct' });
    const pinta = () => { const x = pct(num(v().c) || 0, num(v().r) || 0); pctEl.textContent = fmtPct(x); pctEl.className = 'pct ' + corAcerto(x); };
    pinta();
    const inp = (campo, rot, tipo) => {
      const path = `${base}.${f.k}.${campo}`;
      return h('label', { class: 'campo' }, h('span', {}, rot), h('input', {
        type: tipo, value: v()[campo] ?? '', 'data-path': path, min: tipo === 'number' ? 0 : null, inputmode: tipo === 'number' ? 'numeric' : null,
        onchange: e => {
          let val = e.target.value === '' ? undefined : (tipo === 'number' ? Math.max(0, Math.round(+e.target.value)) : e.target.value);
          const novo = { ...v(), [campo]: val };
          if (num(novo.c) != null && num(novo.r) != null && novo.c > novo.r) {
            toast('Certas não pode passar de resolvidas.', true); e.target.value = v()[campo] ?? ''; return; }
          if (novo.i && novo.f && novo.f < novo.i) {
            toast('A conclusão não pode ser antes do início.', true); e.target.value = v()[campo] ?? ''; return; }
          salvar({ [path]: val }); pinta(); depois();
        } }));
    };
    const hojeBtn = campo => h('button', { class: 'mini', type: 'button', title: 'hoje', onclick: e => {
      const i = e.target.closest('.campo-d').querySelector('input'); i.value = hoje(); i.dispatchEvent(new Event('change')); } }, 'hoje');
    return h('fieldset', { class: 'fase' }, h('legend', {}, f.nome),
      f.datas && h('div', { class: 'campo-d' }, inp('i', 'Início', 'date'), hojeBtn('i')),
      f.datas && h('div', { class: 'campo-d' }, inp('f', 'Conclusão', 'date'), hojeBtn('f')),
      inp('c', 'Certas', 'number'), inp('r', 'Resolvidas', 'number'),
      h('div', { class: 'campo' }, h('span', {}, '% acerto'), pctEl));
  });
  return h('div', { class: 'painel' },
    h('div', { class: 'linha-campos' }, sel('inc', 'Incidência', INCID), sel('pri', 'Prioridade', PRIOR)),
    h('div', { class: 'fases' }, fases),
    h('label', { class: 'campo larga' }, h('span', {}, 'Anotações'),
      h('textarea', { rows: 2, 'data-path': `${base}.an`, value: p().an || '',
        onchange: e => salvar({ [`${base}.an`]: e.target.value || undefined }) })));
}

// ---------------- aba Resumo
function abaResumo() {
  const ed = S.ed, { discs, soma } = estat(ed);
  const t = soma(discs);
  const dias = diasAte(ed.dataProva);
  const kpi = (v, rot, cls = '') => h('div', { class: 'kpi ' + cls }, h('b', {}, v), h('span', {}, rot));
  const tp = pct(t.tc, t.tr);
  const linha = (rot, s, forte) => h('tr', { class: forte ? 'forte' : '' },
    h('td', {}, rot), h('td', { class: 'n' }, `${s.feitos}/${s.itens}`),
    h('td', { class: 'barra-td' }, barra(s.itens ? s.feitos / s.itens : 0), h('small', {}, fmtPct(s.itens ? s.feitos / s.itens : 0))),
    s.f.map(x => h('td', { class: 'n ' + corAcerto(pct(x.c, x.r)) }, x.r ? `${x.c}/${x.r} · ${fmtPct(pct(x.c, x.r))}` : '—')),
    h('td', { class: 'n ' + corAcerto(pct(s.tc, s.tr)) }, s.tr ? `${s.tc}/${s.tr} · ${fmtPct(pct(s.tc, s.tr))}` : '—'));
  const corpo = [];
  const blocos = [...new Set(discs.map(d => d.bloco))];
  for (const b of blocos) {
    const ds = discs.filter(d => d.bloco === b);
    if (b) corpo.push(h('tr', { class: 'sep' }, h('td', { colspan: 7 }, BLOCOS[b])));
    ds.forEach(d => corpo.push(linha(nomeCurto(d.nome), d)));
    if (b && blocos.length > 1) corpo.push(linha('Subtotal', soma(ds), true));
  }
  corpo.push(linha('TOTAL', t, true));
  return h('div', {},
    h('div', { class: 'kpis' },
      kpi(fmtPct(t.itens ? t.feitos / t.itens : 0), `cobertura (${t.feitos} de ${t.itens} itens)`),
      kpi(fmtPct(tp), `acerto geral (${t.tc}/${t.tr} questões)`, corAcerto(tp)),
      dias != null && kpi(dias >= 0 ? dias : '—', dias >= 0 ? 'dias para a prova' : 'prova já passou')),
    h('div', { class: 'tabela-rol' }, h('table', { class: 'resumo' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Disciplina'), h('th', {}, 'Estudados'), h('th', {}, 'Cobertura'),
        FASES.map(f => h('th', {}, f.nome)), h('th', {}, 'Total'))),
      h('tbody', {}, corpo))),
    h('p', { class: 'mut peq' }, `Estudado = status "Estudado" ou "Revisão". Acerto em verde a partir de ${META * 100}%.`));
}

// ---------------- aba Ciclos
function abaCiclos() {
  const ed = S.ed;
  const nomes = ed.disciplinas.map(d => d.nome);
  // tipo guardado por posição da disciplina (nomes têm caracteres que não servem de chave)
  const tipo = n => ed.tipos?.['d' + nomes.indexOf(n)] || tipoSugerido(n);
  const tipos = h('div', { class: 'tipos' }, ed.disciplinas.map((d, i) => h('label', { class: 'tipo t-' + tipo(d.nome) },
    h('span', {}, nomeCurto(d.nome)),
    h('select', { 'data-path': `tipo-${i}`, onchange: e => { salvar({ [`tipos.d${i}`]: e.target.value }); render(); } },
      TIPOS.map(t => h('option', { selected: tipo(d.nome) === t }, t))))));
  const ciclos = ed.ciclos || [];
  const gravar = () => { salvar({ ciclos: ed.ciclos }); render(); };
  const novo = () => {
    ed.ciclos = [...ciclos, { id: Date.now().toString(36), nome: `Ciclo ${String(ciclos.length + 1).padStart(2, '0')}`, inicio: hoje(), slots: [] }];
    gravar();
  };
  return h('div', {},
    h('h2', {}, 'Disciplinas e tipo'),
    h('p', { class: 'mut peq' }, 'Tipo é sugestão inicial; mude se quiser. A cor aparece nos ciclos.'),
    tipos,
    h('div', { class: 'cab-ciclos' }, h('h2', {}, 'Ciclos'), h('button', { class: 'btn prim', onclick: novo }, '+ Novo ciclo')),
    !ciclos.length && h('p', { class: 'mut' }, 'Monte um ciclo com as disciplinas na ordem em que vai estudar. Depois é só marcar cada dia estudado: a próxima matéria aparece sozinha, sem pular nenhuma, e cada volta completa ganha uma cor.'),
    [...ciclos].reverse().map(c => cartaoCiclo(c, nomes, tipo, gravar)));
}

function cartaoCiclo(c, nomes, tipo, gravar) {
  const ed = S.ed;
  const slots = c.slots;
  const vezes = slots.map(s => s.d.length);
  let prox = null;
  slots.forEach((s, i) => { const o = vezes[i] * 100 + i; if (prox == null || o < prox.o) prox = { o, i }; });
  const volta = prox ? vezes[prox.i] + 1 : null;
  const mover = (i, j) => { [slots[i], slots[j]] = [slots[j], slots[i]]; gravar(); };
  const marcar = (i, dia) => {
    const d = slots[i].d;
    const k = d.indexOf(dia);
    if (k >= 0) d.splice(k, 1); else { d.push(dia); d.sort(); }
    gravar();
  };
  // grade de dias: do início até hoje (pelo menos 14 dias; no máximo os últimos 120)
  const ultimo = [hoje(), somaDias(c.inicio, 13), ...slots.flatMap(s => s.d)].sort().at(-1);
  let dias = [];
  for (let d = c.inicio; d <= ultimo && dias.length < 1000; d = somaDias(d, 1)) dias.push(d);
  dias = dias.slice(-120);
  const tabela = h('table', { class: 'grade' },
    h('thead', {}, h('tr', {}, h('th', { class: 'fixa' }, 'Matéria (ordem do ciclo)'), h('th', {}, 'Vezes'),
      dias.map(d => h('th', { class: d === hoje() ? 'hoje' : '' }, ddmm(d))))),
    h('tbody', {}, slots.map((s, i) => h('tr', { class: prox?.i === i ? 'prox' : '' },
      h('td', { class: 'fixa t-' + tipo(s.m) }, nomeCurto(s.m)), h('td', { class: 'n' }, s.d.length),
      dias.map(d => {
        const n = s.d.indexOf(d), futuro = d > hoje();
        return h('td', { class: 'dia' + (futuro ? ' futuro' : ''), title: `${nomeCurto(s.m)} — ${ddmmaaaa(d)}`,
          style: n >= 0 ? { background: VOLTAS[n % VOLTAS.length] } : null,
          onclick: futuro ? null : () => marcar(i, d) }, n >= 0 ? 'x' : '');
      })))));
  const rol = h('div', { class: 'tabela-rol' }, tabela);
  requestAnimationFrame(() => { rol.scrollLeft = rol.scrollWidth; });
  const addSel = h('select', { 'aria-label': 'Adicionar disciplina' }, h('option', { value: '' }, 'Adicionar disciplina…'),
    nomes.map(n => h('option', { value: n }, nomeCurto(n))));
  addSel.onchange = () => { if (addSel.value) { slots.push({ m: addSel.value, d: [] }); gravar(); } };
  return h('div', { class: 'ciclo' },
    h('div', { class: 'ciclo-cab' },
      h('input', { class: 'ciclo-nome', value: c.nome, 'data-path': `ciclo-${c.id}-nome`, onchange: e => { c.nome = e.target.value; gravar(); } }),
      h('label', { class: 'campo inline' }, h('span', {}, 'Início'),
        h('input', { type: 'date', value: c.inicio, onchange: e => { if (e.target.value) { c.inicio = e.target.value; gravar(); } } })),
      h('button', { class: 'btn fantasma peq', onclick: () => {
        if (confirm(`Excluir "${c.nome}" e as marcações dele?`)) { ed.ciclos = ed.ciclos.filter(x => x !== c); gravar(); } } }, 'Excluir')),
    prox ? h('div', { class: 'proxima' },
      h('div', {}, h('span', { class: 'mut' }, 'Volta atual'), h('b', { class: 'volta', style: { background: VOLTAS[(volta - 1) % VOLTAS.length] } }, volta)),
      h('div', { class: 'cresce' }, h('span', { class: 'mut' }, 'Próxima matéria'), h('b', {}, nomeCurto(slots[prox.i].m))),
      h('button', { class: 'btn prim', onclick: () => {
        if (slots[prox.i].d.includes(hoje())) return toast('Essa matéria já está marcada hoje.');
        marcar(prox.i, hoje()); toast(`Marcado: ${nomeCurto(slots[prox.i].m)} em ${ddmm(hoje())}`); } }, 'Estudei hoje ✓'))
      : h('p', { class: 'mut' }, 'Adicione as disciplinas do ciclo, na ordem em que vai estudar.'),
    slots.length ? rol : '',
    h('details', { class: 'composicao' }, h('summary', {}, `Montar o ciclo (${slots.length} matérias)`),
      h('ol', {}, slots.map((s, i) => h('li', { class: 't-' + tipo(s.m) }, h('span', {}, nomeCurto(s.m)),
        h('span', { class: 'botoes' },
          h('button', { class: 'mini', disabled: i === 0, title: 'subir', onclick: () => mover(i, i - 1) }, '↑'),
          h('button', { class: 'mini', disabled: i === slots.length - 1, title: 'descer', onclick: () => mover(i, i + 1) }, '↓'),
          h('button', { class: 'mini', title: 'tirar do ciclo', onclick: () => {
            if (!s.d.length || confirm(`Tirar ${nomeCurto(s.m)} do ciclo? As ${s.d.length} marcações dela somem.`)) { slots.splice(i, 1); gravar(); } } }, '✕'))))),
      addSel),
    h('div', { class: 'legenda' }, h('span', { class: 'mut peq' }, 'Voltas:'),
      VOLTAS.map((cor, i) => h('span', { class: 'volta peq', style: { background: cor } }, i + 1)),
      h('span', { class: 'mut peq' }, 'Clique num dia para marcar ou desmarcar.')));
}

// ---------------- aba Exportar
function abaExportar() {
  const ed = S.ed;
  const json = () => ({ concurso: ed.concurso || '', orgao: ed.orgao || '', banca: ed.banca || '', cargo: ed.cargo || '',
    data_edital: ed.data_edital || '', disciplinas: ed.disciplinas });
  const base = nomeArquivo(ed);
  const gerar = (tipo, nome, mime) => async e => {
    const b = e.currentTarget, txt = b.querySelector('b').textContent;
    b.disabled = true; b.querySelector('b').textContent = 'Gerando… (a 1ª vez carrega o Python)';
    try { baixar(nome, await py('gerar', { tipo, edital: json() }), mime); }
    catch (err) { toast('Não gerou: ' + err.message, true); }
    b.disabled = false; b.querySelector('b').textContent = txt;
  };
  const botao = (titulo, desc, fn) => h('button', { class: 'card exp', onclick: fn }, h('b', {}, titulo), h('span', { class: 'mut' }, desc));
  return h('div', {},
    h('p', { class: 'mut' }, 'Os arquivos são gerados no seu aparelho, a partir do edital salvo.'),
    h('div', { class: 'cards' },
      botao('Planilha (.xlsx)', 'O plano em branco, com as abas de sempre. Abre no Excel e no Google Sheets.',
        gerar('xlsx', base + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
      botao('Painel (.html)', 'Painel interativo para abrir no navegador.', gerar('html', base + '.html', 'text/html')),
      botao('Imprimível (.docx)', 'Edital verticalizado para imprimir.',
        gerar('docx', base + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
      botao('Cópia de segurança (.json)', 'Tudo: edital, progresso e ciclos.', () =>
        baixar(base + '-backup.json', JSON.stringify({ ...json(), ...ed }, null, 1), 'application/json'))),
    h('p', { class: 'mut peq' }, 'A planilha, o painel e o imprimível saem sem o progresso marcado aqui; o progresso fica na cópia de segurança.'));
}

// ---------------- aba Dados
function abaDados() {
  const ed = S.ed;
  const campo = (k, rot, tipo = 'text') => h('label', { class: 'campo' }, h('span', {}, rot),
    h('input', { type: tipo, value: ed[k] || '', 'data-path': `dados-${k}`, onchange: e => salvar({ [k]: e.target.value }) }));
  return h('div', { class: 'estreito' },
    h('div', { class: 'grade2' }, campo('concurso', 'Concurso'), campo('orgao', 'Órgão'), campo('banca', 'Banca'),
      campo('cargo', 'Cargo / área'), campo('data_edital', 'Edital'), campo('dataProva', 'Data da prova', 'date')),
    h('p', { class: 'mut peq' }, `Criado em ${ddmmaaaa((ed.criado || '').slice(0, 10))}. ${ed.disciplinas.length} disciplinas, ${ed.disciplinas.reduce((a, d) => a + d.itens.length, 0)} itens.`),
    h('div', { class: 'perigo' }, h('b', {}, 'Excluir este edital'),
      h('p', { class: 'mut peq' }, 'Apaga o edital e todo o progresso marcado nele. Não tem volta. Se quiser guardar, baixe antes a cópia de segurança na aba Exportar.'),
      h('button', { class: 'btn perigo-btn', onclick: async () => {
        if (prompt('Para confirmar, digite EXCLUIR') !== 'EXCLUIR') return;
        const id = S.edId; fecharEdital();
        try { await S.store.excluir(id); toast('Edital excluído.'); } catch (e) { toast('Não excluiu: ' + (e.code || e.message), true); }
        location.hash = '#/';
      } }, 'Excluir edital')));
}

// ------------------------------------------------------------------ início do app
(async () => {
  const demo = new URLSearchParams(location.search).has('demo');
  try { S.store = demo ? demoStore() : await firebaseStore(); }
  catch (e) { $('#app').replaceChildren(h('div', { class: 'aviso' }, 'Não foi possível carregar o Firebase: ' + e.message)); return; }
  S.store.onUser(u => { S.user = u; if (!u) fecharEdital(); render(); });
})();
