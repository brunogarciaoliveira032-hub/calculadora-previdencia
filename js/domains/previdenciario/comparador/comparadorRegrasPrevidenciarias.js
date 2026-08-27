/* ============================================================================
   COMPARADOR/COMPARADORREGRASPREVIDENCIARIAS.JS — Comparador das regras de
   aposentadoria programada (permanente + as 4 regras de transição da EC
   103/2019). Atualização 50, a pedido do usuário — arquitetura exatamente
   como especificada por ele:

     Motor permanente ─┐
     Motor pontos ──────┤
     Motor idade prog. ─┼──▶ Comparador ──▶ Ranking ──▶ Melhor regra
     Motor pedágio 50 ──┤
     Motor pedágio 100 ─┘

   ESTE MÓDULO NÃO CALCULA NADA — mesma disciplina do item 6/item 8 desta
   sessão (motor jurídico decide, isto só agrega e ordena o que os 5
   motores/regras já decidiram). Não reabre nenhuma fórmula de RMI, não
   reavalia nenhuma elegibilidade — só lê `.elegivel` e `.rmiFinal` de cada
   resultado já pronto e organiza um ranking.

   REGRA DE RANKING: só entram no ranking (e concorrem a "melhor regra")
   as regras EFETIVAMENTE ELEGÍVEIS com RMI calculada — nunca uma regra
   inelegível "vence" por ter o maior número; regras não elegíveis ou sem
   RMI aparecem na lista completa (`regras`), mas com `.podeConcorrer:
   false` e o motivo. Em empate de RMI, a ordem de entrada é preservada
   (nenhum critério de desempate extra é inventado).

   ENTRADA: aceita o MESMO objeto `resultado` já usado em
   painelPrevidenciario.js (com `.elegibilidade`/`.rmiTeorica` da regra
   permanente e `.regraPontos`/`.regraIdadeMinimaProgressiva`/
   `.regraPedagio50`/`.regraPedagio100` quando cada um foi avaliado) — não
   pede aos motores para rodar de novo, só lê o que já está lá.
============================================================================ */

function _comparadorExtrairRegra(nome, baseLegal, avaliacao, chaveElegibilidade, chaveRmi) {
  if (!avaliacao) return null; // regra não avaliada neste cálculo — nem entra na lista
  var elegibilidade = chaveElegibilidade ? avaliacao[chaveElegibilidade] : avaliacao;
  var rmi = chaveRmi ? avaliacao[chaveRmi] : avaliacao;
  var elegivel = elegibilidade ? elegibilidade.elegivel === true : false;
  var rmiFinal = (rmi && typeof rmi.rmiFinal === 'number') ? rmi.rmiFinal : null;

  var podeConcorrer = elegivel && rmiFinal !== null;
  var motivoForaDoRanking = null;
  if (!podeConcorrer) {
    if (!elegivel) motivoForaDoRanking = 'não elegível nesta regra';
    else if (rmiFinal === null) motivoForaDoRanking = 'RMI não calculada nesta regra (ver seção da regra para o motivo — ex.: fator previdenciário não informado)';
  }

  return {
    nome: nome,
    baseLegal: baseLegal,
    elegivel: elegivel,
    rmiFinal: rmiFinal,
    podeConcorrer: podeConcorrer,
    motivoForaDoRanking: motivoForaDoRanking
  };
}

/**
 * @param {object} resultado - mesmo objeto usado em painelPrevidenciario.js,
 *   já com as regras avaliadas anexadas (o que não foi avaliado é
 *   simplesmente ignorado, não gera erro).
 * @returns {{
 *   regras: Array<{nome, baseLegal, elegivel, rmiFinal, podeConcorrer, motivoForaDoRanking}>,
 *   ranking: Array<{nome, baseLegal, rmiFinal}>, // só as elegíveis com RMI, ordenadas do maior pro menor RMI
 *   melhorRegra: {nome, baseLegal, rmiFinal}|null,
 *   motivoSemMelhorRegra: string|null
 * }}
 */
function compararRegrasPrevidenciarias(resultado) {
  resultado = resultado || {};

  var candidatas = [
    _comparadorExtrairRegra('Direito adquirido (tempo de contribuição)', 'Lei 8.213/91, art. 53 (regra pré-EC 103/2019)', resultado.direitoAdquiridoTempoContribuicao, 'elegibilidade', 'rmi'),
    _comparadorExtrairRegra('Regra permanente', 'EC 103/2019, art. 26', resultado.elegibilidade ? { elegibilidade: resultado.elegibilidade, rmi: resultado.rmiTeorica } : null, 'elegibilidade', 'rmi'),
    _comparadorExtrairRegra('Pontos', 'EC 103/2019, art. 15', resultado.regraPontos, 'elegibilidade', 'rmi'),
    _comparadorExtrairRegra('Idade mínima progressiva', 'EC 103/2019, art. 16', resultado.regraIdadeMinimaProgressiva, 'elegibilidade', 'rmi'),
    _comparadorExtrairRegra('Pedágio 50%', 'EC 103/2019, art. 17', resultado.regraPedagio50, 'elegibilidade', 'rmi'),
    _comparadorExtrairRegra('Pedágio 100%', 'EC 103/2019, art. 20', resultado.regraPedagio100, 'elegibilidade', 'rmi')
  ].filter(Boolean); // remove as regras não avaliadas neste cálculo

  var ranking = candidatas
    .filter(function (r) { return r.podeConcorrer; })
    .map(function (r) { return { nome: r.nome, baseLegal: r.baseLegal, rmiFinal: r.rmiFinal }; });
  // Ordena do MAIOR RMI pro menor — estável (Array.prototype.sort em
  // engines modernas já é estável; não é preciso critério de desempate
  // extra, mantém a ordem de entrada em caso de empate).
  ranking.sort(function (a, b) { return b.rmiFinal - a.rmiFinal; });

  var melhorRegra = ranking.length ? ranking[0] : null;
  var motivoSemMelhorRegra = null;
  if (!melhorRegra) {
    motivoSemMelhorRegra = candidatas.length
      ? 'Nenhuma das regras avaliadas está elegível com RMI calculada — revise os requisitos de cada regra individualmente.'
      : 'Nenhuma regra foi avaliada ainda neste cálculo.';
  }

  return {
    regras: candidatas,
    ranking: ranking,
    melhorRegra: melhorRegra,
    motivoSemMelhorRegra: motivoSemMelhorRegra
  };
}

var ComparadorRegrasPrevidenciarias = {
  compararRegrasPrevidenciarias
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA:
     1. Compara só as regras de aposentadoria PROGRAMADA por tempo de
        contribuição — permanente, as 4 transições da EC 103/2019, e o
        direito adquirido à regra pré-reforma (Atualização 51) — não
        inclui professor, especial, rural, PCD (ainda não implementadas)
        nem as espécies de benefício de incapacidade/pensão/auxílio/
        maternidade (são benefícios distintos, não "a mesma aposentadoria
        por caminhos diferentes" — comparar RMI entre eles não faz
        sentido do mesmo jeito).
     2. Em caso de empate exato de RMI entre duas regras elegíveis, não
        aplica nenhum critério de desempate (ex.: qual tem requisitos mais
        fáceis de manter, qual dá direito a benefícios adicionais) — a
        decisão final de qual regra requerer continua sendo do advogado.
---------------------------------------------------------------------- */
