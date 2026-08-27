/* ============================================================================
   REGRAS/TRANSICAO/PEDAGIO100.JS — Regra de transição por PEDÁGIO DE 100%
   (EC 103/2019, art. 20). Atualização 41.

   BASE LEGAL (texto conferido — art. 20, EC 103/2019; só a parte aplicável
   ao segurado do RGPS, sem os incisos exclusivos de servidor público;
   referência, não substitui análise jurídica do caso concreto):
     "Art. 20. O segurado [...] que se tenha filiado ao Regime Geral de
     Previdência Social [...] até a data de entrada em vigor desta Emenda
     Constitucional [13/11/2019] poderá aposentar-se voluntariamente quando
     preencher, cumulativamente, os seguintes requisitos:
       I - 57 anos de idade, se mulher, e 60 anos, se homem;
       II - 30 anos de contribuição, se mulher, e 35 anos, se homem;
       IV - período adicional de contribuição correspondente ao tempo que,
       em 13/11/2019, faltaria para atingir o tempo mínimo do inciso II."
     - RMI (para o segurado do RGPS — art. 26, §3º c/c decisões que aplicam
       o art. 20: média aritmética simples de 100% dos salários de
       contribuição desde 07/1994, multiplicada pelo coeficiente de 100%
       — ou seja, SEM redução e SEM Fator Previdenciário (diferente do
       pedágio de 50%, a única regra de transição com fator).
     - Carência: 180 contribuições mensais (Lei 8.213/91, art. 25, II —
       mesmo valor de sempre; reaproveitado de MotorRMI).

   DEPENDE de: MotorRMI (motorRMI.js) já carregado no mesmo escopo global —
   reaproveita MotorRMI.CARENCIA_MINIMA_MESES.

   LIMITAÇÕES CONHECIDAS (documentadas, não escondidas):
     1. Precisa do tempo de contribuição apurado EM 13/11/2019 separado do
        tempo total na DER — este módulo não recalcula nenhum dos dois, só
        recebe ambos prontos (mesma convenção de motorRMI.js/pedagio50.js).
     2. Não verifica filiação ao RGPS anterior a 13/11/2019 nem confirma
        que os dados de "tempo em 13/11/2019" realmente correspondem a
        essa data — responsabilidade de quem chama.
     3. Só cobre o segurado comum do RGPS — os incisos III (tempo de
        serviço público)/§1º (redução de 5 anos para professor) do art. 20
        não estão implementados aqui.
============================================================================ */

if (typeof MotorRMI === 'undefined') {
  throw new Error('regras/transicao/pedagio100.js depende de MotorRMI (motorRMI.js) já carregado no mesmo escopo global');
}

var IDADE_MINIMA_PEDAGIO100_ANOS = Object.freeze({ homem: 60, mulher: 57 });
var TEMPO_MINIMO_PEDAGIO100_ANOS = Object.freeze({ homem: 35, mulher: 30 });

function validarSexoPedagio100(sexo) {
  if (sexo !== 'homem' && sexo !== 'mulher') {
    throw new Error(`sexo inválido (esperado "homem" ou "mulher"): ${sexo}`);
  }
}

// Mesma convenção de anos fracionários já usada em motorRMI.js/pontos.js/
// pedagio50.js — duplicada aqui por não ser exposta pelos outros módulos.
function paraAnosFracionariosPedagio100(tempo) {
  if (typeof tempo === 'number') return tempo;
  const { anos = 0, meses = 0, dias = 0 } = tempo || {};
  return anos + meses / 12 + dias / 360;
}

/**
 * Calcula o pedágio de 100% e o tempo total exigido, a partir do tempo de
 * contribuição apurado em 13/11/2019 (não é o tempo na DER). Diferente do
 * pedágio de 50%, o art. 20 não impõe pré-condição mínima de tempo já
 * cumprido em 13/11/2019 — qualquer tempo (inclusive zero) gera um pedágio
 * calculável, ainda que grande demais para ser prático.
 *
 * @param {{anos,meses,dias}|number} tempoContribuicaoEm13112019
 * @param {'homem'|'mulher'} sexo
 * @returns {{tempoFaltanteEm13112019Anos:number, pedagioAnos:number,
 *   tempoTotalExigidoAnos:number, tempoMinimoAnos:number}}
 */
function calcularPedagio100(tempoContribuicaoEm13112019, sexo) {
  validarSexoPedagio100(sexo);
  const tempoMinimoAnos = TEMPO_MINIMO_PEDAGIO100_ANOS[sexo];
  const tempoEm13112019Anos = paraAnosFracionariosPedagio100(tempoContribuicaoEm13112019);
  const tempoFaltanteEm13112019Anos = Math.max(0, tempoMinimoAnos - tempoEm13112019Anos);
  const pedagioAnos = 1.0 * tempoFaltanteEm13112019Anos;
  const tempoTotalExigidoAnos = tempoMinimoAnos + pedagioAnos;

  return {
    tempoFaltanteEm13112019Anos,
    pedagioAnos,
    tempoTotalExigidoAnos,
    tempoMinimoAnos
  };
}

/**
 * Verifica se os requisitos da regra de transição por PEDÁGIO DE 100%
 * estão cumpridos. Não calcula RMI — só elegibilidade.
 *
 * @param {{idadeAnos:number, tempoContribuicaoEm13112019:{anos,meses,dias}|number,
 *   tempoContribuicao:{anos,meses,dias}|number, carenciaMeses:number,
 *   sexo:'homem'|'mulher'}} dados
 * @returns {{elegivel:boolean, pendencias:string[], pedagioAnos:number,
 *   tempoTotalExigidoAnos:number, tempoMinimoAnos:number, idadeMinimaAnos:number}}
 */
function elegibilidadeRegraPedagio100(dados) {
  validarSexoPedagio100(dados.sexo);
  const pedagio = calcularPedagio100(dados.tempoContribuicaoEm13112019, dados.sexo);
  const tempoAnos = paraAnosFracionariosPedagio100(dados.tempoContribuicao);
  const idadeMinima = IDADE_MINIMA_PEDAGIO100_ANOS[dados.sexo];
  const carenciaMinima = MotorRMI.CARENCIA_MINIMA_MESES;

  const pendencias = [];
  if (typeof dados.idadeAnos !== 'number' || dados.idadeAnos < idadeMinima) {
    pendencias.push(`idade mínima não atingida (exige ${idadeMinima} anos)`);
  }
  if (tempoAnos < pedagio.tempoTotalExigidoAnos) {
    pendencias.push(`tempo de contribuição total (com pedágio de 100%) não atingido: exige ${pedagio.tempoTotalExigidoAnos.toFixed(4)} anos (${pedagio.tempoMinimoAnos} anos mínimos + ${pedagio.pedagioAnos.toFixed(4)} anos de pedágio)`);
  }
  if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < carenciaMinima) {
    pendencias.push(`carência mínima não atingida (exige ${carenciaMinima} contribuições)`);
  }

  return {
    elegivel: pendencias.length === 0,
    pendencias,
    pedagioAnos: pedagio.pedagioAnos,
    tempoTotalExigidoAnos: pedagio.tempoTotalExigidoAnos,
    tempoMinimoAnos: pedagio.tempoMinimoAnos,
    idadeMinimaAnos: idadeMinima
  };
}

/**
 * Calcula a RMI pela regra de transição por PEDÁGIO DE 100% — 100% da
 * média aritmética simples dos salários de contribuição (já calculada,
 * recebida pronta), SEM redução e SEM Fator Previdenciário.
 *
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - média já calculada, 100% dos
 *   salários de contribuição desde 07/1994 (este módulo NÃO calcula essa
 *   média).
 * @param {number} [dados.salarioMinimoVigente]
 * @param {number} [dados.tetoRGPSVigente]
 * @returns {{rmiAntesDoPisoTeto:number, rmiFinal:number, aplicouPiso:boolean,
 *   aplicouTeto:boolean}}
 */
function calcularRMIRegraPedagio100(dados) {
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIRegraPedagio100: salarioBeneficio precisa ser um número maior que zero');
  }

  const rmiAntesDoPisoTeto = dados.salarioBeneficio; // coeficiente de 100%, sem fator previdenciário
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

  return { rmiAntesDoPisoTeto, rmiFinal, aplicouPiso, aplicouTeto };
}

var RegraTransicaoPedagio100 = {
  IDADE_MINIMA_PEDAGIO100_ANOS,
  TEMPO_MINIMO_PEDAGIO100_ANOS,
  calcularPedagio100,
  elegibilidadeRegraPedagio100,
  calcularRMIRegraPedagio100
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA (ver também cabeçalho do arquivo):
     1. Não calcula o tempo de contribuição em 13/11/2019 nem na DER —
        recebe os dois prontos.
     2. Só cobre o segurado comum do RGPS (não servidor público, não
        professor com redução de 5 anos).
     3. Não valida nenhuma regra especial (PCD, atividade especial, rural)
        combinada com o pedágio de 100%.
---------------------------------------------------------------------- */
