/* ============================================================================
   CORRECAOINPCPREVIDENCIARIO.JS — fator de correção monetária mês a mês
   (INPC) para os salários de contribuição, base do salário de benefício.

   REAPROVEITA A INFRAESTRUTURA REAL já existente em js/core/indices.js
   (API do Banco Central, série SGS 188 = INPC, com cache local) — NÃO
   contém nenhuma tabela histórica de índice escrita à mão. Isso é
   deliberado: uma série de ~380 competências (07/1994 até hoje)
   transcrita de memória teria risco real de erro em pelo menos algumas
   competências, e um erro silencioso aqui contamina o salário de
   benefício e a RMI de um caso previdenciário de verdade — o mesmo
   raciocínio que já levou js/core/indices.js a BLOQUEAR o cálculo em vez
   de estimar quando falta uma competência (ver `formatarCompetenciasFaltantes`
   lá) é aplicado aqui.

   DEPENDE de (globais, carregar antes deste arquivo):
     - BCB_SERIES, buscarSerieBcbComCache, indexarPorCompetencia  (js/core/indices.js)
     - listarCompetencias, competenciaLabel                       (js/core/util.js)
   Em teste automatizado, `buscarSerieBcbComCache`/`BCB_SERIES.inpc` são
   dublados (mock) em vez de carregar js/core/indices.js de verdade —
   assim o teste roda sem rede e sem depender da API do Bacen estar no ar
   (ver tests/teste-correcao-inpc-previdenciario.js).

   CONVENÇÃO ADOTADA (registrada, não é fórmula oficial fechada do MPS —
   decisão de engenharia explícita, revisável): o fator acumulado de uma
   competência é o produto de (1 + taxa mensal do INPC) desde a
   competência mais antiga do período pedido até ELA MESMA (inclusive);
   corrigir um valor de uma competência A até uma competência de
   referência B é multiplicá-lo pela razão fatorAcumulado(B) /
   fatorAcumulado(A) — isto é, aplica a variação de A+1 até B (a variação
   do próprio mês A já está "descontada" por estar dos dois lados da
   razão). Isso corresponde à prática usual de atualização do salário de
   contribuição pelo índice do mês seguinte ao da competência até o mês
   de referência.
============================================================================ */

function _prevAnoMesDeCompetencia(competenciaAAAAMM) {
  var partes = String(competenciaAAAAMM || '').split('-');
  return { ano: parseInt(partes[0], 10), mes: parseInt(partes[1], 10) };
}

function _prevCompetenciaDeAnoMes(c) {
  return c.ano + '-' + String(c.mes).padStart(2, '0');
}

function _prevIsoPrimeiroDiaMes(competenciaAAAAMM) {
  return competenciaAAAAMM + '-01';
}

/**
 * Busca (via API do Bacen, com cache local) e acumula o fator de correção
 * mensal do INPC para cada competência entre `competenciaInicio` e
 * `competenciaFim` (inclusive, formato 'AAAA-MM'). NUNCA estima uma
 * competência ausente: se a API não tiver o índice histórico de QUALQUER
 * competência do período pedido, devolve `fatoresPorCompetencia` vazio e
 * `faltantes` preenchido — quem chama decide bloquear o cálculo (mesma
 * filosofia de js/core/indices.js).
 *
 * @param {string} competenciaInicio 'AAAA-MM'
 * @param {string} competenciaFim 'AAAA-MM'
 * @returns {Promise<{fatoresPorCompetencia:Object<string,number>, faltantes:Array<{competencia:string}>, origem:string|null, obtidoEm:string|null, erro?:string}>}
 */
async function buscarFatoresAcumuladosINPC(competenciaInicio, competenciaFim) {
  if (!competenciaInicio || !competenciaFim) {
    return { fatoresPorCompetencia: {}, faltantes: [], origem: null, obtidoEm: null };
  }
  if (competenciaInicio > competenciaFim) {
    return { fatoresPorCompetencia: {}, faltantes: [], origem: null, obtidoEm: null, erro: 'competenciaInicio posterior a competenciaFim' };
  }

  var dataIniIso = _prevIsoPrimeiroDiaMes(competenciaInicio);
  var dataFimIso = _prevIsoPrimeiroDiaMes(competenciaFim);
  var lista = listarCompetencias(dataIniIso, dataFimIso, true); // incluirMesInicial: true

  var resposta;
  try {
    resposta = await buscarSerieBcbComCache(BCB_SERIES.inpc, dataIniIso, dataFimIso);
  } catch (erro) {
    return {
      fatoresPorCompetencia: {},
      faltantes: lista.map(function (c) { return { competencia: _prevCompetenciaDeAnoMes(c) }; }),
      origem: null,
      obtidoEm: null,
      erro: 'API do Bacen indisponível (e sem cache local para este período): ' + erro.message
    };
  }

  var mapaTaxas = indexarPorCompetencia(resposta.dados); // chave 'mm/aaaa'

  var faltantes = [];
  lista.forEach(function (c) {
    if (!isFinite(mapaTaxas[competenciaLabel(c)])) faltantes.push({ competencia: _prevCompetenciaDeAnoMes(c) });
  });
  if (faltantes.length > 0) {
    // Todo-ou-nada: uma lacuna no meio da série invalidaria o acumulado de
    // toda competência posterior a ela — não é seguro devolver um fator
    // parcial calculado ignorando o mês que falta.
    return { fatoresPorCompetencia: {}, faltantes: faltantes, origem: resposta.origem, obtidoEm: resposta.obtidoEm };
  }

  var fatoresPorCompetencia = {};
  var acumulado = 1;
  lista.forEach(function (c) {
    var taxa = mapaTaxas[competenciaLabel(c)];
    acumulado *= (1 + taxa / 100);
    fatoresPorCompetencia[_prevCompetenciaDeAnoMes(c)] = acumulado;
  });

  return { fatoresPorCompetencia: fatoresPorCompetencia, faltantes: [], origem: resposta.origem, obtidoEm: resposta.obtidoEm };
}

/**
 * Fator de correção (razão entre fatores acumulados) entre uma competência
 * de origem e uma de referência — a peça que faltava para a memória de
 * cálculo poder mostrar "índice utilizado" separado do valor final, não
 * só o resultado já multiplicado. Devolve `null` (nunca um número
 * inventado) quando falta o fator de qualquer uma das duas competências.
 */
function fatorAplicadoINPC(competenciaOrigem, competenciaReferencia, fatoresPorCompetencia) {
  var mapa = fatoresPorCompetencia || {};
  var fatorOrigem = mapa[competenciaOrigem];
  var fatorReferencia = mapa[competenciaReferencia];
  if (!isFinite(fatorOrigem) || !isFinite(fatorReferencia) || fatorOrigem <= 0) return null;
  return fatorReferencia / fatorOrigem;
}

/**
 * Corrige um valor de uma competência de origem até uma competência de
 * referência, usando os fatores já acumulados por buscarFatoresAcumuladosINPC().
 * Devolve `null` (nunca um número inventado) quando falta o fator de
 * qualquer uma das duas competências no mapa fornecido. Implementado em
 * cima de fatorAplicadoINPC() — mesma conta, não duplicada.
 */
function corrigirValorPorINPC(valorOriginal, competenciaOrigem, competenciaReferencia, fatoresPorCompetencia) {
  if (!(valorOriginal >= 0)) return null;
  var fator = fatorAplicadoINPC(competenciaOrigem, competenciaReferencia, fatoresPorCompetencia);
  if (fator === null) return null;
  return valorOriginal * fator;
}

var CorrecaoINPCPrevidenciario = {
  versaoModulo: '1.1.0',
  buscarFatoresAcumuladosINPC: buscarFatoresAcumuladosINPC,
  fatorAplicadoINPC: fatorAplicadoINPC,
  corrigirValorPorINPC: corrigirValorPorINPC
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CorrecaoINPCPrevidenciario, buscarFatoresAcumuladosINPC, fatorAplicadoINPC, corrigirValorPorINPC };
}
