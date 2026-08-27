/* ============================================================================
   BENEFICIOS/INCAPACIDADEPERMANENTE.JS — Aposentadoria por incapacidade
   permanente (antiga "aposentadoria por invalidez"). Atualização 43 —
   primeira espécie do catálogo `beneficios/` além da aposentadoria
   programada, escolhida pelo usuário como fase 1.

   BASE LEGAL (referência, não substitui análise jurídica do caso concreto;
   conferida por busca antes de codificar):
     - Lei 8.213/91, art. 42: requisitos — qualidade de segurado, carência
       (regra geral) e incapacidade total e permanente para qualquer
       atividade laboral, atestada por perícia médica do INSS, sem
       possibilidade de reabilitação.
     - Lei 8.213/91, art. 25, I: carência de 12 contribuições mensais —
       DISPENSADA nos casos de acidente de qualquer natureza/causa, doença
       profissional/do trabalho, ou doença/afecção especificada em lista do
       Ministério da Saúde/Previdência (art. 26, II) — este módulo não tem
       essa lista (mesma limitação já registrada para vocabulário jurídico
       específico em outros módulos do projeto), por isso recebe a
       dispensa como fato já verificado pelo chamador.
     - EC 103/2019, art. 26 (nova redação dada aos incisos sobre
       incapacidade): RMI = 60% do salário de benefício + 2 pontos
       percentuais por ano que exceder 20 anos de contribuição (homem) ou
       15 anos (mulher) — EXATAMENTE a mesma fórmula e os mesmos tempos
       mínimos da regra permanente da aposentadoria programada
       (motorRMI.js) — por isso este módulo REAPROVEITA
       MotorRMI.calcularRMI() diretamente no caso não acidentário, em vez
       de duplicar a fórmula.
     - EXCEÇÃO — incapacidade decorrente de acidente de trabalho, doença
       profissional ou doença do trabalho: RMI = 100% do salário de
       benefício (íntegra, sem redução, sem a fórmula de anos excedentes).
     - Lei 8.213/91, art. 45: acréscimo de 25% quando o segurado necessita
       de assistência permanente de outra pessoa ("grande invalidez") —
       aplicado sobre o valor já calculado (depois de piso/teto), e o
       PRÓPRIO ACRÉSCIMO não é limitado pelo teto do RGPS (art. 45,
       parágrafo único, "a": devido ainda que o valor atinja o limite
       máximo legal).

   DEPENDE de: MotorRMI (motorRMI.js) já carregado no mesmo escopo global
   — reaproveitado para a fórmula do caso não acidentário.

   LIMITAÇÕES CONHECIDAS (documentadas, não escondidas):
     1. Não verifica qualidade de segurado — pressuposto legal não
        modelado neste projeto (mesma limitação já registrada nas regras
        de transição da EC 103/2019 quanto à filiação anterior a
        13/11/2019).
     2. Não tem a lista de doenças/afecções que dispensam carência (art.
        26, II, Lei 8.213/91) nem confirma perícia médica real — recebe
        `incapacidadeAtestada`, `causaAcidentaria` e `dispensaCarencia`
        como fatos já verificados pelo chamador.
     3. Não calcula "salário de benefício" — mesma limitação de
        motorRMI.js, recebe esse valor já pronto.
     4. Não trata a conversão de auxílio por incapacidade temporária em
        incapacidade permanente (DIB retroativa ao início do auxílio) nem
        a discussão de direito intertemporal sobre a Data de Início da
        Incapacidade (DII) anterior/posterior à EC 103/2019 — fora do
        escopo desta entrega.
============================================================================ */

if (typeof MotorRMI === 'undefined') {
  throw new Error('beneficios/incapacidadePermanente.js depende de MotorRMI (motorRMI.js) já carregado no mesmo escopo global');
}

var CARENCIA_MINIMA_INCAPACIDADE_MESES = 12; // Lei 8.213/91, art. 25, I
var ADICIONAL_GRANDE_INVALIDEZ_PERCENTUAL = 0.25; // Lei 8.213/91, art. 45

/**
 * Verifica se os requisitos da aposentadoria por incapacidade permanente
 * estão cumpridos. Não calcula RMI — só elegibilidade. SEM idade mínima,
 * SEM tempo de contribuição mínimo (diferente das aposentadorias por
 * tempo/idade) — o requisito central é a própria incapacidade.
 *
 * @param {{incapacidadeAtestada:boolean, carenciaMeses:number,
 *   dispensaCarencia?:boolean}} dados
 * @returns {{elegivel:boolean, pendencias:string[]}}
 */
function elegibilidadeIncapacidadePermanente(dados) {
  var pendencias = [];

  if (dados.incapacidadeAtestada !== true) {
    pendencias.push('incapacidade total e permanente para qualquer atividade laboral não atestada por perícia médica do INSS (art. 42, Lei 8.213/91)');
  }

  if (!dados.dispensaCarencia) {
    if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < CARENCIA_MINIMA_INCAPACIDADE_MESES) {
      pendencias.push(`carência mínima não atingida (exige ${CARENCIA_MINIMA_INCAPACIDADE_MESES} contribuições, art. 25, I, Lei 8.213/91) — não informada dispensa de carência (acidente ou doença/afecção listada, art. 26, II)`);
    }
  }

  return { elegivel: pendencias.length === 0, pendencias: pendencias };
}

/**
 * Calcula a RMI da aposentadoria por incapacidade permanente.
 *
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - média já calculada (este
 *   módulo NÃO calcula essa média).
 * @param {boolean} dados.causaAcidentaria - true = decorrente de acidente
 *   de trabalho, doença profissional ou doença do trabalho (RMI = 100%);
 *   false = regra geral (RMI = 60% + 2%/ano excedente, mesma fórmula da
 *   regra permanente).
 * @param {{anos,meses,dias}|number} [dados.tempoContribuicao] - só usado
 *   (e obrigatório) quando causaAcidentaria é false.
 * @param {'homem'|'mulher'} [dados.sexo] - só usado (e obrigatório) quando
 *   causaAcidentaria é false.
 * @param {boolean} [dados.necessitaAssistenciaPermanente] - "grande
 *   invalidez" (art. 45) — acrescenta 25% ao final, SEM respeitar o teto
 *   do RGPS neste acréscimo (o teto só é aplicado à RMI-base).
 * @param {number} [dados.salarioMinimoVigente]
 * @param {number} [dados.tetoRGPSVigente]
 * @returns {{
 *   causaAcidentaria:boolean, percentualAplicado:number|null,
 *   anosExcedentesConsiderados:number|null, rmiBaseAntesDoPisoTeto:number,
 *   rmiBase:number, aplicouPiso:boolean, aplicouTeto:boolean,
 *   adicionalGrandeInvalidezAplicado:boolean, rmiFinal:number
 * }}
 */
function calcularRMIIncapacidadePermanente(dados) {
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIIncapacidadePermanente: salarioBeneficio precisa ser um número maior que zero');
  }

  var rmiBase;
  var percentualAplicado = null;
  var anosExcedentesConsiderados = null;
  var aplicouPiso = false;
  var aplicouTeto = false;

  if (dados.causaAcidentaria === true) {
    // 100% do salário de benefício, sem a fórmula de anos excedentes.
    rmiBase = dados.salarioBeneficio;
    // Correção (achado da perícia de software): mesma validação cruzada
    // piso/teto das demais espécies — rejeita entrada inconsistente em vez
    // de aplicar o teto por cima do piso silenciosamente.
    if (typeof dados.salarioMinimoVigente === 'number' && typeof dados.tetoRGPSVigente === 'number'
        && dados.salarioMinimoVigente > dados.tetoRGPSVigente) {
      throw new Error(`salarioMinimoVigente (${dados.salarioMinimoVigente}) não pode ser maior que tetoRGPSVigente (${dados.tetoRGPSVigente}) — entrada inconsistente`);
    }
    if (typeof dados.salarioMinimoVigente === 'number' && rmiBase < dados.salarioMinimoVigente) {
      rmiBase = dados.salarioMinimoVigente;
      aplicouPiso = true;
    }
    if (typeof dados.tetoRGPSVigente === 'number' && rmiBase > dados.tetoRGPSVigente) {
      rmiBase = dados.tetoRGPSVigente;
      aplicouTeto = true;
    }
  } else {
    // Regra geral: EXATAMENTE a fórmula da regra permanente (art. 26) —
    // reaproveita MotorRMI.calcularRMI() em vez de duplicar.
    var resultadoPermanente = MotorRMI.calcularRMI({
      salarioBeneficio: dados.salarioBeneficio,
      tempoContribuicao: dados.tempoContribuicao,
      sexo: dados.sexo,
      salarioMinimoVigente: dados.salarioMinimoVigente,
      tetoRGPSVigente: dados.tetoRGPSVigente
    });
    rmiBase = resultadoPermanente.rmiFinal;
    percentualAplicado = resultadoPermanente.percentualAplicado;
    anosExcedentesConsiderados = resultadoPermanente.anosExcedentesConsiderados;
    aplicouPiso = resultadoPermanente.aplicouPiso;
    aplicouTeto = resultadoPermanente.aplicouTeto;
  }

  var adicionalGrandeInvalidezAplicado = dados.necessitaAssistenciaPermanente === true;
  // Art. 45, parágrafo único, "a": o acréscimo é devido AINDA QUE o valor
  // já tenha atingido o teto — por isso multiplica DEPOIS do piso/teto já
  // aplicados acima, sem limitar de novo o resultado final.
  var rmiFinal = adicionalGrandeInvalidezAplicado
    ? Math.round(rmiBase * (1 + ADICIONAL_GRANDE_INVALIDEZ_PERCENTUAL) * 100) / 100
    : rmiBase;

  return {
    causaAcidentaria: dados.causaAcidentaria === true,
    percentualAplicado: percentualAplicado,
    anosExcedentesConsiderados: anosExcedentesConsiderados,
    rmiBase: rmiBase,
    aplicouPiso: aplicouPiso,
    aplicouTeto: aplicouTeto,
    adicionalGrandeInvalidezAplicado: adicionalGrandeInvalidezAplicado,
    rmiFinal: rmiFinal
  };
}

var BeneficioIncapacidadePermanente = {
  CARENCIA_MINIMA_INCAPACIDADE_MESES,
  ADICIONAL_GRANDE_INVALIDEZ_PERCENTUAL,
  elegibilidadeIncapacidadePermanente,
  calcularRMIIncapacidadePermanente
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA (ver também cabeçalho do arquivo):
     1. Não verifica qualidade de segurado.
     2. Não tem a lista de doenças/afecções que dispensam carência, nem
        confirma perícia médica real — recebe como fatos já verificados.
     3. Não trata conversão de auxílio por incapacidade temporária nem a
        discussão de DII anterior/posterior à EC 103/2019.
     4. Próxima fase do catálogo `beneficios/` (auxílio-incapacidade
        temporária, pensão por morte, auxílio-acidente, salário-
        maternidade etc.) fica para decisão futura do usuário.
---------------------------------------------------------------------- */
