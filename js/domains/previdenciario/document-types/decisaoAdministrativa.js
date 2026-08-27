/* ============================================================================
   DECISAOADMINISTRATIVA.JS — Tipo documental "Decisão Administrativa"
   (recurso/junta de recursos — JRPS/CRPS). Baseado em
   DICIONARIO_PREVIDENCIARIO.tipos_documento.decisaoAdministrativa
   (ancoras_identificacao: "Junta de Recursos", "Conselho de Recursos",
   "Recurso Administrativo", "mantém a decisão", "reforma a decisão").

   Exclusão: precisa se distinguir de processoJudicial.js (recurso é ainda
   esfera ADMINISTRATIVA, não judicial) — sinais de vara/juizado/sentença
   zeram a pontuação aqui.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_DECISAO_ADMINISTRATIVA = {
  id: 'decisaoAdministrativa',
  name: 'Decisão Administrativa (recurso/junta de recursos)',

  providesFields: ['dataDIB', 'especieBeneficio', 'motivoIndeferimento'],

  sinaisIdentificacao: {
    fortes: [
      /junta\s+de\s+recursos/i,
      /conselho\s+de\s+recursos/i,
      /recurso\s+administrativo/i
    ],
    apoio: [
      /mant[ée]m\s+a\s+decis[ãa]o/i,
      /reforma\s+a\s+decis[ãa]o/i,
      /\bjrps\b/i,
      /\bcrps\b/i
    ],
    exclusao: [
      /vara\s+federal/i,
      /juizado\s+especial\s+federal/i,
      /senten[çc]a/i,
      /julgo\s+procedente/i
    ]
  },

  priority: 'medium'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_DECISAO_ADMINISTRATIVA };
}
