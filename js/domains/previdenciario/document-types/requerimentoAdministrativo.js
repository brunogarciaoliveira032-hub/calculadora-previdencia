/* ============================================================================
   REQUERIMENTOADMINISTRATIVO.JS — Tipo documental "Requerimento
   Administrativo" (protocolo do pedido de benefício no INSS, fonte da
   DER). Baseado em DICIONARIO_PREVIDENCIARIO.tipos_documento
   .requerimentoAdministrativo (ancoras_identificacao: "Requerimento",
   "Protocolo", "Data de Entrada do Requerimento", "DER").

   "Requerimento" e "protocolo" sozinhos são palavras genéricas demais
   (aparecem em várias peças processuais) — por isso NÃO entram como sinal
   forte isolado; só combinações específicas do próprio requerimento do
   INSS contam como forte. "DER" isolado (3 letras) é ambíguo demais pra
   ser sinal sozinho — só conta como apoio quando aparece com dois-pontos
   ou seguido de data.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_REQUERIMENTO_ADMINISTRATIVO = {
  id: 'requerimentoAdministrativo',
  name: 'Requerimento Administrativo',

  providesFields: ['dataDER'],

  sinaisIdentificacao: {
    fortes: [
      /requerimento\s+administrativo/i,
      /data\s+de\s+entrada\s+do\s+requerimento/i,
      /protocolo\s+do\s+pedido/i
    ],
    apoio: [
      /\bder\b\s*[:\-]/i,
      /\bder\b\s*[:\-]?\s*\d{2}\/\d{2}\/\d{4}/i,
      /protocolo\s+n[º°o]?\.?/i,
      /data\s+do\s+requerimento/i
    ],
    exclusao: [
      /carta\s+de\s+concess[ãa]o/i,
      /indeferimento/i,
      /senten[çc]a|ac[óo]rd[ãa]o/i,
      /junta\s+de\s+recursos|conselho\s+de\s+recursos/i
    ]
  },

  priority: 'medium'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_REQUERIMENTO_ADMINISTRATIVO };
}
