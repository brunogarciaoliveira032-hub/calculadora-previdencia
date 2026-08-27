/* ============================================================================
   FIELD-RULES/CAMPOS.JS (previdenciário) — cataloga CAMPO -> MELHOR FONTE
   pros campos_semanticos que têm MAIS DE UM tipo documental candidato
   (mesma regra de ouro do der-pr: campo com fonte única não entra aqui,
   já está coberto por `providesFields` do próprio document-types/*.js).

   COMO OS 4 CAMPOS ABAIXO FORAM ACHADOS: cruzando `providesFields` dos 9
   tipos documentais (Atualização 21) — não é lista arbitrária:
     dataDER            <- requerimentoAdministrativo, cartaIndeferimento
     dataDIB            <- cartaConcessao, decisaoAdministrativa, processoJudicial
     especieBeneficio   <- cartaConcessao, decisaoAdministrativa, processoJudicial
     motivoIndeferimento<- cartaIndeferimento, decisaoAdministrativa

   LIMITAÇÃO HONESTA (documentada explicitamente, não escondida): pra
   dataDIB/especieBeneficio o Direito Previdenciário não tem uma "fonte
   sempre vence" fixa — é uma CADEIA de precedência temporal (decisão
   judicial que julga procedente prevalece sobre decisão administrativa de
   recurso, que por sua vez prevalece sobre a concessão original SE a
   reformar — ver riscos_comuns de processoJudicial/decisaoAdministrativa
   em dicionarioPrevidenciario.js). O schema de field-rules só permite UM
   `preferredSource` estático — por isso `preferredSource` aqui é sempre o
   documento de ORIGEM mais comum (cartaConcessao), nunca presumindo que
   uma decisão recursal/judicial concorrente perde: `conflictAction` é
   SEMPRE 'review' nesses 2 campos (nunca 'auto'), exatamente pra forçar
   conferência humana quando mais de uma fonte aparecer — a escolha
   automática seria arriscar aplicar a fonte errada num caso que teve
   reforma/reversão.

   `sourceManual` aqui não é um manual único (der-pr tem "expropriation-
   manual"; previdenciário não tem um documento equivalente) — uso
   'lei-8213-91' como rótulo de citação (Lei 8.213/91, Plano de Benefícios
   da Previdência Social), mesma convenção de citar a base legal.

   DEPENDE de (carregar antes deste arquivo): nada (catálogo puro,
   `sources` usa ids de document-types/index.js deste domínio).
============================================================================ */

var PREV_FIELD_RULES_CAMPOS = [
  {
    field: 'dataDER',
    sources: ['requerimentoAdministrativo', 'cartaIndeferimento'],
    preferredSource: 'requerimentoAdministrativo',
    motivo: 'O requerimento administrativo é a origem primária da DER (data do protocolo). A carta de indeferimento apenas repete essa data ao comunicar a negativa.',
    validation: ['same_value_across_documents'],
    conflictAction: 'review',
    sourceManual: 'lei-8213-91'
  },
  {
    field: 'dataDIB',
    sources: ['cartaConcessao', 'decisaoAdministrativa', 'processoJudicial'],
    preferredSource: 'cartaConcessao',
    motivo: 'A carta de concessão é a origem mais comum da DIB. Quando há decisão de recurso administrativo ou sentença judicial no mesmo processo, a mais recente PODE prevalecer (reforma/procedência) — por isso conflictAction é sempre "review", nunca escolhida automaticamente.',
    validation: ['same_value_across_documents'],
    conflictAction: 'review',
    sourceManual: 'lei-8213-91'
  },
  {
    field: 'especieBeneficio',
    sources: ['cartaConcessao', 'decisaoAdministrativa', 'processoJudicial'],
    preferredSource: 'cartaConcessao',
    motivo: 'Mesma ressalva de dataDIB: a espécie concedida pode ser alterada por decisão de recurso ou sentença judicial — conflictAction sempre "review".',
    validation: ['same_value_across_documents'],
    conflictAction: 'review',
    sourceManual: 'lei-8213-91'
  },
  {
    field: 'motivoIndeferimento',
    sources: ['cartaIndeferimento', 'decisaoAdministrativa'],
    preferredSource: 'cartaIndeferimento',
    motivo: 'A carta de indeferimento é a origem do motivo da negativa. Uma decisão administrativa de recurso pode mantê-lo ou reformá-lo — quando reforma, o motivo da peça recursal é o que vale (ver riscos_comuns de decisaoAdministrativa).',
    validation: ['same_value_across_documents'],
    conflictAction: 'review',
    sourceManual: 'lei-8213-91'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PREV_FIELD_RULES_CAMPOS };
}
