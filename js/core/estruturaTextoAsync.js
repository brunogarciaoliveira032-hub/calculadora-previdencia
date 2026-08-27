/* ============================================================================
   ESTRUTURATEXTOASYNC.JS — expõe analisarEstruturaEmLote(textos), que roda
   analisarEstrutura() (js/core/estruturaTexto.js) num Web Worker
   (js/core/workers/estruturaTextoWorker.js) em vez de bloquear a thread
   principal, e devolve os resultados NA MESMA ORDEM de `textos`.

   USADO por leitorPdf.js no lote final de análise estrutural (uma vez por
   PDF lido, sobre todas as páginas já lidas de uma vez) — ver comentário em
   js/core/workers/estruturaTextoWorker.js sobre por que só esta função foi para
   um Worker, e não interpretadorEstrutural.js.

   FALLBACK SÍNCRONO: se `Worker` não existir no ambiente (Node, nos testes
   automatizados — ver tests/loader.js) ou se o Worker falhar ao carregar
   (ex.: navegador antigo, política de segurança bloqueando o arquivo, ou
   erro dentro do próprio estruturaTexto.js), cai de volta para chamar
   analisarEstrutura() direto, igual ao comportamento de antes desta
   melhoria — a extração continua funcionando, só sem o ganho de não travar
   a tela.
------------------------------------------------------------------------ */
let _workerEstrutura = null;
let _proximoIdLote = 1;
const _lotesPendentes = new Map(); // id -> {resolve, reject}
let _workerIndisponivel = false;

function _obterWorkerEstrutura(){
  if(_workerIndisponivel) return null;
  if(_workerEstrutura) return _workerEstrutura;
  if(typeof Worker === 'undefined') { _workerIndisponivel = true; return null; }

  try{
    _workerEstrutura = new Worker('js/core/workers/estruturaTextoWorker.js');
    _workerEstrutura.onmessage = evento => {
      const { id, resultados, erro } = evento.data || {};
      const pendente = _lotesPendentes.get(id);
      if(!pendente) return;
      _lotesPendentes.delete(id);
      if(erro) pendente.reject(new Error(erro));
      else pendente.resolve(resultados);
    };
    _workerEstrutura.onerror = () => {
      // Worker quebrou de forma irrecuperável (ex.: erro de sintaxe ao
      // carregar estruturaTexto.js via importScripts) — desiste dele para
      // o resto da sessão; próximas chamadas usam o fallback síncrono.
      _workerIndisponivel = true;
      _workerEstrutura = null;
      _lotesPendentes.forEach(p => p.reject(new Error('Worker de análise estrutural falhou')));
      _lotesPendentes.clear();
    };
  }catch(erro){
    _workerIndisponivel = true;
    return null;
  }
  return _workerEstrutura;
}

function _analisarEstruturaEmLoteSincrono(textos){
  return textos.map(texto => {
    try{ return analisarEstrutura(texto); }
    catch(erro){
      // Um texto isolado com problema (ex.: entrada atípica que a heurística
      // de parágrafo/cabeçalho não previu) não pode derrubar o lote inteiro
      // — devolve uma estrutura vazia só para essa página e segue.
      return { texto: '', paragrafos: [], cabecalhos: [], linhas: [] };
    }
  });
}

// Devolve uma Promise<resultados[]> — mesma forma de retorno de
// analisarEstrutura(), um item por texto de entrada, na mesma ordem.
function analisarEstruturaEmLote(textos){
  if(!Array.isArray(textos) || textos.length === 0) return Promise.resolve([]);

  const worker = _obterWorkerEstrutura();
  if(!worker){
    return Promise.resolve(_analisarEstruturaEmLoteSincrono(textos));
  }

  const id = _proximoIdLote++;
  return new Promise(resolve => {
    _lotesPendentes.set(id, {
      resolve,
      reject: () => {
        // Não propaga o erro pro chamador: cai pro fallback síncrono e
        // resolve com o mesmo resultado que ele teria antes desta melhoria.
        resolve(_analisarEstruturaEmLoteSincrono(textos));
      }
    });
    worker.postMessage({ id, textos });
  });
}
