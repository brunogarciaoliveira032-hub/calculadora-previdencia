/* ============================================================================
   ESTRUTURATEXTOWORKER.JS — roda analisarEstrutura() (js/core/estruturaTexto.js)
   num Web Worker, fora da thread principal.

   POR QUÊ ESTE ARQUIVO E NÃO interpretadorEstrutural.js: analisarEstrutura()
   é a etapa cara (varre o texto inteiro da página com regex para achar
   parágrafo/cabeçalho/linha) e hoje é chamada, em leitorPdf.js, num
   `forEach` SÍNCRONO sobre TODAS as páginas já lidas de um PDF — sem nenhum
   yield à UI entre uma página e outra. Em documentos de dezenas de páginas
   isso é um bloco só de trabalho síncrono que trava a tela.
   construirArvoreContexto() (interpretadorEstrutural.js), por outro lado,
   já é cacheada por página (`pagina._arvoreContexto`) e opera sobre arrays
   pequenos (dezenas de parágrafos, no máximo baixas centenas) — mover ela
   pra um Worker trocaria um cálculo já barato por idas e vindas de
   mensagens entre threads, sem ganho real, e obrigaria tokenizador.js e
   classificadorExtrator.js (que a chamam de forma síncrona, por ocorrência
   de âncora encontrada no texto) a virarem assíncronos numa cascata grande.
   Por isso o Worker cobre só analisarEstrutura().

   CONTRATO DE MENSAGENS:
   → recebe: { id, textos: string[] }  (um lote — um texto por página)
   ← devolve: { id, resultados: [...] } na mesma ordem de `textos`, ou
              { id, erro: string } se algo falhar (o lado que chamou faz o
              fallback síncrono nesse caso — ver estruturaTextoAsync.js).

   DEPENDE de estruturaTexto.js, carregado aqui via importScripts com
   caminho relativo a este arquivo (js/workers/ → js/).
------------------------------------------------------------------------ */
importScripts('../estruturaTexto.js');

self.onmessage = function(evento){
  const { id, textos } = evento.data || {};
  try{
    // Cada texto é isolado num try/catch próprio: uma única página com
    // problema (entrada atípica) não deve forçar o lote inteiro a cair no
    // fallback síncrono do outro lado (estruturaTextoAsync.js) — só essa
    // página específica volta com estrutura vazia.
    const resultados = (textos || []).map(texto => {
      try{ return analisarEstrutura(texto); }
      catch(erroItem){ return { texto: '', paragrafos: [], cabecalhos: [], linhas: [] }; }
    });
    self.postMessage({ id, resultados });
  }catch(erro){
    self.postMessage({ id, erro: String(erro && erro.message || erro) });
  }
};
