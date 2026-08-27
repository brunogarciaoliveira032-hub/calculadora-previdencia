/* ============================================================================
   CNIS.JS — Tipo documental "CNIS" (Cadastro Nacional de Informações
   Sociais), primeiro tipo documental REAL do domínio previdenciário (até
   aqui só existia DICIONARIO_PREVIDENCIARIO.tipos_documento.cnis, que é
   conhecimento declarativo com `ancoras_identificacao` em texto solto, sem
   regex nem classificador — ver dicionarioPrevidenciario.js).

   Mesmo formato de js/juridical-knowledge/der-pr/document-types/*.js
   (sinaisIdentificacao.fortes/apoio/exclusao), mas propositalmente NÃO
   reaproveita nenhum global do der-pr (nem o nome do objeto, nem
   identificarTipoDocumento()) — ver nota de namespacing em
   document-types/index.js deste domínio.
============================================================================ */

var DOC_TIPO_PREVIDENCIARIO_CNIS = {
  id: 'cnis',
  name: 'CNIS — Cadastro Nacional de Informações Sociais',

  providesFields: ['vinculo'],

  sinaisIdentificacao: {
    fortes: [
      /cadastro\s+nacional\s+de\s+informa[çc][õo]es\s+sociais/i,
      /\bcnis\b/i,
      /extrato\s+previdenci[áa]rio/i,
      /rela[çc][ãa]o\s+de\s+v[íi]nculos(?:\s*\/?\s*contribui[çc][õo]es)?/i
    ],
    apoio: [
      /ind\.?\s*n?\.?\s*ocorr[êe]ncia/i, // "Ind. Ocorrência" — coluna típica do extrato CNIS
      /c[óo]digo\s+de\s+ocorr[êe]ncia/i,
      /remunera[çc][õo]es/i,
      /\bnit\b/i // Número de Identificação do Trabalhador
    ],
    // Uma carta de concessão ou decisão pode CITAR "consta no CNIS que..."
    // de passagem, sem ser o próprio extrato — sinais de decisão/concessão
    // não devem, sozinhos, ganhar pontuação de CNIS.
    exclusao: [
      /carta\s+de\s+concess[ãa]o/i,
      /sentença|ac[óo]rd[ãa]o/i
    ]
  },

  priority: 'high'
};
