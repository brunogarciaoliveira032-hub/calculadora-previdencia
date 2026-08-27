/* ============================================================================
   CARTAINDEFERIMENTO.JS — Tipo documental "Carta/Comunicado de
   Indeferimento" (negativa administrativa do INSS, com motivo). Baseado em
   DICIONARIO_PREVIDENCIARIO.tipos_documento.cartaIndeferimento
   (ancoras_identificacao: "Indeferimento", "Comunicado de Decisão",
   "Benefício não concedido", "Motivo do indeferimento").

   Risco já catalogado no dicionário (riscos_comuns): um indeferimento não
   tem DIB/DIP/RMI — por isso providesFields aqui NUNCA inclui esses
   campos, só o motivo e a DER do pedido negado.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_CARTA_INDEFERIMENTO = {
  id: 'cartaIndeferimento',
  name: 'Carta/Comunicado de Indeferimento',

  providesFields: ['motivoIndeferimento', 'dataDER'],

  sinaisIdentificacao: {
    fortes: [
      /indeferimento/i,
      /benef[íi]cio\s+n[ãa]o\s+concedido/i,
      /comunicado\s+de\s+decis[ãa]o/i
    ],
    apoio: [
      /motivo\s+do\s+indeferimento/i,
      /car[êe]ncia\s+n[ãa]o\s+cumprida/i,
      /perda\s+da\s+qualidade\s+de\s+segurado/i,
      /n[ãa]o\s+foi\s+poss[íi]vel\s+conceder/i
    ],
    exclusao: [
      /carta\s+de\s+concess[ãa]o/i,
      /benef[íi]cio\s+concedido/i
    ]
  },

  priority: 'high'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_CARTA_INDEFERIMENTO };
}
