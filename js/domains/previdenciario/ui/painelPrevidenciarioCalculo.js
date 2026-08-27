/* ============================================================================
   PAINEL PREVIDENCIÁRIO — dividido em 5 arquivos (Atualização 55, refactor
   sem mudança de comportamento) a partir do antigo painelPrevidenciario.js
   único (1811 linhas), seguindo as 5 seções que o próprio arquivo já
   documentava por comentário numerado. Sem bundler/ES modules no projeto:
   os 5 arquivos compartilham escopo global via <script> em sequência
   (mesmo padrão já usado por todo o resto do app) — ORDEM DE CARREGAMENTO
   IMPORTA e é sempre a mesma nos 3 lugares que listam estes arquivos:
   index.html, sw.js (precache) e cada teste que carrega a UI num vm sandbox.

     1) painelPrevidenciarioEstado.js      — PREV_UI_ESTADO + leitura de PDF
     2) painelPrevidenciarioConferencia.js — tabelas de conferência (docs,
                                              campos decididos, vínculos,
                                              remunerações, contribuições)
     3) painelPrevidenciarioCalculo.js     — regras de benefício + cálculo
     4) painelPrevidenciarioResultado.js   — renderização do resultado
     5) painelPrevidenciarioWiring.js      — listeners DOM + module.exports

   Nenhuma lógica mudou nesta divisão — é só o mesmo código movido para
   arquivos menores. Ver docs/ARQUITETURA-ATUAL.md para a arquitetura atual
   e docs/historico/ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md para o histórico
   completo do arquivo original.
============================================================================ */


/* ------------------------------------------------------------------------
   3. CÁLCULO — chama calcularRMIDoHistorico() (motorRMIDoHistorico.js),
   nenhuma fórmula nova aqui.
------------------------------------------------------------------------ */

// Regra de transição por PONTOS (EC 103/2019, art. 15) — módulo de domínio
// separado (regras/transicao/pontos.js), NÃO parte de
// calcularRMIDoHistorico()/motorRMIDoHistorico.js (que continua avaliando
// só a regra permanente, como documentado no próprio motor). Esta função
// só decide QUANDO chamar (dados mínimos disponíveis) e devolve o
// resultado pra ser anexado a `resultado.regraPontos` — não recalcula nem
// reinterpreta nada que os dois motores já decidiram. Função de módulo
// (não aninhada em calcularPrevidenciario) para poder ser testada isolada.
function avaliarRegraPontosSeAplicavel(resultado, dados) {
  if (typeof RegraTransicaoPontos === 'undefined') return undefined;
  if (!resultado || !resultado.tempoEcarencia || !resultado.tempoEcarencia.tempoContribuicao) return undefined;
  if (!resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;
  if (!resultado.elegibilidade || !resultado.elegibilidade.carencia) return undefined; // exige idade informada, igual à regra permanente
  if (!dados.sexo || !dados.competenciaReferencia) return undefined;

  var tempoTotal = resultado.tempoEcarencia.tempoContribuicao.tempoTotal;
  var carenciaMeses = resultado.elegibilidade.carencia.totalMeses;

  try {
    var elegibilidade = RegraTransicaoPontos.elegibilidadeRegraPontos({
      idadeAnos: dados.idadeAnos,
      tempoContribuicao: tempoTotal,
      carenciaMeses: carenciaMeses,
      sexo: dados.sexo,
      dataReferencia: dados.competenciaReferencia
    });
    var rmi = RegraTransicaoPontos.calcularRMIRegraPontos({
      salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
      tempoContribuicao: tempoTotal,
      sexo: dados.sexo,
      salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
      tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
    });
    return { elegibilidade: elegibilidade, rmi: rmi };
  } catch (erroPontos) {
    // Ex.: dataReferencia anterior a 2019 (regra ainda não existia no ano
    // informado) — não é um bug nem interrompe o cálculo principal (regra
    // permanente), só não mostra a caixa da regra de pontos.
    console.warn('Regra de transição por pontos não pôde ser avaliada: ' + erroPontos.message);
    return undefined;
  }
}

// Regra de transição por IDADE MÍNIMA PROGRESSIVA (EC 103/2019, art. 16)
// — mesmo espírito de avaliarRegraPontosSeAplicavel(): mesmos dados de
// entrada (idade, sexo, tempo, carência, DER), só troca o módulo de
// domínio chamado. Última das 4 regras clássicas de transição.
function avaliarRegraIdadeMinimaProgressivaSeAplicavel(resultado, dados) {
  if (typeof RegraTransicaoIdadeMinimaProgressiva === 'undefined') return undefined;
  if (!resultado || !resultado.tempoEcarencia || !resultado.tempoEcarencia.tempoContribuicao) return undefined;
  if (!resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;
  if (!resultado.elegibilidade || !resultado.elegibilidade.carencia) return undefined;
  if (!dados.sexo || !dados.competenciaReferencia) return undefined;

  var tempoTotal = resultado.tempoEcarencia.tempoContribuicao.tempoTotal;
  var carenciaMeses = resultado.elegibilidade.carencia.totalMeses;

  try {
    var elegibilidade = RegraTransicaoIdadeMinimaProgressiva.elegibilidadeIdadeMinimaProgressiva({
      idadeAnos: dados.idadeAnos,
      tempoContribuicao: tempoTotal,
      carenciaMeses: carenciaMeses,
      sexo: dados.sexo,
      dataReferencia: dados.competenciaReferencia
    });
    var rmi = RegraTransicaoIdadeMinimaProgressiva.calcularRMIIdadeMinimaProgressiva({
      salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
      tempoContribuicao: tempoTotal,
      sexo: dados.sexo,
      salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
      tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
    });
    return { elegibilidade: elegibilidade, rmi: rmi };
  } catch (erroIdadeProgressiva) {
    console.warn('Regra de transição por idade mínima progressiva não pôde ser avaliada: ' + erroIdadeProgressiva.message);
    return undefined;
  }
}

// Regra de transição por PEDÁGIO DE 50% (EC 103/2019, art. 17) — mesmo
// espírito de avaliarRegraPontosSeAplicavel(): só orquestra
// RegraTransicaoPedagio50, nunca decide nada por conta própria. Precisa de
// dados.fatorPrevidenciario (o sistema não calcula o Fator Previdenciário
// — ver limitação documentada em regras/transicao/pedagio50.js) e de
// dados.tempoContribuicaoEm13112019Anos (o app não deriva automaticamente
// o tempo até essa data a partir dos vínculos — recebido como campo
// próprio da UI, mesma decisão de escopo do fator previdenciário).
function avaliarRegraPedagio50SeAplicavel(resultado, dados) {
  if (typeof RegraTransicaoPedagio50 === 'undefined') return undefined;
  if (!resultado || !resultado.tempoEcarencia || !resultado.tempoEcarencia.tempoContribuicao) return undefined;
  if (!resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;
  if (!resultado.elegibilidade || !resultado.elegibilidade.carencia) return undefined;
  if (!dados.sexo || typeof dados.tempoContribuicaoEm13112019Anos !== 'number') return undefined;

  var tempoTotal = resultado.tempoEcarencia.tempoContribuicao.tempoTotal;
  var carenciaMeses = resultado.elegibilidade.carencia.totalMeses;

  try {
    var elegibilidade = RegraTransicaoPedagio50.elegibilidadeRegraPedagio50({
      tempoContribuicaoEm13112019: dados.tempoContribuicaoEm13112019Anos,
      tempoContribuicao: tempoTotal,
      carenciaMeses: carenciaMeses,
      sexo: dados.sexo
    });
    var rmi;
    if (typeof dados.fatorPrevidenciario === 'number' && dados.fatorPrevidenciario > 0) {
      rmi = RegraTransicaoPedagio50.calcularRMIRegraPedagio50({
        salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
        fatorPrevidenciario: dados.fatorPrevidenciario,
        salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
        tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
      });
    }
    return { elegibilidade: elegibilidade, rmi: rmi }; // rmi pode ficar undefined se o fator não foi informado
  } catch (erroPedagio50) {
    console.warn('Regra de transição por pedágio de 50% não pôde ser avaliada: ' + erroPedagio50.message);
    return undefined;
  }
}

// Regra de transição por PEDÁGIO DE 100% (EC 103/2019, art. 20) — mesmo
// padrão acima, mas sem Fator Previdenciário (RMI é 100% direto da média).
function avaliarRegraPedagio100SeAplicavel(resultado, dados) {
  if (typeof RegraTransicaoPedagio100 === 'undefined') return undefined;
  if (!resultado || !resultado.tempoEcarencia || !resultado.tempoEcarencia.tempoContribuicao) return undefined;
  if (!resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;
  if (!resultado.elegibilidade || !resultado.elegibilidade.carencia) return undefined;
  if (!dados.sexo || typeof dados.tempoContribuicaoEm13112019Anos !== 'number') return undefined;

  var tempoTotal = resultado.tempoEcarencia.tempoContribuicao.tempoTotal;
  var carenciaMeses = resultado.elegibilidade.carencia.totalMeses;

  try {
    var elegibilidade = RegraTransicaoPedagio100.elegibilidadeRegraPedagio100({
      idadeAnos: dados.idadeAnos,
      tempoContribuicaoEm13112019: dados.tempoContribuicaoEm13112019Anos,
      tempoContribuicao: tempoTotal,
      carenciaMeses: carenciaMeses,
      sexo: dados.sexo
    });
    var rmi = RegraTransicaoPedagio100.calcularRMIRegraPedagio100({
      salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
      salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
      tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
    });
    return { elegibilidade: elegibilidade, rmi: rmi };
  } catch (erroPedagio100) {
    console.warn('Regra de transição por pedágio de 100% não pôde ser avaliada: ' + erroPedagio100.message);
    return undefined;
  }
}

// Aposentadoria por INCAPACIDADE PERMANENTE (Lei 8.213/91, arts. 42/45) —
// espécie separada da aposentadoria programada, só avaliada quando o
// usuário marca "Avaliar esta espécie também" (checkbox própria, ver
// index.html) — diferente das regras de transição acima, não é avaliada
// automaticamente em todo cálculo, porque tem pré-requisitos (incapacidade
// atestada) que não fazem sentido presumir por padrão.
//
// A carência exigida (12 meses, Lei 8.213/91 art. 25, I) é DIFERENTE da
// carência da aposentadoria programada (180 meses) — por isso este módulo
// chama validarCarenciaPrevidenciaria(historico) diretamente, em vez de
// reaproveitar resultado.elegibilidade.carencia (que só existe quando
// idade foi informada, e esta espécie não exige idade).
function avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultado, historico, dados) {
  if (typeof BeneficioIncapacidadePermanente === 'undefined') return undefined;
  if (!dados.avaliar) return undefined;
  if (!resultado || !resultado.tempoEcarencia || !resultado.tempoEcarencia.tempoContribuicao) return undefined;
  if (!resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;
  if (typeof validarCarenciaPrevidenciaria !== 'function') return undefined;

  try {
    var carencia = validarCarenciaPrevidenciaria(historico);
    var elegibilidade = BeneficioIncapacidadePermanente.elegibilidadeIncapacidadePermanente({
      incapacidadeAtestada: dados.incapacidadeAtestada === true,
      carenciaMeses: carencia ? carencia.totalMeses : undefined,
      dispensaCarencia: dados.dispensaCarencia === true
    });

    var rmiParams = {
      salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
      causaAcidentaria: dados.causaAcidentaria === true,
      necessitaAssistenciaPermanente: dados.necessitaAssistenciaPermanente === true,
      salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
      tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
    };
    // O caso NÃO acidentário reaproveita MotorRMI.calcularRMI() por baixo
    // (mesma fórmula da regra permanente) — por isso precisa de sexo e
    // tempo de contribuição; o caso acidentário (100% direto) não precisa.
    if (!rmiParams.causaAcidentaria) {
      rmiParams.tempoContribuicao = resultado.tempoEcarencia.tempoContribuicao.tempoTotal;
      rmiParams.sexo = dados.sexo;
    }
    var rmi = BeneficioIncapacidadePermanente.calcularRMIIncapacidadePermanente(rmiParams);

    return { elegibilidade: elegibilidade, rmi: rmi, carencia: carencia };
  } catch (erroIncapacidade) {
    console.warn('Aposentadoria por incapacidade permanente não pôde ser avaliada: ' + erroIncapacidade.message);
    return undefined;
  }
}

// Auxílio por incapacidade temporária (Lei 8.213/91, arts. 59/61) — mesmo
// padrão de opt-in da incapacidade permanente; carência própria (12
// meses) apurada via validarCarenciaPrevidenciaria(historico) direto.
function avaliarAuxilioIncapacidadeTemporariaSeAplicavel(resultado, historico, dados) {
  if (typeof BeneficioAuxilioIncapacidadeTemporaria === 'undefined') return undefined;
  if (!dados.avaliar) return undefined;
  if (!resultado || !resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;
  if (typeof validarCarenciaPrevidenciaria !== 'function') return undefined;

  try {
    var carencia = validarCarenciaPrevidenciaria(historico);
    var elegibilidade = BeneficioAuxilioIncapacidadeTemporaria.elegibilidadeAuxilioIncapacidadeTemporaria({
      incapacidadeAtestada: dados.incapacidadeAtestada === true,
      carenciaMeses: carencia ? carencia.totalMeses : undefined,
      dispensaCarencia: dados.dispensaCarencia === true
    });
    var rmi = BeneficioAuxilioIncapacidadeTemporaria.calcularRMIAuxilioIncapacidadeTemporaria({
      salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
      salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
      tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
    });
    return { elegibilidade: elegibilidade, rmi: rmi, carencia: carencia };
  } catch (erroAuxTemp) {
    console.warn('Auxílio por incapacidade temporária não pôde ser avaliado: ' + erroAuxTemp.message);
    return undefined;
  }
}

// Auxílio-acidente (Lei 8.213/91, art. 86) — sem carência, sem idade;
// mais simples que os anteriores.
function avaliarAuxilioAcidenteSeAplicavel(resultado, dados) {
  if (typeof BeneficioAuxilioAcidente === 'undefined') return undefined;
  if (!dados.avaliar) return undefined;
  if (!resultado || !resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;

  try {
    var elegibilidade = BeneficioAuxilioAcidente.elegibilidadeAuxilioAcidente({
      sequelaComReducaoCapacidadeAtestada: dados.sequelaAtestada === true
    });
    var rmi = BeneficioAuxilioAcidente.calcularRMIAuxilioAcidente({
      salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
      salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
      tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
    });
    return { elegibilidade: elegibilidade, rmi: rmi };
  } catch (erroAuxAcidente) {
    console.warn('Auxílio-acidente não pôde ser avaliado: ' + erroAuxAcidente.message);
    return undefined;
  }
}

// Pensão por morte (Lei 8.213/91, arts. 16/74-78) — o "valor que o
// segurado recebia ou teria direito" (art. 75) é auto-calculado
// reaproveitando a MESMA fórmula da incapacidade permanente não
// acidentária (idêntica ao art. 26), a partir dos dados já calculados
// acima, A MENOS que o usuário informe manualmente que o segurado já
// estava aposentado (campo "valor que já recebia").
function avaliarPensaoPorMorteSeAplicavel(resultado, dados) {
  if (typeof BeneficioPensaoPorMorte === 'undefined') return undefined;
  if (!dados.avaliar) return undefined;
  if (typeof dados.numeroDependentes !== 'number' || dados.numeroDependentes < 1) return undefined;

  try {
    var elegibilidade = BeneficioPensaoPorMorte.elegibilidadePensaoPorMorte({
      qualidadeSeguradoFalecido: dados.qualidadeSeguradoFalecido === true,
      dependenteReconhecido: dados.dependenteReconhecido === true
    });

    var valorBaseAposentadoria = dados.valorJaRecebido;
    var origemValorBase = 'informado manualmente (segurado já aposentado)';
    if (!(typeof valorBaseAposentadoria === 'number' && valorBaseAposentadoria > 0)) {
      // Auto-cálculo: precisa dos mesmos dados que a incapacidade
      // permanente não acidentária usa (tempo de contribuição + sexo +
      // salário de benefício, já calculados no cálculo principal acima).
      if (typeof BeneficioIncapacidadePermanente === 'undefined') return undefined;
      if (!resultado || !resultado.tempoEcarencia || !resultado.tempoEcarencia.tempoContribuicao) return undefined;
      if (!resultado.salarioBeneficio || resultado.salarioBeneficio.salarioBeneficio === null) return undefined;
      if (!dados.sexo) return undefined;
      var rmiComoSeAposentado = BeneficioIncapacidadePermanente.calcularRMIIncapacidadePermanente({
        salarioBeneficio: resultado.salarioBeneficio.salarioBeneficio,
        causaAcidentaria: false,
        tempoContribuicao: resultado.tempoEcarencia.tempoContribuicao.tempoTotal,
        sexo: dados.sexo
      });
      valorBaseAposentadoria = rmiComoSeAposentado.rmiFinal;
      origemValorBase = 'calculado automaticamente como se o segurado estivesse aposentado por incapacidade permanente na data do óbito (art. 75)';
    }

    var rmi = BeneficioPensaoPorMorte.calcularRMIPensaoPorMorte({
      valorBaseAposentadoria: valorBaseAposentadoria,
      numeroDependentes: dados.numeroDependentes
    });
    return { elegibilidade: elegibilidade, rmi: rmi, valorBaseAposentadoria: valorBaseAposentadoria, origemValorBase: origemValorBase };
  } catch (erroPensao) {
    console.warn('Pensão por morte não pôde ser avaliada: ' + erroPensao.message);
    return undefined;
  }
}

// Salário-maternidade (Lei 8.213/91, arts. 25/71-73) — não depende de
// nada do cálculo principal (salário de benefício "desde 07/1994" não
// serve para nenhuma categoria deste benefício); só precisa do salário
// mínimo vigente (piso sempre aplicável) e, conforme a categoria, de uma
// base de cálculo informada manualmente.
function avaliarSalarioMaternidadeSeAplicavel(dados) {
  if (typeof BeneficioSalarioMaternidade === 'undefined') return undefined;
  if (!dados.avaliar) return undefined;
  if (!dados.categoria) return undefined;
  if (!(dados.salarioMinimoVigente > 0)) return undefined;

  try {
    var elegibilidade = BeneficioSalarioMaternidade.elegibilidadeSalarioMaternidade({
      segurada: dados.segurada === true,
      eventoGerador: dados.eventoGerador === true
    });
    var rmi = BeneficioSalarioMaternidade.calcularRMISalarioMaternidade({
      categoria: dados.categoria,
      baseCalculo: dados.baseCalculo > 0 ? dados.baseCalculo : undefined,
      salarioMinimoVigente: dados.salarioMinimoVigente,
      tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
    });
    return { elegibilidade: elegibilidade, rmi: rmi };
  } catch (erroMaternidade) {
    console.warn('Salário-maternidade não pôde ser avaliado: ' + erroMaternidade.message);
    return undefined;
  }
}

// DIREITO ADQUIRIDO — Aposentadoria por tempo de contribuição (regra
// pré-EC 103/2019, art. 53, Lei 8.213/91) — Atualização 51. Diferente das
// demais regras acima, NÃO depende de resultado.salarioBeneficio (que usa
// a base "100% dos salários" pós-reforma, ERRADA para direito adquirido —
// ver limitação 1 em aposentadoriaTempoContribuicao.js); usa um campo
// próprio (salarioBeneficio80MaioresSalarios) que o usuário informa à
// parte. A elegibilidade aparece sempre que sexo+tempo em 13/11/2019
// estão preenchidos; a RMI só aparece quando o salário de benefício
// (80% maiores) e (o fator previdenciário OU a dispensa por pontuação)
// também estiverem disponíveis — sem inventar nenhum dos dois.
function avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel(dados) {
  if (typeof RegraDireitoAdquiridoTempoContribuicao === 'undefined') return undefined;
  if (!dados.avaliar) return undefined;
  if (!dados.sexo || typeof dados.tempoContribuicaoEm13112019Anos !== 'number') return undefined;

  try {
    var elegibilidade = RegraDireitoAdquiridoTempoContribuicao.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: dados.tempoContribuicaoEm13112019Anos,
      idadeEm13112019Anos: dados.idadeEm13112019Anos,
      carenciaMeses: dados.carenciaEm13112019Meses,
      sexo: dados.sexo
    });

    var rmi;
    if (typeof dados.salarioBeneficio80MaioresSalarios === 'number' && dados.salarioBeneficio80MaioresSalarios > 0) {
      try {
        rmi = RegraDireitoAdquiridoTempoContribuicao.calcularRMIDireitoAdquiridoTempoContribuicao({
          salarioBeneficio: dados.salarioBeneficio80MaioresSalarios,
          dispensaFatorPrevidenciario: elegibilidade.dispensaFatorPrevidenciario,
          fatorPrevidenciario: dados.fatorPrevidenciario > 0 ? dados.fatorPrevidenciario : undefined,
          salarioMinimoVigente: dados.salarioMinimoVigente > 0 ? dados.salarioMinimoVigente : undefined,
          tetoRGPSVigente: dados.tetoRGPSVigente > 0 ? dados.tetoRGPSVigente : undefined
        });
      } catch (erroRmiDireitoAdquirido) {
        console.warn('RMI do direito adquirido (tempo de contribuição) não pôde ser calculada: ' + erroRmiDireitoAdquirido.message);
      }
    }
    return { elegibilidade: elegibilidade, rmi: rmi };
  } catch (erroDireitoAdquirido) {
    console.warn('Direito adquirido (tempo de contribuição) não pôde ser avaliado: ' + erroDireitoAdquirido.message);
    return undefined;
  }
}

// Campos "inteiro" digitados PELO USUÁRIO (idade em anos, número de
// dependentes, carência em meses — diferente dos campos extraídos de PDF,
// que passam pelo Decision Engine) usavam parseInt() direto no valor bruto
// do input. parseInt() TRUNCA em vez de rejeitar: "2,5"/"2.5" vira 2,
// "3abc" vira 3, sem aviso nenhum — um número de dependentes digitado
// errado por engano (ex.: decimal em vez de inteiro) mudaria o cálculo da
// pensão por morte silenciosamente. Mesma disciplina de "nunca falhar
// silenciosamente" já aplicada ao preenchimento automático (ver
// REGEX_DATA_ISO_PREVIDENCIARIO em preenchimentoAutomaticoPrevidenciario.js):
// aqui, REGEX_INTEIRO_PREV exige dígitos puros (sinal opcional) — qualquer
// coisa fora disso é reportada como inválida, não truncada.
var REGEX_INTEIRO_PREV = /^-?\d+$/;

// Lê um campo numérico "inteiro" do formulário. Vazio -> undefined (campo
// não informado, comportamento já existente e aceito pelo motor). Não-vazio
// mas fora do formato inteiro puro -> também undefined (mesmo efeito de
// "não informado"), só que `rotulo` é empilhado em `avisos` para virar um
// toast de aviso único no fim de calcularPrevidenciario() — nunca faz
// parseInt() direto num valor ainda não validado.
function intFieldValuePrev(id, rotulo, avisos) {
  var bruto = $(id) ? $(id).value : '';
  if (bruto == null) bruto = '';
  bruto = String(bruto).trim();
  if (bruto === '') return undefined;
  if (!REGEX_INTEIRO_PREV.test(bruto)) {
    avisos.push(rotulo + ' ("' + bruto + '")');
    return undefined;
  }
  return parseInt(bruto, 10);
}

async function calcularPrevidenciario() {
  var historico = PREV_UI_ESTADO.historico;
  var competenciaReferencia = ($('prevCompetenciaReferencia') && $('prevCompetenciaReferencia').value) || '';
  var sexo = ($('prevSexo') && $('prevSexo').value) || '';

  var avisosCamposInvalidosPrev = [];
  var idadeAnos = intFieldValuePrev('prevIdadeAnos', 'Idade (anos)', avisosCamposInvalidosPrev);
  var salarioMinimoVigente = moneyValue('prevSalarioMinimo');
  var tetoRGPSVigente = moneyValue('prevTetoRgps');
  var fatorPrevidenciarioBruto = $('prevFatorPrevidenciario') ? $('prevFatorPrevidenciario').value : '';
  var fatorPrevidenciario = fatorPrevidenciarioBruto !== '' ? parseFloat(fatorPrevidenciarioBruto) : undefined;
  var tempoEm13112019Bruto = $('prevTempoContribuicaoEm13112019') ? $('prevTempoContribuicaoEm13112019').value : '';
  var tempoContribuicaoEm13112019Anos = tempoEm13112019Bruto !== '' ? parseFloat(tempoEm13112019Bruto) : undefined;
  var nomeSegurado = ($('prevNomeSegurado') && $('prevNomeSegurado').value.trim()) || '';
  var converterTempoEspecial = !!($('prevConverterTempoEspecial') && $('prevConverterTempoEspecial').checked);

  // Remonta o histórico incorporando o nome do segurado digitado (a
  // extração de PDF não identifica isso — ver limitação registrada em
  // historicoPrevidenciario.js) — reaproveita montarHistorico() com os
  // MESMOS candidatos já extraídos, não refaz a extração.
  if (nomeSegurado && typeof HistoricoPrevidenciario !== 'undefined' && HistoricoPrevidenciario.montarHistorico) {
    historico = HistoricoPrevidenciario.montarHistorico(
      { vinculos: PREV_UI_ESTADO.candidatosVinculo, remuneracoes: PREV_UI_ESTADO.candidatosRemuneracao, segurado: { nome: nomeSegurado, cpf: null, nascimento: null } },
      {}
    );
    PREV_UI_ESTADO.historico = historico;
  }

  if (typeof calcularRMIDoHistorico !== 'function') { toast('Motor de cálculo previdenciário não carregado.', true); return; }

  // NENHUMA validação de "campo obrigatório preenchido" acontece aqui —
  // isso é regra de negócio de motorRMIDoHistorico.js/motorSalarioBenefi
  // cio.js (competência de referência, sexo, histórico sem contribuição
  // elegível etc.), que já devolvem `.motivo` explícito quando algo falta
  // (nunca calculam com suposição, ver cabeçalho de cada um). A UI só
  // repassa os valores dos campos e renderiza o que voltar —
  // renderizarResultadoPrev() sabe mostrar tanto o resultado quanto o
  // motivo de interrupção, incluindo o motivo ESPECÍFICO aninhado (ver
  // _prevUiMotivoEspecifico), nunca decide sozinha se pode calcular.
  var btn = $('prevBtnCalcular');
  if (btn) btn.disabled = true;
  try {
    var resultado = await calcularRMIDoHistorico(historico, {
      competenciaReferencia: competenciaReferencia,
      sexo: sexo,
      idadeAnos: (typeof idadeAnos === 'number' && isFinite(idadeAnos)) ? idadeAnos : undefined,
      salarioMinimoVigente: salarioMinimoVigente > 0 ? salarioMinimoVigente : undefined,
      tetoRGPSVigente: tetoRGPSVigente > 0 ? tetoRGPSVigente : undefined,
      converterTempoEspecial: converterTempoEspecial
    });
    resultado.regraPontos = avaliarRegraPontosSeAplicavel(resultado, {
      sexo: sexo,
      idadeAnos: (typeof idadeAnos === 'number' && isFinite(idadeAnos)) ? idadeAnos : undefined,
      competenciaReferencia: competenciaReferencia,
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    });
    resultado.regraIdadeMinimaProgressiva = avaliarRegraIdadeMinimaProgressivaSeAplicavel(resultado, {
      sexo: sexo,
      idadeAnos: (typeof idadeAnos === 'number' && isFinite(idadeAnos)) ? idadeAnos : undefined,
      competenciaReferencia: competenciaReferencia,
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    });
    var dadosPedagio = {
      sexo: sexo,
      idadeAnos: (typeof idadeAnos === 'number' && isFinite(idadeAnos)) ? idadeAnos : undefined,
      tempoContribuicaoEm13112019Anos: (typeof tempoContribuicaoEm13112019Anos === 'number' && isFinite(tempoContribuicaoEm13112019Anos)) ? tempoContribuicaoEm13112019Anos : undefined,
      fatorPrevidenciario: (typeof fatorPrevidenciario === 'number' && isFinite(fatorPrevidenciario)) ? fatorPrevidenciario : undefined,
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    };
    resultado.regraPedagio50 = avaliarRegraPedagio50SeAplicavel(resultado, dadosPedagio);
    resultado.regraPedagio100 = avaliarRegraPedagio100SeAplicavel(resultado, dadosPedagio);
    resultado.beneficioIncapacidadePermanente = avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultado, historico, {
      avaliar: !!($('prevAvaliarIncapacidadePermanente') && $('prevAvaliarIncapacidadePermanente').checked),
      incapacidadeAtestada: !!($('prevIncapacidadeAtestada') && $('prevIncapacidadeAtestada').checked),
      dispensaCarencia: !!($('prevDispensaCarencia') && $('prevDispensaCarencia').checked),
      causaAcidentaria: !!($('prevCausaAcidentaria') && $('prevCausaAcidentaria').checked),
      necessitaAssistenciaPermanente: !!($('prevNecessitaAssistenciaPermanente') && $('prevNecessitaAssistenciaPermanente').checked),
      sexo: sexo,
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    });
    resultado.auxilioIncapacidadeTemporaria = avaliarAuxilioIncapacidadeTemporariaSeAplicavel(resultado, historico, {
      avaliar: !!($('prevAvaliarAuxilioIncapacidadeTemp') && $('prevAvaliarAuxilioIncapacidadeTemp').checked),
      incapacidadeAtestada: !!($('prevAuxTempIncapacidadeAtestada') && $('prevAuxTempIncapacidadeAtestada').checked),
      dispensaCarencia: !!($('prevAuxTempDispensaCarencia') && $('prevAuxTempDispensaCarencia').checked),
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    });
    resultado.auxilioAcidente = avaliarAuxilioAcidenteSeAplicavel(resultado, {
      avaliar: !!($('prevAvaliarAuxilioAcidente') && $('prevAvaliarAuxilioAcidente').checked),
      sequelaAtestada: !!($('prevSequelaAtestada') && $('prevSequelaAtestada').checked),
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    });
    var pensaoValorJaRecebido = moneyValue('prevPensaoValorJaRecebido');
    resultado.pensaoPorMorte = avaliarPensaoPorMorteSeAplicavel(resultado, {
      avaliar: !!($('prevAvaliarPensaoPorMorte') && $('prevAvaliarPensaoPorMorte').checked),
      qualidadeSeguradoFalecido: !!($('prevPensaoQualidadeSegurado') && $('prevPensaoQualidadeSegurado').checked),
      dependenteReconhecido: !!($('prevPensaoDependenteReconhecido') && $('prevPensaoDependenteReconhecido').checked),
      numeroDependentes: intFieldValuePrev('prevPensaoNumeroDependentes', 'Número de dependentes', avisosCamposInvalidosPrev),
      valorJaRecebido: pensaoValorJaRecebido > 0 ? pensaoValorJaRecebido : undefined,
      sexo: sexo
    });
    resultado.salarioMaternidade = avaliarSalarioMaternidadeSeAplicavel({
      avaliar: !!($('prevAvaliarSalarioMaternidade') && $('prevAvaliarSalarioMaternidade').checked),
      segurada: !!($('prevMaternidadeSegurada') && $('prevMaternidadeSegurada').checked),
      eventoGerador: !!($('prevMaternidadeEventoGerador') && $('prevMaternidadeEventoGerador').checked),
      categoria: ($('prevMaternidadeCategoria') && $('prevMaternidadeCategoria').value) || '',
      baseCalculo: moneyValue('prevMaternidadeBaseCalculo'),
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    });
    var idadeEm13112019Bruta = $('prevIdadeEm13112019') ? $('prevIdadeEm13112019').value : '';
    resultado.direitoAdquiridoTempoContribuicao = avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: !!($('prevAvaliarDireitoAdquirido') && $('prevAvaliarDireitoAdquirido').checked),
      sexo: sexo,
      tempoContribuicaoEm13112019Anos: (typeof tempoContribuicaoEm13112019Anos === 'number' && isFinite(tempoContribuicaoEm13112019Anos)) ? tempoContribuicaoEm13112019Anos : undefined,
      idadeEm13112019Anos: idadeEm13112019Bruta !== '' ? parseFloat(idadeEm13112019Bruta) : undefined,
      carenciaEm13112019Meses: intFieldValuePrev('prevCarenciaEm13112019', 'Carência em 13/11/2019 (meses)', avisosCamposInvalidosPrev),
      salarioBeneficio80MaioresSalarios: moneyValue('prevSalarioBeneficio80Maiores'),
      fatorPrevidenciario: (typeof fatorPrevidenciario === 'number' && isFinite(fatorPrevidenciario)) ? fatorPrevidenciario : undefined,
      salarioMinimoVigente: salarioMinimoVigente,
      tetoRGPSVigente: tetoRGPSVigente
    });

    // COMPARADOR DE REGRAS (Atualização 50) — roda depois de todas as
    // regras de aposentadoria programada avaliadas acima, ANTES da
    // validação final (a validação final também pode olhar pro resultado
    // do comparador, se um dia precisar). Só agrega e ordena — nunca
    // recalcula nenhuma RMI nem reavalia nenhuma elegibilidade.
    if (typeof ComparadorRegrasPrevidenciarias !== 'undefined') {
      resultado.comparadorRegras = ComparadorRegrasPrevidenciarias.compararRegrasPrevidenciarias(resultado);
    }

    // VALIDAÇÃO FINAL (Atualização 48) — roda por último, DEPOIS de tudo
    // decidido acima; só inspeciona o que já foi calculado, nunca decide
    // nada novo (mesma disciplina do item 6 desta sessão).
    if (typeof ValidadorFinalCalculo !== 'undefined') {
      resultado.validacaoFinal = ValidadorFinalCalculo.validarCalculoFinal({
        cpf: ($('prevCpfSegurado') && $('prevCpfSegurado').value) || '',
        dataNascimento: ($('prevDataNascimento') && $('prevDataNascimento').value) || '',
        dataDER: ($('prevDataDER') && $('prevDataDER').value) || '',
        dataDIB: ($('prevDataDIB') && $('prevDataDIB').value) || '',
        competenciaReferencia: competenciaReferencia,
        historico: historico,
        resultado: resultado
      });
    }

    renderizarResultadoPrev(resultado, { nomeSegurado: nomeSegurado, competenciaReferencia: competenciaReferencia });
    if (avisosCamposInvalidosPrev.length) {
      toast('Campo(s) numérico(s) inválido(s), ignorado(s) no cálculo: ' + avisosCamposInvalidosPrev.join('; '), true);
    }
  } catch (erro) {
    console.error(erro);
    toast('Erro ao calcular: ' + erro.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcularPrevidenciario };
}
