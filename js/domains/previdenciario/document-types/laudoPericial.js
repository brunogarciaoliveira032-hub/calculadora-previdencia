/* ============================================================================
   LAUDOPERICIAL.JS — Tipo documental "Laudo Pericial" (médico ou social).
   Baseado em DICIONARIO_PREVIDENCIARIO.tipos_documento.laudoPericial
   (ancoras_identificacao: "Laudo Pericial", "Perito", "quesitos", "CID",
   "incapacidade total", "incapacidade parcial", "data de início da
   incapacidade").

   Risco já catalogado no dicionário (riscos_comuns): laudo pericial é
   OPINIÃO TÉCNICA, não decide a DIB sozinho — por isso providesFields
   aqui só inclui dataDID (a data que o perito aponta), nunca dataDIB.

   Exclusão: uma sentença costuma CITAR o laudo pericial de passagem ao
   acolher/rejeitar a conclusão do perito — sinais estruturais de sentença
   não devem, sozinhos, fazer a peça inteira pontuar como laudo.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_LAUDO_PERICIAL = {
  id: 'laudoPericial',
  name: 'Laudo Pericial (médico ou social)',

  providesFields: ['dataDID'],

  sinaisIdentificacao: {
    fortes: [
      /laudo\s+pericial/i,
      /quesitos/i,
      /data\s+de\s+in[íi]cio\s+da\s+incapacidade/i
    ],
    apoio: [
      /\bperito\b/i,
      /incapacidade\s+(total|parcial)/i,
      /\bcid\b\s*[:\-]?\s*[a-z]\d/i
    ],
    exclusao: [
      /senten[çc]a/i,
      /julgo\s+procedente/i,
      /vara\s+federal/i,
      /juizado\s+especial\s+federal/i
    ]
  },

  priority: 'medium'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_LAUDO_PERICIAL };
}
