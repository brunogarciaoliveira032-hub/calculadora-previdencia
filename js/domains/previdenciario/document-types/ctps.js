/* ============================================================================
   CTPS.JS — Tipo documental "CTPS" (Carteira de Trabalho e Previdência
   Social). Mesmo formato de cnis.js (sinaisIdentificacao.fortes/apoio/
   exclusao), baseado nas âncoras já declaradas em
   DICIONARIO_PREVIDENCIARIO.tipos_documento.ctps (ancoras_identificacao:
   "Carteira de Trabalho", "CTPS", "Contrato de Trabalho", "Anotações
   Gerais") — nenhum sinal novo inventado fora do que já estava catalogado
   como conhecimento declarativo.

   Exclusão: um extrato CNIS às vezes referencia "conforme CTPS anexa" de
   passagem — sinais estruturais do CNIS (cabeçalho oficial) não devem
   pontuar como CTPS.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_CTPS = {
  id: 'ctps',
  name: 'CTPS — Carteira de Trabalho e Previdência Social',

  providesFields: ['vinculoEmpregaticio'],

  sinaisIdentificacao: {
    fortes: [
      /carteira\s+de\s+trabalho(\s+e\s+previd[êe]ncia\s+social)?/i,
      /\bctps\b/i,
      /contrato\s+de\s+trabalho/i
    ],
    apoio: [
      /anota[çc][õo]es\s+gerais/i,
      /fun[çc][ãa]o\s*:/i,
      /admiss[ãa]o\s*:/i,
      /s[ée]rie\s*\/?\s*n[º°o]?\.?\s*da\s+carteira/i
    ],
    exclusao: [
      /cadastro\s+nacional\s+de\s+informa[çc][õo]es\s+sociais/i,
      /\bcnis\b/i,
      /perfil\s+profissiogr[áa]fico\s+previdenci[áa]rio/i
    ]
  },

  priority: 'high'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOC_TIPO_PREVIDENCIARIO_CTPS };
}
