/* ============================================================================
   BENEFICIOS/AUXILIOACIDENTE.JS — Auxílio-acidente. Atualização 44 — fase
   2 do catálogo `beneficios/`.

   BASE LEGAL (conferida por busca antes de codificar):
     - Lei 8.213/91, art. 86: benefício indenizatório devido quando,
       consolidadas as lesões decorrentes de acidente de qualquer
       natureza, resultar sequela permanente que implique REDUÇÃO da
       capacidade para o trabalho habitualmente exercido — NÃO exige
       incapacidade total (diferente da incapacidade permanente/temporária).
     - Lei 8.213/91, art. 26, I: independe de carência.
     - Lei 8.213/91, art. 86, §1º (regra vigente desde 20/04/2020 — houve
       oscilação por MPs revogadas, conferida na entrega): RMI = 50% do
       salário de benefício. Sem idade mínima.
     - Lei 8.213/91, art. 86, §3º: não cumulável com nenhuma espécie de
       aposentadoria do RGPS (regra de acumulação, não tratada aqui —
       fora do escopo de um cálculo pontual de RMI).

   LIMITAÇÕES CONHECIDAS:
     1. Não confirma perícia real da sequela/redução de capacidade —
        recebido como fato já verificado pelo chamador.
     2. Não trata a vedação de cumulação com aposentadoria (art. 86, §3º).
     3. Não calcula "salário de benefício" — recebido pronto.
============================================================================ */

var PERCENTUAL_AUXILIO_ACIDENTE = 0.50; // Lei 8.213/91, art. 86, §1º

/**
 * @param {{sequelaComReducaoCapacidadeAtestada:boolean}} dados
 * @returns {{elegivel:boolean, pendencias:string[]}}
 */
function elegibilidadeAuxilioAcidente(dados) {
  var pendencias = [];
  if (dados.sequelaComReducaoCapacidadeAtestada !== true) {
    pendencias.push('sequela permanente de acidente, com redução da capacidade para o trabalho habitualmente exercido, não atestada por perícia médica do INSS (art. 86, Lei 8.213/91)');
  }
  return { elegivel: pendencias.length === 0, pendencias: pendencias };
}

/**
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - já calculado (não computado aqui).
 * @param {number} [dados.salarioMinimoVigente]
 * @param {number} [dados.tetoRGPSVigente]
 * @returns {{percentualAplicado:number, rmiAntesDoPisoTeto:number, rmiFinal:number,
 *   aplicouPiso:boolean, aplicouTeto:boolean}}
 */
function calcularRMIAuxilioAcidente(dados) {
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIAuxilioAcidente: salarioBeneficio precisa ser um número maior que zero');
  }
  var rmiAntesDoPisoTeto = Math.round(dados.salarioBeneficio * PERCENTUAL_AUXILIO_ACIDENTE * 100) / 100;
  var rmiFinal = rmiAntesDoPisoTeto;
  var aplicouPiso = false;
  var aplicouTeto = false;
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
    percentualAplicado: PERCENTUAL_AUXILIO_ACIDENTE,
    rmiAntesDoPisoTeto: rmiAntesDoPisoTeto,
    rmiFinal: rmiFinal,
    aplicouPiso: aplicouPiso,
    aplicouTeto: aplicouTeto
  };
}

var BeneficioAuxilioAcidente = {
  PERCENTUAL_AUXILIO_ACIDENTE,
  elegibilidadeAuxilioAcidente,
  calcularRMIAuxilioAcidente
};
