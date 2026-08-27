/* ============================================================================
   CARTACONCESSAO.JS — Tipo documental "Carta de Concessão" (comunicação
   oficial do INSS de concessão do benefício; fonte primária de
   NB/DIB/DIP/RMI/espécie). Baseado em DICIONARIO_PREVIDENCIARIO
   .tipos_documento.cartaConcessao (ancoras_identificacao: "Carta de
   Concessão", "Concessão de Benefício", "Benefício concedido", "NB",
   "Número do Benefício").

   Exclusão: precisa se distinguir de cartaIndeferimento.js (mesma família
   de comunicado do INSS, sentido oposto) — sinal de negativa zera a
   pontuação aqui.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_CARTA_CONCESSAO = {
  id: 'cartaConcessao',
  name: 'Carta de Concessão',

  providesFields: ['numeroBeneficio', 'especieBeneficio', 'dataDIB', 'dataDIP', 'rendaMensalInicial'],

  sinaisIdentificacao: {
    fortes: [
      /carta\s+de\s+concess[ãa]o/i,
      /concess[ãa]o\s+de\s+benef[íi]cio/i,
      /benef[íi]cio\s+concedido/i
    ],
    apoio: [
      /\bnb\b\s*[:\-]/i,
      /n[úu]mero\s+do\s+benef[íi]cio/i,
      /esp[ée]cie\s*[:\-]?\s*\d{2}/i,
      /renda\s+mensal\s+inicial/i
    ],
    exclusao: [
      /indeferimento/i,
      /n[ãa]o\s+concedido/i,
      /benef[íi]cio\s+n[ãa]o\s+concedido/i
    ]
  },

  priority: 'high'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_CARTA_CONCESSAO };
}
