/* ============================================================================
   DECISIONENGINEPREVIDENCIARIO.JS — Decision Engine do domínio
   previdenciário (item 6 do plano). Onde se encaixa no pipeline do
   usuário:

     ... -> CANDIDATOS -> FIELD RULES -> DECISÃO -> PREENCHIMENTO

   PROBLEMA QUE ISTO RESOLVE: o Candidate Pool (item 5,
   candidates/candidatePoolPrevidenciario.js) já monta, por campo, a lista
   de candidatos no formato que `js/core/decisorCampos.js` espera — mas
   nada ainda CHAMA `decidirCampo()` de fato pra cada campo com a regra de
   fonte preferencial certa (item 3). Este arquivo é essa fiação: formaliza
   como um módulo o que o teste da Atualização 25 já tinha provado
   manualmente (evidência -> pool -> decidirCampo() -> decisão real).

   Reaproveita `decidirCampo()` do core direto (sem duplicar — mecanismo
   genérico, mesma decisão já tomada nos itens anteriores pra
   normalizarTexto()/js/core/indices.js/js/core/calculoPeriodos.js).

   `sempreConflito` default aqui é `true` (diferente do padrão de
   decisorCampos.js) — decisão deliberada: dado jurídico/previdenciário
   nunca deve esconder um concorrente só porque o vencedor teve confiança
   um pouco maior (ver mesma cautela já registrada em field-rules/campos.js
   sobre dataDIB/especieBeneficio: `conflictAction` sempre 'review'). Quem
   chama pode desligar isso explicitamente via `opcoes.sempreConflito:
   false` se um caso de uso futuro precisar do comportamento padrão do
   core.

   DEPENDE de (carregar antes deste arquivo):
     js/core/decisorCampos.js (decidirCampo)
     ../field-rules/index.js (regraPreferenciaFontePrevidenciaria)
============================================================================ */

/**
 * Decide UM campo a partir dos candidatos já no pool (item 5). Aplica
 * sempre a regra de fonte preferencial do campo (item 3) — inerte quando o
 * campo não está catalogado em field-rules (ver
 * regraPreferenciaFontePrevidenciaria). `opcoes` é repassado direto pra
 * decidirCampo() do core, com `sempreConflito:true` como padrão
 * previdenciário (ver cabeçalho). Devolve `null` quando não há candidato
 * válido (mesmo contrato de decidirCampo()) — nunca lança erro.
 */
function decidirCampoPrevidenciario(campo, candidatos, opcoes) {
  opcoes = opcoes || {};
  var regraFonte = (typeof regraPreferenciaFontePrevidenciaria === 'function')
    ? regraPreferenciaFontePrevidenciaria(campo)
    : null;
  var regras = opcoes.regras || (regraFonte ? [regraFonte] : []);
  var opcoesFinal = Object.assign({ sempreConflito: true }, opcoes, { regras: regras });

  if (typeof decidirCampo !== 'function') return null;
  return decidirCampo(candidatos, opcoesFinal);
}

/**
 * Decide TODOS os campos do pool de uma vez. Devolve
 * { porCampo: {<campo>: decisao|null}, campos: [<campo>...] } — mesmo
 * formato de porCampo do Evidence Layer/Candidate Pool, pra manter a
 * navegação consistente entre as 3 camadas. `opcoesPorCampo` (opcional)
 * permite sobrescrever `opcoes` de decidirCampoPrevidenciario() campo a
 * campo (ex.: `{ dataDIB: { sempreConflito: false } }`).
 */
function decidirCamposPrevidenciarios(pool, opcoesPorCampo) {
  opcoesPorCampo = opcoesPorCampo || {};
  var porCampo = {};
  var campos = (pool && pool.campos) ? pool.campos.slice() : [];

  campos.forEach(function (campo) {
    var candidatos = (pool.porCampo && pool.porCampo[campo]) ? pool.porCampo[campo] : [];
    porCampo[campo] = decidirCampoPrevidenciario(campo, candidatos, opcoesPorCampo[campo]);
  });

  return { porCampo: porCampo, campos: campos };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decidirCampoPrevidenciario, decidirCamposPrevidenciarios };
}
