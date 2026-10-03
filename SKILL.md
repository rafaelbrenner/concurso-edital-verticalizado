---
name: verticalizar-edital-pro
description: "Verticaliza qualquer edital de concurso público e gera o plano de estudo em TRÊS formatos a partir de uma fonte única: PLANILHA viva (Excel .xlsx), PAINEL interativo (HTML) e documento imprimível (DOCX). Use sempre que o usuário quiser transformar um edital (PDF ou conteúdo programático) em um plano de estudo estruturado, priorizável e acompanhável. Gatilhos: 'verticalizar edital', 'planilha do edital', 'edital verticalizado', 'plano de estudo do edital', 'organizar o edital pra estudar', 'acompanhar o edital'. Detecta os cargos/especialidades do edital e deixa o usuário escolher um; extrai disciplinas, assuntos e subitens preservando a numeração e a ordem do edital."
metadata:
  version: "1.1.0"
---

# Verticalizar Edital PRO — plano de estudo em 3 formatos

Transforma o edital de um concurso em um plano de estudo acompanhável, em três formatos gerados de uma fonte única: **Excel** (planilha viva), **HTML** (painel interativo) e **DOCX** (imprimível).

<args>$ARGUMENTS</args>

## Início — pergunte primeiro (sempre)

Ao acionar esta skill, **não comece a processar sem antes alinhar o básico com o usuário**:

1. **Peça o edital.** Solicite que o usuário **anexe o PDF do edital** (ou informe o caminho do arquivo, ou cole o conteúdo programático). Sem o edital não há o que verticalizar. Se o usuário já tiver anexado/citado um arquivo, use-o.
2. **Cargo/especialidade.** Rode a extração em modo lista (`--listar`) e **mostre os cargos detectados numerados**; pergunte qual o usuário quer. Editais grandes têm vários cargos — verticalizar todos seria inútil.
3. **Formatos.** Pergunte quais formatos gerar: **Excel, HTML, DOCX ou todos** (padrão sugerido: todos).
4. **(Opcional) Cabeçalho.** Confirme nome do concurso / órgão / banca / data, se quiser que apareçam no topo dos arquivos.

Use `AskUserQuestion` para os itens 2 e 3 quando ajudar. Só siga para o pipeline depois que tiver o edital e o cargo.

## Arquitetura — "extrair uma vez → vários geradores"

O edital é extraído **uma única vez** para um **JSON canônico** (a fonte da verdade); cada formato é gerado a partir dele, garantindo conteúdo idêntico nas três versões.

```
edital (.pdf ou .md) ─▶ extrair_edital.py ─▶ edital.json ─┬─▶ gerar_excel.py ─▶ planilha viva (.xlsx)
                                                          ├─▶ gerar_html.py  ─▶ painel interativo (.html)
                                                          └─▶ gerar_docx.py  ─▶ imprimível (.docx)
```

## Extração fiel + seleção de cargo

Regras de extração: **preservar a numeração e a ordem exatas do edital**, respeitar disciplinas agrupadas (não separar blocos que a banca uniu), ignorar seções administrativas (inscrições, cronograma), contar todos os níveis (assunto + subitem + sub-subitem). Editais reais trazem **vários cargos/especialidades** — a extração separa **Conhecimentos Gerais (comuns)** dos **Específicos por cargo** e monta a saída como *Gerais + cargo escolhido*.

- `.md` (conteúdo já verticalizado): extração **exata**, cargo único.
- `.pdf`: extração **heurística** — itens inline são tokenizados distinguindo nº de item de nº de lei; sempre confira o resumo impresso.
- **Editais CEBRASPE com vários cargos** (`OBJETOS DE AVALIAÇÃO` → `CONHECIMENTOS BÁSICOS` + `CONHECIMENTOS ESPECÍFICOS` com blocos `CARGO N: ...`) têm parser próprio: reconhece cabeçalhos de cargo quebrados em várias linhas, disciplinas inline (`NOME: 1 item. 1.1 ...`) e cargos que começam direto nos itens (disciplina implícita com o nome da área). A assinatura no fim do edital é descartada.
- Cada disciplina do JSON leva `bloco`: `"basicos"` (comuns) ou `"especificos"` (do cargo) — o Excel usa isso para separar as abas.

## Pipeline

### 1. Listar cargos e extrair o JSON
```bash
python3 scripts/extrair_edital.py <edital.pdf|edital.md> --listar
python3 scripts/extrair_edital.py <edital.pdf> --cargo "<nº|nome>" --out edital.json \
  [--concurso "..."] [--orgao "..."] [--banca "..."]
```
Saída: `edital.json` = `{concurso, orgao, banca, cargo, data_edital, disciplinas[ {nome, bloco, itens[ {numero, nivel, texto} ]} ]}` (`bloco` só existe quando há seleção de cargo).

### 2. Gerar os formatos pedidos (todos consomem o mesmo `edital.json`)
```bash
python3 scripts/gerar_excel.py edital.json --out plano.xlsx [--sem-logo]
python3 scripts/gerar_html.py  edital.json --out painel.html [--sem-logo]
python3 scripts/gerar_docx.py  edital.json --out plano.docx [--sem-logo]
```
- **Excel** — compatível com **Google Sheets** (para acompanhar em vários aparelhos). Abas:
  - **Conhecimentos Básicos** e **Conhecimentos Específicos** — 1 linha por item: Status / Incidência / Prioridade (dropdowns, cores por estado); **Fase 1** e **Fase 2** (Início, Conclusão, Certas, Resolvidas, Porcentagem) e **Questões Fase 3** (Certas, Resolvidas, Porcentagem); Anotações. % de acerto **vermelha abaixo de 70% e verde a partir de 70%**; validação de datas e de questões (inteiros, certas ≤ resolvidas).
  - **Resumo** — % de cobertura (barra em texto) e % de acerto por fase e no total, por disciplina, subtotal por bloco e total geral; gráfico.
  - **Edital** — disciplinas × tipo **Decoreba/Raciocínio** (sugestão editável) × ciclos em que entraram (marcados sozinhos).
  - **Ciclos** — até 6 ciclos de estudo com data de início e blocos de "0' a 1h"; disciplinas escolhidas em lista, coloridas pelo tipo.
  - **Controle** — por ciclo, matérias × dias: marca-se `x` no dia estudado e o n-ésimo `x` da linha recebe a cor da volta n; mostra **Volta atual** e **Próxima matéria** (ordem do ciclo, sem pular matéria).
  - **Evolução Semanal** — certas/resolvidas/% por disciplina, semana a semana (15 semanas a partir de uma data editável), com subtotais por bloco.
  - **Como usar** — instruções, inclusive para Google Sheets e celular.
- **HTML** — painel de estudo (arquivo único): seções **Conhecimentos Básicos / Específicos**, disciplinas recolhíveis, status por item (clique cicla A estudar → Estudando → Estudado → Revisão), **questões por fase** (botão "Questões" em cada item: Fase 1 e 2 com datas, Fase 3; % vermelha abaixo de 70%, verde a partir de 70%), progresso e % de acerto por disciplina, bloco e global, busca e filtro (inclui "Acerto abaixo de 70%") — salvo automaticamente no navegador (localStorage) + botões **Salvar/Carregar progresso** que exportam/importam um `.json` (não perde ao trocar de navegador ou dispositivo).
- **DOCX** — verticalizado imprimível: quadro-resumo por bloco, partes **Básicos / Específicos**, uma disciplina por página em tabela (☐ | Nº | Conteúdo | Fase 1 | Fase 2 | Fase 3, com `___/___` para anotar certas/resolvidas à mão), cabeçalho da tabela repetido a cada página, nº de página no rodapé.

### 3. Conferir e entregar
Leia o resumo da extração, abra cada arquivo, confirme que disciplinas/itens batem com o edital, e entregue os arquivos ao usuário.

## Incidência: honestidade

A skill **nunca inventa a incidência** (o que "mais cai"). No Excel a coluna nasce com **"Sem dado"**; para preenchê-la de verdade, o usuário junta os assuntos das **últimas provas reais da banca** e classifica cada item em Alta/Média/Baixa. Princípio: **a IA organiza, você decide — ela não chuta no seu lugar.**

## Marca (opcional)

Os arquivos exibem a logo em `assets/logo.png`, se existir. Para usar outra marca, substitua esse arquivo ou defina a variável de ambiente `EDITAL_LOGO` com o caminho de um PNG. Sem logo, os títulos se sustentam sozinhos.

## Dependências
`pip install pymupdf openpyxl python-docx`

## Scripts
| Script | Função |
|--------|--------|
| `scripts/extrair_edital.py` | Edital (.md/.pdf/.txt) → JSON canônico, com `--listar`/`--cargo` |
| `scripts/gerar_excel.py` | JSON → planilha de estudo viva (.xlsx), compatível com Google Sheets |
| `scripts/gerar_html.py` | JSON → painel de estudo interativo (.html) |
| `scripts/gerar_docx.py` | JSON → verticalizado imprimível (.docx) |
