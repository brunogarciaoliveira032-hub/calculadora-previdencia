/* ============================================================================
   MOTORRMI.JS — RMI (Renda Mensal Inicial) da aposentadoria programada,
   REGRA PERMANENTE pós-EC 103/2019 (Reforma da Previdência), Atualização 13.

   ESCOPO DESTA ENTREGA (decidido com o usuário): só a regra PERMANENTE do
   art. 26 da EC 103/2019 para APOSENTADORIA PROGRAMADA (a que substituiu a
   antiga aposentadoria por tempo de contribuição + a aposentadoria por
   idade, unificadas numa só modalidade). NENHUMA regra de transição
   (pontos, pedágio 50%, pedágio 100%, idade mínima progressiva) está
   implementada aqui — cada uma tem fórmula própria e fica para uma entrega
   futura, se o usuário precisar.

   DEPENDE de: nada em tempo de execução (é uma função pura de fórmula) —
   mas o valor de tempoContribuicaoAnos normalmente vem do resultado de
   js/domains/previdenciario/motorTempoContribuicao.js (calcularTempoContribuicao).

   BASE LEGAL (referência, não substitui análise jurídica do caso concreto):
     - EC 103/2019, art. 26, caput e §2º: RMI = 60% do salário de benefício,
       ACRESCIDO de 2 pontos percentuais para cada ano que exceder o tempo
       mínimo de contribuição exigido (20 anos para homem, 15 para mulher).
     - EC 103/2019, art. 19: requisitos da regra permanente — idade mínima
       65 anos (homem) / 62 anos (mulher) + tempo de contribuição mínimo 20
       anos (homem) / 15 anos (mulher) + carência de 180 contribuições
       mensais (Lei 8.213/91, art. 25, II, mantido pela reforma).
     - Lei 8.213/91, art. 33 c/c EC 103/2019: o valor do benefício não pode
       ser inferior a um salário-mínimo nem superior ao teto do RGPS
       (ambos variam por portaria interministerial anual — por isso este
       módulo EXIGE que sejam informados pelo chamador; não há valor
       hardcoded que ficaria desatualizado).
     - "Salário de benefício" (a média que serve de base ao percentual) NÃO
       é calculado por este módulo: pressupõe-se já calculado (é a média
       aritmética de todos os salários de contribuição desde 07/1994,
       devidamente atualizados monetariamente mês a mês pelo INPC — cálculo
       que depende de uma série histórica de índices e fica como entrega
       separada, no mesmo padrão de js/core/indices.js).
============================================================================ */

var TEMPO_MINIMO_CONTRIBUICAO_ANOS = Object.freeze({ homem: 20, mulher: 15 });
var IDADE_MINIMA_ANOS = Object.freeze({ homem: 65, mulher: 62 });
var CARENCIA_MINIMA_MESES = 180; // Lei 8.213/91, art. 25, II

function validarSexo(sexo) {
  if (sexo !== 'homem' && sexo !== 'mulher') {
    throw new Error(`sexo inválido (esperado "homem" ou "mulher"): ${sexo}`);
  }
}

// Converte {anos, meses, dias} (formato usado por MotorTempoContribuicao) em
// anos fracionários, pela mesma convenção 30 dias/mês já usada em
// js/core/calculoPeriodos.js (diasParaDuracaoConvencional) — mantém as duas
// peças do motor previdenciário consistentes entre si.
function paraAnosFracionarios(tempo) {
  if (typeof tempo === 'number') return tempo;
  const { anos = 0, meses = 0, dias = 0 } = tempo || {};
  return anos + meses / 12 + dias / 360;
}

/**
 * Verifica se os requisitos da REGRA PERMANENTE (art. 19, EC 103/2019) estão
 * cumpridos. Não calcula RMI — só elegibilidade.
 *
 * @param {{idadeAnos:number, tempoContribuicao:{anos,meses,dias}|number, carenciaMeses:number, sexo:'homem'|'mulher'}} dados
 * @returns {{elegivel:boolean, pendencias:string[]}}
 */
function elegibilidadeRegraPermanente(dados) {
  validarSexo(dados.sexo);
  const pendencias = [];
  const idadeMinima = IDADE_MINIMA_ANOS[dados.sexo];
  const tempoMinimo = TEMPO_MINIMO_CONTRIBUICAO_ANOS[dados.sexo];
  const tempoAnos = paraAnosFracionarios(dados.tempoContribuicao);

  if (typeof dados.idadeAnos !== 'number' || dados.idadeAnos < idadeMinima) {
    pendencias.push(`idade mínima não atingida (exige ${idadeMinima} anos)`);
  }
  if (tempoAnos < tempoMinimo) {
    pendencias.push(`tempo de contribuição mínimo não atingido (exige ${tempoMinimo} anos)`);
  }
  if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < CARENCIA_MINIMA_MESES) {
    pendencias.push(`carência mínima não atingida (exige ${CARENCIA_MINIMA_MESES} contribuições)`);
  }
  return { elegivel: pendencias.length === 0, pendencias };
}

/**
 * Calcula a RMI da aposentadoria programada pela regra permanente.
 *
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - média já calculada dos salários
 *   de contribuição atualizados (este módulo NÃO calcula essa média).
 * @param {{anos,meses,dias}|number} dados.tempoContribuicao - saída de
 *   MotorTempoContribuicao.calcularTempoContribuicao(...).tempoTotal, ou um
 *   número de anos fracionários.
 * @param {'homem'|'mulher'} dados.sexo
 * @param {number} [dados.salarioMinimoVigente] - se informado, aplica como
 *   piso do benefício (competência do cálculo é responsabilidade do
 *   chamador — o valor muda por portaria interministerial).
 * @param {number} [dados.tetoRGPSVigente] - se informado, aplica como teto.
 * @returns {{
 *   percentualAplicado:number, anosExcedentesConsiderados:number,
 *   tempoMinimoExigidoAnos:number, rmiAntesDoPisoTeto:number,
 *   rmiFinal:number, aplicouPiso:boolean, aplicouTeto:boolean
 * }}
 */
function calcularRMI(dados) {
  validarSexo(dados.sexo);
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMI: salarioBeneficio precisa ser um número maior que zero');
  }
  const tempoMinimoExigidoAnos = TEMPO_MINIMO_CONTRIBUICAO_ANOS[dados.sexo];
  const tempoAnos = paraAnosFracionarios(dados.tempoContribuicao);

  // "Para cada ano que exceder" — só anos COMPLETOS excedentes contam o
  // adicional de 2 pontos percentuais; a fração de ano remanescente não
  // gera adicional proporcional (convenção usual de cálculo do INSS/
  // calculadoras previdenciárias; ano em curso só conta quando completo).
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

var MotorRMI = {
  TEMPO_MINIMO_CONTRIBUICAO_ANOS,
  IDADE_MINIMA_ANOS,
  CARENCIA_MINIMA_MESES,
  elegibilidadeRegraPermanente,
  calcularRMI
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA:
     1. Não calcula o "salário de benefício" (média dos salários de
        contribuição atualizados desde 07/1994) — recebe esse valor pronto.
        Calculá-lo exige uma série histórica de índices de atualização
        monetária mês a mês, tratada como entrega separada.
     2. Não implementa nenhuma regra de TRANSIÇÃO (pontos, pedágio 50%,
        pedágio 100%, idade mínima progressiva) — só a regra permanente.
     3. Não valida se a atividade tinha direito a algum acréscimo/redução
        específico (ex.: professor, PCD, atividade especial já convertida
        — essa conversão já é tratada por MotorTempoContribuicao, mas o
        eventual acréscimo de RMI para PCD segue regra própria, não
        implementada).
     4. salarioMinimoVigente/tetoRGPSVigente ficam por conta do chamador de
        propósito — nenhum valor está fixado no código.
---------------------------------------------------------------------- */
