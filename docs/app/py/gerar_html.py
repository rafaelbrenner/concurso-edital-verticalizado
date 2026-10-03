#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera um PAINEL DE ESTUDO interativo (HTML único) a partir do JSON canônico.

Recursos: blocos Conhecimentos Básicos / Específicos (quando o JSON traz `bloco`),
disciplinas recolhíveis, status por item (clique cicla A estudar → Estudando →
Estudado → Revisão), questões por fase (Fase 1 e 2 com datas; Fase 3 só questões)
com % de acerto vermelha abaixo de 70% e verde a partir de 70%, progresso e acerto
por disciplina, bloco e global, busca e filtro — tudo salvo no navegador
(localStorage) + Salvar/Carregar progresso em .json. Estética da marca (azul/slate, Sora).

Uso: python3 gerar_html.py edital.json --out painel.html [--sem-logo]
"""
import argparse, base64, json, os
from pathlib import Path

_LOGO_DEFAULT = Path(__file__).resolve().parent.parent / "assets" / "logo.png"
LOGO = os.environ.get("EDITAL_LOGO") or str(_LOGO_DEFAULT)  # opcional: marca própria do usuário
BLOCOS = {"basicos": "Conhecimentos Básicos", "especificos": "Conhecimentos Específicos"}
META_ACERTO = 0.70


def build(data, out):
    logo = ""
    if LOGO:
        try:
            logo = "data:image/png;base64," + base64.b64encode(Path(LOGO).read_bytes()).decode()
        except Exception:
            pass
    payload = json.dumps({
        "concurso": data.get("concurso", ""), "cargo": data.get("cargo", ""),
        "orgao": data.get("orgao", ""), "disciplinas": data.get("disciplinas", []),
        "blocos": BLOCOS, "meta": META_ACERTO,
    }, ensure_ascii=False).replace("</", "<\\/")

    html = """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Edital Verticalizado — Painel de Estudo</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--azul:#2563EB;--azul2:#3B82F6;--slate:#0f172a;--slate2:#1e293b;--bg:#f1f5f9;--card:#fff;
--txt:#1e293b;--mut:#64748b;--bd:#e2e8f0;--verde:#16a34a;--amar:#d97706;--verm:#dc2626;
--okbg:#dcfce7;--okfg:#166534;--badbg:#fee2e2;--badfg:#991b1b;--soft:#f8fafc}
*{margin:0;box-sizing:border-box}
body{font-family:'Sora',system-ui,sans-serif;background:var(--bg);color:var(--txt);font-size:15px}
header{position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;
padding:14px 22px;box-shadow:0 4px 20px rgba(0,0,0,.25)}
.top{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.logo{width:42px;height:42px;border-radius:11px;background:rgba(255,255,255,.07);
border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center}
.logo img{width:30px}
h1{font-size:18px;font-weight:700}.sub{font-size:13px;color:#94a3b8}
.gstats{margin-left:auto;display:flex;gap:22px;text-align:right}
.gstat b{font-size:26px;font-weight:800;color:#60a5fa;font-variant-numeric:tabular-nums}
.gstat b.ok{color:#4ade80}.gstat b.bad{color:#f87171}
.gbar{height:7px;border-radius:6px;background:rgba(255,255,255,.12);margin-top:10px;overflow:hidden}
.gbar>span{display:block;height:100%;background:linear-gradient(90deg,#2563EB,#60a5fa);width:0;transition:width .3s}
.tools{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.tools input,.tools select{font-family:inherit;font-size:13px;padding:8px 12px;border-radius:10px;
border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff}
.tools input{flex:1;min-width:160px}.tools input::placeholder{color:#94a3b8}
.tools select option{color:#000}
.btn{font-family:inherit;font-size:13px;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}
.btn:hover{background:rgba(255,255,255,.16)}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
main{max-width:1000px;margin:22px auto;padding:0 16px}
.bloco{margin-bottom:26px}
.bh{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 2px 12px}
.bh h2{font-size:16px;font-weight:700;color:var(--slate2);letter-spacing:.02em;text-transform:uppercase;flex:1}
.bh .pc{font-size:13px;font-weight:600;color:var(--azul)}
.disc{background:var(--card);border:1px solid var(--bd);border-radius:14px;margin-bottom:14px;overflow:hidden;
box-shadow:0 1px 3px rgba(15,23,42,.04)}
.dh{display:flex;align-items:center;gap:12px;padding:14px 18px;cursor:pointer;user-select:none;flex-wrap:wrap}
.dh:hover{background:var(--soft)}
.dh .nm{font-weight:600;font-size:15px;flex:1;min-width:180px}
.pc{font-size:13px;font-weight:600;color:var(--azul);min-width:42px;text-align:right;font-variant-numeric:tabular-nums}
.dh .ct{font-size:12px;color:var(--mut)}
.dbar{height:6px;width:120px;border-radius:5px;background:#eef2f7;overflow:hidden}
.dbar>span{display:block;height:100%;background:linear-gradient(90deg,#2563EB,#60a5fa);width:0}
.chev{transition:transform .2s;color:var(--mut)}
.disc.collapsed .items{display:none}.disc.collapsed .chev{transform:rotate(-90deg)}
.items{border-top:1px solid var(--bd)}
.it{border-bottom:1px solid #f1f5f9}.it:last-child{border-bottom:0}
.row{display:flex;align-items:flex-start;gap:12px;padding:9px 18px}
.st{flex:0 0 auto;width:22px;height:22px;border-radius:7px;border:2px solid #cbd5e1;cursor:pointer;background:transparent;
margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;font-family:inherit;padding:0}
.it[data-s="estudando"] .st{background:var(--amar);border-color:var(--amar)}
.it[data-s="estudado"] .st{background:var(--verde);border-color:var(--verde)}
.it[data-s="revisao"] .st{background:var(--azul);border-color:var(--azul)}
.num{flex:0 0 auto;color:var(--mut);font-variant-numeric:tabular-nums;font-size:13px;min-width:34px}
.tx{flex:1;min-width:0}
.it[data-s="estudado"] .tx,.it[data-s="revisao"] .tx{color:var(--mut)}
.it.n1 .tx{font-weight:600}.it.n2 .tx{padding-left:18px}.it.n3 .tx,.it.n4 .tx{padding-left:36px;font-size:14px}
.it.hide{display:none}
.qbtn{flex:0 0 auto;display:flex;gap:4px;align-items:center;font-family:inherit;font-size:11px;color:var(--mut);
background:var(--soft);border:1px solid var(--bd);border-radius:8px;padding:3px 7px;cursor:pointer}
.qbtn:hover{border-color:var(--azul2);color:var(--azul)}
.chip{font-size:11px;font-weight:700;border-radius:6px;padding:1px 6px;font-variant-numeric:tabular-nums;white-space:nowrap}
.chip.ok{background:var(--okbg);color:var(--okfg)}.chip.bad{background:var(--badbg);color:var(--badfg)}
.chip.nd{background:#eef2f7;color:var(--mut);font-weight:500}
.qpanel{display:none;gap:10px;flex-wrap:wrap;padding:4px 18px 14px 86px}
.it.open .qpanel{display:flex}
.fase{border:1px solid var(--bd);border-radius:10px;padding:8px 10px;background:var(--soft);display:grid;
grid-template-columns:auto auto;gap:4px 8px;align-items:center;font-size:12px;min-width:0}
.fase h4{grid-column:1/-1;font-size:12px;font-weight:700;color:var(--slate2);display:flex;justify-content:space-between;gap:8px}
.fase label{color:var(--mut)}
.fase input{font-family:inherit;font-size:12px;padding:3px 6px;border:1px solid var(--bd);border-radius:6px;width:120px;background:#fff;color:var(--txt)}
.fase input[type=number]{width:70px}
.fase input.err{border-color:var(--verm);background:var(--badbg)}
.foot{text-align:center;color:var(--mut);font-size:12px;margin:24px 0}
.leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#94a3b8;margin-top:10px}
.leg i{width:12px;height:12px;border-radius:4px;display:inline-block;margin-right:5px;vertical-align:-1px}
@media (max-width:600px){.qpanel{padding-left:18px}.gstats{margin-left:0;text-align:left}.dbar{width:80px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media print{header{position:static}.tools,.chev,.qbtn{display:none}.disc.collapsed .items{display:block}}
</style></head><body>
<header>
  <div class="top">
    <div class="logo">__LOGO__</div>
    <div><h1>Edital Verticalizado</h1><div class="sub" id="sub"></div></div>
    <div class="gstats">
      <div class="gstat"><b id="gpc">0%</b><div class="sub" id="gct"></div></div>
      <div class="gstat"><b id="gac">—</b><div class="sub" id="gacq">acerto nas questões</div></div>
    </div>
  </div>
  <div class="gbar"><span id="gbar"></span></div>
  <div class="tools">
    <input id="q" placeholder="🔎 Buscar assunto..." aria-label="Buscar assunto">
    <select id="fs" aria-label="Filtrar">
      <option value="">Todos os itens</option>
      <option value="pend">Pendentes (não concluídos)</option>
      <option value="a">A estudar</option>
      <option value="estudando">Estudando</option>
      <option value="estudado">Estudado</option>
      <option value="revisao">Revisão</option>
      <option value="baixo">Acerto abaixo de 70%</option>
      <option value="semq">Sem questões ainda</option>
    </select>
    <button id="exp" class="btn">Recolher/expandir</button>
    <button id="save" class="btn" title="Baixar um arquivo com seu progresso">💾 Salvar progresso</button>
    <button id="load" class="btn" title="Carregar um arquivo de progresso salvo">📂 Carregar</button>
    <input id="file" type="file" accept="application/json,.json" style="display:none">
  </div>
  <div class="leg"><span><i style="background:#cbd5e1"></i>A estudar</span><span><i style="background:#d97706"></i>Estudando</span><span><i style="background:#16a34a"></i>Estudado</span><span><i style="background:#2563EB"></i>Revisão</span><span><i style="background:#dcfce7"></i>Acerto ≥ 70%</span><span><i style="background:#fee2e2"></i>Acerto &lt; 70%</span></div>
</header>
<main id="app"></main>
<div class="foot">Seu progresso fica salvo automaticamente neste navegador. Use “Salvar progresso” para levar a outro aparelho.</div>
<script>
const DATA = __DATA__;
const ORDER = ["", "estudando", "estudado", "revisao"];
const MARK = {"":"","estudando":"~","estudado":"✓","revisao":"R"};
// fases: Fase 1 e 2 com datas (i = início, c = conclusão); Fase 3 só questões. ce = certas, re = resolvidas
const FASES = [{k:"f1",nome:"Fase 1",datas:true},{k:"f2",nome:"Fase 2",datas:true},{k:"f3",nome:"Fase 3",datas:false}];
const slug = (DATA.concurso+"|"+DATA.cargo).replace(/\\s+/g,"_").slice(0,80);
const KEY = "vep:"+slug;
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let state = {};
try{ state = JSON.parse(localStorage.getItem(KEY)||"{}"); }catch(e){ state = {}; }
// versões antigas guardavam só o status (string)
for(const k in state){ if(typeof state[k]==="string") state[k]={s:state[k]}; }
const done = s => s==="estudado"||s==="revisao";
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
const rec = id => state[id] || (state[id] = {});
function clean(id){ const r=state[id]; if(r && !Object.keys(r).some(k=>r[k]!==""&&r[k]!=null)) delete state[id]; }

const num = v => (v===""||v==null||isNaN(+v)) ? null : +v;
function fasePct(r, k){ const ce=num(r[k+"ce"]), re=num(r[k+"re"]);
  return (re && ce!=null && ce<=re) ? ce/re : null; }
function somaQ(ids){ let ce=0, re=0;
  ids.forEach(id=>{ const r=state[id]; if(!r) return;
    FASES.forEach(f=>{ const c=num(r[f.k+"ce"]), q=num(r[f.k+"re"]); if(q && c!=null && c<=q){ ce+=c; re+=q; } }); });
  return {ce, re, p: re ? ce/re : null}; }
const fmtP = p => p==null ? "—" : (100*p).toFixed(p===1?0:1).replace(".",",")+"%";
const cls = p => p==null ? "nd" : (p>=DATA.meta ? "ok" : "bad");

document.getElementById("sub").textContent = [DATA.concurso, DATA.cargo].filter(Boolean).join(" · ");

// ---- montagem
const app = document.getElementById("app");
const grupos = [];
DATA.disciplinas.forEach((d,di)=>{ const b=d.bloco||"";
  let g=grupos.find(x=>x.b===b); if(!g){ g={b, dis:[]}; grupos.push(g); } g.dis.push(di); });
function faseHTML(id, f){
  const datas = f.datas ? `<label for="${id}-${f.k}i">Início</label><input type="date" id="${id}-${f.k}i" data-f="${f.k}i">
    <label for="${id}-${f.k}c">Conclusão</label><input type="date" id="${id}-${f.k}c" data-f="${f.k}c">` : "";
  return `<div class="fase"><h4>${f.nome}<span class="chip nd" data-p="${f.k}">—</span></h4>${datas}
    <label for="${id}-${f.k}ce">Certas</label><input type="number" min="0" step="1" inputmode="numeric" id="${id}-${f.k}ce" data-f="${f.k}ce">
    <label for="${id}-${f.k}re">Resolvidas</label><input type="number" min="0" step="1" inputmode="numeric" id="${id}-${f.k}re" data-f="${f.k}re"></div>`;
}
grupos.forEach(g=>{
  const box=document.createElement("section"); box.className="bloco"; box.dataset.b=g.b;
  if(g.b) box.innerHTML=`<div class="bh"><h2>${esc(DATA.blocos[g.b]||g.b)}</h2>
    <span class="chip nd" data-ac></span><div class="dbar"><span></span></div><span class="pc">0%</span></div>`;
  g.dis.forEach(di=>{ const d=DATA.disciplinas[di];
    const sec=document.createElement("section"); sec.className="disc"; sec.dataset.di=di;
    let its="";
    d.itens.forEach(it=>{
      const id="d"+di+"-"+it.numero; const s=(state[id]||{}).s||"";
      its+=`<div class="it n${it.nivel}" data-id="${id}" data-s="${s}" data-tx="${esc((it.texto||'').toLowerCase())}">
        <div class="row"><button class="st" title="Clique para mudar o status" aria-label="Status">${MARK[s]}</button>
        <div class="num">${esc(it.numero)}</div><div class="tx">${esc(it.texto)}</div>
        <button class="qbtn" title="Questões por fase" aria-expanded="false">Questões <span class="chip nd" data-tot>—</span></button></div>
        <div class="qpanel">${FASES.map(f=>faseHTML(id,f)).join("")}</div></div>`;
    });
    sec.innerHTML=`<div class="dh"><i class="chev">▾</i><span class="nm">${esc(d.nome)}</span>
      <span class="ct">${d.itens.length} itens</span><span class="chip nd" data-ac></span>
      <div class="dbar"><span></span></div><span class="pc">0%</span></div>
      <div class="items">${its}</div>`;
    box.appendChild(sec);
  });
  app.appendChild(box);
});

// preenche os campos com o que está salvo
app.querySelectorAll(".it").forEach(it=>{ const r=state[it.dataset.id]||{};
  it.querySelectorAll("[data-f]").forEach(inp=>{ inp.value = r[inp.dataset.f] ?? ""; }); paintItem(it); });

// ---- cálculo e pintura
function setChip(el, p, prefixo){ el.className="chip "+cls(p); el.textContent=(prefixo||"")+fmtP(p); }
function paintItem(it){
  const r=state[it.dataset.id]||{};
  FASES.forEach(f=>{
    setChip(it.querySelector(`[data-p="${f.k}"]`), fasePct(r,f.k));
    const ce=it.querySelector(`[data-f="${f.k}ce"]`), re=it.querySelector(`[data-f="${f.k}re"]`);
    const c=num(r[f.k+"ce"]), q=num(r[f.k+"re"]);
    const bad=(c!=null&&(c<0||c%1))||(q!=null&&(q<0||q%1))||(c!=null&&q!=null&&c>q)||(c!=null&&q==null);
    ce.classList.toggle("err", bad); re.classList.toggle("err", bad);
    if(f.datas){ const i=it.querySelector(`[data-f="${f.k}i"]`), cc=it.querySelector(`[data-f="${f.k}c"]`);
      cc.classList.toggle("err", !!(i.value && cc.value && cc.value < i.value)); }
  });
  setChip(it.querySelector("[data-tot]"), somaQ([it.dataset.id]).p);
}
const ids = el => [...el.querySelectorAll(".it")].map(x=>x.dataset.id);
function prog(el){ const its=[...el.querySelectorAll(".it")]; const c=its.filter(x=>done(x.dataset.s)).length;
  const p=its.length?Math.round(100*c/its.length):0;
  const pc=el.querySelector(":scope > .dh .pc, :scope > .bh .pc"), bar=el.querySelector(":scope > .dh .dbar>span, :scope > .bh .dbar>span");
  if(pc) pc.textContent=p+"%"; if(bar) bar.style.width=p+"%";
  const ac=el.querySelector(":scope > .dh [data-ac], :scope > .bh [data-ac]");
  if(ac){ const q=somaQ(ids(el)); setChip(ac,q.p,"acerto "); ac.title=q.re?`${q.ce} de ${q.re} questões`:"sem questões"; }
  return [c,its.length]; }
function refresh(){ let tot=0,cc=0;
  app.querySelectorAll(".disc").forEach(d=>{ const [c,n]=prog(d); tot+=n; cc+=c; });
  app.querySelectorAll(".bloco").forEach(prog);
  const p=tot?Math.round(100*cc/tot):0;
  document.getElementById("gpc").textContent=p+"%";
  document.getElementById("gbar").style.width=p+"%";
  document.getElementById("gct").textContent=cc+" de "+tot+" itens";
  const q=somaQ(ids(app)); const g=document.getElementById("gac");
  g.textContent=fmtP(q.p); g.className=q.p==null?"":cls(q.p);
  document.getElementById("gacq").textContent = q.re ? `acerto · ${q.ce} de ${q.re} questões` : "acerto nas questões";
}

// ---- eventos
app.addEventListener("click",e=>{
  const st=e.target.closest(".st");
  if(st){ const it=st.closest(".it"); const cur=it.dataset.s||"";
    const nx=ORDER[(ORDER.indexOf(cur)+1)%ORDER.length]; it.dataset.s=nx; st.textContent=MARK[nx];
    rec(it.dataset.id).s=nx; clean(it.dataset.id); save(); refresh(); return; }
  const qb=e.target.closest(".qbtn");
  if(qb){ const it=qb.closest(".it"); it.classList.toggle("open"); qb.setAttribute("aria-expanded", it.classList.contains("open")); return; }
  const dh=e.target.closest(".dh"); if(dh){ dh.closest(".disc").classList.toggle("collapsed"); }
});
app.addEventListener("input",e=>{
  const inp=e.target.closest("[data-f]"); if(!inp) return;
  const it=inp.closest(".it"); rec(it.dataset.id)[inp.dataset.f]=inp.value; clean(it.dataset.id);
  save(); paintItem(it); refresh(); applyFilter();
});
document.getElementById("exp").onclick=()=>{
  const any=app.querySelector(".disc:not(.collapsed)");
  app.querySelectorAll(".disc").forEach(s=>s.classList.toggle("collapsed", !!any));
};
function applyFilter(){ const q=document.getElementById("q").value.toLowerCase().trim();
  const fs=document.getElementById("fs").value;
  app.querySelectorAll(".disc").forEach(sec=>{ let vis=0;
    sec.querySelectorAll(".it").forEach(it=>{
      const s=it.dataset.s||"", p=somaQ([it.dataset.id]);
      let ok=!q || it.dataset.tx.includes(q);
      if(fs==="pend") ok=ok&&!done(s);
      else if(fs==="a") ok=ok&&s==="";
      else if(fs==="baixo") ok=ok&&p.p!=null&&p.p<DATA.meta;
      else if(fs==="semq") ok=ok&&p.re===0;
      else if(fs) ok=ok&&s===fs;
      it.classList.toggle("hide",!ok); if(ok)vis++; });
    sec.hidden=!vis; });
  app.querySelectorAll(".bloco").forEach(b=>{ b.hidden=!b.querySelector(".disc:not([hidden])"); });
}
document.getElementById("q").addEventListener("input",applyFilter);
document.getElementById("fs").addEventListener("change",applyFilter);

// --- salvar / carregar progresso (export/import .json) ---
function exportProgress(){
  const payload={app:"verticalizar-edital-pro",versao:2,concurso:DATA.concurso,cargo:DATA.cargo,exportadoEm:new Date().toISOString(),state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="progresso-"+(slug||"edital")+".json"; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(a.href);
}
function importProgress(file){
  const rd=new FileReader();
  rd.onload=ev=>{ try{ const j=JSON.parse(ev.target.result); const st=(j&&j.state)?j.state:j;
    if(typeof st!=="object"||!st) throw 0;
    if(j&&j.cargo&&DATA.cargo&&j.cargo!==DATA.cargo&&!confirm("Este progresso é de outro cargo (\\""+j.cargo+"\\"). Carregar mesmo assim?")) return;
    state=st; for(const k in state){ if(typeof state[k]==="string") state[k]={s:state[k]}; } save();
    app.querySelectorAll(".it").forEach(it=>{ const r=state[it.dataset.id]||{}; const s=r.s||"";
      it.dataset.s=s; it.querySelector(".st").textContent=MARK[s];
      it.querySelectorAll("[data-f]").forEach(inp=>{ inp.value=r[inp.dataset.f]??""; }); paintItem(it); });
    refresh(); applyFilter(); alert("Progresso carregado com sucesso.");
  }catch(e){ alert("Arquivo de progresso inválido."); } };
  rd.readAsText(file);
}
document.getElementById("save").onclick=exportProgress;
document.getElementById("load").onclick=()=>document.getElementById("file").click();
document.getElementById("file").addEventListener("change",e=>{ if(e.target.files[0])importProgress(e.target.files[0]); e.target.value=""; });
refresh();
</script></body></html>"""
    html = html.replace("__LOGO__", f'<img src="{logo}" alt="">' if logo else "📋").replace("__DATA__", payload)
    Path(out).write_text(html, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json"); ap.add_argument("--out", "-o", required=True)
    ap.add_argument("--sem-logo", action="store_true", help="não inserir logo no cabeçalho")
    a = ap.parse_args()
    if a.sem_logo:
        global LOGO
        LOGO = ""
    data = json.loads(Path(a.json).read_text(encoding="utf-8"))
    build(data, a.out)
    n = sum(len(d["itens"]) for d in data.get("disciplinas", []))
    print(f"OK -> {a.out} | {len(data.get('disciplinas', []))} disciplinas, {n} itens")


if __name__ == "__main__":
    main()
