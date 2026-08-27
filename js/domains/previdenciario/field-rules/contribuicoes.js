/* ============================================================================
   FIELD-RULES/CONTRIBUICOES.JS (previdenciário) — cataloga a fonte
   preferencial do campo estrutural "remuneracao" (competência + valor),
   mesmo formato de field-rules/vinculos.js.

   ESCOPO DESTA ENTREGA: só 'cnis' está catalogado, mesmo motivo já
   registrado em field-rules/vinculos.js — é o único tipo documental com
   extrator implementado.

   Atualização 23: `sourceManual` acrescentado (mesmo achado de
   field-rules/vinculos.js).
============================================================================ */

var PREV_FIELD_RULES_CONTRIBUICOES = [
  {
    field: 'remuneracao',
    sources: ['cnis'],
    preferredSource: 'cnis',
    motivo: 'O CNIS é o extrato oficial de remunerações mês a mês do segurado — base para o salário de benefício.',
    conflictAction: 'review',
    sourceManual: 'lei-8213-91'
  }
];

function regraPrevidenciariaContribuicoesDoCampo(campo) {
  return PREV_FIELD_RULES_CONTRIBUICOES.find(function (r) { return r.field === campo; }) || null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PREV_FIELD_RULES_CONTRIBUICOES, regraPrevidenciariaContribuicoesDoCampo };
}
