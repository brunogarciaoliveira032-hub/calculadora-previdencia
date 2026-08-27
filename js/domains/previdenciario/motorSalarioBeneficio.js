/* ============================================================================
   MOTORSALARIOBENEFICIO.JS — Atualização 18, escopo fechado com o usuário:

     HistoricoPrevidenciario.contribuicoes (salários de contribuição)
       -> localizar por competência + validar (marco 07/1994, referência,
          ambiguidade)                                    [ESTE ARQUIVO]
       -> correcaoINPCPrevidenciario.js (atualização monetária)
       -> média = salário de benefício, com MEMÓRIA DE CÁLCULO completa
          por competência                                 [ESTE ARQUIVO]
       -> motorRMIDoHistorico.js encadeia com MotorRMI.calcularRMI(...)

   REGRA PERMANENTE pós-EC 103/2019 (mesma decisão já registrada em
   motorRMI.js — não a regra antiga pré-reforma nem nenhuma regra de
   transição): salário de benefício = média aritmética simples de 100%
   dos salários de contribuição a partir da competência 07/1994 (marco do
   Plano Real, Lei 8.213/91, art. 29-B), SEM descartar os 20% menores
   (isso era a regra ANTERIOR à reforma — a permanente usa todos).

   ENTRADA: o HISTÓRICO CONSOLIDADO inteiro (HistoricoPrevidenciario),
   nunca um array de remuneração solto — usa especificamente
   `historico.contribuicoes` (já deduplicado por competência pelo próprio
   HistoricoPrevidenciario, com `.ambigua` sinalizando quando havia mais
   de um lançamento de remuneração na mesma competência) e consulta
   `historico.remuneracoes` só para recuperar a fonte/página de cada
   competência na memória de cálculo.

   MEMÓRIA DE CÁLCULO (`.memoria`, um item por competência elegível):
   `competencia`, `valorOriginal`, `indiceUtilizado` (nome + série do
   Bacen), `fatorAplicado` (a razão de correção efetivamente usada),
   `valorAtualizado`, `participacaoNaMedia` (% que aquela competência
   representa na soma que forma a média) e `fonte` (array de
   {documento,pagina,arquivo} — pode ter mais de um item quando duas
   remunerações da mesma competência foram usadas via
   `opcoes.incluirAmbiguas`).

   NUNCA CALCULA COM DADO INCOMPLETO SEM AVISAR: se faltar o índice INPC
   de qualquer competência necessária, ou se alguma contribuição elegível
   estiver marcada `.ambigua` (e `opcoes.incluirAmbiguas` não foi pedido)
   ou `.possivelPendencia` (e `opcoes.incluirComPendencia` não foi
   pedido), o retorno vem com `salarioBeneficio: null` e o motivo
   explícito — nunca uma média calculada só com o que "deu certo" sem
   dizer o que ficou de fora.

   CONCOMITÂNCIA (Art. 32, Lei 8.213/91): quando o histórico tem uma
   competência com mais de um vínculo simultâneo, HistoricoPrevidenciario
   já soma os salários de contribuição e marca `.concomitante: true` —
   este arquivo NUNCA exclui essa competência por padrão (diferente de
   `.ambigua`/`.possivelPendencia`, que são problemas de qualidade de
   dado, não regra legal). A memória de cálculo carrega
   `.limitacaoTetoRgpsHistorico` para cada competência concomitante —
   ATUALIZADO (comentário corrigido pela perícia de software; estava
   desatualizado): desde a Atualização 42 (dados-historicos/tetoRgps.js)
   o teto do RGPS DA ÉPOCA já É aplicado automaticamente pelo
   HistoricoPrevidenciario sempre que a tabela cobrir a competência
   (`.aplicouTetoRgpsHistorico`); o texto de `.limitacaoTetoRgpsHistorico`
   só continua pedindo revisão manual quando a tabela não cobre a
   competência (antes de 03/1994) ou o módulo não está carregado.

   DEPENDE de (globais, carregar antes deste arquivo):
     - BCB_SERIES                                          (js/core/indices.js)
     - buscarFatoresAcumuladosINPC, fatorAplicadoINPC,
       corrigirValorPorINPC                     (correcao/correcaoINPCPrevidenciario.js)
============================================================================ */

// Marco do Plano Real (Lei 8.213/91, art. 29-B) — nenhum salário de
// contribuição anterior a esta competência entra na média da regra
// permanente.
var PREV_MARCO_PLANO_REAL = '1994-07';

/**
 * Calcula o salário de benefício a partir do histórico consolidado.
 *
 * @param {object} historico — saída de HistoricoPrevidenciario.montarHistorico()
 * @param {{competenciaReferencia:string, incluirAmbiguas?:boolean}} opcoes
 *        `competenciaReferencia` ('AAAA-MM') é OBRIGATÓRIA — normalmente o
 *        mês do DER (Data de Entrada do Requerimento); é até onde os
 *        salários de contribuição são corrigidos monetariamente.
 * @returns {Promise<{salarioBeneficio:number|null, quantidadeSalarios:number,
 *   competenciaReferencia:string, memoria?:Array<object>, ignoradas:Array<object>,
 *   origemIndice?:string, obtidoEm?:string, motivo?:string}>}
 */
async function calcularSalarioBeneficio(historico, opcoes) {
  opcoes = opcoes || {};
  var competenciaReferencia = opcoes.competenciaReferencia;
  if (!competenciaReferencia) {
    return { salarioBeneficio: null, quantidadeSalarios: 0, ignoradas: [], motivo: 'opcoes.competenciaReferencia (mês de referência da correção, ex. competência do DER) é obrigatória' };
  }

  var contribuicoes = (historico && Array.isArray(historico.contribuicoes)) ? historico.contribuicoes : [];
  var incluirAmbiguas = !!opcoes.incluirAmbiguas;
  var incluirComPendencia = !!opcoes.incluirComPendencia;

  var elegiveis = [];
  var ignoradas = [];
  contribuicoes.forEach(function (c) {
    if (!c || !c.competencia) return;
    if (c.competencia < PREV_MARCO_PLANO_REAL) {
      ignoradas.push({ contribuicao: c, motivo: 'competência anterior ao marco do Plano Real (07/1994) — Lei 8.213/91, art. 29-B' });
      return;
    }
    if (c.competencia > competenciaReferencia) {
      ignoradas.push({ contribuicao: c, motivo: 'competência posterior à competência de referência informada' });
      return;
    }
    if (c.ambigua && !incluirAmbiguas) {
      ignoradas.push({ contribuicao: c, motivo: 'competência ambígua (mais de um lançamento de remuneração) — use opcoes.incluirAmbiguas para incluir mesmo assim' });
      return;
    }
    // Concomitância REAL (Art. 32, Lei 8.213/91 — dois vínculos simultâneos
    // na mesma competência) NUNCA é excluída por padrão: é regra legal, não
    // problema de qualidade de dado (diferente de .ambigua, acima). O valor
    // já vem somado de HistoricoPrevidenciario — só segue com a limitação
    // do teto histórico anexada na memória de cálculo (ver bloco abaixo).
    if (c.possivelPendencia && !incluirComPendencia) {
      ignoradas.push({ contribuicao: c, motivo: 'competência com indício de pendência no CNIS (código de ocorrência sugere lançamento não confirmado/em análise) — use opcoes.incluirComPendencia para incluir mesmo assim' });
      return;
    }
    elegiveis.push(c);
  });

  if (elegiveis.length === 0) {
    return { salarioBeneficio: null, quantidadeSalarios: 0, competenciaReferencia: competenciaReferencia, ignoradas: ignoradas, motivo: 'nenhum salário de contribuição elegível (competência entre 07/1994 e a referência, não ambígua, sem indício de pendência) encontrado no histórico' };
  }

  var competenciaMaisAntiga = elegiveis.reduce(function (min, c) { return c.competencia < min ? c.competencia : min; }, elegiveis[0].competencia);

  if (typeof buscarFatoresAcumuladosINPC !== 'function') {
    return { salarioBeneficio: null, quantidadeSalarios: elegiveis.length, competenciaReferencia: competenciaReferencia, ignoradas: ignoradas, motivo: 'correcaoINPCPrevidenciario.js não carregado' };
  }

  var fatores = await buscarFatoresAcumuladosINPC(competenciaMaisAntiga, competenciaReferencia);
  if (fatores.faltantes && fatores.faltantes.length > 0) {
    return {
      salarioBeneficio: null,
      quantidadeSalarios: elegiveis.length,
      competenciaReferencia: competenciaReferencia,
      ignoradas: ignoradas,
      faltantesIndice: fatores.faltantes,
      motivo: (fatores.erro || 'índice INPC histórico não localizado para a(s) competência(s) necessária(s)') + ' — cálculo bloqueado, sem estimativa automática'
    };
  }

  // Mapa id->remuneração, só para poder anexar fonte/página do PDF de cada
  // competência na memória de cálculo (rastreabilidade até o documento).
  var remuneracaoPorId = {};
  (historico && Array.isArray(historico.remuneracoes) ? historico.remuneracoes : []).forEach(function (r) {
    if (r && r.id) remuneracaoPorId[r.id] = r;
  });

  var memoria = [];
  var semFator = [];
  elegiveis.forEach(function (c) {
    var fatorAplicado = fatorAplicadoINPC(c.competencia, competenciaReferencia, fatores.fatoresPorCompetencia);
    var valorAtualizado = corrigirValorPorINPC(c.valor, c.competencia, competenciaReferencia, fatores.fatoresPorCompetencia);
    if (valorAtualizado === null || fatorAplicado === null) {
      semFator.push(c);
      return;
    }
    var fontes = (c.remuneracaoIds || [])
      .map(function (id) { return remuneracaoPorId[id]; })
      .filter(Boolean)
      .map(function (r) { return r.fonte || null; })
      .filter(Boolean);

    memoria.push({
      competencia: c.competencia,
      valorOriginal: c.valor,
      indiceUtilizado: 'INPC (Bacen SGS ' + ((typeof BCB_SERIES !== 'undefined' && BCB_SERIES.inpc) || '188') + ')',
      fatorAplicado: Math.round(fatorAplicado * 1e6) / 1e6,
      valorAtualizado: valorAtualizado,
      participacaoNaMedia: null, // preenchido abaixo, depois que a soma total é conhecida
      fonte: fontes,
      contribuicaoId: c.id || null,
      // Transparência de auditoria (item 2 do checklist de melhorias):
      // nunca esconder que um valor é soma de atividades concomitantes ou
      // que carrega indício de pendência — mesmo já tendo passado pelos
      // filtros acima (só chega aqui quem foi incluído no cálculo).
      concomitante: !!c.concomitante,
      limitacaoTetoRgpsHistorico: c.concomitante ? (c.limitacaoTetoRgpsHistorico || null) : null,
      aplicouTetoRgpsHistorico: !!c.aplicouTetoRgpsHistorico,
      valorAntesDoTetoRgps: c.concomitante ? (typeof c.valorAntesDoTetoRgps === 'number' ? c.valorAntesDoTetoRgps : null) : null,
      possivelPendencia: !!c.possivelPendencia,
      codigosOcorrencia: Array.isArray(c.codigosOcorrencia) ? c.codigosOcorrencia.slice() : []
    });
  });

  if (semFator.length > 0) {
    return {
      salarioBeneficio: null,
      quantidadeSalarios: elegiveis.length,
      competenciaReferencia: competenciaReferencia,
      ignoradas: ignoradas,
      motivo: 'não foi possível corrigir ' + semFator.length + ' competência(s) elegível(is) — cálculo bloqueado'
    };
  }

  var soma = memoria.reduce(function (acc, m) { return acc + m.valorAtualizado; }, 0);
  var media = soma / memoria.length;
  memoria.forEach(function (m) {
    m.participacaoNaMedia = soma > 0 ? Math.round((m.valorAtualizado / soma) * 10000) / 100 : 0; // % com 2 casas
  });

  return {
    salarioBeneficio: Math.round(media * 100) / 100,
    quantidadeSalarios: memoria.length,
    competenciaReferencia: competenciaReferencia,
    memoria: memoria,
    ignoradas: ignoradas,
    origemIndice: fatores.origem,
    obtidoEm: fatores.obtidoEm
  };
}

var MotorSalarioBeneficio = {
  versaoModulo: '2.1.0',
  MARCO_PLANO_REAL: PREV_MARCO_PLANO_REAL,
  calcularSalarioBeneficio: calcularSalarioBeneficio
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MotorSalarioBeneficio, calcularSalarioBeneficio };
}

/* ----------------------------------------------------------------------
   O encadeamento até RMI (HistoricoPrevidenciario -> este arquivo ->
   MotorRMI) fica em js/domains/previdenciario/motorRMIDoHistorico.js —
   arquivo separado, não aqui, para este continuar só sobre salário de
   benefício (mesma disciplina de granularidade do resto do domínio:
   motorTempoContribuicao.js / motorRMI.js / motorSalarioBeneficio.js /
   motorRMIDoHistorico.js, cada um com uma responsabilidade só).
---------------------------------------------------------------------- */
