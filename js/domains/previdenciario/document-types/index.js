/* ============================================================================
   INDEX.JS (document-types, previdenciário) — catálogo + classificador de
   tipo documental do domínio previdenciário (pontuação por sinal
   forte/apoio, exclusão zera, teto de confiança, margem de ambiguidade).

   NAMING PRÓPRIO (identificarTipoDocumentoPrevidenciario() em vez de um
   nome genérico como identificarTipoDocumento()): já que index.html
   carrega ~68 scripts no mesmo escopo global (sem bundler, ver
   docs/ARQUITETURA-ATUAL.md), qualquer função com nome genérico correria
   risco de colidir com outro módulo carregado na mesma página — nomear
   tudo com o sufixo do domínio evita essa classe inteira de bug
   (ver tests/teste-sanidade-carga.js, que verifica isso automaticamente).
   Extrair o algoritmo comum para uma fábrica genérica em js/core/ (ex.:
   CriarClassificadorTipoDocumento) é possível no futuro, se um segundo
   domínio vier a existir; hoje só há um, não há duplicação a resolver.

   DEPENDE de (carregar antes deste arquivo): cnis.js, ctps.js,
   requerimentoAdministrativo.js, cartaConcessao.js, cartaIndeferimento.js,
   decisaoAdministrativa.js, processoJudicial.js, laudoPericial.js, ppp.js

   Atualização 21: catálogo passou de 1 para 9 tipos documentais — os 8
   novos foram construídos a partir dos ancoras_identificacao/riscos_comuns
   JÁ declarados em dicionarioPrevidenciario.js (tipos_documento), nenhum
   sinal novo foi inventado fora do que já estava catalogado como
   conhecimento declarativo do domínio.
============================================================================ */

var DOC_TIPOS_PREVIDENCIARIOS = [
  DOC_TIPO_PREVIDENCIARIO_CNIS,
  DOC_TIPO_PREVIDENCIARIO_CTPS,
  DOC_TIPO_PREVIDENCIARIO_REQUERIMENTO_ADMINISTRATIVO,
  DOC_TIPO_PREVIDENCIARIO_CARTA_CONCESSAO,
  DOC_TIPO_PREVIDENCIARIO_CARTA_INDEFERIMENTO,
  DOC_TIPO_PREVIDENCIARIO_DECISAO_ADMINISTRATIVA,
  DOC_TIPO_PREVIDENCIARIO_PROCESSO_JUDICIAL,
  DOC_TIPO_PREVIDENCIARIO_LAUDO_PERICIAL,
  DOC_TIPO_PREVIDENCIARIO_PPP
];

var PREV_PESO_SINAL_FORTE = 0.5;
var PREV_PESO_SINAL_APOIO = 0.12;
var PREV_TETO_CONFIANCA_CLASSIFICACAO = 0.95;
var PREV_MARGEM_AMBIGUIDADE_TIPO_PADRAO = 0.15;

function tipoDocumentalPrevidenciarioPorId(id) {
  return DOC_TIPOS_PREVIDENCIARIOS.find(function (t) { return t.id === id; }) || null;
}

/**
 * Varre um texto contra todos os tipos documentais previdenciários
 * catalogados. Nunca lança erro para texto vazio/ausente (devolve todos
 * com confiança 0). Mesmo contrato de classificarTipoDocumento() (der-pr).
 */
function classificarTipoDocumentoPrevidenciario(textoBruto) {
  var texto = String(textoBruto || '');
  return DOC_TIPOS_PREVIDENCIARIOS.map(function (tipo) {
    var sinais = tipo.sinaisIdentificacao || { fortes: [], apoio: [], exclusao: [] };
    var excluido = (sinais.exclusao || []).some(function (re) { return re.test(texto); });
    var fortesEncontrados = excluido ? [] : (sinais.fortes || []).filter(function (re) { return re.test(texto); });
    var apoioEncontrados = excluido ? [] : (sinais.apoio || []).filter(function (re) { return re.test(texto); });
    var confianca = excluido ? 0 : Math.min(
      PREV_TETO_CONFIANCA_CLASSIFICACAO,
      fortesEncontrados.length * PREV_PESO_SINAL_FORTE + apoioEncontrados.length * PREV_PESO_SINAL_APOIO
    );
    return {
      id: tipo.id,
      name: tipo.name,
      confianca: confianca,
      sinaisFortesEncontrados: fortesEncontrados.length,
      sinaisApoioEncontrados: apoioEncontrados.length,
      descartadoPorExclusao: excluido
    };
  }).sort(function (a, b) { return b.confianca - a.confianca; });
}

/**
 * Decide o tipo documental previdenciário de um texto, ou devolve null se
 * nenhum candidato atingiu `limiarMinimo`. Mesmo contrato de
 * identificarTipoDocumento() (der-pr): sempre reporta concorrentes com
 * confiança > 0, `emAmbiguidade` quando o 2º colocado está perto do 1º.
 */
function identificarTipoDocumentoPrevidenciario(textoBruto, opcoes) {
  opcoes = opcoes || {};
  var limiarMinimo = opcoes.limiarMinimo != null ? opcoes.limiarMinimo : 0.4;
  var margemAmbiguidade = opcoes.margemAmbiguidade != null ? opcoes.margemAmbiguidade : PREV_MARGEM_AMBIGUIDADE_TIPO_PADRAO;

  var ranking = classificarTipoDocumentoPrevidenciario(textoBruto);
  var vencedor = ranking[0];
  if (!vencedor || vencedor.confianca < limiarMinimo) return null;

  var concorrentes = ranking.slice(1).filter(function (c) { return c.confianca > 0; });
  var segundo = concorrentes[0];
  var emAmbiguidade = !!segundo && (vencedor.confianca - segundo.confianca) < margemAmbiguidade;

  return {
    id: vencedor.id,
    name: vencedor.name,
    confianca: vencedor.confianca,
    emAmbiguidade: emAmbiguidade,
    concorrentes: concorrentes
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOC_TIPOS_PREVIDENCIARIOS,
    tipoDocumentalPrevidenciarioPorId,
    classificarTipoDocumentoPrevidenciario,
    identificarTipoDocumentoPrevidenciario
  };
}
