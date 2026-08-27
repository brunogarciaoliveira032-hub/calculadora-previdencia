/* ============================================================================
   CAMPOSREVISAOIAPREVIDENCIARIO.JS — peça que faltava para
   backend/server.js poder abrir POST /api/previdenciario/ia-revisar-campos
   (ver LIMITAÇÃO HONESTA no cabeçalho de
   js/domains/previdenciario/ia/iaRevisoraPrevidenciaria.js).

   Um único lugar com (a) o catálogo CAMPO -> descrição que a ferramenta de
   revisão da IA usa para montar o schema, e (b) o system prompt do REVISOR
   (nunca do extrator — ver regra de ouro em iaRevisoraPrevidenciaria.js).

   NÃO REDIGIDO À MÃO: CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO é DERIVADO de
   DICIONARIO_PREVIDENCIARIO.campos_semanticos — mesmo padrão que
   iaRevisoraPrevidenciaria.js já usa no navegador (onde
   DICIONARIO_PREVIDENCIARIO é global). Este arquivo só precisa resolver
   esse dicionário também no Node, onde não há global de navegador — por
   isso o require() condicional abaixo (dicionarioPrevidenciario.js passou
   a exportar via module.exports nesta mesma entrega).

   ESCOPO: só backend. Este arquivo NÃO é carregado por index.html/sw.js —
   nada no lado do navegador previdenciário precisa dele hoje
   (iaRevisoraPrevidenciaria.js já deriva sua própria cópia local do
   mesmo dicionário). Existe só para backend/server.js fazer
   `require('../js/domains/previdenciario/camposRevisaoIAPrevidenciario.js')`.

   DEPENDE de: ./dicionarioPrevidenciario.js (via require no Node; via
   global DICIONARIO_PREVIDENCIARIO se algum dia for carregado num
   navegador também).
============================================================================ */

var DICIONARIO_PREVIDENCIARIO_PARA_REVISAO_IA = (typeof require === 'function')
  ? require('./dicionarioPrevidenciario.js').DICIONARIO_PREVIDENCIARIO
  : (typeof DICIONARIO_PREVIDENCIARIO !== 'undefined' ? DICIONARIO_PREVIDENCIARIO : null);

var CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO = {};
((DICIONARIO_PREVIDENCIARIO_PARA_REVISAO_IA && DICIONARIO_PREVIDENCIARIO_PARA_REVISAO_IA.campos_semanticos) || []).forEach(function (c) {
  CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO[c.campo] = c.descricao;
});

var SYSTEM_PROMPT_REVISAO_IA_PREVIDENCIARIO = 'Você é um REVISOR de dados previdenciários (RGPS/INSS) — não um extrator. Para cada campo, você recebe o VALOR JÁ PROPOSTO (decidido por decisorCampos.js a partir de candidatos extraídos de documentos reais) e o TRECHO do documento que o originou. Sua única tarefa é julgar se aquele valor está correto, olhando o trecho.\n' +
  'Use SEMPRE a ferramenta "revisar_campos" — nunca responda em texto livre.\n' +
  'Regras OBRIGATÓRIAS:\n' +
  '- Você NUNCA propõe um valor novo, corrige o valor proposto, ou preenche um campo vazio — sua saída é só um veredito sobre o que já foi proposto. Se o valor parecer errado, o veredito é "rejeitado", não uma correção.\n' +
  '- "veredito" é exatamente um de: "confirmado" (o trecho comprova claramente o valor proposto), "provavel" (o trecho é compatível, mas não é prova inequívoca — pode ser ambíguo ou depender de contexto que você não recebeu), "rejeitado" (o trecho contradiz o valor proposto, ou não tem relação com ele).\n' +
  '- "confianca_numerica" é um inteiro de 0 a 100, independente do veredito categórico — julgue caso a caso, nunca infira o número a partir do veredito.\n' +
  '- Julgue CADA campo pelo trecho DELE — não presuma que um campo está certo só porque outro parece certo.\n' +
  '- Para dataDIB/especieBeneficio/motivoIndeferimento em especial: o Direito Previdenciário brasileiro tem uma cadeia de precedência temporal entre concessão administrativa original, decisão de recurso administrativo e decisão judicial (a mais recente PODE reformar a anterior) — quando vierem "Alternativa concorrente" com datas/valores diferentes, isso não é ruído, pode ser exatamente uma reforma; julgue pelo trecho de cada uma, sem presumir automaticamente que a fonte mais comum (ex.: carta de concessão) está certa.\n' +
  '- Quando vier "Tipo de documento de onde veio: <nome>", use isso como PISTA (ex.: um valor de dataDER vindo de um "Requerimento Administrativo" é mais esperado que vindo de uma "Carta de Indeferimento") — nunca rejeite ou confirme só por causa dela, sempre julgue pelo trecho.\n' +
  '- "justificativa" deve ser curta (até 20 palavras) e apontar o que no trecho embasa o veredito.';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO, SYSTEM_PROMPT_REVISAO_IA_PREVIDENCIARIO };
}
