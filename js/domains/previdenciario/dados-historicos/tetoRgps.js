/* ============================================================================
   DADOS-HISTORICOS/TETO-RGPS.JS — série histórica versionada do teto do
   RGPS (valor máximo do salário de contribuição e do benefício), desde
   03/1994 (Plano Real). Atualização 42.

   POR QUE UM ARQUIVO ESTÁTICO (diferente do INPC, que é buscado ao vivo
   via Bacen SGS em js/core/indices.js): o teto do RGPS NÃO é uma série do
   Bacen — é fixado periodicamente por Portaria Interministerial (ou, em 3
   casos, diretamente por Emenda Constitucional) publicada no Diário
   Oficial, sem uma API pública equivalente ao SGS. Por isso a única forma
   responsável de ter esse dado é uma tabela mantida manualmente, com
   citação da norma de cada valor — exatamente o formato abaixo.

   FONTE: tabela histórica com valor e norma legal de cada teto, conferida
   em 12/08/2026 (ver tests/teste-teto-rgps-historico.js para os valores
   testados um a um). Precisa ser ATUALIZADA quando uma nova Portaria for
   publicada (normalmente em janeiro de cada ano) — ver aviso de possível
   desatualização em tetoRgpsNaCompetencia() abaixo.

   Cada entrada é o valor vigente A PARTIR da competência indicada, até a
   véspera da entrada seguinte (ordem cronológica).
============================================================================ */

// vigenciaDesde: competência (AAAA-MM) a partir da qual o valor vale.
// baseLegal: norma que fixou o valor (Portaria Interministerial, Portaria,
// Ordem de Serviço ou Emenda Constitucional, conforme o caso histórico).
// reajustePercentual: reajuste em relação ao valor anterior desta mesma
// tabela — puramente informativo (documentação/auditoria), nunca usado
// para calcular o valor (o valor em si é sempre o número já fixado pela
// norma, nunca derivado do percentual).
var TETO_RGPS_HISTORICO = Object.freeze([
  { vigenciaDesde: '1994-03', valor: 582.86, baseLegal: 'Portaria 929/1994', reajustePercentual: null },
  { vigenciaDesde: '1995-05', valor: 832.66, baseLegal: 'Portaria 2.005/1995', reajustePercentual: 42.86 },
  { vigenciaDesde: '1996-05', valor: 957.56, baseLegal: 'Portaria 3.251/1996', reajustePercentual: 15.00 },
  { vigenciaDesde: '1997-06', valor: 1031.87, baseLegal: 'Ordem de Serviço 573/1997', reajustePercentual: 7.76 },
  { vigenciaDesde: '1998-06', valor: 1081.50, baseLegal: 'Portaria 4.478/1998', reajustePercentual: 4.81 },
  { vigenciaDesde: '1998-12', valor: 1200.00, baseLegal: 'EC 20/1998', reajustePercentual: 10.96 },
  { vigenciaDesde: '1999-06', valor: 1255.32, baseLegal: 'Portaria 5.188/1999', reajustePercentual: 4.61 },
  { vigenciaDesde: '2000-06', valor: 1328.25, baseLegal: 'Portaria 6.211/2000', reajustePercentual: 5.81 },
  { vigenciaDesde: '2001-06', valor: 1430.00, baseLegal: 'Portaria 1.987/2001', reajustePercentual: 7.66 },
  { vigenciaDesde: '2002-06', valor: 1561.56, baseLegal: 'Portaria 525/2002', reajustePercentual: 9.20 },
  { vigenciaDesde: '2003-06', valor: 1869.34, baseLegal: 'Portaria 727/2003', reajustePercentual: 19.71 },
  { vigenciaDesde: '2004-01', valor: 2400.00, baseLegal: 'EC 41/2003', reajustePercentual: 28.39 },
  { vigenciaDesde: '2004-05', valor: 2508.72, baseLegal: 'Portaria 479/2004', reajustePercentual: 4.53 },
  { vigenciaDesde: '2005-05', valor: 2668.15, baseLegal: 'Portaria 822/2005', reajustePercentual: 6.36 },
  { vigenciaDesde: '2006-04', valor: 2801.56, baseLegal: 'Portaria 119/2006', reajustePercentual: 5.00 },
  { vigenciaDesde: '2007-04', valor: 2894.28, baseLegal: 'Portaria 142/2007', reajustePercentual: 3.31 },
  { vigenciaDesde: '2008-03', valor: 3038.99, baseLegal: 'Portaria Interministerial 77/2008', reajustePercentual: 5.00 },
  { vigenciaDesde: '2009-02', valor: 3218.90, baseLegal: 'Portaria Interministerial 48/2009', reajustePercentual: 5.92 },
  { vigenciaDesde: '2010-01', valor: 3467.40, baseLegal: 'Portaria 333/2010', reajustePercentual: 7.72 },
  { vigenciaDesde: '2011-01', valor: 3691.74, baseLegal: 'Portaria Interministerial 407/2011', reajustePercentual: 6.47 },
  { vigenciaDesde: '2012-01', valor: 3916.20, baseLegal: 'Portaria Interministerial 2/2012', reajustePercentual: 6.08 },
  { vigenciaDesde: '2013-01', valor: 4159.00, baseLegal: 'Portaria Interministerial 15/2013', reajustePercentual: 6.20 },
  { vigenciaDesde: '2014-01', valor: 4390.24, baseLegal: 'Portaria Interministerial 19/2014', reajustePercentual: 5.56 },
  { vigenciaDesde: '2015-01', valor: 4663.75, baseLegal: 'Portaria Interministerial 13/2015', reajustePercentual: 6.23 },
  { vigenciaDesde: '2016-01', valor: 5189.82, baseLegal: 'Portaria Interministerial 1/2016', reajustePercentual: 11.28 },
  { vigenciaDesde: '2017-01', valor: 5531.31, baseLegal: 'Portaria 8/2017', reajustePercentual: 6.58 },
  { vigenciaDesde: '2018-01', valor: 5645.80, baseLegal: 'Portaria 15/2018', reajustePercentual: 2.07 },
  { vigenciaDesde: '2019-01', valor: 5839.45, baseLegal: 'Portaria 9/2019', reajustePercentual: 3.43 },
  { vigenciaDesde: '2020-01', valor: 6101.06, baseLegal: 'Portaria 914/2020', reajustePercentual: 4.48 },
  { vigenciaDesde: '2021-01', valor: 6433.57, baseLegal: 'Portaria SEPRT/ME 477/2021', reajustePercentual: 5.45 },
  { vigenciaDesde: '2022-01', valor: 7087.22, baseLegal: 'Portaria Interministerial MTP/ME 12/2022', reajustePercentual: 10.16 },
  { vigenciaDesde: '2023-01', valor: 7507.49, baseLegal: 'Portaria Interministerial MPS/MF 26/2023', reajustePercentual: 5.93 },
  { vigenciaDesde: '2024-01', valor: 7786.02, baseLegal: 'Portaria Interministerial MPS/MF 2/2024', reajustePercentual: 3.71 },
  { vigenciaDesde: '2025-01', valor: 8157.41, baseLegal: 'Portaria Interministerial MPS/MF 6/2025', reajustePercentual: 4.77 },
  { vigenciaDesde: '2026-01', valor: 8475.55, baseLegal: 'Portaria Interministerial MPS/MF 13/2026', reajustePercentual: 3.90 }
]);

// Metadados de versionamento do arquivo em si (não da tabela de cada
// competência, que já tem sua própria norma) — para saber, ao olhar o
// arquivo, quando ele foi conferido pela última vez.
var TETO_RGPS_METADADOS = Object.freeze({
  versao: '1.0.0',
  conferidoEm: '2026-08-12',
  ultimaCompetenciaConhecida: '2026-01'
});

function _tetoRgpsValidarCompetencia(competencia) {
  if (typeof competencia !== 'string' || !/^\d{4}-\d{2}$/.test(competencia)) {
    throw new Error(`tetoRgpsNaCompetencia: competência inválida (esperado "AAAA-MM"): ${competencia}`);
  }
}

/**
 * Consulta o teto do RGPS vigente numa competência. NUNCA estima ou
 * interpola — só devolve um valor da tabela, ou null se a competência for
 * anterior à primeira entrada conhecida (03/1994).
 *
 * Para competências posteriores à última entrada conhecida, devolve o
 * último valor conhecido (é o valor legalmente vigente até que uma nova
 * Portaria seja publicada), mas marca `.possivelmenteDesatualizado:true`
 * quando a competência pedida está a mais de 13 meses da última entrada —
 * sinal de que provavelmente já existe uma Portaria mais recente ainda não
 * incorporada a este arquivo (o reajuste é tipicamente anual, em janeiro).
 *
 * @param {string} competencia - formato "AAAA-MM"
 * @returns {{valor:number, vigenciaDesde:string, baseLegal:string,
 *   possivelmenteDesatualizado:boolean}|null}
 */
function tetoRgpsNaCompetencia(competencia) {
  _tetoRgpsValidarCompetencia(competencia);

  var entradaEncontrada = null;
  for (var i = 0; i < TETO_RGPS_HISTORICO.length; i++) {
    if (TETO_RGPS_HISTORICO[i].vigenciaDesde <= competencia) {
      entradaEncontrada = TETO_RGPS_HISTORICO[i];
    } else {
      break; // tabela em ordem cronológica — pode parar assim que passar da competência
    }
  }
  if (!entradaEncontrada) return null; // competência anterior a 03/1994 — nunca estimado

  var ultimaEntrada = TETO_RGPS_HISTORICO[TETO_RGPS_HISTORICO.length - 1];
  var possivelmenteDesatualizado = false;
  if (entradaEncontrada === ultimaEntrada) {
    var mesesDesdeUltimaEntrada = _tetoRgpsMesesEntre(ultimaEntrada.vigenciaDesde, competencia);
    possivelmenteDesatualizado = mesesDesdeUltimaEntrada > 13;
  }

  return {
    valor: entradaEncontrada.valor,
    vigenciaDesde: entradaEncontrada.vigenciaDesde,
    baseLegal: entradaEncontrada.baseLegal,
    possivelmenteDesatualizado: possivelmenteDesatualizado
  };
}

function _tetoRgpsMesesEntre(competenciaInicioIso, competenciaFimIso) {
  var ini = competenciaInicioIso.split('-').map(Number);
  var fim = competenciaFimIso.split('-').map(Number);
  return (fim[0] - ini[0]) * 12 + (fim[1] - ini[1]);
}

var TetoRgpsHistorico = {
  TETO_RGPS_HISTORICO,
  TETO_RGPS_METADADOS,
  tetoRgpsNaCompetencia
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA:
     1. Tabela mantida manualmente — precisa de atualização quando uma
        nova Portaria Interministerial for publicada (normalmente em
        janeiro). O aviso `.possivelmenteDesatualizado` ajuda a notar
        quando isso pode ter acontecido, mas não substitui checagem real.
     2. Só cobre o valor NACIONAL único do teto — não cobre regras
        especiais de categorias com teto próprio (se existirem).
     3. `dados-historicos/` foi criado só com `teto-rgps/` nesta entrega —
        `salario-minimo/`, `aliquotas/` e `regras-por-periodo/` (propostos
        pelo usuário) ainda não existem; ver decisão de escopo registrada
        na resposta desta entrega. `indices/` continua intencionalmente
        NÃO duplicado aqui — INPC já é buscado ao vivo via Bacen SGS
        (js/core/indices.js), e uma cópia estática ficaria desatualizada.
---------------------------------------------------------------------- */
