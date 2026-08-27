/* ============================================================================
   MOTORRMIDOHISTORICO.JS — "Integração com RMI", agora com a CORREÇÃO
   CRÍTICA pedida pelo usuário: RMI MATEMÁTICA e BENEFÍCIO ELEGÍVEL são
   duas coisas diferentes, e este arquivo NUNCA mais devolve uma RMI sem
   dizer, ao lado, se o segurado tem ou não direito a ela.

     HistoricoPrevidenciario
            |
            v
     MotorSalarioBeneficio -> salário de benefício
            |
            v
     MotorRMI.calcularRMI() -> RMI TEÓRICA (fórmula pura: 60% + 2% por
            |                   ano excedente, aplicada ao salário de
            |                   benefício — SEM checar se o segurado
            |                   preenche os requisitos da aposentadoria)
            v
     MotorRMI.elegibilidadeRegraPermanente() -> ELEGIBILIDADE (idade
                                     mínima + tempo de contribuição mínimo
                                     + carência mínima, regra PERMANENTE
                                     do art. 19 da EC 103/2019)

   POR QUE ISSO É CRÍTICO (achado do usuário, registrado aqui para não se
   perder): o teste E2E da Atualização 18 usava um CNIS sintético de só 3
   meses de contribuição e produzia uma "RMI: R$ 599,958" sem nenhum
   aviso — matematicamente correto (é para isso que o teste serve: provar
   o encadeamento), mas se esse número fosse mostrado a alguém sem
   dizer que o segurado NÃO tem direito a essa aposentadoria (3 meses é
   muito menos que os 180 meses de carência e os 15-20 anos de tempo
   mínimo exigidos), seria uma informação enganosa apresentada como se
   fosse um resultado válido. A partir desta entrega, `.elegibilidade`
   SEMPRE acompanha `.rmiTeorica` — nunca um sem o outro.

   `MotorRMI.calcularRMI()` continua sendo só fórmula (não muda — é usado
   por quem já sabe que quer o valor teórico, ex.: simulações "quanto eu
   receberia se contribuísse mais X anos"). A checagem de elegibilidade é
   deste arquivo pra frente: quem consome `calcularRMIDoHistorico()` nunca
   recebe `.rmiTeorica` sem `.elegibilidade` ao lado.

   REGRA DE TRANSIÇÃO: NÃO IMPLEMENTADA (mesma decisão já registrada em
   motorRMI.js) — `elegibilidadeRegraPermanente()` verifica só a regra
   PERMANENTE (art. 19, EC 103/2019). Um segurado inelegível pela regra
   permanente pode ainda ter direito por alguma regra de transição (pontos,
   pedágio 50%, pedágio 100%) — isso não é verificado aqui. O campo
   `.elegibilidade.regraVerificada` deixa isso explícito no retorno, para
   nunca ser lido como "não tem direito a nenhuma aposentadoria".

   CARÊNCIA USADA NA ELEGIBILIDADE — CORRIGIDO: este arquivo NÃO escolhe
   mais entre os dois indicadores técnicos de `HistoricoPrevidenciario.
   calcularTempoEcarenciaDeHistorico()` (`carenciaAproximadaPorVinculo` /
   `carenciaPorRemuneracao`) como se um deles fosse "a carência" — nenhum
   dos dois é a regra legal (nem "quantidade de vínculos" nem
   "quantidade de remunerações > 0" é carência, ver achado do usuário).
   Usa `ValidacaoCarenciaPrevidenciaria.validarCarenciaPrevidenciaria()`
   (novo arquivo, `carencia/validacaoCarenciaPrevidenciaria.js`), que
   aplica de fato o art. 27, I e II da Lei 8.213/91 — o resultado (com
   `.metodologia` e `.limitacoes` explícitas) fica em
   `.elegibilidade.carencia`, nunca chamado de "definitivo".

   DEPENDE de (globais, carregar antes deste arquivo):
     - HistoricoPrevidenciario.calcularTempoEcarenciaDeHistorico  (historico/historicoPrevidenciario.js)
     - validarCarenciaPrevidenciaria                              (carencia/validacaoCarenciaPrevidenciaria.js)
     - calcularSalarioBeneficio                                   (motorSalarioBeneficio.js)
     - MotorRMI.calcularRMI, MotorRMI.elegibilidadeRegraPermanente (motorRMI.js)
============================================================================ */


/**
 * @param {object} historico — saída de HistoricoPrevidenciario.montarHistorico()
 * @param {{competenciaReferencia:string, incluirAmbiguas?:boolean, sexo:'homem'|'mulher',
 *          idadeAnos?:number, salarioMinimoVigente?:number, tetoRGPSVigente?:number}} opcoes
 *        `competenciaReferencia` e `sexo` são OBRIGATÓRIOS para a RMI
 *        teórica. `idadeAnos` é OBRIGATÓRIO para a checagem de
 *        elegibilidade — sem ele, `.rmiTeorica` ainda é calculada (é só
 *        fórmula, não depende de idade), mas `.elegibilidade` vem `null`
 *        com o motivo explícito, NUNCA presumida como "elegível".
 * @returns {Promise<{
 *   rmiTeorica: object|null,
 *   elegibilidade: {elegivel:boolean, pendencias:string[], regraVerificada:string,
 *                   carencia:{totalMeses:number, metodologia:string, limitacoes:string[]}}|null,
 *   salarioBeneficio: object, tempoEcarencia: object|null, motivo?: string
 * }>}
 */
async function calcularRMIDoHistorico(historico, opcoes) {
  opcoes = opcoes || {};

  var tempoEcarencia = (typeof HistoricoPrevidenciario !== 'undefined' && HistoricoPrevidenciario.calcularTempoEcarenciaDeHistorico)
    ? HistoricoPrevidenciario.calcularTempoEcarenciaDeHistorico(historico, opcoes)
    : null;

  if (typeof calcularSalarioBeneficio !== 'function') {
    return { rmiTeorica: null, elegibilidade: null, salarioBeneficio: null, tempoEcarencia: tempoEcarencia, motivo: 'motorSalarioBeneficio.js não carregado' };
  }
  var salarioBeneficio = await calcularSalarioBeneficio(historico, opcoes);

  if (salarioBeneficio.salarioBeneficio === null) {
    return {
      rmiTeorica: null,
      elegibilidade: null,
      salarioBeneficio: salarioBeneficio,
      tempoEcarencia: tempoEcarencia,
      motivo: 'salário de benefício não pôde ser calculado — ver .salarioBeneficio.motivo'
    };
  }

  if (!tempoEcarencia || !tempoEcarencia.tempoContribuicao) {
    return {
      rmiTeorica: null,
      elegibilidade: null,
      salarioBeneficio: salarioBeneficio,
      tempoEcarencia: tempoEcarencia,
      motivo: 'tempo de contribuição não pôde ser calculado a partir do histórico (sem vínculos elegíveis, ou motorTempoContribuicao.js/historicoPrevidenciario.js não carregados)'
    };
  }

  if (opcoes.sexo !== 'homem' && opcoes.sexo !== 'mulher') {
    return {
      rmiTeorica: null,
      elegibilidade: null,
      salarioBeneficio: salarioBeneficio,
      tempoEcarencia: tempoEcarencia,
      motivo: 'opcoes.sexo ("homem" ou "mulher") é obrigatório para MotorRMI.calcularRMI'
    };
  }

  if (typeof MotorRMI === 'undefined' || typeof MotorRMI.calcularRMI !== 'function') {
    return { rmiTeorica: null, elegibilidade: null, salarioBeneficio: salarioBeneficio, tempoEcarencia: tempoEcarencia, motivo: 'motorRMI.js não carregado' };
  }

  var dadosRMI = {
    salarioBeneficio: salarioBeneficio.salarioBeneficio,
    tempoContribuicao: tempoEcarencia.tempoContribuicao.tempoTotal,
    sexo: opcoes.sexo,
    salarioMinimoVigente: opcoes.salarioMinimoVigente,
    tetoRGPSVigente: opcoes.tetoRGPSVigente
  };

  var rmiTeorica;
  try {
    rmiTeorica = MotorRMI.calcularRMI(dadosRMI);
  } catch (erro) {
    return { rmiTeorica: null, elegibilidade: null, salarioBeneficio: salarioBeneficio, tempoEcarencia: tempoEcarencia, motivo: 'MotorRMI.calcularRMI: ' + erro.message };
  }

  // ---- A PARTIR DAQUI: RMI TEÓRICA JÁ CALCULADA. NUNCA DEVOLVIDA SOZINHA. ----
  // ELEGIBILIDADE (regra permanente, art. 19 EC 103/2019) — checagem
  // separada, nunca pulada silenciosamente. Carência apurada pela camada
  // de validação previdenciária (art. 27, I e II) — não é mais uma
  // escolha implícita entre os dois indicadores técnicos do histórico.
  var elegibilidade = null;
  if (typeof opcoes.idadeAnos !== 'number') {
    elegibilidade = {
      elegivel: null,
      pendencias: ['idade não informada (opcoes.idadeAnos) — elegibilidade não verificada, NÃO presumir elegível'],
      regraVerificada: 'permanente (art. 19, EC 103/2019)',
      carencia: null
    };
  } else if (typeof MotorRMI.elegibilidadeRegraPermanente !== 'function') {
    elegibilidade = {
      elegivel: null,
      pendencias: ['MotorRMI.elegibilidadeRegraPermanente não disponível — elegibilidade não verificada'],
      regraVerificada: 'permanente (art. 19, EC 103/2019)',
      carencia: null
    };
  } else if (typeof validarCarenciaPrevidenciaria !== 'function') {
    elegibilidade = {
      elegivel: null,
      pendencias: ['carencia/validacaoCarenciaPrevidenciaria.js não carregado — carência não apurada, elegibilidade não verificada'],
      regraVerificada: 'permanente (art. 19, EC 103/2019)',
      carencia: null
    };
  } else {
    var carencia = validarCarenciaPrevidenciaria(historico);
    var resultadoElegibilidade = MotorRMI.elegibilidadeRegraPermanente({
      idadeAnos: opcoes.idadeAnos,
      tempoContribuicao: tempoEcarencia.tempoContribuicao.tempoTotal,
      carenciaMeses: carencia.totalMeses,
      sexo: opcoes.sexo
    });
    elegibilidade = {
      elegivel: resultadoElegibilidade.elegivel,
      pendencias: resultadoElegibilidade.pendencias,
      regraVerificada: 'permanente (art. 19, EC 103/2019) — regras de TRANSIÇÃO (pontos, pedágio 50%/100%) não verificadas',
      carencia: carencia
    };
  }

  return { rmiTeorica: rmiTeorica, elegibilidade: elegibilidade, salarioBeneficio: salarioBeneficio, tempoEcarencia: tempoEcarencia };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcularRMIDoHistorico };
}
