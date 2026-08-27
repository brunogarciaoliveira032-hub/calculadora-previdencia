/* ============================================================================
   REGRAS/TRANSICAO/PEDAGIO50.JS — Regra de transição por PEDÁGIO DE 50%
   (EC 103/2019, art. 17). Atualização 41.

   BASE LEGAL (texto conferido — art. 17, EC 103/2019; referência, não
   substitui análise jurídica do caso concreto):
     "Art. 17. Ao segurado filiado ao Regime Geral de Previdência Social até
     a data de entrada em vigor desta Emenda Constitucional [13/11/2019] e
     que na referida data contar com mais de 28 (vinte e oito) anos de
     contribuição, se mulher, e 33 (trinta e três) anos de contribuição, se
     homem, fica assegurado o direito à aposentadoria quando preencher,
     cumulativamente, os seguintes requisitos:
       I - 30 anos de contribuição, se mulher, e 35 anos, se homem; e
       II - cumprimento de período adicional correspondente a 50% do tempo
       que, em 13/11/2019, faltaria para atingir 30/35 anos de contribuição.
     Parágrafo único. O benefício [...] terá seu valor apurado de acordo com
     a média aritmética simples dos salários de contribuição [...]
     multiplicada pelo fator previdenciário [Lei 9.876/99]."
     - Carência: 180 contribuições mensais (Lei 8.213/91, art. 25, II —
       mesmo valor de sempre; reaproveitado de MotorRMI).
     - SEM idade mínima exigida.
     - É a ÚNICA regra de transição da EC 103/2019 em que incide o Fator
       Previdenciário (as demais usam a fórmula do art. 26 ou a média
       integral sem fator).

   DEPENDE de: MotorRMI (motorRMI.js) já carregado no mesmo escopo global —
   reaproveita MotorRMI.CARENCIA_MINIMA_MESES.

   LIMITAÇÕES CONHECIDAS (documentadas, não escondidas):
     1. Este módulo NÃO calcula o Fator Previdenciário (Lei 9.876/99) — a
        fórmula depende da tábua de expectativa de sobrevida do IBGE,
        atualizada anualmente, que o projeto não tem como série de dados
        (mesma situação já registrada para o teto histórico do RGPS em
        motorSalarioBeneficio.js). O chamador precisa fornecer
        dados.fatorPrevidenciario já calculado; sem ele, a função recusa
        calcular a RMI (nunca assume fator = 1 nem estima).
     2. Precisa do tempo de contribuição apurado EM 13/11/2019 separado do
        tempo total na DER — são dois momentos diferentes, nenhum dos dois
        substitui o outro. Este módulo não recalcula nenhum dos dois, só
        recebe ambos prontos (mesma convenção de motorRMI.js).
     3. Não verifica filiação ao RGPS anterior a 13/11/2019 nem confirma
        que os dados de "tempo em 13/11/2019" realmente correspondem a
        essa data — responsabilidade de quem chama.
============================================================================ */

if (typeof MotorRMI === 'undefined') {
  throw new Error('regras/transicao/pedagio50.js depende de MotorRMI (motorRMI.js) já carregado no mesmo escopo global');
}

var TEMPO_MINIMO_PEDAGIO50_ANOS = Object.freeze({ homem: 35, mulher: 30 });
// Pré-condição do art. 17 (caput): só pode OPTAR por esta regra quem, em
// 13/11/2019, já tinha MAIS DE 28 anos (mulher) / 33 anos (homem) de
// contribuição — ou seja, o tempo mínimo desta regra menos, no máximo, 2
// anos. Comparação estritamente ">" (o texto legal diz "mais de", não
// "pelo menos").
var TEMPO_MINIMO_EM_13112019_ANOS = Object.freeze({ homem: 33, mulher: 28 });

function validarSexoPedagio50(sexo) {
  if (sexo !== 'homem' && sexo !== 'mulher') {
    throw new Error(`sexo inválido (esperado "homem" ou "mulher"): ${sexo}`);
  }
}

// Mesma convenção de anos fracionários já usada em motorRMI.js/pontos.js —
// duplicada aqui (função pura, sem estado) por não ser exposta pelos outros
// módulos.
function paraAnosFracionariosPedagio50(tempo) {
  if (typeof tempo === 'number') return tempo;
  const { anos = 0, meses = 0, dias = 0 } = tempo || {};
  return anos + meses / 12 + dias / 360;
}

/**
 * Calcula o pedágio de 50% e o tempo total exigido, a partir do tempo de
 * contribuição apurado em 13/11/2019 (não é o tempo na DER).
 *
 * @param {{anos,meses,dias}|number} tempoContribuicaoEm13112019
 * @param {'homem'|'mulher'} sexo
 * @returns {{tempoFaltanteEm13112019Anos:number, pedagioAnos:number,
 *   tempoTotalExigidoAnos:number, tempoMinimoAnos:number,
 *   preCondicaoAtendida:boolean}}
 */
function calcularPedagio50(tempoContribuicaoEm13112019, sexo) {
  validarSexoPedagio50(sexo);
  const tempoMinimoAnos = TEMPO_MINIMO_PEDAGIO50_ANOS[sexo];
  const tempoEm13112019Anos = paraAnosFracionariosPedagio50(tempoContribuicaoEm13112019);
  const tempoFaltanteEm13112019Anos = Math.max(0, tempoMinimoAnos - tempoEm13112019Anos);
  const pedagioAnos = 0.5 * tempoFaltanteEm13112019Anos;
  const tempoTotalExigidoAnos = tempoMinimoAnos + pedagioAnos;
  const preCondicaoAtendida = tempoEm13112019Anos > TEMPO_MINIMO_EM_13112019_ANOS[sexo];

  return {
    tempoFaltanteEm13112019Anos,
    pedagioAnos,
    tempoTotalExigidoAnos,
    tempoMinimoAnos,
    preCondicaoAtendida
  };
}

/**
 * Verifica se os requisitos da regra de transição por PEDÁGIO DE 50% estão
 * cumpridos. Não calcula RMI — só elegibilidade. Sem idade mínima.
 *
 * @param {{tempoContribuicaoEm13112019:{anos,meses,dias}|number,
 *   tempoContribuicao:{anos,meses,dias}|number, carenciaMeses:number,
 *   sexo:'homem'|'mulher'}} dados
 * @returns {{elegivel:boolean, pendencias:string[], pedagioAnos:number,
 *   tempoTotalExigidoAnos:number, tempoMinimoAnos:number}}
 */
function elegibilidadeRegraPedagio50(dados) {
  validarSexoPedagio50(dados.sexo);
  const pedagio = calcularPedagio50(dados.tempoContribuicaoEm13112019, dados.sexo);
  const tempoAnos = paraAnosFracionariosPedagio50(dados.tempoContribuicao);
  const carenciaMinima = MotorRMI.CARENCIA_MINIMA_MESES;

  const pendencias = [];
  if (!pedagio.preCondicaoAtendida) {
    const limite = TEMPO_MINIMO_EM_13112019_ANOS[dados.sexo];
    pendencias.push(`pré-condição do art. 17 não atendida: em 13/11/2019 é preciso ter mais de ${limite} anos de contribuição (informado: ${paraAnosFracionariosPedagio50(dados.tempoContribuicaoEm13112019).toFixed(2)})`);
  }
  if (tempoAnos < pedagio.tempoTotalExigidoAnos) {
    pendencias.push(`tempo de contribuição total (com pedágio de 50%) não atingido: exige ${pedagio.tempoTotalExigidoAnos.toFixed(4)} anos (${pedagio.tempoMinimoAnos} anos mínimos + ${pedagio.pedagioAnos.toFixed(4)} anos de pedágio)`);
  }
  if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < carenciaMinima) {
    pendencias.push(`carência mínima não atingida (exige ${carenciaMinima} contribuições)`);
  }

  return {
    elegivel: pendencias.length === 0,
    pendencias,
    pedagioAnos: pedagio.pedagioAnos,
    tempoTotalExigidoAnos: pedagio.tempoTotalExigidoAnos,
    tempoMinimoAnos: pedagio.tempoMinimoAnos
  };
}

/**
 * Calcula a RMI pela regra de transição por PEDÁGIO DE 50% (art. 17,
 * parágrafo único) — média aritmética simples dos salários de contribuição
 * (já calculada, recebida pronta) multiplicada pelo Fator Previdenciário
 * (recebido pronto — ver limitação 1 no cabeçalho do arquivo).
 *
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - média já calculada, 100% dos
 *   salários de contribuição desde 07/1994 (este módulo NÃO calcula essa
 *   média).
 * @param {number} dados.fatorPrevidenciario - já calculado externamente
 *   (Lei 9.876/99); OBRIGATÓRIO — sem ele a função recusa calcular.
 * @param {number} [dados.salarioMinimoVigente]
 * @param {number} [dados.tetoRGPSVigente]
 * @returns {{rmiAntesDoPisoTeto:number, rmiFinal:number, aplicouPiso:boolean,
 *   aplicouTeto:boolean, fatorPrevidenciarioAplicado:number}}
 */
function calcularRMIRegraPedagio50(dados) {
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIRegraPedagio50: salarioBeneficio precisa ser um número maior que zero');
  }
  if (typeof dados.fatorPrevidenciario !== 'number' || !Number.isFinite(dados.fatorPrevidenciario) || !(dados.fatorPrevidenciario > 0)) {
    throw new Error('calcularRMIRegraPedagio50: fatorPrevidenciario é obrigatório (Lei 9.876/99) — este módulo não o calcula, ver limitação no cabeçalho do arquivo');
  }

  const rmiAntesDoPisoTeto = dados.salarioBeneficio * dados.fatorPrevidenciario;
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
    rmiAntesDoPisoTeto,
    rmiFinal,
    aplicouPiso,
    aplicouTeto,
    fatorPrevidenciarioAplicado: dados.fatorPrevidenciario
  };
}

var RegraTransicaoPedagio50 = {
  TEMPO_MINIMO_PEDAGIO50_ANOS,
  TEMPO_MINIMO_EM_13112019_ANOS,
  calcularPedagio50,
  elegibilidadeRegraPedagio50,
  calcularRMIRegraPedagio50
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA (ver também cabeçalho do arquivo):
     1. Não calcula o Fator Previdenciário — recebe pronto.
     2. Não calcula o tempo de contribuição em 13/11/2019 nem na DER —
        recebe os dois prontos.
     3. Não valida nenhuma regra especial (professor, PCD, atividade
        especial, rural) combinada com o pedágio de 50%.
---------------------------------------------------------------------- */
