# Arquitetura atual — Calculadora Previdenciária (Duarte Advogados)

> Este documento descreve o sistema COMO ELE ESTÁ HOJE, em poucas páginas.
> Para o histórico de decisões (por que cada peça existe, o que foi tentado
> e descartado, a migração desde o antigo domínio de desapropriação), ver
> `docs/historico/ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md` — um diário de
> ~1700 linhas, útil como registro, não como referência do estado atual.

## Visão geral

PWA (Progressive Web App) client-side, sem framework nem bundler: cada
módulo é um arquivo `.js` carregado como `<script>` global em `index.html`,
na ordem em que aparece — todos compartilham o mesmo escopo `window`
(nenhum usa `import`/`export` de ES modules). Um backend Node/Express
mínimo (`backend/server.js`) existe só para guardar a chave da API da
Anthropic longe do navegador.

```
PDF do usuário
  → lerUmPdf() (core/leitorPdf.js)
  → identificarTipoDocumentoPrevidenciario() por página (domains/previdenciario/document-types/)
  → ramo CNIS: extrairVinculosDoTexto() / extrairRemuneracoesDoTexto()
      → HistoricoPrevidenciario.montarHistorico() → calcularRMIDoHistorico()
  → ramo "campos do processo" (dataDER, dataDIB, espécie, motivo, segurado):
      Semantic Mapper → Evidence Layer → Candidate Pool → Field Rules
      → Decision Engine → [sem conflito: auto-fill DOM │ conflito: botão
      "Revisar com IA" → POST /api/previdenciario/ia-revisar-campos]
  → telas: documentos reconhecidos, campos do processo, vínculos,
    remunerações, contribuições, resultado (RMI teórica + elegibilidade,
    sempre em caixas separadas, com proveniência até a página do PDF)
```

## Estrutura de pastas

```
index.html              — página única, ~68 <script src> em ordem de dependência
manifest.json, sw.js     — PWA (instalável, funciona offline via precache)
backend/server.js        — Express: só expõe POST /api/previdenciario/ia-revisar-campos
js/core/                 — mecanismo genérico, SEM regra de domínio previdenciário
  leitorPdf.js              leitura/OCR de PDF
  normalizadorTexto.js,     texto bruto → estrutura utilizável
  estruturaTexto*.js
  classificadorExtrator.js  roteamento genérico por tipo de conteúdo
  decisorCampos.js          mecanismo genérico de decisão (usado pelo Decision Engine)
  indices.js                séries de índices (INPC etc.)
  motorRelatorios.js        geração de relatório/auditoria, genérico
js/domains/previdenciario/ — TODA regra de domínio (RGPS/INSS) vive aqui
  dicionarioPrevidenciario.js        base de conhecimento (termos, sinônimos)
  document-types/                    reconhecimento de tipo de documento (CNIS, CTPS, PPP, laudos...)
  semantics/                         Semantic Mapper — texto de página → conceitos do domínio
  evidence/                          Evidence Layer — conceitos → evidências rastreáveis
  candidates/                        Candidate Pool — evidências → candidatos por campo
  field-rules/                       regras de qual fonte é preferencial por campo
  decision/                          Decision Engine — decide COM ou SEM conflito (nunca decide sozinho um valor em conflito)
  ia/                                ponte para revisão por IA dos campos em conflito (chama o backend)
  preenchimento/                     aplica a decisão no DOM (auto-fill)
  extraction/                        extratores especializados de tabela (CNIS: vínculos/remunerações)
  historico/                         HistoricoPrevidenciario — entidade consolidada (vínculos+remunerações+contribuições)
  motorTempoContribuicao.js,         motores de cálculo (tempo de contribuição, RMI, salário de benefício)
  motorRMI.js, motorRMIDoHistorico.js, motorSalarioBeneficio.js
  correcao/                          correção monetária (INPC)
  carencia/                          validação de carência
  regras/transicao/, regras/direitoAdquirido/  regras de transição da EC 103/2019 (pontos, idade mínima progressiva, pedágio 50/100, direito adquirido)
  beneficios/                        benefícios por incapacidade, pensão por morte, salário-maternidade, auxílio-acidente
  comparador/                        compara resultados de todas as regras aplicáveis e aponta a melhor
  validacaoFinal/                    checklist de sanidade do cálculo antes de exibir
  ui/                                camada de apresentação (ver abaixo)
tests/                    — 57 arquivos, node puro (vm sandbox) + 2 E2E reais em Chromium (Playwright) + 1 com Express real (backend/server.js)
docs/                     — este arquivo + docs/historico/ (diário completo)
```

## Camada de UI (`js/domains/previdenciario/ui/`)

Dividida em 5 arquivos (antes um único de 1811 linhas), carregados NESSA
ORDEM em `index.html`, `sw.js` e em qualquer teste que monte a UI num vm
sandbox — a ordem é a mesma documentada no topo de cada arquivo:

1. `painelPrevidenciarioEstado.js` — `PREV_UI_ESTADO` (estado global da tela) + leitura de PDF
2. `painelPrevidenciarioConferencia.js` — tabelas de conferência (documentos, campos decididos, vínculos, remunerações, contribuições)
3. `painelPrevidenciarioCalculo.js` — avalia cada regra de benefício aplicável + `calcularPrevidenciario()`
4. `painelPrevidenciarioResultado.js` — renderiza o resultado final (RMI + elegibilidade + proveniência)
5. `painelPrevidenciarioWiring.js` — só os listeners de DOM (`DOMContentLoaded`)

Cada um dos 4 primeiros expõe seu próprio `module.exports` (só com as
funções que ELE define) para os testes que usam `require()` direto;
`painelPrevidenciarioWiring.js` não exporta nada porque só registra
listeners.

## Backend (`backend/server.js`)

Único endpoint: `POST /api/previdenciario/ia-revisar-campos`. Recebe
propostas de campo em conflito, valida entrada (limites de tamanho por
campo, lista de IDs conhecidos), monta uma tool call para a API da
Anthropic (`tool_choice` forçado, sem espaço para resposta fora do
schema) e devolve só o veredito. Chave da API só existe no servidor
(`ANTHROPIC_API_KEY`, nunca no navegador). Rate limit: 30 requisições/15min.

**Disponibilidade.** Sem `ANTHROPIC_API_KEY`, o servidor sobe normalmente
(estático + cálculo funcionam) — só a rota de IA responde `503` explicando
a causa. Antes desta correção, o processo inteiro encerrava
(`process.exit(1)`) mesmo para uso 100% manual.

**Segurança/produção (todas opt-in via env var, ver `.env.example`):**
- `Content-Security-Policy` em toda resposta (`script-src` restrito a
  `'self'` + `cdnjs.cloudflare.com`, sem `'unsafe-inline'`) — mitigação
  para as 5 bibliotecas de CDN carregadas sem SRI (ver comentário em
  `index.html`: não foi possível calcular hashes SRI reais sem acesso de
  rede para baixar o binário de cada arquivo).
- `TRUST_PROXY` — necessário para o rate limit funcionar por IP real (não
  o IP do proxy) atrás de nginx/Caddy; desligado por padrão (um valor
  errado permite ao cliente forjar o IP e burlar o rate limit).
- `AI_BASIC_AUTH_USER`/`AI_BASIC_AUTH_PASS` — Basic Auth só na rota de IA,
  comparação em tempo constante. Sem autenticação de usuário por padrão —
  se exposto fora da rede interna do escritório, ainda se recomenda
  VPN/reverse-proxy com autenticação/IP allowlist na frente; isto é uma
  rede de segurança adicional, não substitui a anterior.
- **Consentimento LGPD.** O botão "Revisar campos em conflito com IA" (só
  aparece com conflito pendente — ver `painelPrevidenciarioConferencia.js`)
  vem acompanhado de um aviso + checkbox obrigatório: sem marcar
  "estou ciente e autorizo", `_prevUiRevisarConflitosComIA()` recusa a
  chamada (nenhum trecho de documento sai para a Anthropic sem
  consentimento explícito nesta tela).

## Convenções e invariantes que valem a pena preservar

- **`js/core/` nunca conhece o domínio previdenciário.** Nenhum nome de
  campo, regra de benefício ou terminologia jurídica aparece lá — só
  mecanismo reaproveitável.
- **Decision Engine nunca decide um valor em conflito sozinho.** Conflito
  sempre vai para revisão manual ou revisão por IA — nunca auto-fill
  silencioso.
- **Toda linha de dado extraído mostra proveniência** (documento + página
  + confiança), nunca só o valor.
- **Motores de cálculo (`motorRMI*.js`, `motorSalarioBeneficio.js`, regras
  de transição) nunca fazem I/O nem tocam o DOM** — recebem dados,
  devolvem resultado ou `.motivo` explicando por que não calcularam.
- **Sem bundler.** A ordem dos `<script>` em `index.html` importa; `sw.js`
  precisa precachear exatamente os mesmos arquivos. Isso é verificado
  automaticamente por `tests/teste-sanidade-carga.js` (roda em toda
  execução de `npm test`) — ele falha se algum script sumir do precache ou
  se dois arquivos declararem o mesmo identificador global.

## Testes

`npm test` roda 57 arquivos, cada um testando uma fatia (motor, regra,
integração de UI ou E2E). A maioria usa `tests/loader.js`/`vm` para
carregar os arquivos reais de `js/` num sandbox Node, do jeito que o
navegador carregaria via `<script>`. Dois testes sobem um servidor
estático e abrem `index.html` de verdade num Chromium via Playwright:
`teste-e2e-pdf-real-previdenciario.js` (PDF real de CNIS até a RMI, com
conversão de vínculo especial→comum na tela) e
`teste-e2e-fluxos-adicionais-previdenciario.js` (conflito de campos entre
documentos + confirmação manual, revisão por IA com backend mockado (o
endpoint real do app é chamado, só a chamada do servidor à Anthropic é
mockada) + guarda de consentimento LGPD, upload de arquivo inválido, os 4
benefícios da Fase 2 simultâneos + a correção do campo "número de
dependentes" fracionário, o comparador de regras de transição,
persistência de tema, e a correção de formato de data descrita no
changelog). Um terceiro, `teste-backend-server.js`, sobe o Express de
`backend/server.js` DE VERDADE (porta efêmera, sem mock) e faz requisição
HTTP real — cobre disponibilidade sem `ANTHROPIC_API_KEY`, validação de
entrada e o header CSP.

**Pular não é sucesso silencioso.** Os 2 testes Chromium pulam
(`playwright`/`pdftotext` ausentes) e o `teste-backend-server.js` pula
(`express`/`express-rate-limit`/`dotenv` ausentes) em vez de falhar — comportamento
correto pra quem clonou sem instalar essas dependências opcionais. Definir
`CI_STRICT_E2E=1` no ambiente (ver `tests/ci-strict-skip.js`) vira esses 3
pulos em falha dura — use isto num pipeline de CI que precise garantir que
as dependências foram instaladas e os testes rodaram de verdade, não só
que o script terminou com código 0.
