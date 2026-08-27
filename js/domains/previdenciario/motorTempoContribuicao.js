/* ============================================================================
   MOTORTEMPOCONTRIBUICAO.JS — Primeira entrega do motor de cálculo
   previdenciário (Atualização 12 — Fase 3/Atualização 4 do roteiro, ver
   docs/historico/ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md).

   ESCOPO DESTA ENTREGA: tempo de contribuição (com conversão de tempo
   especial em comum, quando aplicável) e carência. RMI (Renda Mensal
   Inicial) FICA FORA desta entrega, de propósito — depende de qual espécie
   de benefício e qual regra (permanente pós-EC 103/2019 ou alguma regra de
   transição) o usuário quer calcular primeiro; ver docs/ARQUITETURA-
   MIGRACAO-PREVIDENCIARIO.md para o registro dessa decisão em aberto.

   DEPENDE de: js/core/calculoPeriodos.js (mecanismo genérico de datas —
   este arquivo não reimplementa nenhuma aritmética de data, só aplica
   regra previdenciária sobre o resultado dele).

   BASE LEGAL DAS REGRAS ABAIXO (referência, não substitui análise jurídica
   do caso concreto):
     - Tempo de contribuição = soma dos períodos, sem contar duas vezes
       tempo de vínculos concorrentes/sobrepostos (regra geral consolidada
       na jurisprudência e na prática do INSS de não computar em dobro
       tempo simultâneo em mais de uma atividade, salvo hipótese de
       averbação de tempo rural + urbano concomitante, não tratada nesta
       entrega).
     - Conversão de tempo especial em comum: fatores históricos do RGPS —
       homem (meta 35 anos): 1,40 (base 25 anos), 1,75 (base 20 anos), 2,33
       (base 15 anos); mulher (meta 30 anos): 1,20 (base 25 anos), 1,50
       (base 20 anos), 2,00 (base 15 anos).
     - EC 103/2019, art. 25, §2º: VEDADA a conversão de tempo especial em
       comum relativo a período POSTERIOR a 13/11/2019; período anterior
       mantém o direito adquirido à conversão pelas regras vigentes à
       época. Este módulo aplica esse corte automaticamente quando
       `converterTempoEspecial: true`.
     - Carência (Lei 8.213/91, arts. 24 a 27-A): nº de contribuições
       mensais. ESTA ENTREGA calcula uma APROXIMAÇÃO — nº de competências
       (mês/ano) distintas cobertas por algum vínculo informado — sem
       considerar perda da qualidade de segurado, recolhimento em atraso de
       contribuinte individual/facultativo, ou as contagens especiais de
       segurado especial (rural). Ver "limitações" no rodapé do arquivo.
============================================================================ */

var FATOR_CONVERSAO_TEMPO_ESPECIAL = Object.freeze({
  homem: Object.freeze({ 15: 35 / 15, 20: 35 / 20, 25: 35 / 25 }),
  mulher: Object.freeze({ 15: 30 / 15, 20: 30 / 20, 25: 30 / 25 })
});

// EC 103/2019, art. 25 §2º — data a partir da qual não cabe mais conversão
// de tempo especial em comum (tempo posterior a esta data sempre conta 1:1).
var DATA_LIMITE_CONVERSAO_ESPECIAL_COMUM = '2019-11-13';

function validarVinculo(v) {
  CalculoPeriodos.validarIso(v.inicio, 'início do vínculo');
  CalculoPeriodos.validarIso(v.fim, 'fim do vínculo');
  if (v.tipo !== 'comum' && v.tipo !== 'especial') {
    throw new Error(`vínculo com tipo inválido (esperado "comum" ou "especial"): ${v.tipo}`);
  }
  if (v.tipo === 'especial' && ![15, 20, 25].includes(v.anosExposicao)) {
    throw new Error(`vínculo especial precisa de anosExposicao 15, 20 ou 25 (recebido: ${v.anosExposicao})`);
  }
}

// Divide um vínculo especial em até 2 trechos: um até (e incluindo)
// DATA_LIMITE_CONVERSAO_ESPECIAL_COMUM (passível de conversão) e outro
// depois dela (sem direito a conversão, sempre 1:1). Se o vínculo inteiro
// cai de um só lado, devolve só esse trecho.
function dividirNoLimiteConversao(vinculo) {
  const limite = DATA_LIMITE_CONVERSAO_ESPECIAL_COMUM;
  if (CalculoPeriodos.compararIso(vinculo.fim, limite) <= 0) {
    return { comDireito: vinculo, semDireito: null };
  }
  if (CalculoPeriodos.compararIso(vinculo.inicio, limite) > 0) {
    return { comDireito: null, semDireito: vinculo };
  }
  return {
    comDireito: { ...vinculo, fim: limite },
    semDireito: { ...vinculo, inicio: CalculoPeriodos.somarDias(limite, 1) }
  };
}

/* ------------------------------------------------------------------------
   CONCOMITÂNCIA DE ATIVIDADE ESPECIAL (Atualização 45 — refinamento do
   motor existente, a pedido do usuário): antes desta entrega, quando dois
   ou mais vínculos ESPECIAIS convertíveis cobriam os MESMOS dias
   (segurado com dois vínculos especiais simultâneos, ex.: dois empregos),
   o incremento de conversão de cada um era somado independentemente —
   contando o mesmo dia civil mais de uma vez no acréscimo, o que gera
   tempo de contribuição maior que o calendário permite.

   CORRIGIDO com um sweep de intervalos: os dias em que MAIS DE UM trecho
   convertível está ativo usam o incremento de UM SÓ fator (o mais
   vantajoso ao segurado entre os ativos — mesma linha de decisão já usada
   no resto do projeto para casos de concomitância/ambiguidade: nunca
   decidido silenciosamente, sempre sinalizado). Dias cobertos por um único
   trecho continuam exatamente como antes (nenhuma mudança de resultado
   para o caso comum, sem concomitância).

   POLÍTICA (registrada, não uma certeza jurisprudencial fechada — a
   busca feita antes desta entrega não encontrou tese pacífica específica
   sobre qual fator prevalece em atividade especial concomitante,
   diferente do que existe para concomitância de SALÁRIO, Art. 32, Lei
   8.213/91): usa o fator mais vantajoso para os dias sobrepostos, e
   sinaliza `.houveConcomitanciaEspecial` para revisão manual do advogado.
------------------------------------------------------------------------ */
function calcularAcrescimoConversaoSemDuplicar(trechosConversiveis, sexo) {
  if (trechosConversiveis.length === 0) {
    return { totalDiasAcrescimo: 0, houveConcomitanciaEspecial: false };
  }

  // Pontos de quebra: todo início e todo (fim + 1 dia) de cada trecho —
  // entre dois pontos consecutivos, o conjunto de trechos ativos nunca
  // muda (por construção), então cada subintervalo pode ser tratado com
  // um único fator.
  const pontosSet = new Set();
  trechosConversiveis.forEach(function (t) {
    pontosSet.add(t.inicio);
    pontosSet.add(CalculoPeriodos.somarDias(t.fim, 1));
  });
  const pontos = Array.from(pontosSet).sort(function (a, b) { return CalculoPeriodos.compararIso(a, b); });

  let totalDiasAcrescimo = 0;
  let houveConcomitanciaEspecial = false;

  for (let i = 0; i < pontos.length - 1; i++) {
    const inicioSub = pontos[i];
    const fimSubExclusivo = pontos[i + 1];
    const fimSub = CalculoPeriodos.somarDias(fimSubExclusivo, -1);
    if (CalculoPeriodos.compararIso(inicioSub, fimSub) > 0) continue; // subintervalo vazio

    const ativos = trechosConversiveis.filter(function (t) {
      return CalculoPeriodos.compararIso(t.inicio, inicioSub) <= 0 &&
        CalculoPeriodos.compararIso(t.fim, fimSub) >= 0;
    });
    if (ativos.length === 0) continue;
    if (ativos.length > 1) houveConcomitanciaEspecial = true;

    // Menor anosExposicao entre os ativos = maior fator = mais vantajoso.
    const melhorAnosExposicao = ativos.reduce(function (menor, t) {
      return t.anosExposicao < menor ? t.anosExposicao : menor;
    }, ativos[0].anosExposicao);
    const fator = FATOR_CONVERSAO_TEMPO_ESPECIAL[sexo][melhorAnosExposicao];

    const diasSub = CalculoPeriodos.totalDiasCorridos(inicioSub, fimSub);
    totalDiasAcrescimo += diasSub * (fator - 1);
  }

  return { totalDiasAcrescimo: totalDiasAcrescimo, houveConcomitanciaEspecial: houveConcomitanciaEspecial };
}

/**
 * Calcula o tempo de contribuição total a partir de uma lista de vínculos.
 *
 * @param {Array<{inicio:string, fim:string, tipo:'comum'|'especial', anosExposicao?:15|20|25}>} vinculos
 * @param {{sexo?: 'homem'|'mulher', converterTempoEspecial?: boolean}} opcoes
 * @returns {{tempoSemConversao:{anos,meses,dias}, tempoConvertidoAdicional:{anos,meses,dias}, tempoTotal:{anos,meses,dias}, periodosMesclados:Array, houveConcomitanciaEspecial:boolean}}
 */
function calcularTempoContribuicao(vinculos, opcoes = {}) {
  if (!Array.isArray(vinculos) || vinculos.length === 0) {
    throw new Error('calcularTempoContribuicao: informe ao menos um vínculo');
  }
  vinculos.forEach(validarVinculo);

  const converter = !!opcoes.converterTempoEspecial;
  const sexo = opcoes.sexo === 'mulher' ? 'mulher' : 'homem';

  // Períodos que contam 1:1 (todo tempo, comum ou especial, sempre conta ao
  // menos como tempo comum) — usados para o tempo "sem conversão".
  const periodos1a1 = [];
  // Trechos com direito a conversão (pré-limite), guardados para calcular o
  // ACRÉSCIMO de tempo (diferença entre convertido e original).
  const trechosConversiveis = [];

  for (const v of vinculos) {
    if (v.tipo === 'comum') {
      periodos1a1.push({ inicio: v.inicio, fim: v.fim });
      continue;
    }
    // especial
    if (!converter) {
      periodos1a1.push({ inicio: v.inicio, fim: v.fim });
      continue;
    }
    const { comDireito, semDireito } = dividirNoLimiteConversao(v);
    if (semDireito) periodos1a1.push({ inicio: semDireito.inicio, fim: semDireito.fim });
    if (comDireito) {
      periodos1a1.push({ inicio: comDireito.inicio, fim: comDireito.fim });
      trechosConversiveis.push({ ...comDireito });
    }
  }

  const { total: tempoSemConversao, periodosMesclados } =
    CalculoPeriodos.tempoTotalDePeriodos(periodos1a1);

  // Acréscimo de conversão: computado por um sweep de intervalos que NUNCA
  // conta o mesmo dia civil duas vezes, mesmo com vínculos especiais
  // concomitantes (ver calcularAcrescimoConversaoSemDuplicar acima).
  const { totalDiasAcrescimo, houveConcomitanciaEspecial } =
    calcularAcrescimoConversaoSemDuplicar(trechosConversiveis, sexo);
  const tempoConvertidoAdicional = trechosConversiveis.length
    ? CalculoPeriodos.diasParaDuracaoConvencional(totalDiasAcrescimo)
    : { anos: 0, meses: 0, dias: 0 };

  const tempoTotal = CalculoPeriodos.somarDuracoes(tempoSemConversao, tempoConvertidoAdicional);

  return { tempoSemConversao, tempoConvertidoAdicional, tempoTotal, periodosMesclados, houveConcomitanciaEspecial };
}

/**
 * Aproximação de carência: nº de competências (mês/ano) distintas cobertas
 * por qualquer vínculo informado, após mesclar sobreposições. Ver
 * limitações no cabeçalho do arquivo.
 *
 * @param {Array<{inicio:string, fim:string}>} vinculos
 * @returns {{competencias:string[], totalMeses:number}}
 */
function calcularCarencia(vinculos) {
  if (!Array.isArray(vinculos) || vinculos.length === 0) {
    throw new Error('calcularCarencia: informe ao menos um vínculo');
  }
  vinculos.forEach(v => { CalculoPeriodos.validarIso(v.inicio, 'início'); CalculoPeriodos.validarIso(v.fim, 'fim'); });

  const mesclados = CalculoPeriodos.mesclarPeriodos(vinculos);
  const competenciasSet = new Set();
  for (const p of mesclados) {
    for (const c of CalculoPeriodos.competenciasDoPeriodo(p.inicio, p.fim)) competenciasSet.add(c);
  }
  const competencias = Array.from(competenciasSet).sort();
  return { competencias, totalMeses: competencias.length };
}

var MotorTempoContribuicao = {
  FATOR_CONVERSAO_TEMPO_ESPECIAL,
  DATA_LIMITE_CONVERSAO_ESPECIAL_COMUM,
  calcularTempoContribuicao,
  calcularCarencia,
  calcularAcrescimoConversaoSemDuplicar
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA (registradas de propósito, para
   decisão consciente futura — mesmo padrão de "achados" já usado no
   restante do projeto):
     1. calcularCarencia não distingui segurado empregado (presunção legal
        de contribuição mensal enquanto o vínculo dura) de contribuinte
        individual/facultativo (carência real depende de recolhimento
        mês a mês, inclusive em atraso) — hoje toda competência tocada por
        um vínculo conta, sem checar tipo de segurado.
     2. Não trata perda da qualidade de segurado (art. 15 da Lei 8.213/91)
        nem prazo de manutenção do direito após cessar contribuição.
     3. Não trata segurado especial (rural) nem contagem recíproca com
        RPPS.
     4. Não trata concomitância proposital (tempo rural + urbano no mesmo
        período, que em alguns casos PODE ser somado sem mesclar) — este
        módulo sempre mescla qualquer sobreposição. DIFERENTE da
        concomitância de atividade ESPECIAL (dois vínculos especiais
        simultâneos), corrigida na Atualização 45 — ver
        calcularAcrescimoConversaoSemDuplicar acima.
     5. Concomitância de atividade especial (Atualização 45): quando dois
        vínculos especiais convertíveis se sobrepõem, usa o fator mais
        vantajoso para os dias sobrepostos, sinalizado em
        `.houveConcomitanciaEspecial` — não há tese jurisprudencial
        pacífica localizada especificamente sobre qual fator prevalece
        nesse cenário (diferente da concomitância de salário, Art. 32,
        Lei 8.213/91, que tem base legal expressa); decisão de política,
        sempre sinalizada para revisão, nunca aplicada silenciosamente.
   Nenhuma dessas limitações bloqueia o uso do módulo para o caso mais
   comum (empregado urbano, vínculos CNIS não concomitantes); ficam
   registradas para quando o caso de uso pedir mais precisão.
---------------------------------------------------------------------- */
