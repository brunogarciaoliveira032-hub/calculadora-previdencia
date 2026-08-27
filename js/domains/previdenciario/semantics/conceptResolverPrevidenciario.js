/* ============================================================================
   CONCEPTRESOLVERPREVIDENCIARIO.JS — versão previdenciária de
   js/core/semantic-mapper/conceptResolver.js (mesmo espírito: nenhuma
   função aqui decide um valor final sozinha, cada uma devolve um fato
   consultável pra semanticMapperPrevidenciario.js combinar). Duplicado
   com nomes próprios pelo mesmo motivo de namespacing dos outros arquivos
   deste domínio (identificarTermo/identificarTipoDocumento já são globais
   do der-pr, carregado na mesma página).

   LIMITAÇÃO HONESTA DESTA ENTREGA (Atualização 22, item 1 do plano —
   "conectar semantic mapper ao previdenciário"): fonteEhPreferencialPara/
   fonteEhElegivelPara do der-pr consultam field-rules/index.js (campo por
   campo, tipo documental por tipo documental — "fonte preferencial").
   O previdenciário ainda só tem field-rules para 2 campos (vinculos.js,
   contribuicoes.js — Atualização 14-15), não os 25 campos_semanticos do
   dicionário. Por isso fonteEhPreferencialParaPrevidenciario/
   fonteEhElegivelParaPrevidenciario aqui SEMPRE degradam pra `false` até
   o catálogo completo de field-rules existir (item 3 do plano) — nunca
   inventam uma resposta. Mesmo padrão defensivo `typeof fn === 'function'`
   do arquivo original: quando as funções de field-rules completo
   existirem (fonteRecomendadaParaPrevidenciario/
   fontesElegiveisParaPrevidenciario), este arquivo passa a usá-las
   automaticamente, sem precisar ser reescrito.

   DEPENDE de (globais, com fallback defensivo):
     - identificarTermoPrevidenciario()          (./termos-index.js)
     - identificarTipoDocumentoPrevidenciario(),
       tipoDocumentalPrevidenciarioPorId()       (../document-types/index.js)
     - fonteRecomendadaParaPrevidenciario(),
       fontesElegiveisParaPrevidenciario()       (ainda não existe — item 3)
============================================================================ */

function resolverConceitoPrevidenciario(textoNormalizado, categoria) {
  if (typeof identificarTermoPrevidenciario !== 'function') return null;
  return identificarTermoPrevidenciario(textoNormalizado, categoria) || null;
}

function resolverTipoDocumentoPrevidenciario(textoContexto, opcoes) {
  opcoes = opcoes || {};

  if (opcoes.tipoDocumento) {
    var conhecido = (typeof tipoDocumentalPrevidenciarioPorId === 'function')
      ? tipoDocumentalPrevidenciarioPorId(opcoes.tipoDocumento)
      : null;
    return {
      id: opcoes.tipoDocumento,
      name: conhecido ? conhecido.name : null,
      confianca: 1,
      emAmbiguidade: false,
      concorrentes: [],
      origem: 'informado'
    };
  }

  if (typeof identificarTipoDocumentoPrevidenciario !== 'function') return null;
  var resultado = identificarTipoDocumentoPrevidenciario(textoContexto, opcoes.opcoesClassificador);
  if (!resultado) return null;
  return Object.assign({ origem: 'classificado' }, resultado);
}

function fonteEhPreferencialParaPrevidenciario(campo, tipoDocumentoId) {
  if (!campo || !tipoDocumentoId) return false;
  if (typeof fonteRecomendadaParaPrevidenciario !== 'function') return false;
  return fonteRecomendadaParaPrevidenciario(campo) === tipoDocumentoId;
}

function fonteEhElegivelParaPrevidenciario(campo, tipoDocumentoId) {
  if (!campo || !tipoDocumentoId) return false;
  if (typeof fontesElegiveisParaPrevidenciario !== 'function') return false;
  return fontesElegiveisParaPrevidenciario(campo).indexOf(tipoDocumentoId) !== -1;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolverConceitoPrevidenciario, resolverTipoDocumentoPrevidenciario,
    fonteEhPreferencialParaPrevidenciario, fonteEhElegivelParaPrevidenciario
  };
}
