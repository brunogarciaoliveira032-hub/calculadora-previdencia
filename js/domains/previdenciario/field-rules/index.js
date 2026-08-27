/* ============================================================================
   FIELD-RULES/INDEX.JS (previdenciário) — agregador CAMPO -> MELHOR FONTE.
   Mesmo contrato de js/juridical-knowledge/der-pr/field-rules/index.js,
   nomes com sufixo Previdenciario pelo mesmo motivo de namespacing do
   resto deste domínio.

   FECHA O LOOP COM O ITEM 1 (semantic mapper): conceptResolverPrevidenciario.js
   já procurava por `fonteRecomendadaParaPrevidenciario`/
   `fontesElegiveisParaPrevidenciario` (com fallback defensivo, degradando
   pra `false` na ausência deles — ver Atualização 22). A partir desta
   entrega, essas duas funções existem de verdade — fonteEhPreferencialPara
   Previdenciario()/fonteEhElegivelParaPrevidenciario() do semantic mapper
   passam a responder de verdade pros 4 campos catalogados em campos.js,
   SEM precisar reescrever nada lá.

   DEPENDE de (carregar antes deste arquivo):
     field-rules/vinculos.js, field-rules/contribuicoes.js, field-rules/campos.js
   Opcionalmente (pra validarFieldRulesPrevidenciario poder conferir os ids
   de fonte contra o catálogo real): document-types/index.js
   (tipoDocumentalPrevidenciarioPorId).
============================================================================ */

var PREV_FIELD_RULES = [].concat(
  PREV_FIELD_RULES_VINCULOS.map(function (r) { return Object.assign({ category: 'vinculos' }, r); }),
  PREV_FIELD_RULES_CONTRIBUICOES.map(function (r) { return Object.assign({ category: 'contribuicoes' }, r); }),
  PREV_FIELD_RULES_CAMPOS.map(function (r) {
    var campo = (typeof campoPrevidenciarioPorNome === 'function') ? campoPrevidenciarioPorNome(r.field) : null;
    return Object.assign({ category: campo ? campo.categoria : null }, r);
  })
);

/** Retorna a regra completa de um campo (ex.: 'dataDIB'), ou null. */
function regraFonteCampoPrevidenciarioPorId(campo) {
  return PREV_FIELD_RULES.find(function (r) { return r.field === campo; }) || null;
}

/** Retorna só o id do tipo documental preferencial para um campo, ou null. */
function fonteRecomendadaParaPrevidenciario(campo) {
  var r = regraFonteCampoPrevidenciarioPorId(campo);
  return r ? r.preferredSource : null;
}

/** Retorna os ids de tipo documental aceitos como fonte para um campo (array vazio se não catalogado). */
function fontesElegiveisParaPrevidenciario(campo) {
  var r = regraFonteCampoPrevidenciarioPorId(campo);
  return r ? r.sources.slice() : [];
}

/** Retorna a lista de ids de validação a rodar quando um campo tem mais de uma fonte concorrente. */
function validacoesParaPrevidenciario(campo) {
  var r = regraFonteCampoPrevidenciarioPorId(campo);
  return r ? (r.validation || []).slice() : [];
}

/** Retorna a ação recomendada em caso de conflito ('review'|'auto'), ou null se o campo não está catalogado. */
function acaoConflitoParaPrevidenciario(campo) {
  var r = regraFonteCampoPrevidenciarioPorId(campo);
  return r ? r.conflictAction : null;
}

/** Todos os campos catalogados neste módulo (array de ids, sem duplicar). */
function todosOsCamposComRegraDeFontePrevidenciario() {
  return PREV_FIELD_RULES.map(function (r) { return r.field; });
}

/**
 * Checagem de integridade do catálogo (uso em teste, não em runtime):
 * schema completo, preferredSource dentro de sources, sem field duplicado,
 * e (se document-types/index.js estiver carregado) cada id em `sources`
 * corresponde a um tipo documental real.
 */
function validarFieldRulesPrevidenciario() {
  var problemas = [];
  var vistos = {};
  var tiposConhecidos = (typeof tipoDocumentalPrevidenciarioPorId === 'function')
    ? function (id) { return !!tipoDocumentalPrevidenciarioPorId(id); }
    : null;

  PREV_FIELD_RULES.forEach(function (r, i) {
    var onde = 'field-rules[' + i + ']' + (r.field ? ' (' + r.field + ')' : '');
    if (!r.field) problemas.push(onde + ': sem `field`.');
    if (!Array.isArray(r.sources) || !r.sources.length) problemas.push(onde + ': `sources` ausente ou vazio.');
    if (!r.preferredSource) problemas.push(onde + ': sem `preferredSource`.');
    if (Array.isArray(r.sources) && r.preferredSource && r.sources.indexOf(r.preferredSource) === -1) {
      problemas.push(onde + ': preferredSource "' + r.preferredSource + '" não está em `sources`.');
    }
    if (!r.conflictAction) problemas.push(onde + ': sem `conflictAction`.');
    if (!r.sourceManual) problemas.push(onde + ': sem `sourceManual`.');
    if (r.field) {
      if (vistos[r.field]) problemas.push(onde + ': `field` duplicado (já definido em ' + vistos[r.field] + ').');
      vistos[r.field] = onde;
    }
    if (tiposConhecidos && Array.isArray(r.sources)) {
      r.sources.forEach(function (s) {
        if (!tiposConhecidos(s)) problemas.push(onde + ': fonte "' + s + '" não existe em DOC_TIPOS_PREVIDENCIARIOS.');
      });
    }
  });

  return problemas;
}

/* ------------------------------------------------------------------------
   INTEGRAÇÃO OPCIONAL FUTURA (itens 5/6 do plano — Candidate Pool/Decision
   Engine) — mesma fábrica de regra mecânica que field-rules/index.js do
   der-pr já oferece pra decisorCampos.js. Nada aqui é chamado
   automaticamente hoje.
------------------------------------------------------------------------ */
var BONUS_FONTE_PREFERENCIAL_PREV = 0.02;

function regraPreferenciaFontePrevidenciaria(campo) {
  var preferida = fonteRecomendadaParaPrevidenciario(campo);
  return function (candidatos) {
    if (!preferida) return candidatos;
    return candidatos.map(function (c) {
      if (!c || c.tipoDocumento !== preferida) return c;
      return Object.assign({}, c, { confianca: Math.min(0.99, (c.confianca || 0) + BONUS_FONTE_PREFERENCIAL_PREV) });
    });
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PREV_FIELD_RULES, regraFonteCampoPrevidenciarioPorId, fonteRecomendadaParaPrevidenciario,
    fontesElegiveisParaPrevidenciario, validacoesParaPrevidenciario, acaoConflitoParaPrevidenciario,
    todosOsCamposComRegraDeFontePrevidenciario, validarFieldRulesPrevidenciario,
    regraPreferenciaFontePrevidenciaria
  };
}
