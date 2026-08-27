/* ============================================================================
   REGRAS/TRANSICAO/IDADEMINIMAPROGRESSIVA.JS — Regra de transição por
   IDADE MÍNIMA PROGRESSIVA (EC 103/2019, art. 16). Atualização 49 — última
   das 4 regras clássicas de transição da EC 103/2019 (pontos, pedágio
   50%, pedágio 100% já entregues nas Atualizações 38/41).

   BASE LEGAL (texto conferido — art. 16, EC 103/2019; referência, não
   substitui análise jurídica do caso concreto):
     "Art. 16. Ao segurado filiado ao Regime Geral de Previdência Social
     até a data de entrada em vigor desta Emenda Constitucional
     [13/11/2019] fica assegurado o direito à aposentadoria quando
     preencher, cumulativamente, os seguintes requisitos:
       I - 30 (trinta) anos de contribuição, se mulher, e 35 (trinta e
       cinco) anos de contribuição, se homem; e
       II - 56 (cinquenta e seis) anos de idade, se mulher, e 61
       (sessenta e um) anos, se homem.
     § 1º A idade a que se refere o inciso II do caput deste artigo será
     acrescida de 6 (seis) meses a cada ano, a partir de 1º de janeiro de
     2020, até atingir 62 (sessenta e dois) anos de idade, se mulher, e
     65 (sessenta e cinco) anos de idade, se homem."
     - Carência: 180 contribuições mensais (Lei 8.213/91, art. 25, II —
       mesmo valor de sempre; reaproveitado de MotorRMI).
     - RMI: EC 103/2019, art. 16 c/c art. 26, §2º — MESMA fórmula da
       regra permanente e da regra de pontos (60% do salário de benefício
       + 2 pontos percentuais por ano que exceder o tempo mínimo de 35/30
       anos) — por isso este módulo REAPROVEITA MotorRMI.calcularRMI()
       diretamente (mesmo tempo mínimo 35/30 desta regra, não o de 20/15
       da regra permanente — por isso não dá pra usar MotorRMI.calcularRMI
       com os parâmetros "crus"; ver calcularRMIIdadeMinimaProgressiva).
     - A partir do ano em que a idade mínima desta regra estabiliza em
       65 (homem, 2027) / 62 (mulher, 2031), ela coincide com a idade da
       regra PERMANENTE (art. 26) — a partir daí esta regra de transição
       deixa de acrescentar qualquer vantagem sobre a permanente, mas
       continua calculável (não é um erro, é só irrelevante na prática).

   DEPENDE de: MotorRMI (motorRMI.js) já carregado no mesmo escopo global
   — reaproveitado para CARENCIA_MINIMA_MESES e para a fórmula de RMI.

   LIMITAÇÃO CONHECIDA (documentada, não escondida): não verifica filiação
   ao RGPS antes de 13/11/2019, pressuposto legal desta regra de transição
   — mesma limitação já registrada em pontos.js/pedagio50.js/pedagio100.js.
============================================================================ */

if (typeof MotorRMI === 'undefined') {
  throw new Error('regras/transicao/idadeMinimaProgressiva.js depende de MotorRMI (motorRMI.js) já carregado no mesmo escopo global');
}

var TEMPO_MINIMO_IDADE_PROGRESSIVA_ANOS = Object.freeze({ homem: 35, mulher: 30 });
var IDADE_BASE_2019 = Object.freeze({ homem: 61, mulher: 56 });
var IDADE_MAXIMA = Object.freeze({ homem: 65, mulher: 62 });
var ANO_VIGENCIA_EC103_IDADE_PROGRESSIVA = 2019;
var ACRESCIMO_ANUAL_MESES = 6; // a partir de 01/01/2020

function validarSexoIdadeProgressiva(sexo) {
  if (sexo !== 'homem' && sexo !== 'mulher') {
    throw new Error(`sexo inválido (esperado "homem" ou "mulher"): ${sexo}`);
  }
}

function paraAnosFracionariosIdadeProgressiva(tempo) {
  if (typeof tempo === 'number') return tempo;
  const { anos = 0, meses = 0, dias = 0 } = tempo || {};
  return anos + meses / 12 + dias / 360;
}

// Mesmo padrão de anoDaReferencia/dataReferencia já usado em pontos.js —
// não assume "ano atual" por padrão, precisa do ano do requerimento/DER.
function anoDaReferenciaIdadeProgressiva(dados) {
  if (typeof dados.anoReferencia === 'number') return dados.anoReferencia;
  if (dados.dataReferencia) {
    const d = dados.dataReferencia instanceof Date ? dados.dataReferencia : new Date(dados.dataReferencia);
    if (isNaN(d.getTime())) {
      throw new Error('dataReferencia inválida (esperado Date ou string ISO "AAAA-MM-DD")');
    }
    return d.getUTCFullYear();
  }
  throw new Error('é preciso informar dados.anoReferencia (número) ou dados.dataReferencia (Date/ISO) — ano do requerimento/DER, necessário para saber a idade mínima exigida naquele ano');
}

/**
 * Idade mínima exigida (em anos fracionários — ex.: 64.5) no ano dado.
 *
 * @param {number} ano
 * @param {'homem'|'mulher'} sexo
 * @returns {number}
 */
function idadeMinimaExigida(ano, sexo) {
  validarSexoIdadeProgressiva(sexo);
  if (typeof ano !== 'number' || !Number.isFinite(ano)) {
    throw new Error(`ano inválido: ${ano}`);
  }
  if (ano < ANO_VIGENCIA_EC103_IDADE_PROGRESSIVA) {
    throw new Error(`regra de transição por idade mínima progressiva (EC 103/2019, art. 16) não existia antes de ${ANO_VIGENCIA_EC103_IDADE_PROGRESSIVA} — ano informado: ${ano}`);
  }
  if (ano === ANO_VIGENCIA_EC103_IDADE_PROGRESSIVA) return IDADE_BASE_2019[sexo];
  const anosDesde2020 = Math.floor(ano) - (ANO_VIGENCIA_EC103_IDADE_PROGRESSIVA + 1) + 1; // nº de incrementos de 01/jan de cada ano a partir de 2020
  const acrescimoAnos = (anosDesde2020 * ACRESCIMO_ANUAL_MESES) / 12;
  return Math.min(IDADE_BASE_2019[sexo] + acrescimoAnos, IDADE_MAXIMA[sexo]);
}

/**
 * Verifica se os requisitos da regra de transição por IDADE MÍNIMA
 * PROGRESSIVA estão cumpridos. Não calcula RMI — só elegibilidade.
 *
 * @param {{idadeAnos:number, tempoContribuicao:{anos,meses,dias}|number,
 *   carenciaMeses:number, sexo:'homem'|'mulher', anoReferencia?:number,
 *   dataReferencia?:Date|string}} dados
 * @returns {{elegivel:boolean, pendencias:string[], idadeExigida:number,
 *   tempoMinimoExigidoAnos:number, anoReferencia:number}}
 */
function elegibilidadeIdadeMinimaProgressiva(dados) {
  validarSexoIdadeProgressiva(dados.sexo);
  const ano = anoDaReferenciaIdadeProgressiva(dados);
  const idadeExigida = idadeMinimaExigida(ano, dados.sexo);
  const tempoMinimoExigidoAnos = TEMPO_MINIMO_IDADE_PROGRESSIVA_ANOS[dados.sexo];
  const tempoAnos = paraAnosFracionariosIdadeProgressiva(dados.tempoContribuicao);
  const carenciaMinima = MotorRMI.CARENCIA_MINIMA_MESES;

  const pendencias = [];
  if (typeof dados.idadeAnos !== 'number' || dados.idadeAnos < idadeExigida) {
    pendencias.push(`idade mínima não atingida: exige ${idadeExigida.toFixed(1)} anos em ${ano} (art. 16, EC 103/2019)`);
  }
  if (tempoAnos < tempoMinimoExigidoAnos) {
    pendencias.push(`tempo de contribuição mínimo não atingido (exige ${tempoMinimoExigidoAnos} anos)`);
  }
  if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < carenciaMinima) {
    pendencias.push(`carência mínima não atingida (exige ${carenciaMinima} contribuições)`);
  }

  return {
    elegivel: pendencias.length === 0,
    pendencias,
    idadeExigida,
    tempoMinimoExigidoAnos,
    anoReferencia: ano
  };
}

/**
 * Calcula a RMI pela regra de transição por IDADE MÍNIMA PROGRESSIVA —
 * mesma fórmula da regra permanente (60% + 2% por ano excedente), mas com
 * o tempo mínimo de 35/30 anos desta regra.
 *
 * @param {object} dados
 * @param {number} dados.salarioBeneficio
 * @param {{anos,meses,dias}|number} dados.tempoContribuicao
 * @param {'homem'|'mulher'} dados.sexo
 * @param {number} [dados.salarioMinimoVigente]
 * @param {number} [dados.tetoRGPSVigente]
 * @returns {{percentualAplicado:number, anosExcedentesConsiderados:number,
 *   tempoMinimoExigidoAnos:number, rmiAntesDoPisoTeto:number, rmiFinal:number,
 *   aplicouPiso:boolean, aplicouTeto:boolean}}
 */
function calcularRMIIdadeMinimaProgressiva(dados) {
  validarSexoIdadeProgressiva(dados.sexo);
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIIdadeMinimaProgressiva: salarioBeneficio precisa ser um número maior que zero');
  }
  const tempoMinimoExigidoAnos = TEMPO_MINIMO_IDADE_PROGRESSIVA_ANOS[dados.sexo];
  const tempoAnos = paraAnosFracionariosIdadeProgressiva(dados.tempoContribuicao);

  const anosExcedentesConsiderados = Math.max(0, Math.floor(tempoAnos - tempoMinimoExigidoAnos));
  const percentualAplicado = 0.60 + 0.02 * anosExcedentesConsiderados;
  const rmiAntesDoPisoTeto = dados.salarioBeneficio * percentualAplicado;

  let rmiFinal = rmiAntesDoPisoTeto;
  let aplicouPiso = false;
  let aplicouTeto = false;
  // Correção (achado da perícia de software): antes, se quem chamava
  // informasse piso > teto por engano (entrada inconsistente), o teto
  // vencia silenciosamente e o resultado saía abaixo do próprio piso legal,
  // sem nenhum aviso. Agora essa inconsistência é rejeitada explicitamente.
  if (typeof dados.salarioMinimoVigente === 'number' && typeof dados.tetoRGPSVigente === 'number'
      && dados.salarioMinimoVigente > dados.tetoRGPSVigente) {
    throw new Error(`salarioMinimoVigente (${dados.salarioMinimoVigente}) não pode ser maior que tetoRGPSVigente (${dados.tetoRGPSVigente}) — entrada inconsistente`);
  }
  if (typeof dados.salarioMinimoVigente === 'number' && rmiFinal < dados.salarioMinimoVigente) {
    rmiFinal = dados.salarioMinimoVigente;
    aplicouPiso = true;
  }
  if (typeof dados.tetoRGPSVigente === 'number' && rmiFinal > dados.tetoRGPSVigente) {
    rmiFinal = dados.tetoRGPSVigente;
    aplicouTeto = true;
  }

  return {
    percentualAplicado,
    anosExcedentesConsiderados,
    tempoMinimoExigidoAnos,
    rmiAntesDoPisoTeto,
    rmiFinal,
    aplicouPiso,
    aplicouTeto
  };
}

var RegraTransicaoIdadeMinimaProgressiva = {
  TEMPO_MINIMO_IDADE_PROGRESSIVA_ANOS,
  IDADE_BASE_2019,
  IDADE_MAXIMA,
  ANO_VIGENCIA_EC103_IDADE_PROGRESSIVA,
  ACRESCIMO_ANUAL_MESES,
  idadeMinimaExigida,
  elegibilidadeIdadeMinimaProgressiva,
  calcularRMIIdadeMinimaProgressiva
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA:
     1. Não verifica filiação ao RGPS anterior a 13/11/2019.
     2. Não calcula "salário de benefício" — recebido pronto.
     3. Com este módulo, as 4 regras clássicas de transição da EC
        103/2019 estão completas (pontos, idade progressiva, pedágio 50%,
        pedágio 100%) — ainda faltam: direito adquirido, professor,
        especial, rural, PCD, e o comparador de benefícios.
---------------------------------------------------------------------- */
