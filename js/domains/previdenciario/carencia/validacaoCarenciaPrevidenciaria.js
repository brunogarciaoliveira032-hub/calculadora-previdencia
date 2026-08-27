/* ============================================================================
   VALIDACAOCARENCIAPREVIDENCIARIA.JS — a "camada previdenciária específica
   de validação" pedida pelo usuário, corrigindo um problema apontado
   depois da correção crítica de elegibilidade:

   `HistoricoPrevidenciario.calcularTempoEcarenciaDeHistorico()` (Atualização
   15) devolve DOIS indicadores técnicos — `carenciaAproximadaPorVinculo`
   (todo mês dentro do span de um vínculo) e `carenciaPorRemuneracao` (todo
   mês com remuneração > 0 lançada). NENHUM DOS DOIS é a carência legal:
     - "quantidade de meses de vínculo" não é carência — um vínculo pode
       ter meses sem contribuição efetiva (afastamento, licença não
       remunerada) que ainda assim contam para o segurado empregado, por
       presunção legal (não é a mesma coisa que "todo mês do span conta",
       é uma regra jurídica específica, não uma contagem de calendário).
     - "quantidade de remunerações > 0" também não é carência — para o
       segurado EMPREGADO, a carência conta pela filiação (existência do
       vínculo), independentemente de o empregador ter de fato recolhido
       (o CNIS pode ter lacuna de remuneração por omissão do empregador,
       e isso não pode prejudicar o segurado); só para CONTRIBUINTE
       INDIVIDUAL/FACULTATIVO (sem vínculo empregatício) é que a carência
       depende do efetivo pagamento.
   Este arquivo aplica essa distinção (Lei 8.213/91, art. 27, incisos I e
   II) — NUNCA chama o resultado de "carência definitiva": o nome do
   campo é `totalMeses` dentro de um objeto que carrega, ao lado,
   `metodologia` (o que foi aplicado) e `limitacoes` (o que NÃO foi
   verificado), porque mesmo esta apuração deixa de fora peças reais do
   direito previdenciário (ver LIMITAÇÕES no fim do arquivo) — ela é mais
   correta que os dois indicadores técnicos brutos, mas não é uma
   pronúncia jurídica fechada sobre o caso concreto.

   REGRA APLICADA (art. 27, Lei 8.213/91):
     I  — segurado empregado, empregado doméstico e trabalhador avulso:
          carência conta a partir do início da filiação (aqui: toda
          competência coberta pelo período de QUALQUER vínculo do
          histórico, independentemente de remuneração ter sido lançada).
     II — contribuinte individual, especial e facultativo: carência
          conta só a partir do efetivo pagamento (aqui: competências de
          `historico.contribuicoes` com valor > 0 e SEM vínculo
          associado — `.vinculoId === null` —, que é como o
          HistoricoPrevidenciario já sinaliza contribuição sem vínculo
          empregatício, ver Atualização 16).
   O resultado é a UNIÃO das duas contagens (uma competência não conta
   duas vezes se satisfizer as duas regras ao mesmo tempo).

   PREMISSA REGISTRADA (não escondida): todo `vinculo` do histórico é
   tratado, para os fins deste cálculo, como relação de emprego (regra I)
   — porque é o que o extrator de CNIS reconhece hoje (ver Atualização
   14: extratorVinculosCNIS.js não distingue tipo de vínculo). Se um
   vínculo do histórico for, na verdade, de outra natureza, esta apuração
   pode estar aplicando a regra errada para aquele período — por isso
   segue listada em `.limitacoes`, não escondida.

   DEPENDE de (globais, carregar antes deste arquivo):
     - CalculoPeriodos.mesclarPeriodos, CalculoPeriodos.competenciasDoPeriodo (js/core/calculoPeriodos.js)
============================================================================ */

var PREV_LIMITACOES_VALIDACAO_CARENCIA = [
  'não distingue o tipo de vínculo — todo vínculo do histórico é tratado como relação de emprego (art. 27, I) para este cálculo, porque o extrator de CNIS não classifica o tipo de vínculo hoje',
  'não verifica perda da qualidade de segurado (art. 15 e art. 24, parágrafo único, Lei 8.213/91) nem a exigência de recontagem de 1/3 da carência após reafiliação (art. 27-A)',
  'não verifica se a competência tem valor igual ou superior ao salário mínimo vigente à época',
  'não verifica hipóteses de dispensa de carência (ex.: alguns casos de auxílio-doença/invalidez por acidente de qualquer natureza)',
  'não trata segurado especial (rural) nem contagem recíproca com RPPS'
];

/**
 * Apura a carência do histórico consolidado aplicando a distinção do
 * art. 27, I e II da Lei 8.213/91 — NÃO é "quantidade de vínculos" nem
 * "quantidade de remunerações > 0" isoladamente (ver cabeçalho do
 * arquivo). Nunca lança erro: histórico ausente/vazio devolve
 * `totalMeses: 0`, nunca `null` nem uma exceção.
 *
 * @param {object} historico — saída de HistoricoPrevidenciario.montarHistorico()
 * @returns {{totalMeses:number, competencias:string[], metodologia:string, limitacoes:string[]}}
 */
function validarCarenciaPrevidenciaria(historico) {
  var vinculos = (historico && Array.isArray(historico.vinculos)) ? historico.vinculos : [];
  var contribuicoes = (historico && Array.isArray(historico.contribuicoes)) ? historico.contribuicoes : [];

  // Art. 27, I — competências cobertas por qualquer vínculo (filiação),
  // independentemente de remuneração ter sido lançada no CNIS.
  var competenciasPorFiliacao = new Set();
  var periodosValidos = vinculos.filter(function (v) { return v && v.inicio && v.fim; });
  if (periodosValidos.length > 0 && typeof CalculoPeriodos !== 'undefined') {
    var mesclados = CalculoPeriodos.mesclarPeriodos(periodosValidos.map(function (v) { return { inicio: v.inicio, fim: v.fim }; }));
    mesclados.forEach(function (p) {
      CalculoPeriodos.competenciasDoPeriodo(p.inicio, p.fim).forEach(function (c) { competenciasPorFiliacao.add(c); });
    });
  }

  // Art. 27, II — competências de contribuição SEM vínculo associado,
  // só a partir do efetivo pagamento (valor > 0 realmente lançado).
  var competenciasPorPagamentoEfetivo = new Set();
  contribuicoes.forEach(function (c) {
    if (c && c.valor > 0 && !c.vinculoId) competenciasPorPagamentoEfetivo.add(c.competencia);
  });

  var uniao = new Set();
  competenciasPorFiliacao.forEach(function (c) { uniao.add(c); });
  competenciasPorPagamentoEfetivo.forEach(function (c) { uniao.add(c); });

  var competencias = Array.from(uniao).sort();

  return {
    totalMeses: competencias.length,
    competencias: competencias,
    metodologia: 'Art. 27, I e II, Lei 8.213/91: competências cobertas por vínculo contam pela filiação (independentemente de remuneração lançada); competências de contribuição sem vínculo associado contam só a partir do efetivo pagamento.',
    limitacoes: PREV_LIMITACOES_VALIDACAO_CARENCIA.slice()
  };
}

var ValidacaoCarenciaPrevidenciaria = {
  versaoModulo: '1.0.0',
  validarCarenciaPrevidenciaria: validarCarenciaPrevidenciaria
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ValidacaoCarenciaPrevidenciaria, validarCarenciaPrevidenciaria };
}
