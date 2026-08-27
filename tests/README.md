# Testes de extração de PDF — Fase 1

Roda sem instalar nada (Node puro, sem dependências externas):

```bash
node tests/testes.js
```

## O que é testado

| # | Cenário | O que verifica |
|---|---------|-----------------|
| 1 | PDF digital | texto extraído direto (sem OCR); nº de processo correto |
| 2 | PDF escaneado (boa qualidade) | OCR de 1 tentativa só, confiança alta |
| 3 | PDF ruim / baixa qualidade | retentativa em resolução maior quando a 1ª tem confiança baixa; correção de erro de OCR (0↔O) |
| 4 | OCR imperfeito (página girada) | varredura das 4 rotações (0/90/180/270°) quando a rotação declarada no PDF não é a correta |
| 5 | PDF de mais de 300 páginas | processamento em lotes até o fim do arquivo, sem truncar, com peças espalhadas em posições distantes |

Cada cenário mede a **taxa de extração** (campos corretamente extraídos ÷
campos esperados no documento-teste, 18 campos) e falha o teste se ficar
abaixo da meta de **95%**. No final é impresso um resumo comparável entre
os 5 cenários.

## Testes de ponta a ponta (extração → conferência → formulário)

`tests/teste-e2e-preenchimento-formulario.js` cobre o elo que os testes
acima não cobrem: garantir que cada campo extraído do PDF cai no
`<input>`/`<select>` **certo** do formulário real (`index.html`), passando
pelo fluxo de produção completo (extração → conferência → clique em
"Preencher formulário automaticamente"). Roda num Chromium real via
Playwright; se o pacote não estiver instalado, o teste avisa e sai sem
falhar a suíte.

### Setup (uma vez por ambiente)

O `playwright` está declarado em `package.json` (`devDependencies`), com
um `postinstall` que já baixa o Chromium:

```bash
npm install
```

Se preferir instalar manualmente (ou o `postinstall` não rodar por algum
motivo do ambiente):

```bash
npm install playwright
npx playwright install chromium
```

### Rodar

```bash
node tests/teste-e2e-preenchimento-formulario.js
# ou
npm run test:e2e-formulario
```

## Como funciona (sem navegador nem Tesseract/pdf.js reais) — testes de extração (Fase 1)

- `dom-stub.js` — `document`/`localStorage`/`performance` fake mínimos.
- `mocks-pdf-ocr.js` — `pdfjsLib` e `Tesseract` fake e controláveis por
  página (cada página do PDF-teste decide o que "o OCR lê" e com que
  confiança, por tentativa de resolução/rotação).
- `loader.js` — carrega os arquivos **reais** de `js/` (sem modificá-los)
  num contexto Node `vm` compartilhado, exatamente como tags `<script>`
  numa página.
- `fixtures.js` — documento-base realista (petição, laudo, sentença,
  depósito) e os 5 cenários acima.
- `testes.js` — a suíte propriamente dita.

## Testes de extração por IA — seção "IA" do checklist

```bash
node tests/testes-ia.js
```

Cobre os 5 itens da seção "IA" do checklist (valores, datas, índice,
modalidade, juros), exercitando `extrairCampos()` +
`aplicarInteligenciaJuridica()` sobre o mesmo documento-base desta suíte
(`fixtures.js`) mais cenários extras específicos em `fixtures-ia.js`
(modalidade direta/indireta/ambígua, índice ambíguo, índice em menção
solta, data no futuro, ordem cronológica improvável, sentença sem juros):

| Seção | O que verifica |
|---|---|
| Valores | oferta, pericial, sentença e depósito — extraídos corretamente e nunca confundidos entre si |
| Datas | oferta, imissão, sentença, depósito; + validação lógica (data futura e ordem cronológica improvável reduzem a confiança sem descartar o campo) |
| Índice | IPCA-E extraído com confiança alta quando ancorado em sentença/acórdão; fallback de confiança baixa para menção solta; alerta de ambiguidade quando mais de um índice aparece na sentença |
| Modalidade | `tipoAcaoDetectado` direta/indireta por marcadores de rito; placar equilibrado não "chuta" um lado — fica marcado como ambíguo |
| Juros | compensatórios e moratórios extraídos sem se confundir; ausência de menção não quebra o pipeline nem inventa valor |

20 testes, todos passando contra o código de `js/` tal como está no zip
(nenhum arquivo de produção foi alterado para os testes passarem).

## Parágrafo/cabeçalho real em vez de janela por caractere

```bash
node tests/teste-estrutura.js
```

Cobre `js/core/estruturaTexto.js`: a busca de valor perto de uma âncora deixou
de usar uma janela fixa de caracteres e passou a respeitar o parágrafo e
os títulos/cabeçalhos reais do documento (a partir de `hasEOL` do pdf.js
no texto digital, e das quebras de linha reais do próprio OCR).

10 testes: unitários de `analisarEstrutura()`/`janelaEstrutural()`, mais
dois cenários de ponta a ponta (via `lerUmPdf()` + `extrairCampos()`) —
um valor bem além da antiga janela fixa mas ainda dentro do mesmo
parágrafo (antes ficava de fora), e um valor de outra seção logo depois
de um cabeçalho (antes podia ser roubado por engano pela âncora da seção
anterior).

## Módulo 1 — Interpretador Estrutural de Texto (árvore de contexto)

```bash
node tests/teste-interpretador-estrutural.js
```

Cobre `js/core/interpretadorEstrutural.js`: a camada que transforma
página/parágrafos/cabeçalhos/linhas (já detectados por
`js/core/estruturaTexto.js`) numa árvore **página → bloco → parágrafo → linha**,
consultável por posição. Para qualquer trecho de `pagina.texto`,
`obterContextoCompleto(pagina, inicio, fim)` devolve página, bloco,
parágrafo, linha, posição, título da seção vigente, subtítulo vigente,
contexto anterior e contexto posterior (sem atravessar a fronteira do
parágrafo).

"Bloco" é a novidade estrutural: um agrupamento de parágrafos acima do
parágrafo, delimitado pelos próprios títulos/subtítulos do documento (novo
título de seção ou novo subtítulo = novo bloco; um título de seção sempre
zera o subtítulo vigente da seção anterior).

9 testes: unitários de `construirArvoreContexto()`/`obterContextoCompleto()`
(bloco único sem cabeçalho, abertura de bloco por título, subtítulo somado
ao título sem substituí-lo, título novo apagando subtítulo antigo, contexto
não atravessando parágrafo, offset fora de estrutura sem lançar erro, cache
em `pagina._arvoreContexto`), mais um cenário de ponta a ponta a partir de
`lerUmPdf()` real.

**Limitação honesta herdada:** os offsets de parágrafo/cabeçalho/linha são
calculados antes de `normalizarTextoExtraido()` rodar (correção de OCR,
normalização de moeda/data), que pode mudar o comprimento do texto. Isso já
existia para `janelaEstrutural()` antes deste módulo; a árvore de contexto
só torna esse deslocamento mais visível. Ver comentário no topo de
`js/core/interpretadorEstrutural.js`.

## Tokenização — o dicionário trabalha sobre tokens, não sobre texto

```bash
node tests/teste-tokenizador.js
```

Cobre `js/core/tokenizador.js`: cada palavra do documento vira um objeto Token
(`termo`, `chave` normalizada, `tipo` — `'palavra'`/`'numero'` —,
`indiceNaPagina`, `pagina`, `arquivo`, `bloco`, `paragrafo`, `linha`,
`posicao`, `tituloSecao`, `subtitulo`). `js/core/indiceInvertido.js` deixou de
tokenizar por conta própria — hoje só agrupa a sequência de tokens que
`tokenizarDocumento()` entrega, sem tocar em `pagina.texto` em nenhum
momento; é literalmente "o dicionário trabalha sobre tokens, não sobre
texto".

8 testes: token por palavra na ordem certa, campos completos de um token,
classificação `numero`/`palavra`, página sem estrutura ainda gera tokens
(bloco/parágrafo/linha `null`), página vazia não gera token nenhum,
`tokenizarDocumento()` concatenando páginas em ordem, e a confirmação de que
`construirIndiceInvertido()` é hoje só agrupamento — todo token gerado bate
com o total no índice —, mais um cenário de ponta a ponta a partir de
`lerUmPdf()`.

## Módulo 2 — Índice Invertido (busca por termo quase instantânea)

```bash
node tests/teste-indice-invertido.js
```

Cobre `js/core/indiceInvertido.js`: logo depois de `lerUmPdf()` terminar de ler
todas as páginas (principal + anexos), o resultado já sai com
`.indiceInvertido` pronto — um `Map` chave de token → lista de tokens
daquela chave (ver `js/core/tokenizador.js`, acima), cada um com página, bloco,
parágrafo, linha, posição, título da seção e subtítulo. `buscarNoIndice(
indice, "IPCA-E")` é uma consulta direta ao Map (sem varrer texto de novo),
devolvendo algo como página 12 → bloco 3 → parágrafo 18 → linha 64.

8 testes: busca simples, case/acento-insensível ("réu"/"RÉU"), termo com
múltiplas ocorrências (na ordem em que aparecem), termo ausente (array
vazio, nunca `undefined`), página vazia não entra no índice, índice cobrindo
várias páginas do mesmo documento, `tamanhoIndice()`, e um cenário de ponta
a ponta confirmando que `lerUmPdf()` já devolve o índice pronto sem chamada
manual.

**Limitação honesta:** numa página sem nenhuma quebra de linha detectável
(sem evidência de estrutura — ver `estruturaTexto.js`), o termo ainda entra
no índice (a busca continua achando a página certa), mas bloco/parágrafo/
linha/título/subtítulo saem `null` nessas ocorrências específicas, em vez de
inventar uma estrutura que não existe.

## Bugs encontrados e corrigidos ao escrever estes testes

1. **`normalizarDatas` destruía o número do processo (padrão CNJ).**
   A regex de data numérica casava com pedaços do próprio nº de processo
   (ex.: em `...2020.8.26.0100`, o trecho `8.26.0100` virava `08/26/0100`),
   fazendo `numeroProcesso` falhar em praticamente qualquer PDF de
   processo real. Corrigido protegendo o padrão CNJ antes de normalizar
   datas.
2. **`REGEX_AREA` nunca casava com "m²"** (só com "m2"), porque `\b` não
   funciona depois de um caractere não-alfanumérico como "²". Como "m²" é
   a forma mais comum de escrever área em documentos jurídicos/
   imobiliários brasileiros, `areaImovel` ficava quase sempre vazio.
3. **Taxas de um único dígito real não eram corrigidas quando o OCR
   confundia os dois zeros decimais** (ex.: "6,00%" → "6,OO%", muito comum
   pois 6% a.a. é a taxa padrão de juros compensatórios no Decreto-Lei
   3.365/41). O filtro de segurança de "2 dígitos reais" de
   `corrigirErrosComunsOcr` bloqueava a correção nesse caso. Adicionada
   uma correção extra, ativada só quando o número está ancorado por "R$"
   (antes) ou "%" (depois) — contexto que já elimina o risco de mexer em
   texto não numérico mesmo com só 1 dígito real.
