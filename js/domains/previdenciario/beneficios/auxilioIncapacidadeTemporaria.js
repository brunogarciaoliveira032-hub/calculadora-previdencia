/* ============================================================================
   BENEFICIOS/AUXILIOINCAPACIDADETEMPORARIA.JS — Auxílio por incapacidade
   temporária (antigo "auxílio-doença"). Atualização 44 — fase 2 do
   catálogo `beneficios/`.

   BASE LEGAL (conferida por busca antes de codificar):
     - Lei 8.213/91, art. 59: incapacidade temporária (não necessariamente
       total) para o trabalho ou atividade habitual, por mais de 15 dias
       consecutivos, atestada por perícia médica.
     - Lei 8.213/91, art. 25, I c/c art. 26, II: carência de 12
       contribuições mensais, DISPENSADA em caso de acidente de qualquer
       natureza/causa (inclusive doença profissional/do trabalho) ou
       doença/afecção especificada em lista (mesma dispensa da
       incapacidade permanente — ver beneficios/incapacidadePermanente.js).
     - Lei 8.213/91, art. 61 (redação pós EC 103/2019): RMI = 91% do
       salário de benefício — NÃO foi alterada pela reforma (continua a
       mesma fórmula desde a Lei 13.135/2015), diferente da aposentadoria
       por incapacidade permanente.
     - Lei 8.213/91, art. 29, §10: o salário de benefício deste auxílio
       específico não pode exceder a média aritmética simples dos últimos
       12 salários de contribuição — regra própria deste benefício, NÃO
       implementada aqui (ver limitações), recebida como teto opcional.

   LIMITAÇÕES CONHECIDAS:
     1. Não calcula o limite do art. 29, §10 (média dos últimos 12
        salários de contribuição) — recebe como `limiteMediaUltimos12SC`
        opcional; se informado, funciona como um teto adicional.
     2. Não verifica qualidade de segurado nem confirma perícia real —
        mesmas limitações já registradas em incapacidadePermanente.js.
     3. Não calcula "salário de benefício" — recebido pronto.
============================================================================ */

var CARENCIA_MINIMA_AUX_INCAPACIDADE_TEMP_MESES = 12; // Lei 8.213/91, art. 25, I
var PERCENTUAL_AUX_INCAPACIDADE_TEMP = 0.91; // Lei 8.213/91, art. 61

/**
 * @param {{incapacidadeAtestada:boolean, carenciaMeses:number, dispensaCarencia?:boolean}} dados
 * @returns {{elegivel:boolean, pendencias:string[]}}
 */
function elegibilidadeAuxilioIncapacidadeTemporaria(dados) {
  var pendencias = [];
  if (dados.incapacidadeAtestada !== true) {
    pendencias.push('incapacidade temporária para o trabalho ou atividade habitual não atestada por perícia médica do INSS, por mais de 15 dias (art. 59, Lei 8.213/91)');
  }
  if (!dados.dispensaCarencia) {
    if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < CARENCIA_MINIMA_AUX_INCAPACIDADE_TEMP_MESES) {
      pendencias.push(`carência mínima não atingida (exige ${CARENCIA_MINIMA_AUX_INCAPACIDADE_TEMP_MESES} contribuições, art. 25, I, Lei 8.213/91) — não informada dispensa de carência (acidente ou doença/afecção listada, art. 26, II)`);
    }
  }
  return { elegivel: pendencias.length === 0, pendencias: pendencias };
}

/**
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - média já calculada (não computada aqui).
 * @param {number} [dados.salarioMinimoVigente]
 * @param {number} [dados.tetoRGPSVigente]
 * @param {number} [dados.limiteMediaUltimos12SC] - teto adicional do art. 29, §10 (opcional, recebido pronto).
 * @returns {{percentualAplicado:number, rmiAntesDoPisoTeto:number, rmiFinal:number,
 *   aplicouPiso:boolean, aplicouTeto:boolean, aplicouLimiteUltimos12SC:boolean}}
 */
function calcularRMIAuxilioIncapacidadeTemporaria(dados) {
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIAuxilioIncapacidadeTemporaria: salarioBeneficio precisa ser um número maior que zero');
  }
  var rmiAntesDoPisoTeto = Math.round(dados.salarioBeneficio * PERCENTUAL_AUX_INCAPACIDADE_TEMP * 100) / 100;
  var rmiFinal = rmiAntesDoPisoTeto;
  var aplicouPiso = false;
  var aplicouTeto = false;
  var aplicouLimiteUltimos12SC = false;

  if (typeof dados.limiteMediaUltimos12SC === 'number' && rmiFinal > dados.limiteMediaUltimos12SC) {
    rmiFinal = dados.limiteMediaUltimos12SC;
    aplicouLimiteUltimos12SC = true;
  }
  // Correção (achado da perícia de software): mesma validação cruzada
  // piso/teto das demais espécies — rejeita entrada inconsistente em vez
  // de aplicar o teto por cima do piso silenciosamente.
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
    percentualAplicado: PERCENTUAL_AUX_INCAPACIDADE_TEMP,
    rmiAntesDoPisoTeto: rmiAntesDoPisoTeto,
    rmiFinal: rmiFinal,
    aplicouPiso: aplicouPiso,
    aplicouTeto: aplicouTeto,
    aplicouLimiteUltimos12SC: aplicouLimiteUltimos12SC
  };
}

var BeneficioAuxilioIncapacidadeTemporaria = {
  CARENCIA_MINIMA_AUX_INCAPACIDADE_TEMP_MESES,
  PERCENTUAL_AUX_INCAPACIDADE_TEMP,
  elegibilidadeAuxilioIncapacidadeTemporaria,
  calcularRMIAuxilioIncapacidadeTemporaria
};
