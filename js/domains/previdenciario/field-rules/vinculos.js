/* ============================================================================
   FIELD-RULES/VINCULOS.JS (previdenciário) — cataloga a fonte preferencial
   do campo estrutural "vinculo" (empregador + período), mesmo formato de
   js/juridical-knowledge/der-pr/field-rules/<categoria>/index.js: `sources` usa os
   ids de document-types/index.js deste domínio (DOC_TIPOS_PREVIDENCIARIOS),
   nunca um id novo solto.

   ESCOPO DESTA ENTREGA: só 'cnis' está catalogado como fonte, porque é o
   único tipo documental com extrator implementado (extratorVinculosCNIS.js).
   'ctps' e 'ppp' já aparecem no dicionário (DICIONARIO_PREVIDENCIARIO.
   tipos_documento) e teriam prioridade sobre o CNIS para período anterior
   à informatização (mesma ressalva já registrada em
   dicionarioPrevidenciario.js: CTPS é "prova subsidiária... sobretudo para
   período não coberto pelo CNIS") — mas como não há ainda extrator de CTPS
   nesta entrega, `sources` fica só com 'cnis' para não prometer uma fonte
   que o pipeline ainda não sabe ler. Ver limitações no cabeçalho de
   extratorVinculosCNIS.js.

   Atualização 23: `sourceManual` acrescentado (faltava desde a criação
   deste arquivo, Atualização 14) — achado pela checagem de integridade
   nova de field-rules/index.js (validarFieldRulesPrevidenciario()).
============================================================================ */

var PREV_FIELD_RULES_VINCULOS = [
  {
    field: 'vinculo',
    sources: ['cnis'],
    preferredSource: 'cnis',
    motivo: 'O CNIS é o extrato oficial de vínculos/contribuições do segurado — prova primária de tempo de contribuição (ver DICIONARIO_PREVIDENCIARIO.siglario.CNIS).',
    conflictAction: 'review',
    sourceManual: 'lei-8213-91'
  }
];

function regraPrevidenciariaDoCampo(campo) {
  return PREV_FIELD_RULES_VINCULOS.find(function (r) { return r.field === campo; }) || null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PREV_FIELD_RULES_VINCULOS, regraPrevidenciariaDoCampo };
}
