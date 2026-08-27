/* ============================================================================
   PROCESSOJUDICIAL.JS — Tipo documental "Processo Judicial / Sentença
   Previdenciária". Baseado em DICIONARIO_PREVIDENCIARIO.tipos_documento
   .processoJudicial (ancoras_identificacao: "Processo nº", "Autor",
   "INSS", "Instituto Nacional do Seguro Social", "Vara Federal", "Juizado
   Especial Federal", "sentença", "julgo procedente").

   Exclusão: decisaoAdministrativa.js já cobre a esfera administrativa
   (JRPS/CRPS) — sinais de junta/conselho de recursos zeram a pontuação
   aqui pra não haver dupla classificação.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_PROCESSO_JUDICIAL = {
  id: 'processoJudicial',
  name: 'Processo Judicial / Sentença Previdenciária',

  providesFields: ['dataDIB', 'especieBeneficio'],

  sinaisIdentificacao: {
    fortes: [
      /vara\s+federal/i,
      /juizado\s+especial\s+federal/i,
      /\bjef\b/i,
      /senten[çc]a/i,
      /julgo\s+procedente/i
    ],
    apoio: [
      /processo\s+n[º°o]?\.?/i,
      /institu[íi]?to\s+nacional\s+do\s+seguro\s+social/i,
      /\binss\b/i,
      /autor(a)?\s*:/i,
      /tutela\s+antecipada/i,
      /tr[âa]nsito\s+em\s+julgado/i
    ],
    exclusao: [
      /junta\s+de\s+recursos/i,
      /conselho\s+de\s+recursos/i
    ]
  },

  priority: 'high'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_PROCESSO_JUDICIAL };
}
