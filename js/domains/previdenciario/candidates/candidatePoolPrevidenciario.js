/* ============================================================================
   CANDIDATEPOOLPREVIDENCIARIO.JS — Candidate Pool do domínio previdenciário
   (item 5 do plano). Onde se encaixa no pipeline do usuário:

     ... -> EVIDÊNCIA -> CANDIDATOS -> FIELD RULES -> DECISÃO -> ...

   PROBLEMA QUE ISTO RESOLVE: o Evidence Layer (item 4,
   evidence/evidenciaPrevidenciaria.js) já agrega toda menção de cada campo
   com proveniência ({campo, valor, documento, pagina, confiancaSemantica,
   isFontePreferencial, ...}) — mas esse formato não é o que
   js/core/decisorCampos.js (motor de decisão GENÉRICO, já existente,
   reaproveitado direto sem duplicar — não é específico de nenhum domínio)
   espera receber. `decidirCampo(candidatos,
   opcoes)` exige `{ valor, confianca, pagina: {numero, arquivo}, trecho,
   expressao? }` — este arquivo é a CONVERSÃO evidência -> candidato nesse
   formato exato, por campo, pronta pra alimentar decidirCampo() no
   próximo item (6 — Decision Engine, ainda não entregue).

   Este módulo NÃO decide nada (não chama decidirCampo) — só monta o POOL
   de candidatos, um array por campo, na forma certa. Reaproveita
   decidirCampo() do core diretamente (sem duplicar, sem sufixo
   Previdenciario) porque é mecanismo genérico — mesma lógica já aplicada
   a normalizarTexto()/js/core/indices.js/js/core/calculoPeriodos.js neste
   domínio.

   DEPENDE de (carregar antes deste arquivo):
     ../evidence/evidenciaPrevidenciaria.js (só pro schema do ledger — não
     chama nenhuma função de lá, recebe o ledger já pronto)
============================================================================ */

/**
 * Converte UMA evidência (ver evidenciaPrevidenciaria.js) pro formato de
 * candidato que js/core/decisorCampos.js espera. `trecho` usa o valor bruto
 * capturado (`valorBruto`) — é o dado mais próximo de "trecho de origem"
 * que a evidência carrega hoje; não é o parágrafo inteiro (isso exigiria
 * o texto da página completo, que o Evidence Layer não guarda por
 * evidência — ver limitação equivalente já registrada em
 * semanticMapperPrevidenciario.js sobre reconhecimento de formato).
 */
function evidenciaParaCandidatoPrevidenciario(evidencia) {
  if (!evidencia) return null;
  return {
    valor: evidencia.valor,
    confianca: typeof evidencia.confiancaSemantica === 'number' ? evidencia.confiancaSemantica : 0,
    pagina: { numero: evidencia.pagina, arquivo: evidencia.documento },
    trecho: evidencia.valorBruto || (evidencia.valor != null ? String(evidencia.valor) : ''),
    tipoDocumento: evidencia.tipoDocumento || null,
    isFontePreferencial: !!evidencia.isFontePreferencial,
    isFonteElegivel: !!evidencia.isFonteElegivel
  };
}

/**
 * Monta o pool completo a partir do ledger de evidências (item 4).
 * Devolve { porCampo: {<campo>: [candidato...]}, campos: [<campo>...] }.
 * Nunca lança erro: ledger ausente/malformado devolve pool vazio.
 */
function montarPoolDeCandidatosPrevidenciario(ledger) {
  var porCampo = {};
  if (ledger && ledger.porCampo) {
    Object.keys(ledger.porCampo).forEach(function (campo) {
      porCampo[campo] = ledger.porCampo[campo]
        .map(evidenciaParaCandidatoPrevidenciario)
        .filter(function (c) { return !!c; });
    });
  }
  return { porCampo: porCampo, campos: Object.keys(porCampo) };
}

/** Atalho: só os candidatos de UM campo (array vazio se o campo não tem pool). */
function candidatosDoCampoPrevidenciario(pool, campo) {
  if (!pool || !pool.porCampo || !pool.porCampo[campo]) return [];
  return pool.porCampo[campo].slice();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evidenciaParaCandidatoPrevidenciario, montarPoolDeCandidatosPrevidenciario,
    candidatosDoCampoPrevidenciario
  };
}
