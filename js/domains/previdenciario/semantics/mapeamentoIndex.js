/* ============================================================================
   MAPEAMENTOINDEX.JS — versão previdenciária de
   js/core/semantic-mapper/index.js: a FIAÇÃO real do item 1 do plano
   ("conectar semantic mapper ao previdenciário"). Liga:
     - um CANDIDATO de extração ({ valor, confianca, pagina, trecho, ... },
       mesmo formato já produzido por extratorVinculosCNIS.js/
       extratorRemuneracoesCNIS.js) -> mesmo candidato + `.tipoDocumento`/
       `.conceitoSemantico`/`.campoSemantico` preenchidos;
     - o TEXTO de uma página inteira -> todos os conceitos previdenciários
       encontrados nela, já mapeados.

   Nomes com sufixo Previdenciario pelo mesmo motivo de namespacing do
   resto deste domínio (mapearCandidato/mapearCandidatos/mapearPagina já
   são globais do der-pr).

   STATUS: mesmo estado honesto que js/core/semantic-mapper/index.js já
   documentava pro der-pr — a PEÇA em si está pronta e testada, mas ainda
   não é CHAMADA por nenhum extrator previdenciário real
   (extratorVinculosCNIS.js/extratorRemuneracoesCNIS.js continuam
   devolvendo candidatos sem passar por aqui). Ligar isso ao pipeline de
   extração real (decidir onde no fluxo chamar
   mapearCandidatosPrevidenciarios()) é trabalho dos itens 4/5/6 do plano
   (Evidence Layer / Candidate Pool / Decision Engine), não deste item.

   DEPENDE de (globais, carregados antes deste arquivo):
     ./normalizadorTrechoPrevidenciario.js, ./conceptResolverPrevidenciario.js,
     ./semanticMapperPrevidenciario.js
   Para mapearPaginaPrevidenciaria() funcionar, depende também (fallback:
   devolve [] se ausente) de ./termos-index.js
   (localizarConceitosPrevidenciarios, termoPrevidenciarioPorCanonico).
============================================================================ */

function mapearCandidatoPrevidenciario(candidato, opcoes) {
  if (!candidato) return candidato;
  var resultado = mapearTrechoPrevidenciario(candidato.trecho, opcoes);
  if (!resultado) return Object.assign({}, candidato);
  return Object.assign({}, candidato, {
    tipoDocumento: resultado.documentType,
    conceitoSemantico: resultado.concept,
    campoSemantico: resultado.field,
    confiancaSemantica: resultado.confidence,
    isFontePreferencial: resultado.isPreferredSource
  });
}

function mapearCandidatosPrevidenciarios(lista, opcoes) {
  return (lista || []).map(function (candidato) { return mapearCandidatoPrevidenciario(candidato, opcoes); });
}

function mapearPaginaPrevidenciaria(textoPagina, opcoes) {
  opcoes = opcoes || {};
  var textoNormalizado = normalizarTrechoSemanticoPrevidenciario(textoPagina);
  if (!textoNormalizado) return [];
  if (typeof localizarConceitosPrevidenciarios !== 'function' || typeof termoPrevidenciarioPorCanonico !== 'function') return [];

  var canonicosEncontrados = localizarConceitosPrevidenciarios(textoNormalizado, opcoes.categoria);
  var resultados = [];
  var opcoesComContexto = Object.assign({}, opcoes, {
    textoContexto: opcoes.textoContexto || textoNormalizado
  });

  canonicosEncontrados.forEach(function (canonico) {
    var termo = termoPrevidenciarioPorCanonico(canonico);
    if (!termo) return;
    var mapeado = construirResultadoSemanticoPrevidenciario(termo, textoNormalizado, opcoesComContexto);
    if (mapeado) resultados.push(mapeado);
  });

  return resultados;
}

var SemanticMapperPrevidenciario = {
  versaoModulo: '1.0.0',
  mapearTrecho: (typeof mapearTrechoPrevidenciario === 'function') ? mapearTrechoPrevidenciario : null,
  mapearCandidato: mapearCandidatoPrevidenciario,
  mapearCandidatos: mapearCandidatosPrevidenciarios,
  mapearPagina: mapearPaginaPrevidenciaria
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SemanticMapperPrevidenciario, mapearCandidatoPrevidenciario,
    mapearCandidatosPrevidenciarios, mapearPaginaPrevidenciaria
  };
}
