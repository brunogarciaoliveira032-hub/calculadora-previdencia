/* ============================================================================
   LOADER.JS — Carrega os arquivos reais de js/ num contexto Node `vm`,
   compartilhando o mesmo sandbox (documento fake, pdfjsLib/Tesseract mock),
   igual ao que acontece no navegador com várias tags <script> na mesma
   página. Nenhum arquivo de js/ é modificado — os testes exercitam o
   código de produção tal como ele está no zip enviado.

   Ordem de carregamento segue as dependências documentadas no topo de
   cada arquivo (util -> estruturaTexto -> normalizadorTexto ->
   classificadorExtrator -> decisorCampos -> leitorPdf) — só o núcleo
   compartilhado que sobrou após a remoção do domínio de desapropriação
   (ver ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md). `var`/`function` de nível
   superior desses arquivos ficam acessíveis como `sandbox.xxx`; `const`/
   `let`/`class` de nível superior NÃO ficam (bindings léxicos de um
   contexto vm não viram propriedade do objeto global) — para esses, use
   `sandbox.__executarNoContexto('...')`, ver o fim deste arquivo. Os
   arquivos exclusivos de
   desapropriação (sistemaConfianca, dicionarioJuridico, dicionarioSemantico,
   interpretadorEstrutural, tokenizador, indiceInvertido, extratorCandidatos,
   historicoDecisoes, inteligenciaJuridica, contextoDocumento, entidades,
   grafoRelacoes, painelConferencia) não existem mais neste projeto.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { montarSandbox } = require('./dom-stub');
const { montarMockPdfjs, montarMockTesseract } = require('./mocks-pdf-ocr');

const RAIZ_JS = path.join(__dirname, '..', 'js');

const ARQUIVOS_PIPELINE = [
  'core/util.js',
  'core/estruturaTexto.js',
  'core/estruturaTextoAsync.js', // usa analisarEstruturaEmLote em leitorPdf.js; sem `Worker` no vm do Node, cai no fallback síncrono automaticamente (ver o próprio arquivo)
  'core/normalizadorTexto.js',
  'core/classificadorExtrator.js',
  'core/decisorCampos.js',
  'core/leitorPdf.js'
];

// Cria um contexto novo e independente, com pdfjsLib/Tesseract mockados e
// todos os módulos do pipeline carregados. Cada teste deve chamar isto de
// novo (não reaproveitar entre cenários) para não vazar estado global do
// app (LEITOR_PDF_ESTADO, histórico em localStorage etc.) de um teste para
// o outro.
function carregarContextoPipeline(){
  const sandbox = montarSandbox();
  sandbox.pdfjsLib = montarMockPdfjs();
  sandbox.Tesseract = montarMockTesseract();

  const contexto = vm.createContext(sandbox);

  for(const nomeArquivo of ARQUIVOS_PIPELINE){
    const caminho = path.join(RAIZ_JS, nomeArquivo);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    // Envolve em (function(){ ... })() só para o `document.addEventListener(
    // 'DOMContentLoaded', ...)` no fim de leitorPdf.js não morrer por falta
    // de alguma variável de módulo ainda não carregada — na prática ele só
    // REGISTRA o listener, nunca é disparado nestes testes.
    const script = new vm.Script(codigo, { filename: caminho });
    script.runInContext(contexto);
  }

  // Alguns testes precisam mutar estado interno declarado com `const`/`class`
  // dentro dos scripts carregados (ex.: LEITOR_PDF_ESTADO, LeituraCanceladaError)
  // — bindings `const`/`class` de nível superior num contexto vm NÃO viram
  // propriedade do objeto global (`sandbox.NOME` fica `undefined`), mesmo
  // aparecendo em `sandbox.xxx` para tudo que é `var`/`function` (ver
  // comentário no fim deste arquivo). `__executarNoContexto(codigo)` roda uma
  // string de código DENTRO do mesmo contexto vm — resolve os bindings
  // léxicos como o próprio script faria, sem precisar mudar `const` para
  // `var` no código de produção só para o teste conseguir enxergar.
  sandbox.__executarNoContexto = codigo => vm.runInContext(codigo, contexto);

  return sandbox; // funções/consts top-level do app acessíveis como sandbox.xxx
}

module.exports = { carregarContextoPipeline, ARQUIVOS_PIPELINE };
