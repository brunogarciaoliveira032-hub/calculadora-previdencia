# Migração desapropriação → previdenciário — diário da refatoração

> **Este é um diário histórico**, não a referência do estado atual do
> sistema. Para entender a arquitetura como ela é HOJE, leia
> `docs/ARQUITETURA-ATUAL.md` (bem mais curto). Este arquivo fica aqui
> como registro de decisões — por que cada peça existe, o que foi
> tentado e descartado — não precisa ser lido do início ao fim para
> trabalhar no projeto.

> **Nota (entrega posterior a este diário):** por pedido explícito do usuário,
> o módulo de desapropriação foi inteiramente removido do projeto (código,
> testes, fixtures e scripts de validação/revisão jurídica associados) — o
> app hoje cobre só o domínio previdenciário. Este diário permanece como
> registro histórico de como a migração aconteceu; várias referências abaixo
> a arquivos de desapropriação (`js/domains/desapropriacao/`,
> `js/juridical-knowledge/`, `js/modulos/`, `painelConferencia.js` etc.)
> descrevem código que não existe mais.

Este documento é o mapa vivo da migração. Cada "Atualização" abaixo corresponde
a uma entrega incremental, sempre com a suíte de regressão completa (`npm test`)
rodando 100% verde antes de avançar para a próxima. Nenhuma etapa depende de
adivinhação: cada arquivo foi classificado a partir de contagem real de termos
de domínio (`desapropria|expropri|imóvel|benfeitoria|indeniza`) no código, não
por suposição.

## Baseline (antes de qualquer mudança)

`npm test` — 19 suítes, todas verdes, `exit 0`. Isso inclui testes de unidade,
testes de E2E com PDFs reais e testes de E2E em navegador real (Chromium via
Playwright) cobrindo leitura de PDF, OCR, extração, cálculo, preenchimento de
formulário, exportação PDF/Excel e funcionamento offline (PWA/service worker).
Essa baseline é a régua: qualquer atualização futura só é aceita se reproduzir
exatamente essa mesma contagem de sucesso.

---

## Atualização 1 (esta entrega) — separar infraestrutura pura de domínio

**O que foi feito:** criada a pasta `js/core/`, para onde foram movidos os
módulos que, por inspeção real (grep de termos de domínio em todo o arquivo),
não têm nenhuma regra de desapropriação — são mecanismo puro, reaproveitável
por qualquer domínio documental (incluindo o previdenciário que vem a seguir):

```
js/core/
  util.js                     — helpers genéricos (datas, dinheiro, ids)
  sistemaConfianca.js         — cálculo de score de confiança por candidato
  estruturaTexto.js           — segmentação de texto em blocos/linhas/páginas
  estruturaTextoAsync.js      — versão em lote/worker da estrutura de texto
  interpretadorEstrutural.js  — inferência de papel estrutural (título, tabela...)
  tokenizador.js               — tokenização de texto
  indiceInvertido.js          — índice invertido para busca de termos
  normalizadorTexto.js        — normalização (acentos, maiúsculas, ruído OCR)
  leitorPdf.js                — leitura de PDF + OCR (pdf.js/Tesseract)
  extratorCandidatos.js       — mecanismo de extração por âncora textual
  decisorCampos.js            — mecanismo de decisão entre candidatos
  historicoDecisoes.js        — histórico de decisões do usuário
  iaFallback.js               — mecanismo de fallback via IA (chamada + limites)
  iaRevisora.js                — mecanismo de revisão via IA
  classificadorCandidatosIA.js — mecanismo de classificação de candidatos via IA
  indices.js                   — busca de índices de correção monetária (Bacen)
  consultaOab.js               — consulta a advogados na OAB
  dicionarioJuridico.js        — dicionário de nomes/variações de índices (IPCA-E, INPC...)
  candidateSelection.js        — mecanismo de seleção/ranking de candidatos por campo
  semantic-mapper/             — normalização e resolução de conceitos (0 termos de domínio)
  workers/estruturaTextoWorker.js
```

Todas as referências foram atualizadas em conjunto — `index.html` (ordem das
`<script src>`), `sw.js` (precache do PWA), `tests/loader.js`,
`tests/loader-calculo.js` e mais de uma dezena de arquivos de teste que
carregam esses módulos diretamente. Nada nesses arquivos teve o
**comportamento** alterado — só o caminho.

**Prova de regressão:** `npm test` após a mudança produziu o mesmo número de
suítes, os mesmos números de teste por suíte e `exit 0` — comparação
byte-a-byte contra o log da baseline. O teste
`tests/teste-sanidade-carga.js` (que existe justamente para pegar dessincronia
entre `index.html`/`sw.js`/ordem de carregamento global) também passou, o que
importa mais aqui do que em qualquer outra mudança, porque é exatamente esse
tipo de erro que uma reorganização de pastas pode introduzir silenciosamente.

**O que ficou de fora de propósito.** Os arquivos abaixo continuam em `js/`
(raiz) porque têm lógica de desapropriação misturada com mecanismo genérico —
mexer neles sem separar as duas coisas linha a linha seria romper exatamente a
regra que você pediu ("não alterar o pipeline que já funciona sem antes criar
testes de regressão"). Classificação por contagem real de termos de domínio:

| Arquivo | Termos de domínio | Natureza |
|---|---|---|
| `dicionarioSemantico.js` | 186 | **é** a base de conhecimento de desapropriação — vira `domains/desapropriacao/` |
| `classificadorExtrator.js` | 161 | mecanismo de classificação + regras de campo misturados — precisa split |
| `inteligenciaJuridica.js` | 77 | mecanismo de decisão + regras específicas misturados — precisa split |
| `motor.js` | 23 | motor de cálculo genérico + fórmulas de desapropriação misturados — precisa split |
| `entidades.js` | 18 | reconhecimento de entidades + entidades específicas — precisa split |
| `contextoDocumento.js` | 15 | inferência de contexto + heurísticas específicas — precisa split |
| `completar.js` | 13 | preenchimento de formulário + campos específicos — precisa split |
| `grafoRelacoes.js` | 10 | grafo genérico + relações específicas — precisa split |
| `exportarExcel.js` | 10 | exportação + layout específico — precisa split |
| `camposElegiveisIA.js` | 10 | mecanismo de elegibilidade + campos específicos — precisa split |
| `painelConferencia.js` | 8 | UI de conferência — vai virar view por domínio |
| `carregador.js` | 7 | orquestração de carregamento — provavelmente vira registry de domínio |
| `exportarPDF.js` | 7 | exportação + layout específico — precisa split |
| `validacao.js` | 7 | validação genérica + regras específicas — precisa split |
| `juridical-knowledge/` (pasta inteira) | alto | **é** conhecimento de domínio — vira `domains/desapropriacao/` |
| `modulos/direta.js`, `modulos/indireta.js` | alto | **são** os dois submódulos de desapropriação |

---

## Atualização 2 — `validacao.js` separado em mecanismo + regra de domínio

**O que foi feito:** `js/validacao.js` (592 linhas, 7 ocorrências de termos de
domínio) foi dividido em dois arquivos:

- `js/core/motorValidacao.js` (novo, mecanismo genérico): helpers puros de
  data/dinheiro (`dataValida`, `parseMoedaValidacao`, `umPorCampo`), a
  integração com o DOM (painel de erros/avisos, destaque de campo, scroll,
  ícone de sucesso) e o motor de validação em tempo real (debounce por
  campo, revalidação ao digitar/mudar). Nada aqui sabe o nome de nenhum
  campo nem nenhuma regra — um domínio "registra" seus campos e regras via
  `MotorValidacao.criarValidador({ checarCampos, lerDadosFormulario,
  camposValidaveis, ... })`.
- `js/validacao.js` (continua na raiz — é regra de desapropriação, não
  mecanismo): a lista de campos do formulário (`CAMPOS_DATA`,
  `CAMPOS_MONETARIOS`, `CAMPOS_PERCENTUAIS`), todas as regras jurídicas
  específicas (Súmula 141/STJ, juros compensatórios/moratórios, data de
  imissão na posse, competência da correção monetária) e o registro no
  motor genérico. Os nomes públicos (`validarFormulario`, `checarCampos`
  etc.) continuam exatamente os mesmos — nada que já chamava este arquivo
  precisou mudar.

**Ponto de atenção real que apareceu:** as duas metades declaravam
`DATA_MINIMA_ISO` — o teste `teste-sanidade-carga.js` pegou a colisão de
identificador global na hora (é para isso que ele existe; já pegou um caso
assim de verdade neste projeto, ver o comentário no topo do próprio teste).
Corrigido fazendo o arquivo de domínio reaproveitar a constante do motor
(`MotorValidacao.DATA_MINIMA_ISO`) em vez de duplicá-la.

**Prova de regressão:** `npm test` (19 suítes) — mesma contagem de sucesso
que a baseline, `exit 0`.

---

## Atualização 3 — `js/domains/desapropriacao/` criado, primeiro arquivo movido

**O que foi feito:** diferente de `validacao.js` (Atualização 2), o
`camposElegiveisIA.js` (127 linhas, 10 ocorrências de termos de domínio) não
tinha mecanismo e regra misturados linha a linha — ele é 100% dado
declarativo de domínio: o catálogo de campos que a IA pode preencher
(`CAMPOS_ELEGIVEIS_IA`), os três prompts de sistema (extração, classificação
de candidatos, revisão) e o mapa campo→tipo de candidato. Os consumidores
(`js/core/iaFallback.js`, `js/core/classificadorCandidatosIA.js`,
`js/core/iaRevisora.js`, `backend/server.js`) já são mecanismo genérico —
eles só esperam um objeto com esse formato, sem saber que é desapropriação.

Por isso a ação aqui não foi "separar", foi **mover**: criada a pasta
`js/domains/desapropriacao/` (primeira do que será o diretório de domínios) e
`camposElegiveisIA.js` foi para lá — mesmo padrão de atualização de
referências das entregas anteriores (`index.html`, `sw.js`,
`backend/server.js` — que faz `require()` real deste arquivo — e os testes
que carregam a suíte de módulos de IA).

**Prova de regressão:** `npm test` (19 suítes) — mesma contagem de sucesso
da baseline, `exit 0`; `teste-sanidade-carga.js` confirma que
`index.html`/`sw.js` continuam alinhados.

---

## Atualização 3 (Fase 2) — `js/domains/previdenciario/` criado, base de conhecimento v1.0.0

**O que foi feito:** criada `js/domains/previdenciario/`, com dois arquivos,
no mesmo formato que `js/dicionarioSemantico.js`/`juridical-knowledge/` já
usam para desapropriação:

- `dicionarioPrevidenciario.js` — `DICIONARIO_PREVIDENCIARIO` (congelado):
  metadata, siglário (18 siglas — DER/DIB/DIP/DCB/DID/DCI/NB/CNIS/CTPS/CTC/
  PPP/RMI/SB/RGPS/RPPS/LOAS-BPC/CID/TR-TNU), 9 tipos de documento (CNIS,
  CTPS, requerimento administrativo, carta de concessão, carta de
  indeferimento, decisão administrativa de recurso, processo judicial, laudo
  pericial, PPP) com âncoras de identificação e riscos de leitura comuns a
  cada um, 25 campos semânticos (datas — DER/DIB/DIP/DCB/DID, óbito,
  ajuizamento, sentença, trânsito em julgado, nascimento —, benefício —
  espécie, carência, tempo de contribuição, motivo de indeferimento,
  atividade especial, período rural, tutela antecipada —, valores — salário
  de benefício, RMI —, identificação — NB, nome, CPF, qualidade de segurado
  —), cada um com âncoras textuais, formato esperado, campos confundíveis
  (com o porquê) e peso de confiança base, 7 regras globais (RGP001–RGP007,
  ex.: DER não é DIB, indeferimento não tem NB/DIB/DIP/RMI, DID de laudo só
  vira DIB se a decisão acolher, carência ≠ tempo de contribuição, RMI ≠
  valor atual reajustado, BPC/LOAS não tem carência/tempo de contribuição),
  matriz de 8 conflitos comuns (cada um citando a regra global associada,
  quando houver) e 10 relações entre campos (ex. DIP ≥ DIB; RMI derivada do
  salário de benefício, nunca coincidência de layout).
- `index.js` — fachada `ConhecimentoPrevidenciario` (mesmo padrão de
  `juridical-knowledge/index.js`): `campoPorNome`, `tipoDocumentoPorChave`,
  `sigla`, `conflitosDoCampo`.

**Escopo desta entrega, por decisão explícita (ver `metadata.escopo_fora_
desta_entrega` no próprio arquivo):** só base de conhecimento declarativa —
ainda SEM pipeline de extração plugado e SEM motor de cálculo (isso é a
Atualização 4). O domínio de desapropriação não foi tocado em nenhuma linha.

**Registro de carregamento:** `index.html` (2 novas tags `<script>`, após
`js/core/candidateSelection.js`) e `sw.js` (2 novos itens no precache,
`CACHE_NAME` subido para `v4`, conforme a própria regra documentada no topo
do arquivo). `tests/loader.js` (pipeline de desapropriação) **não** foi
alterado — o novo domínio não é carregado por ele de propósito.

**Teste novo:** `tests/teste-dicionario-previdenciario.js` (20 casos) — carrega
só os dois arquivos do domínio, isolados num contexto `vm` próprio (não usa
`tests/loader.js`); verifica que toda contagem em `metadata.estatisticas`
bate com o array/objeto real, que todo campo/regra/tipo de documento tem os
campos obrigatórios preenchidos (sem string vazia), que toda
`regra_associada` citada na matriz de conflitos aponta pra uma regra global
que existe de fato, e a fachada (`campoPorNome`, `tipoDocumentoPorChave`,
`sigla`, `conflitosDoCampo`). Registrado em `package.json` (`npm test`), logo
após `teste-normalizacao-linguistica.js`.

**Bug real achado durante a escrita do próprio teste:** `conflitosDoCampo`
devolvendo array vazio comparado com `assert.deepStrictEqual(..., [])`
falhava com "same structure but are not reference-equal" — não é bug do
dicionário, é o array devolvido vir do realm do `vm.createContext` (distinto
do realm do arquivo de teste); corrigido comparando por `Array.isArray` +
`length === 0` em vez de `deepStrictEqual` contra um literal `[]` do outro
realm.

**Prova de regressão:** `npm test` — mesma contagem de sucesso da baseline
nas suítes de desapropriação (`exit 0`), mais as 20 novas passando;
`teste-sanidade-carga.js` confirma: nenhuma colisão de identificador global
entre `dicionarioPrevidenciario.js`/`index.js` e qualquer arquivo já
existente, e o precache do `sw.js` cobre os dois arquivos novos.

---

## Atualização 4 — `exportarPDF.js`/`exportarExcel.js` separados em mecanismo + conteúdo de domínio

**O que foi feito:** criado `js/core/motorRelatorios.js` (mecanismo genérico
de geração de relatório, sem nenhum termo de desapropriação), extraído de
`js/exportarPDF.js` e `js/exportarExcel.js` — mesmo padrão de
`motorValidacao.js` (Atualização 2): mecanismo "registra" o que o domínio
entrega, nunca decide rótulo/conteúdo.

- **Lado PDF:** `iniciarPdf` (cria o `jsPDF`, devolve medidas de página),
  `avancarSeEstourarPagina` (helper de paginação repetido 4x no arquivo
  original), `desenharLinhasDeTexto`, `desenharTabelaAuto` (wrapper de
  `doc.autoTable` com os defaults já usados), `desenharListaComNiveis`
  (bloco de texto colorido por nível erro/alerta/ok/info — usado hoje só
  pela auditoria de desapropriação, mas não sabe o que é auditoria) e
  `desenharSeloVerificacao` (assinatura + hash + QR opcional, calcula o
  código UMA vez só — `conteudoQr` pode ser função que recebe o código já
  calculado, pra nunca haver 2 hashes divergentes do mesmo payload).
- **Lado Excel:** `XLSX_FMT_MOEDA/PCT/FATOR`, `xlsxCelula`,
  `xlsxAplicarFormatoColuna`, `xlsxAplicarNegritoEnderecos`,
  `xlsxCriarAbaTabular` (cabeçalho em negrito + freeze + autofiltro +
  formato por coluna — hoje usado pelas abas Memória de Cálculo e Revisão
  Técnica), `xlsxCriarAbaComTitulo` (título mesclado — abas Resumo e
  Parâmetros) e `xlsxMontarESalvar`.
- `js/exportarPDF.js`/`js/exportarExcel.js` (continuam na raiz — são
  conteúdo de desapropriação: quais linhas, rótulos, valores e nomes de
  aba) foram reescritos para montar o conteúdo e chamar o motor genérico.
  Nomes públicos (`gerarPdf`, `exportarExcel`, bindings dos botões
  `#btnPdf`/`#btnExcel`) continuam exatamente os mesmos.

**Bug real evitado durante a própria extração:** o código original calculava
o hash do selo de verificação (`hashDocumento`/`formatarCodigoVerificacao`)
implicitamente UMA vez, usando o mesmo valor no texto da assinatura e no
conteúdo do QR Code. Uma primeira versão do split calculava esse hash duas
vezes (uma dentro do motor, outra no domínio pra montar o texto do QR) —
corrigido antes de rodar qualquer teste: `desenharSeloVerificacao` calcula o
código uma única vez e aceita `conteudoQr` como função que recebe esse
código já pronto, eliminando o risco de os dois textos divergirem.

**Ponto de atenção real que apareceu (achado ao rodar, não hipotético):**
`js/core/motorRelatorios.js` usava `XLSX.utils.encode_col()` para montar a
referência do autofiltro — função que o mock de `XLSX` usado em
`tests/teste-e2e-exports.js` não implementa (o código original nunca a
usava; era coluna `'F'` fixa, hardcoded). Corrigido com um conversor de
índice de coluna → letra escrito localmente (`xlsxLetraColuna`), sem
depender de nenhuma API do SheetJS além das já usadas antes.

**Registro de carregamento:** `index.html` (1 tag nova,
`js/core/motorRelatorios.js`, logo após `candidateSelection.js` e antes dos
dois arquivos de domínio) e `sw.js` (1 item novo no precache). `tests/
teste-e2e-exports.js` atualizado para carregar `core/motorRelatorios.js`
antes de `exportarPDF.js`/`exportarExcel.js` no mesmo contexto `vm` (mesma
mudança de manutenção de teste já feita nas atualizações anteriores quando
um arquivo muda de lugar/ganha dependência nova).

**Prova de regressão:** `npm test` — mesma contagem de sucesso da baseline
(`exit 0`); em especial, os testes de navegador real (Chromium, com jsPDF e
SheetJS de VERDADE, não mock) confirmam que o PDF exportado ainda traz a
identificação do processo, os mesmos números da tela e a memória de cálculo
com o selo de verificação, e que a planilha ainda tem as 4 abas com os
mesmos valores — ou seja, o split não mudou uma vírgula do que o usuário
final vê nos arquivos baixados.

---

## Atualização 5 — `grafoRelacoes.js` separado em mecanismo + regra de domínio

**O que foi feito:** `js/grafoRelacoes.js` (287 linhas, 6 ocorrências de
termos de domínio) dividido em dois arquivos, mesmo padrão de
`motorValidacao.js`/`motorRelatorios.js`:

- `js/core/grafoRelacoes.js` (novo, mecanismo genérico): a classe
  `GrafoRelacoes` (nós/arestas, `adicionarNo`/`adicionarAresta`/`arestasDe`/
  `no`), `caminhoAPartirDe(grafo, idInicial, ordemTiposAresta)` (travessia
  genérica — recebe a ordem de tipos de aresta como parâmetro, não sabe o
  que é "campo") e `grafoParaMermaid(grafo)` (exportação para diagrama).
  Nenhuma linha sabe o nome de um campo de desapropriação.
- `js/grafoRelacoes.js` (continua na raiz — é regra de desapropriação): os
  rótulos (`ROTULOS_CAMPO_GRAFO`, `ROTULOS_PECA_GRAFO`,
  `ROTULOS_INDICE_GRAFO`, rótulos de juros), as listas de domínio
  (`CAMPOS_MONETARIOS_GRAFO`, `ORDEM_PROCESSUAL_VALORES`,
  `ORDEM_CAMINHO_CAMPO`), os helpers `formatarValorNo`/`tipoDePecaDoCampo`,
  `construirGrafoRelacoes` (monta os nós/arestas a partir de `campos`, com
  as regras de juros compensatórios/moratórios e encadeamento processual) e
  `resumoContextoGrafoParaIA`. Os nomes públicos (`construirGrafoRelacoes`,
  `caminhoDoCampo`, `caminhoDoCampoTexto`, `grafoParaMermaid`,
  `resumoContextoGrafoParaIA`) continuam exatamente os mesmos — nada que já
  chamava este arquivo precisou mudar. `caminhoDoCampo` agora é uma casca
  fina sobre `caminhoAPartirDe` do mecanismo genérico.

**Registro de carregamento:** `index.html` (1 tag nova,
`js/core/grafoRelacoes.js`, logo antes de `js/grafoRelacoes.js`), `sw.js`
(1 item novo no precache, `CACHE_NAME` subido para `v5`) e `tests/loader.js`
(`core/grafoRelacoes.js` adicionado antes de `grafoRelacoes.js` em
`ARQUIVOS_PIPELINE`, mesma ordem de dependência do `index.html`).

**Prova de regressão:** `tests/teste-grafo-relacoes.js` sozinho (13/13,
incluindo o caso do próprio cabeçalho do arquivo — Indenização → valor →
Sentença → IPCA-E → Juros compensatórios); `npm test` completo — mesma
contagem de sucesso da baseline (`exit 0`), `teste-sanidade-carga.js`
confirma zero colisão de identificador global entre `core/grafoRelacoes.js`
e qualquer arquivo já existente (em especial `GrafoRelacoes`,
`grafoParaMermaid` — não colidem com nada) e precache íntegro.

---

## Atualização 6 — `completar.js`: listas dinâmicas separadas em mecanismo + regra de domínio

**O que foi feito:** de `js/completar.js` (497 linhas), só a parte
genuinamente mecânica e reaproveitável foi extraída — ler/criar linhas de
uma lista dinâmica do formulário (faixas de juros, depósitos,
levantamentos) — para `js/core/listasDinamicas.js`:
`lerListaDinamica(containerId, itemClasse, campos)` e
`adicionarLinhaLista(containerId, itemClasse, camposHtml)`. Nenhuma das duas
sabe o que é uma "faixa de juros" ou um "depósito judicial" — só leem/criam
linhas por classe CSS e uma lista de campos informada por quem chama.

`js/completar.js` continua com tudo que é de fato regra/orquestração de
desapropriação: `lerFaixas`/`coletarFaixasJurosComp`/`coletarFaixasJurosMora`/
`adicionarFaixa`, `lerDepositos`/`adicionarDeposito`,
`lerLevantamentos`/`adicionarLevantamento` (agora cascas finas sobre o
mecanismo genérico, com os nomes de container/classe/campo específicos
deste domínio), e o restante do arquivo — `bloqueadoPorAuditoria()`,
`calcular()` (orquestra os módulos de direta/indireta, lê todos os campos
do formulário de desapropriação, monta `ULTIMO_CALCULO`),
`renderizarResultado()` e `selecionarIndicePorBotao()` — que **não** foram
divididos: são genuinamente acoplados aos nomes de campo e às regras de
desapropriação linha a linha, diferente do padrão "mecanismo genérico +
config de domínio" que coube nos arquivos anteriores. Dividir essas partes
exigiria reescrever a orquestração inteira, risco desproporcional ao
ganho nesta etapa — registrado aqui para uma decisão consciente futura, não
deixado de fora por descuido.

**Registro de carregamento:** `index.html` (1 tag nova,
`js/core/listasDinamicas.js`, antes de `js/completar.js`), `sw.js` (precache
+ `CACHE_NAME` v6) e três loaders de teste Node atualizados:
`tests/loader-calculo.js`, `tests/teste-e2e-calculo.js` (lista de arquivos
carregados manualmente num `vm` próprio, para o teste de ordem de
carregamento hipotética).

**Prova de regressão:** `npm test` completo — mesma contagem de sucesso da
baseline (`exit 0`, 595 asserções OK, 0 falhas), incluindo o cenário
específico de "depósitos complementares + levantamentos parciais em datas
diferentes (linhas dinâmicas)" e o teste de navegador real de preenchimento
de formulário; `teste-sanidade-carga.js` confirma zero colisão de
identificador global e precache íntegro.

---

## Atualização 7 — `contextoDocumento.js` separado em mecanismo + regra de domínio

**O que foi feito:** `js/contextoDocumento.js` (260 linhas, 11 ocorrências
de termos de domínio) dividido em dois arquivos, mesmo padrão das
atualizações anteriores:

- `js/core/contextoDocumento.js` (novo, mecanismo genérico): `limparTrecho`
  (limpeza de texto), `primeiraOcorrencia(paginas, regex)` (primeiro match
  na ordem de leitura), `construirEstadoPorPagina(fatos,
  ultimoValorPorPagina)` (devolve `estadoAntesDaPagina(indice)` — o "como se
  sabia" antes de cada página, sem usar fato estabelecido depois) e
  `resolverAnaforasGenerico(paginas, contextoDocumento, ancoras)` (varre
  páginas procurando uma lista de âncoras `{regex, campo}` informada por
  quem chama). Nenhuma linha sabe o que é um "imóvel" ou uma "expropriada"
  — um domínio previdenciário futuro poderia reaproveitar o mesmo mecanismo
  com âncoras como "o referido benefício"/"o mesmo requerente" sem tocar
  neste arquivo.
- `js/contextoDocumento.js` (continua na raiz — é regra de desapropriação):
  as regex de extração (`REGEX_ENDERECO_IMOVEL`, `REGEX_MATRICULA_IMOVEL`,
  `REGEX_MUNICIPIO`), os extratores (`extrairImovel`,
  `extrairMunicipioExplicito`, `extrairMunicipio`, `extrairDataBase`,
  `construirUltimoValorPorPagina`), os fatos reaproveitados de `campos`
  (`paraFato`, `paraFatoSentenca`), `construirContextoDocumento` (monta os
  fatos e delega o estado por página ao mecanismo genérico) e o vocabulário
  forense (`ANCORAS_ANAFORA`) — `resolverAnaforas` virou uma casca fina
  sobre `resolverAnaforasGenerico`. Nomes públicos
  (`construirContextoDocumento`, `resolverAnaforas`) inalterados.

**Registro de carregamento:** `index.html` (1 tag nova, antes de
`js/contextoDocumento.js`), `sw.js` (precache + `CACHE_NAME` v7) e
`tests/loader.js` (`core/contextoDocumento.js` adicionado antes de
`contextoDocumento.js` em `ARQUIVOS_PIPELINE`).

**Prova de regressão:** `tests/teste-contexto-documento.js` sozinho (11/11,
incluindo os casos de anáfora resolvida/não resolvida e a limitação de
granularidade por página); `npm test` completo — mesma contagem de sucesso
da baseline (`exit 0`), `teste-sanidade-carga.js` confirma zero colisão de
identificador global e precache íntegro.

---

## Atualização 8 — `entidades.js` separado em mecanismo + regra de domínio

**O que foi feito:** `js/entidades.js` (179 linhas, 13 ocorrências de termos
de domínio) dividido em dois arquivos:

- `js/core/entidades.js` (novo, mecanismo genérico): `normalizarParaAgrupamento`,
  `coletarEntidadesTextuais(paginas, regexFonte)` (varredura exaustiva de um
  padrão textual, agrupando ocorrências por valor normalizado — mesma
  filosofia de extratorCandidatos.js, mas para texto em vez de moeda/data),
  `sugerirCamposSemanticos`/`anotarSugestoesSemanticas` (enriquecimento
  semântico opcional e defensivo — funciona com QUALQUER base semântica que
  exponha `identificarCamposPorTexto`, não só a de desapropriação). Nenhuma
  linha sabe o que é uma "matrícula de imóvel" ou uma "parte expropriante".
- `js/entidades.js` (continua na raiz — é regra de desapropriação):
  `coletarPartes` (papel processual de expropriante/expropriado) e
  `construirEntidades` (monta as 6 categorias — partes, imóveis,
  matrículas, valores, decisões, datas — delegando a varredura textual e o
  enriquecimento semântico ao mecanismo genérico). Nome público
  (`construirEntidades`) inalterado.

**Registro de carregamento:** `index.html` (1 tag nova, antes de
`js/entidades.js`), `sw.js` (precache + `CACHE_NAME` v8) e `tests/loader.js`
(`core/entidades.js` adicionado antes de `entidades.js`, depois de
`contextoDocumento.js` — `entidades.js` depende de `REGEX_ENDERECO_IMOVEL`/
`limparTrecho`, que vêm de lá).

**Prova de regressão:** `tests/teste-entidades.js` sozinho (12/12, incluindo
o teste de que o enriquecimento semântico muta os candidatos por referência
sem quebrá-la — importante porque `campos._candidatos` é compartilhado com
outros módulos); `npm test` completo — mesma contagem de sucesso da
baseline (`exit 0`), `teste-sanidade-carga.js` confirma zero colisão de
identificador global e precache íntegro.

---

## Revisão de `motor.js` — decisão consciente de NÃO dividir agora

**O que foi feito:** revisão completa de `js/motor.js` (695 linhas, 19
ocorrências de termos de domínio) para decidir o próximo split do roteiro.
Resultado da revisão: ao contrário dos arquivos já divididos, aqui não há
um "mecanismo genérico com regra de domínio plugada" separável de forma
limpa — o arquivo é, na esmagadora maioria, RACIOCÍNIO JURÍDICO de
desapropriação escrito como código:

- `auditarCalculo` cita, linha a linha, fundamentos específicos (Súmula
  141/STJ, Súmula 618/STF, Súmula 408/STJ cancelada em 28/10/2020, ADI
  2.332/STF, MP 1.577/97, EC 113/2021 e o embutimento de juros pela Selic)
  para decidir se cada situação é erro, alerta ou informação.
- `calcularJurosCompensatorios`/`calcularJurosMoratorios` aplicam essas
  mesmas regras (fallback de 12% a.a. só com opt-in explícito, recorte por
  troca automática para Selic, distinção Súmula 69 x Súmula 408 conforme o
  tipo de ação) diretamente na fórmula.
- `calcularBaseHonoraria`/`MOTORES_TIPO_ACAO`/`registrarTipoAcao` são a
  config jurídica por tipo de ação (fundamento de honorários, âncora da
  correção, o que cada rito admite) — o "registro" em si é um padrão
  genérico (plugin registry), mas o FORMATO da config que cada entrada
  carrega (`exigeOferta`, `permiteJurosCompensatorios`,
  `campoAncoraCorrecao`...) é inteiramente de desapropriação; extrair só o
  mecanismo de registro sem o formato da config não teria uso real fora
  deste domínio.

A única função com um núcleo genuinamente reaproveitável é
`calcularDepositosComLevantamentos` — no fundo, um LEDGER de saldo
corrigido com eventos de entrada/saída intercalados no tempo, sem
nenhum termo de desapropriação na sua lógica central (só nos nomes dos
parâmetros e nas mensagens de aviso). Decisão: **não extrair isso agora**.
O mesmo raciocínio já registrado na Atualização 6 (`completar.js`) se
aplica aqui com ainda mais peso: é uma função `async`, com ordenação de
eventos por data e desempate, correção monetária intercalada
(`montarMemoriaCorrecao`) e mensagens de aviso formatadas — o risco de
alterar esse comportamento sem quebrar um caso de borda (ex.: dois eventos
na mesma data, saldo negativo) é desproporcional ao ganho de organização
nesta etapa, e o ganho de reuso é hipotético (nenhum outro domínio deste
projeto precisa disso hoje). Fica registrado aqui como candidato a extração
futura, se e quando o domínio previdenciário (ou outro) precisar de um
ledger equivalente — não foi deixado de fora por descuido.

**Conclusão:** `motor.js` permanece como está. Roteiro avança para
`inteligenciaJuridica.js`.

---

## Atualização 9 — `inteligenciaJuridica.js`: dois utilitários genéricos extraídos

**O que foi feito:** revisão completa de `js/inteligenciaJuridica.js` (951
linhas, 69 ocorrências de termos de domínio) para o próximo split do
roteiro. Diferente dos arquivos anteriores, este é quase inteiramente
raciocínio jurídico de desapropriação escrito como código — detecção de
tipo de ação por marcadores textuais ponderados, mapeamento de partes por
rito, detecção de reforma de acórdão, riscos semânticos — sem uma
separação limpa "mecanismo genérico + config de domínio". Mesmo o padrão
de classificação por marcadores ponderados (`MARCADORES_TIPO_ACAO`) tem a
decisão final (limiares, mensagens, campo `tipoAcaoDetectado`) entrelaçada
com a pontuação linha a linha — extrair só o "motor de pontuação" exigiria
reescrever a função inteira, risco desproporcional ao ganho nesta etapa.

Só os dois utilitários SEM nenhum termo de desapropriação foram extraídos
para `js/core/inteligenciaJuridica.js`:
- `ehNegado(texto, indice, janela)` — heurística de negação (verifica se a
  janela de texto antes de uma posição contém "não houve"/"sem"/
  "inexistência de"...), usada pelos marcadores `negavel: true` de
  `MARCADORES_TIPO_ACAO`.
- `adicionarObservacaoSemDuplicar(campo, frase)` — anexa uma observação sem
  duplicar, para validações que podem rodar mais de uma vez sobre o mesmo
  campo.

O restante do arquivo permanece como está, de propósito.

**Achado colateral (não é regressão desta sessão):** ao rodar
`tests/teste-conceitos-juridicos.js` isoladamente para conferência extra,
14 dos 15 casos falharam com `aplicarConceitosJuridicos is not a function`
— essa função não existe em nenhum arquivo de `js/` hoje. Confirmado que
este arquivo de teste **não está** listado no script `npm test` de
`package.json` (por isso a suíte oficial sempre rodou verde) — é um teste
órfão, pré-existente a esta sessão, aparentemente de uma funcionalidade que
não chegou a ser implementada ou foi removida sem atualizar o teste
correspondente. Não foi tocado nesta entrega (fora do escopo do roteiro de
migração) — fica registrado aqui para decisão futura consciente (implementar
`aplicarConceitosJuridicos` ou remover/adaptar o teste órfão).

**Registro de carregamento:** `index.html` (1 tag nova, antes de
`js/inteligenciaJuridica.js`), `sw.js` (precache + `CACHE_NAME` v9) e
`tests/loader.js` (`core/inteligenciaJuridica.js` adicionado antes de
`inteligenciaJuridica.js`).

**Prova de regressão:** `npm test` completo — mesma contagem de sucesso da
baseline (`exit 0`), `teste-sanidade-carga.js` confirma zero colisão de
identificador global e precache íntegro; `tests/testes-ia.js` (26/26,
cobre `aplicarInteligenciaJuridica` de ponta a ponta, incluindo o caminho
que usa `ehNegado` via `MARCADORES_TIPO_ACAO`) e `tests/teste-riscos-
semanticos.js` (4/4) confirmam que o comportamento não mudou.

---

## Roteiro das próximas atualizações

Restam, do menor para o maior acoplamento:
`classificadorExtrator.js` → `dicionarioSemantico.js` (os dois últimos, por
serem os mais densos, exigirão mais de uma sub-entrega cada). Os que forem
puro dado de domínio (como `camposElegiveisIA.js`) só mudam de pasta; os que
misturam mecanismo com regra (como `validacao.js`) são separados em duas
metades, sempre com o mesmo par de provas: nenhuma colisão de identificador
global e a mesma contagem de sucesso do `npm test`.

**Atualização 3 (Fase 2) — feita** (ver seção acima): `js/domains/previdenciario/`
criado com a base de conhecimento v1.0.0 (siglário, tipos de documento, 25
campos semânticos, regras globais, matriz de conflitos, relações entre
campos). Ainda restam, para completar o mapeamento de conhecimento antes do
motor de cálculo: detalhar vínculos/períodos contributivos como estrutura
própria (hoje só há o campo `vinculoEmpregaticio` no dicionário, sem a lista
de exemplos/contraexemplos que `dicionarioSemantico.js` tem para
desapropriação) e ampliar o siglário/tipos de documento conforme novos casos
reais aparecerem — mesmo processo incremental já usado nas correções de
desapropriação (bug real encontrado → correção → teste novo → prova de
regressão).

## Atualização 10 — `dicionarioSemantico.js` separado em motor genérico + dado de domínio

**O que foi feito:** `js/dicionarioSemantico.js` (3611 linhas — 3272 de
dado congelado + ~340 de funções de consulta) dividido em:

- `js/core/dicionarioSemantico.js` (novo, MOTOR genérico): as ~24 funções
  de consulta reescritas como fábrica —
  `MotorDicionarioSemantico.criar(dicionario)` — fechada (closure) sobre
  QUALQUER dicionário do mesmo formato (`campos`, `documentos`,
  `verbos_juridicos`, `expressoes_de_risco`, `regras_de_decisao`,
  `confianca`, `matriz_conflitos`, `linha_tempo`, `pacotes_rag`). Mesmo
  padrão de `js/core/motorValidacao.js`. Isso significa que
  `js/domains/previdenciario/dicionarioPrevidenciario.js` (Atualização 3)
  já pode ganhar `identificarCamposPorTexto`/`identificarExpressaoDeRisco`/
  etc. de graça, bastando chamar
  `MotorDicionarioSemantico.criar(DICIONARIO_PREVIDENCIARIO)` — sem
  depender em nada do dicionário de desapropriação.
- `js/dicionarioSemantico.js` (continua na raiz — é DADO de desapropriação):
  a constante `DICIONARIO_SEMANTICO` (67 campos) intacta, mais o único
  pedaço genuinamente de aplicação que sobrou —
  `MAPA_CAMPO_APP_PARA_SEMANTICO`/`campoSemanticoDoApp` (tradução entre os
  nomes de campo do formulário e os nomes da base semântica) — e a
  instância do motor genérico fechada sobre `DICIONARIO_SEMANTICO`, com
  cada função reexposta com o MESMO nome global de antes.

**Bug real achado e corrigido antes de rodar a suíte:** a primeira versão
reexpunha as funções do motor com `const { obterCampoSemantico, ... } =
MotorDicionarioSemantico.criar(...)` — `tests/teste-dicionario-semantico.js`
falhou 25 de 27 casos com `"... is not a function"`. Causa: neste projeto,
scripts são carregados um a um num `vm` do Node (mesmo mecanismo do
navegador com váriar `<script>`) — `var`/`function` no topo de um arquivo
viram propriedade do objeto global (visível como `sb.nomeDaFuncao` para
quem consulta depois), mas `const`/`let` NUNCA viram propriedade do global
(nem em navegador, nem no `vm`) — só ficam visíveis por referência léxica
direta de dentro de outro código já carregado, não por acesso a
`sb.propriedade`. Corrigido trocando para `var { obterCampoSemantico, ...
} = ...` (desestruturação com `var` cria as mesmas propriedades globais que
existiam antes do split). Suíte: 27/27.

**Prova de regressão:** `tests/teste-dicionario-semantico.js` (27/27),
`npm test` completo — mesma contagem de sucesso da baseline (`exit 0`).

---

## Atualização 11 — `classificadorExtrator.js` separado em mecanismo + regra de domínio (ÚLTIMO item do roteiro)

**O que foi feito:** `js/classificadorExtrator.js` (1781 linhas) dividido em:

- `js/core/classificadorExtrator.js` (novo, mecanismo genérico): formato
  padronizado de campo (`construirCampo` — com chamada defensiva a
  `tipoPecaDe`, já que essa função continua no domínio), parsing pt-BR
  (`parseValorMoedaBR`, `parsePercentualBR`, `parseDataBRParaIso`,
  `parseDataExtensoParaIso`, `formatarValorParaCampoMoeda`,
  `formatarDataIsoParaBR`), busca por proximidade
  (`buscarProximo`/`buscarPercentualComPeriodo`/`buscarTodosProximos`),
  `detectarPaginasDuplicadas`, o filtro de risco semântico
  (`ocorrenciaRestritaPorRisco`, defensivo sobre
  `identificarTodasExpressoesDeRisco`), `extrairDataProxima`,
  `paragrafoDe`/`contexto`, e as regex/cortes genéricos de qualquer
  documento judicial brasileiro: `REGEX_NUMERO_PROCESSO` (padrão CNJ),
  `REGEX_VALOR_RS`/`REGEX_PERCENTUAL`/`REGEX_DATA`/`REGEX_DATA_EXTENSO`/
  `REGEX_PERCENTUAL_COM_PERIODO`, `REGEX_CABECALHO_MAIUSCULO` (SENTENÇA/
  RELATÓRIO/FUNDAMENTAÇÃO/DISPOSITIVO/ACÓRDÃO/DECISÃO/VOTO/EMENTA/
  CONCLUSÃO/VISTOS — vocabulário comum a QUALQUER peça judicial, não só
  desapropriação) e o corte por menção a "vara" (`cortarAntesDeNovaVara`).
- `js/classificadorExtrator.js` (continua na raiz — é regra de
  desapropriação): a classificação de peças
  (`PALAVRAS_CLASSIFICACAO`/`classificarPaginas`/`paginasDoTipo`/
  `tipoPecaDe`), o corte por rótulo de PARTE (`ROTULOS_LIMITE_PARTE` —
  expropriante/expropriado/autor/réu — e `cortarAntesDoProximoRotulo`),
  `REGEX_AREA` (área de imóvel), `REGEX_NOME_INDICE`/`ANCORAS_INDICE_FORTE`,
  e a função `extrairCampos` — que, com ~1150 linhas, continua sendo de
  longe a mais densa do projeto e NÃO foi dividida: cada bloco dela é uma
  regra específica de um campo de desapropriação (o que é "oferta", o que
  é "sentença", quais campos podem ser confundidos com quais), não
  mecanismo reaproveitável — mesmo raciocínio já aplicado a `motor.js` e
  `inteligenciaJuridica.js`. Nomes públicos (`classificarPaginas`,
  `paginasDoTipo`, `extrairCampos`) inalterados.

**Registro de carregamento:** `index.html`/`sw.js` (`CACHE_NAME` v10 para o
split do dicionário, v11 para este) e `tests/loader.js`, com o cuidado de
manter `core/classificadorExtrator.js` carregando ANTES de
`core/extratorCandidatos.js` (que já dependia de `contexto`/
`REGEX_VALOR_RS`/`REGEX_DATA`, agora movidos).

**Prova de regressão:** `tests/testes.js` (16/16, taxa de extração 100% nos
5 cenários — PDF digital, OCR bom/ruim, rotação, 300+ páginas),
`tests/teste-adversarial.js` (58/58), `tests/teste-e2e-pdf-real.js` (16/16),
`tests/teste-e2e-pdf-decisao-indireta-saopaulo.js` (12/12), `npm test`
completo — mesma contagem de sucesso da baseline (`exit 0`), incluindo os
testes de navegador real (Chromium) que exercitam a extração de PDF de
ponta a ponta.

---

## ROTEIRO DE SPLIT MECANISMO/DOMÍNIO — CONCLUÍDO

Com esta entrega, todos os arquivos originalmente catalogados na
Atualização 1 como "mecanismo + regra misturados" foram revisados:
`validacao.js`, `exportarPDF.js`/`exportarExcel.js`, `grafoRelacoes.js`,
`completar.js` (parcial, por decisão consciente), `contextoDocumento.js`,
`entidades.js`, `motor.js` (decisão consciente de não dividir),
`inteligenciaJuridica.js` (parcial, por decisão consciente),
`classificadorExtrator.js` e `dicionarioSemantico.js`. O app de
desapropriação está com seu mecanismo genérico (`js/core/`) e sua regra de
domínio (`js/`, raiz, e `js/domains/desapropriacao/`) separados o quanto
fazia sentido separar, sem nunca sacrificar a regra "não alterar o
pipeline que já funciona sem antes criar testes de regressão" — cada
entrega desta lista tem sua prova de regressão registrada acima.

Segue aberto: a decisão consciente de não dividir `motor.js` e o restante
de `completar.js`/`inteligenciaJuridica.js` pode ser revisitada no futuro
se o domínio previdenciário vier a precisar de um mecanismo equivalente
(ex.: o "ledger de saldo corrigido com eventos" de
`calcularDepositosComLevantamentos`); e o teste órfão
`tests/teste-conceitos-juridicos.js` (função `aplicarConceitosJuridicos`
inexistente) segue pendente de decisão (implementar ou remover).

## Próxima fase do roadmap original (agora que o split terminou)

**Atualização 4 (Fase 3):** motor de cálculo previdenciário (tempo de
contribuição, carência, RMI) como novo módulo de domínio, reaproveitando o
motor genérico de cálculo/validação já disponível em `js/core/` (e, se
fizer sentido no desenho do cálculo, o mecanismo de ledger com eventos
mencionado acima).

**Atualização 5 (Fase 4):** suíte de regressão com documentos sintéticos
previdenciários, no mesmo padrão dos `tests/teste-e2e-pdf-*.js` e
`tests/fixtures-pdf/` já existentes para desapropriação.

**Fora de escopo em todas as fases, por decisão explícita do produto:** nenhum
chat jurídico, nenhuma interface de perguntas e respostas. O fluxo continua
sempre `PDF → RECONHECER → EXTRAIR → VALIDAR → PREENCHER → CALCULAR → MEMÓRIA
DE CÁLCULO`.

---

## Atualização 12 — Fase 3/Atualização 4: primeira entrega do motor de cálculo (tempo de contribuição e carência)

**O que foi feito:** duas peças novas, seguindo o mesmo padrão mecanismo
genérico + regra de domínio já consolidado no roteiro de split:

- `js/core/calculoPeriodos.js` (novo, MECANISMO genérico): aritmética pura
  de datas/períodos, sem nenhum termo previdenciário — `diferencaCalendario`
  (duração entre duas datas ISO, calendário real, fim inclusivo por
  padrão), `totalDiasCorridos`, `diasParaDuracaoConvencional` (converte uma
  contagem de dias em anos/meses/dias pela convenção 30/360, usada só onde
  não há mais uma data de calendário real por trás do número — ex.: tempo
  resultante de multiplicar por um fator de conversão), `mesclarPeriodos`
  (une períodos sobrepostos/adjacentes, para nunca contar em dobro tempo
  concorrente), `somarDuracoes` (soma durações já calculadas, convenção
  30 dias/mês e 12 meses/ano para o "vira-mês"/"vira-ano" do agregado) e
  `competenciasDoPeriodo` (lista de mês/ano tocados por um período — base
  para carência).
- `js/domains/previdenciario/motorTempoContribuicao.js` (novo, REGRA de
  domínio previdenciário): `calcularTempoContribuicao(vinculos, opcoes)` —
  soma tempo de contribuição a partir de uma lista de vínculos
  (`{inicio, fim, tipo: 'comum'|'especial', anosExposicao?}`), com conversão
  opcional de tempo especial em comum pelos fatores históricos do RGPS
  (homem, meta 35 anos: 1,40/1,75/2,33 para base 25/20/15 anos; mulher,
  meta 30 anos: 1,20/1,50/2,00), respeitando o corte da EC 103/2019 art. 25
  §2º (13/11/2019 — período posterior nunca converte, só o anterior mantém
  direito adquirido à conversão); e `calcularCarencia(vinculos)` — hoje uma
  APROXIMAÇÃO (nº de competências mês/ano distintas cobertas por algum
  vínculo, mesclando sobreposição), com as limitações conhecidas registradas
  no próprio rodapé do arquivo (não distingue tipo de segurado, não trata
  perda de qualidade de segurado, segurado especial rural, nem contagem
  recíproca com RPPS — nenhuma bloqueia o caso mais comum de empregado
  urbano, mas ficam pendentes de decisão consciente se o caso de uso pedir
  mais precisão).

**Decisão registrada:** RMI (Renda Mensal Inicial) FICOU FORA desta entrega
de propósito — depende de decidir antes qual espécie de benefício e qual
regra (permanente pós-EC 103/2019 ou alguma das regras de transição) o
usuário quer calcular primeiro; é a próxima decisão em aberto do roadmap.

**Registro de carregamento:** `index.html` (`js/core/calculoPeriodos.js`
antes da base de conhecimento previdenciária, `js/domains/previdenciario/
motorTempoContribuicao.js` depois dela), `sw.js` (`CACHE_NAME` v12) e
`package.json` (`tests/teste-motor-tempo-contribuicao.js` adicionado ao
`npm test`). Nenhum dos dois arquivos novos altera ou é consumido por
nenhum arquivo pré-existente — mesmo estágio de "só disponível, ainda não
plugado a nenhuma tela" em que `dicionarioPrevidenciario.js` já esteve
antes desta atualização.

**Prova de regressão:** `tests/teste-motor-tempo-contribuicao.js` (26/26,
isolado num contexto `vm` próprio, mesmo padrão de
`tests/teste-dicionario-previdenciario.js`), `npm test` completo — mesma
contagem de sucesso da baseline mais os 26 novos (`exit 0`).

## Próxima decisão em aberto

Antes de implementar RMI (próxima peça do motor de cálculo), decidir com o
usuário: (a) qual espécie de benefício primeiro (aposentadoria programada é
a mais comum) e (b) qual regra de cálculo — a regra permanente da EC
103/2019 (60% do salário de benefício + 2% por ano que exceder 20 anos de
contribuição para homem / 15 para mulher) ou alguma regra de transição
(pontos, pedágio 50%, pedágio 100%, idade mínima progressiva) — já que cada
uma tem fórmula própria e a escolha errada de escopo custaria retrabalho.

---

## Atualização 13 — RMI da aposentadoria programada, regra permanente pós-EC 103/2019

**Decisão do usuário:** aposentadoria programada, regra PERMANENTE (não
regra de transição).

**O que foi feito:** `js/domains/previdenciario/motorRMI.js` (novo, regra
de domínio) — `calcularRMI({salarioBeneficio, tempoContribuicao, sexo,
salarioMinimoVigente?, tetoRGPSVigente?})` aplica 60% do salário de
benefício + 2 pontos percentuais por ANO COMPLETO excedente ao tempo mínimo
(20 anos homem / 15 mulher — fração de ano em curso não gera adicional
proporcional, convenção documentada no próprio arquivo), com piso/teto
opcionais (só aplicados se o chamador informar os valores vigentes — o
código não fixa nenhum valor de salário-mínimo/teto do RGPS, já que mudam
por portaria interministerial). `elegibilidadeRegraPermanente({idadeAnos,
tempoContribuicao, carenciaMeses, sexo})` verifica os 3 requisitos do art.
19 (idade 65/62, tempo 20/15, carência 180 meses) e lista pendências.

**Decisão de escopo registrada:** este módulo NÃO calcula o "salário de
benefício" (média dos salários de contribuição desde 07/1994 corrigidos
mês a mês pelo INPC) — recebe esse valor pronto; calculá-lo exigiria uma
série histórica de índices, tratada como entrega separada, no mesmo padrão
de `js/indices.js` do domínio de desapropriação. Nenhuma regra de
TRANSIÇÃO foi implementada.

**Registro de carregamento:** `index.html`/`sw.js` (`js/domains/
previdenciario/motorRMI.js` depois de `motorTempoContribuicao.js`,
`CACHE_NAME` v13), `package.json` (`tests/teste-motor-rmi.js` no `npm
test`).

**Prova de regressão:** `tests/teste-motor-rmi.js` (13/13, isolado em
contexto `vm` próprio), `npm test` completo — 634 OK / 0 falhas (mesma
baseline + 13 novos).

---

## Atualização 14 — primeira fatia real do pipeline de extração (PDF de CNIS → candidatos de vínculo → motor de cálculo)

**Pedido do usuário:** parar de só adicionar conhecimento declarativo e
ligar o domínio previdenciário a um pipeline de extração de verdade —
`PDF -> leitorPdf.js -> classificador de tipo documental -> extrator ->
candidatos estruturados (com fonte/confiança/status) -> field-rules ->
mapper -> motor de cálculo`, no formato de exemplo:
`{tipo:'vinculo', empregador, inicio, fim, fonte:{documento,pagina},
confianca, status}` — nunca só dois campos soltos preenchidos no
formulário.

**Escopo desta entrega:** só o tipo documental **CNIS** e só o campo
estrutural **vínculo** (empregador + período), ponta a ponta até
`MotorTempoContribuicao`. CTPS, PPP, carta de concessão, processo
administrativo/judicial (os outros 5 tipos do pedido original) e os
demais `field-rules/` (segurado, contribuições, benefícios, datas,
valores) ficam registrados como próximas fatias — mesmo padrão do resto
do projeto: uma peça real e testada por vez, nunca 6 tipos documentais
de uma vez sem prova de regressão de cada um.

**Arquivos novos:**
- `js/domains/previdenciario/document-types/cnis.js` + `index.js` —
  classificador de tipo documental (fortes/apoio/exclusão + confiança +
  ambiguidade), MESMO ALGORITMO de `der-pr/document-types/index.js` mas
  **deliberadamente duplicado sob nomes próprios**
  (`identificarTipoDocumentoPrevidenciario` em vez de
  `identificarTipoDocumento`, `DOC_TIPOS_PREVIDENCIARIOS` em vez de
  `DER_PR_TIPOS_DOCUMENTAIS`) — os dois domínios carregam na MESMA
  página (`index.html`), e nomes globais iguais se sobrescreveriam um ao
  outro. Ver o comentário completo em `document-types/index.js` sobre por
  que uma fábrica genérica compartilhada foi CONSCIENTEMENTE adiada (exigiria
  retocar o `der-pr/document-types/index.js` já 100% funcional).
- `js/domains/previdenciario/extraction/extratorVinculosCNIS.js` —
  reconhece a linha tabular `DATA (a|até|-) DATA [-] EMPREGADOR` (inclusive
  vínculo em aberto: "atual"/"em aberto"/"em curso"), produz um candidato
  por vínculo com confiança calculada (reduzida por nome de empregador
  vazio/inválido ou datas invertidas) e `status` `'validado'` ou
  `'requer_revisao'` — nunca descarta silenciosamente, mesmo quando acha
  algo estranho.
- `js/domains/previdenciario/field-rules/vinculos.js` — cataloga o CNIS
  como fonte preferencial do campo `vinculo` (único catalogado nesta
  entrega, porque é o único com extrator implementado).
- `js/domains/previdenciario/mapping/mapperPrevidenciario.js` —
  `vinculosParaMotorTempoContribuicao()` (filtra por status, resolve
  vínculo em aberto via `dataReferencia`, nunca inventa data) e
  `calcularTempoContribuicaoDeCandidatos()` (atalho que fecha o pipeline
  inteiro até `MotorTempoContribuicao.calcularTempoContribuicao()`). Todo
  vínculo mapeado sai como `tipo:'comum'` — o CNIS sozinho não informa
  atividade especial (isso é PPP, fora de escopo).

**Registro de carregamento:** `index.html`/`sw.js` (os 5 arquivos novos,
nesta ordem, depois de `motorRMI.js`; `CACHE_NAME` v14), `package.json`
(3 testes novos no `npm test`, depois de `teste-motor-rmi.js`).

**Bug real achado e corrigido durante esta entrega:** um comentário de
cabeçalho em `field-rules/vinculos.js` continha a substring literal
`*/` dentro do texto (referência a `der-pr/field-rules/*/index.js`),
fechando o comentário de bloco antes da hora e quebrando a sintaxe do
arquivo — só apareceu no teste E2E de navegador real (`Unexpected token
':'` ao carregar a página no Chromium), não no `node -c` de cada arquivo
isolado feito antes (porque o arquivo em si era sintaticamente válido
sozinho — o problema era outro comentário no MESMO arquivo fechando cedo
demais). Corrigido reescrevendo a referência sem a substring `*/`.

**Prova de regressão:** `tests/teste-classificador-tipo-documento-previdenciario.js`
(7/7), `tests/teste-extrator-previdenciario.js` (10/10),
`tests/teste-mapper-previdenciario.js` (5/5, inclui o fechamento
ponta-a-ponta do exemplo do produto), `npm test` completo — mesma
baseline + 22 novos, `exit 0` (inclui os testes E2E reais em Chromium:
carga sem erro de JS e precache do service worker cobrindo os 5 arquivos
novos).

## Próxima decisão em aberto (superada pela Atualização 15 abaixo)

Qual das próximas fatias entrar primeiro: (a) `document-types/ctps.js` +
extrator equivalente (formato "rotulado" em várias linhas, diferente do
tabular do CNIS), (b) `document-types/ppp.js` (para poder marcar vínculo
como `tipo:'especial'` de verdade, hoje sempre `'comum'`), ou (c) os
`field-rules/` de datas/benefícios (DER/DIB/DIP/RMI) ligados a
`document-types/carta-concessao.js` — decisão de produto, não técnica.

---

## Atualização 15 — remunerações + `HistoricoPrevidenciario` (o "Y" do diagrama: vínculos + salários + competências)

**Pedido do usuário:** próximo passo é REMUNERAÇÕES, com o pipeline
evoluindo para `CNIS -> {vínculos, salários, competências} ->
HistoricoPrevidenciario -> {tempo de contribuição, carência} -> (futuro:
salário de benefício -> RMI)`.

**O que foi feito:**
- `js/domains/previdenciario/extraction/extratorRemuneracoesCNIS.js` —
  segundo extrator real do domínio (mesmo padrão de
  `extratorVinculosCNIS.js`): reconhece linha `MM/AAAA [rótulo opcional]
  R$ valor [código de ocorrência opcional]`, produzindo candidatos
  `{tipo:'remuneracao', competencia:'AAAA-MM', valor, valorZerado,
  codigoOcorrencia, confianca, status, trecho}`. Remuneração zerada é
  extraída (nunca descartada) e marcada `valorZerado:true`, seguindo o
  risco já registrado no dicionário ("remuneração zerada não é o mesmo
  que ausência de contribuição"). `agruparRemuneracoesPorCompetencia()`
  detecta competência duplicada (ex.: retificação) sem escolher uma
  sozinha.
- `js/domains/previdenciario/field-rules/contribuicoes.js` — cataloga o
  CNIS como fonte preferencial do novo campo `remuneracao` (mesmo padrão
  de `field-rules/vinculos.js`).
- `js/domains/previdenciario/historico/historicoPrevidenciario.js` — a
  peça `HistoricoPrevidenciario` pedida: `montarHistorico()` junta
  vínculos mapeados (reaproveita `vinculosParaMotorTempoContribuicao()`,
  não duplica a lógica) com remunerações validadas, associando cada
  remuneração ao(s) vínculo(s) cuja competência (AAAA-MM) cai dentro do
  período — remuneração sem vínculo correspondente vai para
  `.remuneracoesSemVinculo` (nunca descartada); competência que cai em
  MAIS de um vínculo (concomitância) fica anexada aos dois e listada em
  `.competenciasAmbiguas`. `calcularTempoEcarenciaDeHistorico()` chama
  `MotorTempoContribuicao` para o tempo de contribuição e devolve **duas
  carências lado a lado, nunca uma só**: `.carenciaAproximadaPorVinculo`
  (método já existente, span do vínculo inteiro) e
  `.carenciaPorRemuneracao` (NOVA, mais precisa — conta só competências
  com remuneração > 0 realmente lançada no CNIS; fica `null` quando não
  há dado de remuneração, nunca inventa um número).

**Decisão de escopo registrada (não decidida sozinha):** salário de
benefício (média dos salários de contribuição corrigidos pelo INPC desde
07/1994) e RMI continuam fora — `historico.vinculos[].remuneracoes` já
deixa o dado bruto pronto (competência + valor por vínculo), mas corrigir
e somar isso em valor de benefício exige uma série histórica de índices
que não existe ainda para o domínio previdenciário (mesmo padrão de
`js/indices.js` na desapropriação) — registrado como a PRÓXIMA peça
central do pipeline, não implementado às pressas sem essa base.

**Registro de carregamento:** `index.html`/`sw.js` (3 arquivos novos,
depois do bloco previdenciário existente; `CACHE_NAME` v15),
`package.json` (3 testes novos, depois de `teste-mapper-previdenciario.js`).

**Prova de regressão:** `tests/teste-extrator-remuneracoes-previdenciario.js`
(11/11), `tests/teste-historico-previdenciario.js` (7/7, inclui o cenário
de vínculo com lacuna de remuneração — carência aproximada de 6 meses x
carência por remuneração de 4 meses — e o de vínculos concomitantes com
competência ambígua), `npm test` completo — mesma baseline + 18 novos,
`exit 0` (674 `OK` no log completo, 0 falhas reais; inclui os E2E reais em
Chromium: carga sem erro de JS e precache do service worker cobrindo os 3
arquivos novos).

## Próxima decisão em aberto (superada pela Atualização 16 abaixo)

Com vínculos + remunerações + competências consolidados em
`HistoricoPrevidenciario`, a peça central que falta para fechar o
diagrama até RMI é **salário de benefício** — exige decidir antes: (a) a
série histórica de índices de correção (INPC mês a mês desde 07/1994,
mesmo padrão de `js/indices.js`) e (b) a regra de seleção dos salários
que entram na média (todo o período contributivo pós-07/1994, regra
permanente da EC 103/2019 já assumida em `motorRMI.js`). Alternativa mais
rápida, se preferir adiar a série de índices: `document-types/ctps.js`
ou `document-types/ppp.js` (fatias já registradas na Atualização 14) —
decisão de produto, não técnica.

---

## Atualização 16 — `HistoricoPrevidenciario` vira a ENTIDADE consolidada (reescrita de ruptura, versão 2.0.0)

**Pedido do usuário:** `HistoricoPrevidenciario` é "provavelmente a peça
mais importante que ainda está faltando" — deveria ser uma entidade única
(`segurado`, `vinculos`, `remuneracoes`, `contribuicoes`, `beneficios`,
`periodosEspeciais`, `periodosRurais`, `documentos`, `proveniencia`), e
"os motores não deveriam mais receber dados soltos".

**Mudança de RUPTURA (registrada, não silenciosa):** `montarHistorico()`
mudou de assinatura — antes `(candidatosVinculo, candidatosRemuneracao,
opcoes)`, agora `(entrada, opcoes)` com `entrada = {vinculos,
remuneracoes, beneficios, periodosEspeciais, periodosRurais, segurado}` —
e o formato de retorno mudou de `{vinculos (com remuneracoes aninhadas),
remuneracoesSemVinculo, competenciasAmbiguas, competenciasComContribuicao,
ignorados}` para a entidade completa de 9 campos + `ignorados` (auditoria,
adição consciente além da forma pedida). Nenhum outro arquivo do projeto
dependia da forma antiga (checado com grep antes de reescrever — o módulo
inteiro é da Atualização 15, ainda não plugado a nenhuma tela), então a
ruptura foi feita direto, sem período de transição — mesmo assim,
`calcularTempoEcarenciaDeHistorico()` manteve o MESMO contrato de saída
(`tempoContribuicao`/`carenciaAproximadaPorVinculo`/`carenciaPorRemuneracao`),
porque essa parte já estava correta.

**O que a entidade faz, exatamente:**
- `segurado` — passthrough puro de `entrada.segurado` (nenhum extrator de
  identificação existe ainda); `{nome:null, cpf:null, nascimento:null}`
  por padrão.
- `vinculos`/`remuneracoes` — mesma extração/filtro de sempre (CNIS), mas
  agora cada um ganha um `.id` (`v1`, `r1`...) que serve de CHAVE entre os
  campos da entidade, em vez de aninhamento solto.
- `contribuicoes` — **novo campo derivado**: uma entrada por competência
  com remuneração > 0 (não por remuneração — duas remunerações na mesma
  competência viram UMA contribuição `.ambigua:true`, nunca duas
  concorrentes silenciosas); `.vinculoId` pode ser `null` (contribuinte
  sem vínculo empregatício associável é uma situação real do RGPS, não um
  erro de extração).
- `beneficios`/`periodosEspeciais`/`periodosRurais` — **forma pronta, sem
  extração real ainda**: aceitam candidatos já prontos (mesmo contrato de
  `.status` 'validado'/'requer_revisao' dos outros), mas nenhum PDF é lido
  para essas 3 categorias nesta entrega (isso é `document-types/ppp.js` e
  `carta-concessao.js`, ainda não implementados) — decisão consciente de
  não fingir uma extração que não existe, só deixar a entidade pronta pra
  quando existir.
- `documentos` — **novo campo derivado**: manifesto único
  documento+página+arquivo de tudo que foi lido (validado ou não).
- `proveniencia` — **novo campo derivado**: um registro por fato
  consolidado (vínculo/remuneração/contribuição), sempre rastreável de
  volta à fonte/confiança/status original.

**Por que os MOTORES (`MotorTempoContribuicao`) NÃO foram reescritos para
aceitar o histórico inteiro:** eles continuam funções PURAS (array de
vínculo entra, tempo/carência sai) — de propósito, para continuarem
testáveis isolados (`tests/teste-motor-tempo-contribuicao.js`) sem
depender de nenhum formato de entidade. `calcularTempoEcarenciaDeHistorico()`
é o ÚNICO ponto que "desmonta" o histórico em array cru para alimentar o
motor — quem consome o pipeline (UI, testes, API futura) só chama
`montarHistorico()` e depois essa função; nunca mais precisa tocar em
vínculo/remuneração solto.

**Registro de carregamento:** nenhuma mudança em `index.html`/`sw.js`
(mesmos 3 arquivos já registrados na Atualização 15 — só o conteúdo de
`historicoPrevidenciario.js` mudou, `CACHE_NAME` não precisou subir
porque a LISTA de arquivos cacheados é a mesma). `package.json` inalterado
(mesmo teste, reescrito por dentro).

**Prova de regressão:** `tests/teste-historico-previdenciario.js`
totalmente reescrito (14/14 — cobre a forma dos 9 campos, associação
vínculo↔remuneração↔contribuição por competência, remuneração/contribuição
sem vínculo (contribuinte individual), competência ambígua entre vínculos
concomitantes, beneficios/periodosEspeciais/periodosRurais como
passthrough filtrado por status, manifesto de documentos, proveniência
rastreável, e entrada ausente/malformada nunca lança erro), `npm test`
completo — mesma baseline + 14, `exit 0` (681 `OK` no log completo, 0
falhas reais; inclui os E2E reais em Chromium). Checado por `grep` antes
da reescrita que nenhum outro arquivo do projeto usava a assinatura
antiga de `montarHistorico()` — a ruptura não quebrou nada além do
próprio teste, que já foi reescrito junto.

## Próxima decisão em aberto (superada pela Atualização 17 abaixo)

Com a entidade `HistoricoPrevidenciario` pronta (inclusive com espaço
reservado para `beneficios`/`periodosEspeciais`/`periodosRurais`), a
pergunta de produto que falta responder é a mesma da Atualização 15:
qual extrator entra a seguir para começar a POPULAR essas 3 categorias —
`document-types/ppp.js` (período especial), `document-types/ctps.js`
(vínculo/período rural em formato diferente do CNIS), ou
`document-types/carta-concessao.js` (benefício já concedido, para poder
testar `HistoricoPrevidenciario.beneficios` com dado real) — ou, em vez
disso, atacar a série histórica de índices para viabilizar salário de
benefício. Decisão de produto, não técnica.

---

## Atualização 17 — SALÁRIO DE BENEFÍCIO (correção INPC + média), fechando quase todo o diagrama até RMI

**Pedido do usuário:** "não iria para CTPS ou PPP agora" — a V16 resolveu
`HistoricoPrevidenciario` como entidade consolidada (vínculos +
remunerações + contribuições), que é exatamente a base para avançar:
`HistoricoPrevidenciario -> salários de contribuição -> correção
monetária -> salário de benefício -> RMI`.

**Decisão técnica central: NENHUMA tabela histórica de INPC escrita à
mão.** `js/core/indices.js` (desapropriação) já busca a série real do
INPC ao vivo na API do Banco Central (SGS, série 188), com cache local
para funcionamento offline — reaproveitado tal como está, sem alterar
uma linha dele. Transcrever de memória uma série de ~380 competências
(07/1994 até hoje) teria risco real de erro pontual, e um erro silencioso
aí contaminaria salário de benefício e RMI de um caso previdenciário de
verdade — o mesmo raciocínio que já levou `js/core/indices.js` a
BLOQUEAR o cálculo em vez de estimar quando falta uma competência foi
replicado aqui.

**Arquivos novos:**
- `js/domains/previdenciario/correcao/correcaoINPCPrevidenciario.js` —
  `buscarFatoresAcumuladosINPC(competenciaInicio, competenciaFim)` busca
  a série (via `buscarSerieBcbComCache`/`BCB_SERIES.inpc`, já existentes
  em `core/indices.js`) e acumula o fator mês a mês; **todo-ou-nada**: se
  faltar o índice de QUALQUER competência do período pedido, devolve
  `fatoresPorCompetencia` vazio e a lacuna em `faltantes` — nunca um
  acumulado parcial calculado pulando o mês que falta (o mesmo problema
  que motivou o bloqueio, não a estimativa, em `montarMemoriaCorrecao` da
  desapropriação). `corrigirValorPorINPC(valor, competenciaOrigem,
  competenciaReferencia, fatores)` aplica a razão entre fatores
  acumulados; devolve `null` (nunca um número inventado) se faltar
  qualquer um dos dois fatores.
- `js/domains/previdenciario/motorSalarioBeneficio.js` —
  `calcularSalarioBeneficio(historico, opcoes)`: consome
  **`historico.contribuicoes`** (não `remuneracoes` soltas — é
  literalmente o nó "salários de contribuição" do diagrama do usuário, já
  deduplicado por competência pelo próprio `HistoricoPrevidenciario`).
  Regra PERMANENTE pós-EC 103/2019 (mesma decisão já registrada em
  `motorRMI.js`): média aritmética simples de 100% das competências a
  partir de 07/1994 (marco do Plano Real, Lei 8.213/91 art. 29-B), SEM
  descarte dos 20% menores (isso era a regra antiga). Contribuição
  `.ambigua` fica de fora por padrão (`opcoes.incluirAmbiguas` inclui
  mesmo assim); `opcoes.competenciaReferencia` é obrigatória (normalmente
  a competência do DER) — sem ela, erro explícito, nunca uma suposição de
  data. Se faltar índice INPC de qualquer competência necessária, ou a
  API do Bacen estiver indisponível, `salarioBeneficio` vem `null` com o
  motivo — nunca uma média calculada só com o que "deu certo".

**Registro de carregamento:** `index.html`/`sw.js` (2 arquivos novos,
logo após `motorRMI.js` — dependem de `core/util.js`/`core/indices.js`,
já carregados antes do bloco previdenciário; `CACHE_NAME` v16).
`package.json` (2 testes novos).

**Como os testes evitam rede real:** `buscarSerieBcbComCache` é dublada
(mock determinístico com uma série INPC sintética de 3 meses) em vez de
carregar `core/indices.js` de verdade fazendo `fetch` — os testes
carregam o `core/indices.js` REAL só pelas suas funções puras
(`indexarPorCompetencia`), e sobrescrevem `sandbox.buscarSerieBcbComCache`
depois, então rodam determinísticos e sem depender da API do Bacen estar
no ar. As contas de correção foram conferidas à mão antes de escrever a
asserção (ex.: 1000 corrigido de 03/2001 para 05/2001 com a série
1%/2%/-1% = 1009,80 — matemática documentada no comentário do teste).

**Prova de regressão:** `tests/teste-correcao-inpc-previdenciario.js`
(7/7), `tests/teste-motor-salario-beneficio.js` (8/8 — inclui o cenário
completo de 3 competências corrigidas e a média final batendo com o
cálculo manual, exclusão do marco pré-07/1994, competência ambígua,
índice ausente bloqueando o cálculo, e API indisponível bloqueando em vez
de usar valor não corrigido), `npm test` completo — mesma baseline + 15,
`exit 0` (696 `OK` no log completo, 0 falhas reais; inclui os E2E reais
em Chromium confirmando que os 2 arquivos novos entraram no precache do
service worker).

**Decisão registrada, não implementada ainda:** `MotorSalarioBeneficio`
devolve `salarioBeneficio` pronto para `MotorRMI.calcularRMI({
salarioBeneficio, ...})`, mas os dois motores ainda não foram encadeados
numa função de conveniência única — cada um continua podendo ser chamado
(e testado) isoladamente, decisão consciente de manter os motores como
funções puras (ver Atualização 16).

## Próxima decisão em aberto (superada pela Atualização 18 abaixo)

Com salário de benefício resolvido, o diagrama do usuário está fechado
até faltar só a última peça: uma função `calcularRMIDoHistorico(historico,
opcoes)` que encadeie `MotorSalarioBeneficio` + `MotorRMI` num só passo
(precisa ainda de `sexo`, `idadeAnos`, `salarioMinimoVigente`,
`tetoRgpsVigente` — nenhum hardcoded, mesma decisão do `motorRMI.js`) —
ou, alternativamente, voltar para as fatias de extração pendentes (PPP,
CTPS, carta de concessão) agora que o motor de cálculo está inteiro.
Decisão de produto, não técnica.

---

## Atualização 18 — V17 fechada com objetivo único: caso previdenciário completo, do CNIS ao RMI, sem ampliar escopo

**Pedido do usuário:** ordem explícita, "sem ampliar escopo" —
`HistoricoPrevidenciario -> remunerações por competência -> seleção das
competências válidas -> atualização monetária -> salário de benefício ->
memória de cálculo -> MotorRMI -> resultado final`, com 4 exigências
específicas (`MotorSalarioBeneficio` recebendo o histórico; reaproveitar
o mecanismo de índices do core sem duplicar; memória de cálculo com 6
campos por competência; integração explícita com o RMI) e um teste E2E
obrigatório provando PDF→RMI com um CNIS sintético. Regra de ouro
explícita: nada de CTPS/PPP/rural/novas espécies agora.

**O que já estava certo (Atualização 17) e não mudou:** `MotorSalario
Beneficio.calcularSalarioBeneficio(historico, opcoes)` já recebia o
histórico inteiro (não array solto); já reaproveitava `js/core/indices.js`
sem duplicar o mecanismo (`BCB_SERIES`/`buscarSerieBcbComCache`/
`indexarPorCompetencia`); já localizava remunerações por competência via
`historico.contribuicoes`; já validava competências (marco 07/1994,
competência de referência, ambiguidade). Nada disso foi refeito.

**O que faltava e foi corrigido nesta entrega:**
- **Memória de cálculo incompleta** — antes só tinha `competencia`/
  `valorOriginal`/`valorCorrigido`. Agora cada item de `.memoria` tem os
  6 campos pedidos: `competencia`, `valorOriginal`, `indiceUtilizado`
  ('INPC (Bacen SGS 188)'), `fatorAplicado` (a razão de correção, não só
  o resultado já multiplicado — nova função pura
  `fatorAplicadoINPC()` em `correcaoINPCPrevidenciario.js`,
  `corrigirValorPorINPC()` reescrito por cima dela para não duplicar a
  conta), `valorAtualizado` (renomeado de `valorCorrigido`) e
  `participacaoNaMedia` (% da soma que forma a média — soma sempre 100%
  entre as competências elegíveis) e `fonte` (array de
  `{documento,pagina,arquivo}`, resolvido via `historico.remuneracoes`
  pelos `remuneracaoIds` de cada contribuição).
- **"Integração com RMI" ainda não existia** — novo arquivo
  `js/domains/previdenciario/motorRMIDoHistorico.js`:
  `calcularRMIDoHistorico(historico, opcoes)` encadeia, nesta ordem,
  `HistoricoPrevidenciario.calcularTempoEcarenciaDeHistorico()` (tempo de
  contribuição) + `calcularSalarioBeneficio()` (salário de benefício) +
  `MotorRMI.calcularRMI()` (RMI) — SEM NENHUMA fórmula nova, só a ordem
  de chamada e a decisão de parar (nunca inventar) quando qualquer etapa
  não pôde ser concluída. `opcoes.sexo` e `opcoes.competenciaReferencia`
  continuam obrigatórios, piso/teto do RGPS continuam por conta de quem
  chama (mesma decisão do `motorRMI.js`, nada hardcoded).
- **Teste E2E obrigatório** —
  `tests/teste-e2e-previdenciario-cnis-ate-rmi.js`: um CNIS sintético (1
  vínculo, 3 competências de R$ 1.000,00) percorrendo **código de
  produção real** em cada etapa —
  `identificarTipoDocumentoPrevidenciario` → `extrairVinculosDoTexto`/
  `extrairRemuneracoesDoTexto` → `montarHistorico` →
  `historico.contribuicoes` → `calcularRMIDoHistorico` — com uma única
  peça dublada (a chamada de rede `buscarSerieBcbComCache`, mesma razão
  dos outros testes: determinístico, sem depender da API do Bacen estar
  no ar). NÃO é um teste de navegador Playwright (não existe UI para o
  domínio previdenciário ainda — implementar uma agora violaria a regra
  de "sem ampliar escopo"); é uma integração de ponta a ponta no nível
  dos módulos JS, com as contas conferidas à mão antes das asserções.

**Registro de carregamento:** `index.html`/`sw.js` reorganizados (a
ordem anterior tinha `correcaoINPCPrevidenciario.js`/
`motorSalarioBeneficio.js` ANTES de `historico/historicoPrevidenciario.js`
no bloco principal, e havia uma duplicata acidental do script de
histórico — corrigido: agora todo o domínio previdenciário carrega em
UMA sequência só, terminando em `motorRMIDoHistorico.js`, que depende de
todo o resto). `CACHE_NAME` v17. `package.json` (3 testes novos).

**Prova de regressão:** `tests/teste-motor-salario-beneficio.js`
atualizado (8/8, memória de cálculo com os 6 campos verificados, soma de
`participacaoNaMedia` = 100% conferida), `tests/teste-motor-rmi-do-
historico.js` (6/6 — inclui aplicação de piso, ausência de sexo parando
antes do RMI mas depois do salário, histórico sem vínculo parando por
falta de tempo de contribuição, API do Bacen indisponível bloqueando
tudo), `tests/teste-e2e-previdenciario-cnis-ate-rmi.js` (6/6 — as 6
etapas do pipeline completo, mais um teste de proveniência ponta-a-ponta:
o RMI final rastreável até a página exata do PDF de origem), `npm test`
completo — mesma baseline + 20, `exit 0` (708 `OK` no log completo, 0
falhas reais; inclui os E2E reais em Chromium confirmando o precache do
novo arquivo).

## Próxima decisão em aberto (superada pela correção crítica abaixo)

Regra de ouro desta etapa cumprida: um caso previdenciário completo
funciona do PDF (sintético) até o valor final da RMI, com memória de
cálculo rastreável em cada competência. Only agora, com essa base sólida,
faz sentido decidir a próxima expansão de escopo — mesmas 3 opções já
registradas nas Atualizações 15-17: `document-types/ppp.js` (período
especial), `document-types/ctps.js` (formato rotulado, período rural),
`document-types/carta-concessao.js` (benefício já concedido) — ou, fora
do pipeline de extração, uma UI real para o domínio previdenciário
(hoje só existe a UI da desapropriação; previdenciário só é acessível via
código/teste). Decisão de produto, não técnica.

---

## Correção crítica pós-Atualização 18 — RMI TEÓRICA separada de ELEGIBILIDADE

**Achado do usuário (prioridade alta, antes de qualquer V19):** o teste
E2E da Atualização 18 usava um CNIS sintético de só 3 meses de
contribuição e produzia "RMI: R$ 599,958" sem nenhum aviso. Matematicamente
correto (o teste existe para provar o encadeamento), mas **não pode ser
apresentado como uma aposentadoria válida** — 3 meses está muito abaixo
dos 15-20 anos e 180 meses de carência exigidos. `motorRMI.js` já tinha
`elegibilidadeRegraPermanente()` pronta e testada desde a Atualização 13,
mas `motorRMIDoHistorico.js` nunca a chamava. A EC 103/2019 estabelece
requisitos próprios para a regra permanente, e ainda existem regras de
TRANSIÇÃO não implementadas — a camada de elegibilidade precisa ficar
sempre visível, nunca implícita.

**Correção:** `calcularRMIDoHistorico()` reescrito para SEMPRE devolver
dois campos separados, nunca um sem o outro:
- `.rmiTeorica` — a saída pura de `MotorRMI.calcularRMI()` (fórmula:
  salário de benefício × percentual), calculada mesmo que o segurado não
  tenha direito a nada — é só matemática, útil inclusive para simulações
  ("quanto eu receberia se contribuísse mais X anos").
- `.elegibilidade` — a saída de `MotorRMI.elegibilidadeRegraPermanente()`
  ({elegivel, pendencias}), mais `regraVerificada` (deixa explícito que
  só a regra PERMANENTE do art. 19 foi checada — um segurado inelegível
  por ela pode ainda ter direito por alguma regra de TRANSIÇÃO, não
  verificada aqui) e `origemCarencia` (qual das duas carências do
  `HistoricoPrevidenciario` — `carenciaPorRemuneracao`, mais precisa, ou
  `carenciaAproximadaPorVinculo` — foi usada). Novo input
  `opcoes.idadeAnos` (obrigatório só para a checagem de elegibilidade,
  não para a RMI teórica) — sem ele, `.elegibilidade` vem `{elegivel:
  null, pendencias:['idade não informada...']}`, NUNCA presumida
  elegível nem inelegível por omissão.

Nenhuma fórmula nova foi criada — a correção foi só passar a CHAMAR uma
função que já existia e já era testada (`elegibilidadeRegraPermanente`),
e nunca mais devolver `.rmiTeorica` sozinha.

**Ruptura de formato, registrada:** o campo `.rmi` (Atualização 18) virou
`.rmiTeorica`. Checado com `grep` que só os 3 arquivos desta mesma função
dependiam do formato antigo (o arquivo é novo, ainda não usado por mais
nada) — reescritos junto.

**Prova de regressão:** `tests/teste-motor-rmi-do-historico.js`
totalmente reescrito (10/10 — inclui o cenário exato do achado do usuário:
3 meses → `elegivel:false` com as 3 pendências nomeadas; um cenário NOVO
de 21 anos e meio de contribuição construído para provar o caminho
`elegivel:true` sem nenhuma pendência; ausência de `idadeAnos` →
`elegivel:null`, nunca presumido; piso do RGPS aplicado na RMI teórica
sem alterar a elegibilidade), `tests/teste-e2e-previdenciario-cnis-ate-
rmi.js` atualizado (6/6 — a Etapa 5+6 agora confirma explicitamente que o
cenário de 3 meses do CNIS sintético produz `elegivel:false`), `npm test`
completo — mesma baseline, `exit 0` (712 `OK` no log completo, 0 falhas
reais). `CACHE_NAME` não subiu (lista de arquivos cacheados não mudou, só
o conteúdo de `motorRMIDoHistorico.js`).

## Próxima decisão em aberto (superada pela correção de carência abaixo)

Com a separação RMI teórica/elegibilidade resolvida, a base do domínio
previdenciário está mais sólida do que antes da V19. As mesmas 3 opções
de expansão de extração (PPP, CTPS, carta de concessão) e a opção de UI
real continuam registradas acima, sem mudança — a diferença é que agora
qualquer resultado exibido a partir daqui já carrega, por padrão, a
distinção entre "quanto daria matematicamente" e "o segurado tem direito
a isso". Decisão de produto, não técnica.

---

## Correção — carência não é "quantidade de vínculos" nem "quantidade de remunerações > 0"

**Achado do usuário (segundo ponto, mesma sessão da correção crítica de
elegibilidade):** `HistoricoPrevidenciario` expõe dois indicadores
técnicos — `carenciaAproximadaPorVinculo` (todo mês dentro do span de um
vínculo) e `carenciaPorRemuneracao` (todo mês com remuneração > 0
lançada). Nenhum dos dois é a carência legal: a Lei 8.213/91, art. 27,
distingue segurado EMPREGADO (carência conta pela filiação, independente
de o empregador ter de fato recolhido) de CONTRIBUINTE INDIVIDUAL/
FACULTATIVO (carência conta só a partir do efetivo pagamento). A correção
anterior (elegibilidade) já usava um desses dois indicadores como se
fosse "a carência" para decidir elegibilidade — o usuário apontou que
isso continuava sendo a mesma confusão, um nível abaixo.

**Correção — nova camada:** `js/domains/previdenciario/carencia/
validacaoCarenciaPrevidenciaria.js`, `validarCarenciaPrevidenciaria(historico)`
aplica de fato o art. 27, I e II:
- **Art. 27, I** (segurado empregado): toda competência coberta por
  QUALQUER vínculo do histórico conta, independentemente de remuneração
  ter sido lançada no CNIS (protege o segurado de uma lacuna que é
  responsabilidade do empregador, não dele).
- **Art. 27, II** (contribuinte individual/facultativo): competências de
  `historico.contribuicoes` SEM vínculo associado (`.vinculoId === null`)
  só contam a partir do efetivo pagamento (valor > 0 realmente lançado).
- O resultado é a UNIÃO das duas contagens (sem contar competência em
  dobro), mesclando períodos de vínculos sobrepostos.

**Nunca chamado de "definitivo":** o retorno sempre carrega, junto com
`totalMeses`, um `metodologia` (o que foi aplicado, citando o artigo) e
um `limitacoes` (5 itens: não distingue tipo de vínculo — todo vínculo do
CNIS é tratado como emprego, porque o extrator não classifica isso hoje;
não verifica perda da qualidade de segurado nem reafiliação art. 27-A;
não verifica piso de salário mínimo por competência; não verifica
hipóteses de dispensa de carência; não trata segurado rural nem RPPS).
Essa é uma apuração MAIS correta que os dois indicadores brutos, mas
continua sendo uma apuração técnica, não uma pronúncia jurídica fechada
sobre o caso concreto — a mesma disciplina já aplicada em toda limitação
registrada no projeto.

**`motorRMIDoHistorico.js` atualizado:** a checagem de elegibilidade não
escolhe mais entre os dois indicadores técnicos (`_prevCarenciaPara
Elegibilidade`, removida) — chama `validarCarenciaPrevidenciaria()` e
expõe o resultado inteiro (com metodologia e limitações) em
`.elegibilidade.carencia`, no lugar do antigo `.elegibilidade.origemCarencia`
(campo removido — ruptura de formato, checada com `grep`: só os próprios
arquivos desta função dependiam dele).
`HistoricoPrevidenciario.calcularTempoEcarenciaDeHistorico()` NÃO foi
alterado (os dois indicadores técnicos continuam lá — o próprio usuário
disse que são "úteis como indicador técnico") — só ganhou um comentário
apontando para a nova camada como a apuração de fato usada em decisões de
elegibilidade.

**Prova de regressão:** `tests/teste-validacao-carencia-previdenciaria.js`
(novo, 7/7 — inclui o caso que prova a diferença na prática: um vínculo
com lacuna de remuneração em 2 dos 6 meses continua contando os 6 meses
inteiros por filiação, diferente do que `carenciaPorRemuneracao` diria;
uma contribuição avulsa sem vínculo só conta a partir do pagamento
efetivo; dois vínculos concomitantes não duplicam a contagem),
`tests/teste-motor-rmi-do-historico.js` atualizado (10/10, mesmo cenário
de 21,5 anos elegível confirmando `totalMeses: 258` pelo novo método),
`tests/teste-e2e-previdenciario-cnis-ate-rmi.js` atualizado, `npm test`
completo — mesma baseline + 7, `exit 0` (719 `OK` no log completo, 0
falhas reais; inclui os E2E reais em Chromium). `CACHE_NAME` v18.

## Próxima decisão em aberto (superada pela Atualização 19 abaixo)

Com RMI teórica/elegibilidade separadas E a carência apurada por
metodologia explícita (não mais um indicador bruto escolhido às cegas), a
camada de cálculo do domínio previdenciário está no ponto mais sólido até
agora. Mesmas opções de sempre continuam em aberto: expandir a extração
(PPP, CTPS, carta de concessão) ou construir uma UI real para o domínio —
mais uma possível, registrada pela primeira vez aqui: classificar o TIPO
de vínculo na extração do CNIS (empregado / contribuinte individual /
avulso), hoje assumido implicitamente como sempre "empregado" pela nova
camada de carência (ver `.limitacoes[0]` do resultado) — isso destravaria
uma apuração de carência ainda mais correta. Decisão de produto, não
técnica.

---

## Atualização 19 — o pipeline sai do código/teste e vira uma tela de verdade

**Pedido do usuário:** integrar o pipeline previdenciário (já concluído em
nível de módulos) à aplicação real — PDF → extração → identificação CNIS
→ vínculos/remunerações → `HistoricoPrevidenciario` → os 3 motores →
resultado — numa interface para visualizar e revisar campos extraídos,
vínculos, competências, remunerações, tempo, carência, salário de
benefício e RMI, cada campo com proveniência/página/confiança/status.
Teste com PDF CNIS sintético REAL (não só texto), passando pelo extrator
de PDF de verdade. RMI teórica separada de elegibilidade, sempre. Regra
de ouro explícita: nenhum motor, tipo documental ou regra de benefício
novo nesta etapa — só integração e UI.

**O que foi feito:**
- `js/domains/previdenciario/ui/painelPrevidenciario.js` — orquestra
  `lerUmPdf()` (reaproveitado do `js/core/leitorPdf.js` tal como está,
  sem alterar uma linha) → `identificarTipoDocumentoPrevidenciario()` por
  página → `extrairVinculosDoTexto()`/`extrairRemuneracoesDoTexto()` (só
  páginas CNIS) → `HistoricoPrevidenciario.montarHistorico()` →
  `calcularRMIDoHistorico()` → renderização. Nenhuma lógica de cálculo ou
  extração nova — só chamadas ao que já existia e já era testado.
- Nova seção em `index.html` (append-only, depois de toda a UI da
  desapropriação, IDs 100% próprios — `zonaDropPdfPrev`,
  `prevTabelaVinculos` etc. — nenhuma colisão checada com grep antes):
  card de importação de PDF, tabela de "Documentos reconhecidos", tabela
  de vínculos, tabela de remunerações por competência, tabela de
  contribuições apuradas, painel de parâmetros do cálculo
  (competência de referência/DER, sexo, idade, piso/teto do RGPS,
  todos opcionais exceto os dois primeiros — nenhum hardcoded) e o
  resultado. Cada linha de vínculo/remuneração mostra confiança (badge
  colorido) e status ('validado'/'requer revisão', com destaque visual
  para as que precisam de revisão) e fonte (documento+página+arquivo) —
  nunca só o valor sem proveniência. Candidatos descartados na extração
  aparecem num `<details>` "nunca silenciosamente", com o motivo.
- **RMI teórica x elegibilidade, na tela**: duas caixas visualmente
  distintas por CSS (`.prev-caixa-rmi-teorica`, cinza/tracejada, com o
  aviso "é só a fórmula, não é um resultado exercível por si só" sempre
  visível ao lado do título) e `.prev-caixa-elegibilidade` (verde/
  vermelha/amarela conforme elegível/não elegível/não verificada, com as
  pendências listadas e a carência apurada — metodologia + limitações —
  junto). Implementa na tela exatamente a correção crítica da sessão
  anterior; nunca uma caixa aparece sem a outra quando o cálculo chega
  até essa etapa.
- **Teste com PDF real (não texto sintético):** `tests/fixtures-pdf/
  cnis_sintetico_teste.pdf`, gerado com `reportlab` (texto real embutido
  no PDF, não uma string JS) — confirmado com `pdftotext` que a extração
  preserva a estrutura de linhas esperada pelos extratores.
  `tests/teste-e2e-pdf-real-previdenciario.js`: mesma técnica já usada e
  documentada em `teste-e2e-pdf-real.js` (desapropriação) — texto extraído
  do PDF real via `pdftotext` (poppler-utils) por não haver acesso à
  internet neste ambiente de teste para o pdf.js baixar do CDN — mas a
  partir daí, `processarPdfsPrevidenciario()` REAL roda sem nenhuma
  alteração num Chromium de verdade, clicando nos elementos da tela real
  (preenche competência/sexo/idade, clica "Calcular"), e as asserções
  conferem o DOM final: vínculo/remunerações extraídos do PDF real nas
  tabelas, a caixa de RMI teórica com o aviso, e a caixa de elegibilidade
  mostrando "❌ Não elegível" com as pendências — a correção crítica da
  sessão anterior, provada na tela real, não só em teste de módulo.
  `buscarSerieBcbComCache` também dublada (mesma série INPC sintética dos
  outros testes), única outra dependência de rede.

**Registro de carregamento:** `index.html`/`sw.js` (1 arquivo JS novo,
depois de `motorRMIDoHistorico.js`; `CACHE_NAME` v19). `package.json` (1
teste novo, junto ao grupo de testes de PDF real).

**Prova de regressão:** `tests/teste-e2e-pdf-real-previdenciario.js`
(9/9 — 8 conferindo o pipeline PDF real → tela, 1 confirmando ausência de
erro de JavaScript real — `pageerror`, não mensagens de console de rede,
mesmo critério já usado em `teste-e2e-navegador-fluxo-completo.js`),
`npm test` completo — mesma baseline + 9, `exit 0` (728 `OK` no log
completo, 0 falhas reais; TODOS os testes já existentes, inclusive os 24
E2E reais em Chromium da desapropriação, continuam passando sem nenhuma
alteração — a nova seção HTML foi adicionada ao final do `<body>`, IDs
próprios, sem tocar em nenhum elemento existente).

## Próxima decisão em aberto

O pipeline previdenciário agora tem uma tela de verdade, ponta a ponta,
com prova em PDF real. As mesmas opções de expansão de sempre continuam
válidas — PPP, CTPS, carta de concessão, classificar tipo de vínculo — e
mais uma fica evidente depois desta entrega: a UI previdenciária hoje
convive na mesma página da desapropriação (duas calculadoras, um
`index.html`); se o uso real pedir, separar em páginas/rotas distintas é
uma decisão de produto a avaliar, não algo decidido nesta entrega.

---

## Atualização 20 — tela de auditoria do cálculo, com proveniência clicável até o PDF

**Pedido do usuário:** um card-resumo (Segurado, DER, tempo de
contribuição, carência, salário de benefício, RMI teórica, elegibilidade,
cada um com um indicador de status) e, a partir de qualquer número,
conseguir chegar até `PDF -> página -> competência -> remuneração
extraída -> índice aplicado -> valor atualizado`.

**O que foi feito (só UI, nenhum motor/cálculo novo):**
- **Nome do segurado**: novo campo `prevNomeSegurado` no painel de
  parâmetros. Ao calcular, `HistoricoPrevidenciario.montarHistorico()` é
  chamado de novo com `entrada.segurado.nome` preenchido — reaproveita a
  MESMA função pura já existente (Atualização 16), sobre os MESMOS
  candidatos já extraídos (não repete a extração do PDF).
- **Card de auditoria** (`.prev-auditoria`, topo de `#prevResultado`):
  cabeçalho com segurado + DER, e uma linha por indicador (tempo de
  contribuição, carência, salário de benefício, RMI teórica,
  elegibilidade), cada uma com um ícone de status (✓ calculado, ⚠ não
  verificado, ✗ bloqueado/não elegível) — a linha de elegibilidade usa o
  mesmo `elegivel: true/false/null` já existente, nunca um "✓" genérico
  que esconda uma reprovação.
- **Navegação por âncora**: cada linha do card é um link (`<a href="#prevSecaoX">`)
  para a seção detalhada correspondente (`id="prevSecaoTempo"`,
  `prevSecaoSalario`, `prevSecaoRmi`, `prevSecaoElegibilidade` — carência
  aponta para a seção de elegibilidade, onde ela já é exibida com
  metodologia e limitações). CSS `:target` com uma animação de destaque
  temporário na seção, sem nenhum JavaScript de scroll — comportamento
  nativo do navegador com âncora de página.
- **Cadeia de proveniência por competência** (a peça central do pedido):
  cada linha da memória de cálculo do salário de benefício ganhou uma
  coluna com um ícone de lupa (🔍, um `<details>`) que revela a cadeia
  completa — valor atualizado → arquivo+página → competência →
  remuneração extraída (valor original) → índice aplicado (nome + fator)
  — **sem nenhuma busca nova**: todo dado já estava no objeto de memória
  de cálculo (`.competencia`, `.valorOriginal`, `.indiceUtilizado`,
  `.fatorAplicado`, `.valorAtualizado`, `.fonte`), só reorganizado como
  uma trilha legível.

**Registro de carregamento:** nenhuma mudança em `index.html`/`sw.js`
além do conteúdo de arquivos já registrados (`painelPrevidenciario.js` —
mesmo arquivo, reescrito por dentro; `index.html` — CSS novo + campo de
nome do segurado) — nenhum arquivo novo, `CACHE_NAME` continua v19.

**Prova de regressão:** `tests/teste-e2e-pdf-real-previdenciario.js`
ganhou 4 casos novos (13/13 no total) — confirma no DOM real: o card de
auditoria mostra o nome digitado e a DER formatada, as 5 linhas
esperadas (tempo/carência/salário/RMI/elegibilidade), o ícone ✗ na linha
de elegibilidade coerente com a caixa detalhada, a navegação por âncora
até `#prevSecaoSalario` funciona, e a cadeia de proveniência de uma
competência cita o arquivo PDF real, a página, a competência, o valor
original e o índice aplicado — tudo isso rastreado a partir de um PDF
real (não texto sintético), mesma disciplina da Atualização 19. `npm
test` completo — mesma baseline + 4, `exit 0` (732 `OK` no log completo,
0 falhas reais; todos os 24 E2E reais da desapropriação continuam
passando sem alteração).

## Próxima decisão em aberto (superada pela correção de identidade abaixo)

Com a tela de auditoria pronta, o domínio previdenciário tem hoje:
motores testados isoladamente, pipeline de extração real (CNIS), UI
integrada com PDF real, e agora rastreabilidade clicável de qualquer
número até a página exata do documento de origem. As mesmas opções de
expansão de sempre continuam válidas (PPP, CTPS, carta de concessão,
classificar tipo de vínculo, ou separar a UI previdenciária em página
própria) — decisão de produto, não técnica.

---

## Correção — identidade da aplicação (package.json, título, PWA)

**Achado do usuário:** a identidade de nível de APLICAÇÃO (não de uma
seção específica) continuava apresentando o projeto só como
desapropriação, mesmo com o domínio previdenciário já entregue e
integrado — `package.json` (`name`/`description`), `<title>` da página,
`manifest.json` (`name`/`short_name`/`description`) e
`apple-mobile-web-app-title` (nome do app ao instalar como PWA no iOS).
O usuário classificou isso como "problema de produto, não apenas
cosmético" e pediu a correção explícita: `calculadora-previdenciaria` e
"Calculadora Previdenciária" nesses pontos.

**Corrigido (só os 4 pontos de identidade de aplicativo, checados com
grep antes para não pegar nada fora do escopo):**
- `package.json`: `name` → `calculadora-previdenciaria`; `description`
  reescrita para citar os dois domínios (o app continua servindo os
  dois — só o NOME do pacote e o título/PWA mudaram para refletir que o
  previdenciário não é mais um apêndice).
- `index.html`: `<title>` → "Calculadora Previdenciária — Duarte
  Advogados Associados"; `apple-mobile-web-app-title` → "Previdenciária".
- `manifest.json`: `name` → "Calculadora Previdenciária — Duarte
  Advogados"; `short_name` → "Previdenciária"; `description` reescrita
  para o domínio previdenciário.

**O que NÃO foi tocado (decisão consciente):** o cabeçalho da PRÓPRIA
seção de desapropriação (`practice-tag` "Direito Administrativo ·
Desapropriação e Indenizações" e `page-title` "Calculadora de
Desapropriação", linhas 649-650 de `index.html`) — esse texto descreve
corretamente o que aquela seção específica faz, ela continua sendo uma
calculadora de desapropriação de verdade; o problema apontado era a
identidade do APLICATIVO como um todo (aba do navegador, nome ao
instalar como PWA, nome do pacote), não o conteúdo de uma seção que
segue existindo e funcionando. Também não foram tocados os caminhos de
pasta/módulo (`js/domains/desapropriacao/...`) — são identificadores
internos, não identidade visível ao usuário, e renomear pastas seria um
refactor grande e arriscado, fora do que foi pedido.

**Prova de regressão:** checado com `grep` que nenhum teste depende do
texto antigo do título/manifest (só `teste-sanidade-carga.js` lê
`manifest.json`, e apenas para conferir os ícones, não o nome). `npm
test` completo — mesma baseline, `exit 0` (732 `OK`, 0 falhas reais,
inclusive os E2E reais em Chromium confirmando que o PWA/service worker
continuam funcionando com os nomes novos). `CACHE_NAME` não precisou
subir (o conteúdo do `manifest.json` não faz parte da lista de arquivos
precacheados por hash/conteúdo, só por presença do arquivo).

## Próxima decisão em aberto (superada pela Atualização 21 abaixo)

A identidade de aplicativo agora reflete o previdenciário como produto
principal, com a desapropriação continuando presente e corretamente
rotulada como sua própria seção. Se o uso real mostrar que uma identidade
neutra (não favorecendo nenhum dos dois domínios — ex.: "Duarte
Advogados — Calculadoras Jurídicas") faria mais sentido enquanto os dois
convivem na mesma página, isso é decisão de produto a avaliar depois,
não algo assumido aqui.

---

## Atualização 21 — classificação de vínculo (comum × especial), por vínculo

**Contexto:** entre as opções de expansão sempre registradas como "em
aberto" (PPP, CTPS, carta de concessão, classificar tipo de vínculo,
separar UI, identidade neutra), esta entrega escolheu "classificar tipo
de vínculo" — não por ordem de preferência arbitrária, mas porque uma
inspeção do código mostrou que o MOTOR de cálculo (`motorTempoContribuicao.js`)
já suporta integralmente `tipo: 'comum'|'especial'` e conversão de tempo
especial em comum (fatores 1,20–2,33, com o corte automático da EC
103/2019, art. 25 §2º) desde a Atualização 12 — mas nada na extração ou
na UI jamais alimentava esse suporte: `mapperPrevidenciario.js` sempre
mandava `tipo: 'comum'` para TODO vínculo, sem exceção, porque "o CNIS
por si só não informa atividade especial" (comentário já existente no
código). Era um motor testado e correto, plugado a uma fonte que nunca
lhe dava o dado que ele sabia processar. Diferente de PPP/CTPS (que
exigiriam um extrator de documento novo, formato nunca visto pelo
projeto, maior risco), fechar esse gap específico não pede nenhum
parser novo — só permitir que quem já SABE que um vínculo é especial
(por PPP em papel, laudo, sentença trabalhista — nenhum desses lido
pelo app) possa marcar isso na tela, vínculo por vínculo.

**O que foi feito:**

- **`js/domains/previdenciario/mapping/mapperPrevidenciario.js`**
  (`vinculosParaMotorTempoContribuicao`): cada candidato de vínculo pode
  agora carregar `.tipoManual` ('comum'|'especial') e, se especial,
  `.anosExposicaoManual` (15|20|25) — nunca inferidos pelo extrator de
  texto (que continua cego a isso), só preenchidos por quem chama
  (a UI). Quando presentes, têm prioridade sobre `opcoes.tipo`/
  `opcoes.anosExposicao` (que continuam existindo, aplicando-se a todos
  os vínculos sem marca individual — compatibilidade mantida, nenhum
  teste antigo do mapper precisou mudar). `.tipoManual === 'especial'`
  SEM `.anosExposicaoManual` válido (15/20/25) nunca vira especial
  silenciosamente: cai para `comum` e ganha `.avisoTipo` explicando o
  motivo — para a UI avisar em vez de aplicar um fator de conversão
  arbitrário.
- **`js/domains/previdenciario/ui/painelPrevidenciario.js`**
  (`renderizarVinculosPrev`): a coluna "Tipo" da tabela de vínculos virou
  um `<select>` por linha (Comum / Especial 15 / Especial 20 / Especial
  25) com um aviso ⚠ quando `.avisoTipo` está presente. Trocar o select
  grava a marca no candidato ORIGINAL (`v._origem` — mesma referência de
  `PREV_UI_ESTADO.candidatosVinculo`, sem clonar) e remonta
  `HistoricoPrevidenciario.montarHistorico()` a partir dos MESMOS
  candidatos já extraídos — nunca relê o PDF. Um texto fixo abaixo da
  tabela deixa explícito que o CNIS não informa isso e que a marcação é
  manual, sobre outra prova.
- **`index.html` + `painelPrevidenciario.js` (`calcularPrevidenciario`)**:
  novo checkbox "Converter tempo especial em tempo comum"
  (`#prevConverterTempoEspecial`), porque marcar um vínculo como
  especial SEM ativar a conversão é uma escolha legítima (a conversão é
  um benefício, não automática) — sem esse checkbox, a marcação ficaria
  sem efeito visível e pareceria quebrada. Passa `converterTempoEspecial`
  em `opcoes` para `calcularRMIDoHistorico()`, que já propagava `opcoes`
  inteiro até `MotorTempoContribuicao.calcularTempoContribuicao()` sem
  nenhuma mudança nessa cadeia — só faltava a UI mandar o campo.

**O que NÃO foi feito (decisão consciente, mesmo padrão de sempre):**
nenhum extrator de PPP/CTPS — a classificação continua 100% manual,
alimentada por prova que a advogada/o advogado já tem em mãos, não lida
do PDF. `calcularCarencia()` não foi alterado (continua sem diferenciar
tipo de vínculo — limitação já registrada em `motorTempoContribuicao.js`,
fora do escopo desta entrega, que era só tempo de contribuição).

**Prova de regressão:** `tests/teste-mapper-previdenciario.js` ganhou 5
casos novos (10/10) cobrindo: marca válida vira especial só naquele
vínculo (os outros continuam no padrão); marca inválida cai para comum
com `.avisoTipo` (dois cenários: `anosExposicaoManual` fora de
{15,20,25} e ausente); `.tipoManual: 'comum'` explícito vence
`opcoes.tipo: 'especial'` global; e o pipeline fechado até
`MotorTempoContribuicao` (vínculo em aberto marcado especial, com
conversão ativada, produz acréscimo de tempo > 0). `tests/teste-e2e-pdf-
real-previdenciario.js` ganhou 3 casos novos (16/16) num Chromium real
com o mesmo PDF de CNIS já usado nas Atualizações 19-20: o vínculo
extraído começa "Comum"; marcar "Especial (15 anos)" + ativar a
conversão AUMENTA o tempo de contribuição mostrado na tela auditável
(sem reler o PDF — verificado direto em `window.PREV_UI_ESTADO.
historico`); desmarcar só a conversão (mantendo a marca de especial)
volta o tempo ao valor original, provando que a conversão é opcional e
não um efeito colateral automático da marcação. `npm test` completo:
mesma baseline + 8 (740 `OK`, 0 falhas reais, exit 0) — nenhum arquivo
novo registrado em `index.html`/`sw.js` (só conteúdo de arquivos e
elementos HTML já existentes), `CACHE_NAME` não precisou subir (mesmo
critério já usado nas Atualizações 19-20).

## Próxima decisão em aberto

Motor, mapper e UI de tempo de contribuição agora processam vínculos
especiais de ponta a ponta — falta só a FONTE automática (PPP, CTPS)
para não depender de marcação manual. As mesmas opções de sempre
continuam válidas: extrator de PPP/CTPS/carta de concessão, separar a
UI previdenciária em página própria, ou identidade neutra do app —
nenhuma decidida aqui, decisão de produto a avaliar quando o uso real
pedir.
