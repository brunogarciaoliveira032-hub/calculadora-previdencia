/* ============================================================================
   PREENCHIMENTOAUTOMATICOPREVIDENCIARIO.JS — auto-fill do domínio
   previdenciário (item 8 do plano, último da fase). Onde se encaixa:

     ... -> DECISÃO -> PREENCHIMENTO

   ATUALIZAÇÃO 36: os 24 campos_semanticos que faltavam ganharam INPUT
   próprio em index.html (fieldset "📋 Dados do benefício/processo",
   logo após a tabela de campos reconhecidos) — a pedido explícito do
   usuário, depois de confirmado que o gargalo real não era a IA "não
   saber preencher", e sim a ausência do campo de destino. Os 25
   campos_semanticos do dicionário agora têm mapeamento DOM completo.
   `semMapeamentoDom` continua existindo no plano (nunca lança erro se
   um campo decidido não tiver id mapeado), mas hoje só recebe algo se o
   dicionário ganhar um campo semântico NOVO sem input correspondente
   ainda criado.

   REGRA DE OURO ("campos que exigem aceite individual são aplicados
   ao clicar em 'Usar esta sugestão'"): uma decisão com `.emConflito` NUNCA
   é preenchida automaticamente — só os campos SEM conflito entram no
   preenchimento automático; os em conflito voltam à parte
   (`.requeremConfirmacao`), prontos para uma ação de confirmação manual
   futura (não implementada nesta entrega — não existe ainda o botão/UI de
   "usar esta sugestão" no lado previdenciário).

   SPLIT PROPOSITAL em duas funções: `planoDePreenchimentoPrevidenciario()`
   é PURA (recebe decisões, devolve o que faria — testável sem DOM/browser)
   e `aplicarPreenchimentoNoDOMPrevidenciario()` é a única que toca
   `document` de verdade (mesma separação já usada no resto do app entre
   lógica e UI).

   DEPENDE de (carregar antes deste arquivo): nada obrigatoriamente.
   `aplicarPreenchimentoNoDOMPrevidenciario` usa `$` (js/core/util.js) se
   disponível, com fallback pra `document.getElementById` direto.
============================================================================ */

var MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO = {
  // identificação
  nomeSegurado: 'prevNomeSegurado',
  numeroBeneficio: 'prevNumeroBeneficio',
  cpfSegurado: 'prevCpfSegurado',
  dataNascimento: 'prevDataNascimento',
  // datas
  dataDER: 'prevDataDER',
  dataDIB: 'prevDataDIB',
  dataDIP: 'prevDataDIP',
  dataDCB: 'prevDataDCB',
  dataDID: 'prevDataDID',
  dataObito: 'prevDataObito',
  dataAjuizamento: 'prevDataAjuizamento',
  dataSentencaJudicial: 'prevDataSentencaJudicial',
  dataTransitoJulgado: 'prevDataTransitoJulgado',
  // benefício
  especieBeneficio: 'prevEspecieBeneficio',
  qualidadeSegurado: 'prevQualidadeSegurado',
  carenciaCumprida: 'prevCarenciaCumprida',
  tempoContribuicaoTotal: 'prevTempoContribuicaoTotal',
  motivoIndeferimento: 'prevMotivoIndeferimento',
  tutelaAntecipada: 'prevTutelaAntecipada',
  cidLaudoPericial: 'prevCidLaudoPericial',
  // valores
  salarioBeneficio: 'prevSalarioBeneficio',
  rendaMensalInicial: 'prevRendaMensalInicial',
  // vínculos
  atividadeEspecial: 'prevAtividadeEspecial',
  periodoRural: 'prevPeriodoRural',
  vinculoEmpregaticio: 'prevVinculoEmpregaticio'
  // Os 25 campos_semanticos do dicionário (Atualização 36) têm mapeamento
  // aqui. Um campo semântico novo que o dicionário venha a ganhar no
  // futuro cai em `semMapeamentoDom` até ganhar input correspondente —
  // nunca adicionado por adivinhação de qual seria o id do input.
};

/**
 * Monta o PLANO de preenchimento a partir das decisões (item 6) — não
 * toca em DOM nenhum, só decide o que faria. Devolve:
 *   { preencher: [{campo, idDom, valor}...],
 *     requeremConfirmacao: [{campo, idDom, valor, motivo:'emConflito'}...],
 *     semMapeamentoDom: [<campo>...] (decidido, mas sem campo de
 *       formulário correspondente ainda — ver LIMITAÇÃO HONESTA),
 *     semDecisao: [<campo>...] (tem mapeamento DOM mas não foi decidido —
 *       nenhum candidato encontrado pra esse campo neste caso) }
 * Nunca lança erro: `decisoes` ausente/malformado devolve um plano vazio.
 */
function planoDePreenchimentoPrevidenciario(decisoes) {
  decisoes = decisoes || {};
  var plano = { preencher: [], requeremConfirmacao: [], semMapeamentoDom: [], semDecisao: [] };

  Object.keys(decisoes).forEach(function (campo) {
    var decisao = decisoes[campo];
    if (!decisao) return;
    var idDom = MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO[campo];
    if (!idDom) {
      plano.semMapeamentoDom.push(campo);
      return;
    }
    var entrada = { campo: campo, idDom: idDom, valor: decisao.valor };
    if (decisao.emConflito) {
      entrada.motivo = 'emConflito';
      plano.requeremConfirmacao.push(entrada);
    } else {
      plano.preencher.push(entrada);
    }
  });

  Object.keys(MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO).forEach(function (campo) {
    if (!decisoes[campo]) plano.semDecisao.push(campo);
  });

  return plano;
}

// Um <input type="date"> do HTML5 REJEITA SILENCIOSAMENTE qualquer valor
// atribuído a `.value` que não esteja exatamente no formato ISO
// yyyy-mm-dd — não lança erro, não recusa visivelmente, só ignora e o
// campo fica vazio. O pipeline de decisão (semanticMapperPrevidenciario.js)
// já converte data BR -> ISO via parseDataBRParaIso() antes de chegar
// aqui, mas essa conversão exige ano com 4 dígitos; um trecho como
// "10/01/23" (ano com 2 dígitos — plausível em documento antigo/digitado
// à mão) não bate no regex de parseDataBRParaIso e cai no fallback bruto
// (permanece "10/01/23"). Sem este guard, esse valor seguiria direto pra
// `elemento.value`, o campo apareceria VAZIO na tela e ainda assim seria
// contado como "aplicado" — badge "preenchido automaticamente" mentindo
// sobre um campo que na verdade está em branco. Mesma disciplina do resto
// do app: nunca falhar silenciosamente.
var REGEX_DATA_ISO_PREVIDENCIARIO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aplica o plano no DOM real — só os itens de `plano.preencher` (nunca os
 * de `requeremConfirmacao`, que ficam pendentes de ação manual futura).
 * Devolve { aplicados: [<campo>...], elementoAusente: [<campo>...],
 *   formatoInvalido: [<campo>...] } — `elementoAusente` é campo mapeado
 * mas o elemento não existe na página no momento; `formatoInvalido` é
 * campo cujo elemento é um <input type="date"> e o valor decidido não
 * está em formato ISO (ver comentário acima) — em nenhum dos dois casos
 * o campo entra em `aplicados`, e nenhum dos dois lança erro, só reporta.
 */
function aplicarPreenchimentoNoDOMPrevidenciario(plano) {
  var buscar = (typeof $ === 'function') ? $ : function (id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  };

  var aplicados = [];
  var elementoAusente = [];
  var formatoInvalido = [];

  (plano ? plano.preencher : []).forEach(function (item) {
    var elemento = buscar(item.idDom);
    if (!elemento) {
      elementoAusente.push(item.campo);
      return;
    }
    var valorFinal = item.valor != null ? String(item.valor) : '';
    if (elemento.type === 'date' && valorFinal && !REGEX_DATA_ISO_PREVIDENCIARIO.test(valorFinal)) {
      formatoInvalido.push(item.campo);
      return;
    }
    elemento.value = valorFinal;
    aplicados.push(item.campo);
  });

  return { aplicados: aplicados, elementoAusente: elementoAusente, formatoInvalido: formatoInvalido };
}

/** Atalho: monta o plano E aplica no DOM num só passo — uso típico do botão da UI. */
function preencherFormularioAutomaticoPrevidenciario(decisoes) {
  var plano = planoDePreenchimentoPrevidenciario(decisoes);
  var resultado = aplicarPreenchimentoNoDOMPrevidenciario(plano);
  return Object.assign({}, resultado, { plano: plano });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO, planoDePreenchimentoPrevidenciario,
    aplicarPreenchimentoNoDOMPrevidenciario, preencherFormularioAutomaticoPrevidenciario
  };
}
