/* ============================================================================
   PPP.JS — Tipo documental "PPP" (Perfil Profissiográfico Previdenciário).
   Baseado em DICIONARIO_PREVIDENCIARIO.tipos_documento.ppp
   (ancoras_identificacao: "Perfil Profissiográfico Previdenciário", "PPP",
   "Agentes Nocivos", "Responsável pelos Registros Ambientais").

   Exclusão: guardado contra o cabeçalho oficial do CNIS (não deveriam
   colidir na prática, mas mantido pelo mesmo padrão defensivo dos demais
   tipos deste domínio).
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_PPP = {
  id: 'ppp',
  name: 'PPP — Perfil Profissiográfico Previdenciário',

  providesFields: ['atividadeEspecial'],

  sinaisIdentificacao: {
    fortes: [
      /perfil\s+profissiogr[áa]fico\s+previdenci[áa]rio/i,
      /\bppp\b/i
    ],
    apoio: [
      /agentes?\s+nocivos?/i,
      /respons[áa]vel\s+pelos\s+registros\s+ambientais/i,
      /respons[áa]vel\s+t[ée]cnico/i,
      /\bler\b|\bltcat\b/i
    ],
    exclusao: [
      /cadastro\s+nacional\s+de\s+informa[çc][õo]es\s+sociais/i
    ]
  },

  priority: 'high'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_PPP };
}
