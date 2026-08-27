/* ============================================================================
   IAREVISORAPREVIDENCIARIA.JS — IA revisora do domínio previdenciário
   (item 7 do plano: "conectar a IA apenas como interpretadora/revisora,
   nunca como calculadora"). Nomes próprios (sufixo "Previdenciaria") pelo
   mesmo motivo de namespacing de todo o resto deste domínio.

   REGRA DE OURO (a mesma do arquivo original, nunca relaxada aqui):
     - Este módulo NUNCA decide um valor. Os itens 5/6 (Candidate
       Pool/Decision Engine) já decidiram — este módulo só pega a decisão
       PRONTA e julga: confirmado / provável / rejeitado.
     - Nunca escreve em `decisao.valor`. Só pode acrescentar
       `.statusRevisao`, `.confiancaRevisao`, `.observacao` — sempre numa
       CÓPIA da decisão, nunca mutando o objeto original.
     - Nunca roda sozinho / automaticamente — precisa ser chamado
       explicitamente por quem orquestra a tela (mesmo gatilho manual do
       resto da IA no app).

   ATUALIZAÇÃO (integração do pipeline completo, ver diagrama do usuário
   "PDF -> ... -> Decision Engine -> [sem conflito: Auto-fill DOM | conflito:
   revisão/IA] -> dados consolidados"): `ENDPOINT_REVISAR_CAMPOS_PREVIDENCIARIO`
   agora EXISTE — backend/server.js abre POST
   /api/previdenciario/ia-revisar-campos, com seu próprio catálogo
   (CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO, derivado de
   DICIONARIO_PREVIDENCIARIO em js/domains/previdenciario/
   camposRevisaoIAPrevidenciario.js).
   `chamarBackendRevisarCamposPrevidenciario()`/`aplicarRevisaoIAPrevidenciaria()`
   passam a ter, de fato, um endpoint do outro lado — quem orquestra a tela
   (js/domains/previdenciario/ui/painelPrevidenciarioConferencia.js) chama
   `aplicarRevisaoIAPrevidenciaria()` só para os campos que o Decision
   Engine marcou `.emConflito === true`, nunca para os demais.

   DEPENDE de (carregar antes deste arquivo): nada obrigatoriamente.
   `CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO` é DERIVADO em runtime de
   DICIONARIO_PREVIDENCIARIO.campos_semanticos (mesmo padrão de
   semantics/termosPrevidenciarios.js — nunca transcrito à mão).
============================================================================ */

var ENDPOINT_REVISAR_CAMPOS_PREVIDENCIARIO = '/api/previdenciario/ia-revisar-campos'; // backend ainda não implementado — ver LIMITAÇÃO HONESTA acima
var LIMITE_CAMPOS_POR_REVISAO_PREV = 12;
var LIMITE_TRECHO_REVISAO_PREV = 300;
var LIMITE_EVIDENCIAS_CONCORRENTES_PREV = 2;
var LIMITE_TRECHO_CONCORRENTE_PREV = 150;

var CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO = (function () {
  if (typeof DICIONARIO_PREVIDENCIARIO === 'undefined') return {};
  var mapa = {};
  DICIONARIO_PREVIDENCIARIO.campos_semanticos.forEach(function (c) {
    mapa[c.campo] = c.descricao;
  });
  return mapa;
})();

/* ------------------------------------------------------------------------
   1. QUAIS CAMPOS TÊM DECISÃO PRONTA E AINDA VALEM REVISÃO — mesmo
   critério do original: precisa ter `.trecho` (sem trecho não há o que
   julgar) e ainda não ter `.statusRevisao` (revisar de novo sem nada
   mudar não muda o veredito, só gasta uma chamada). `decisoes` é o
   `.porCampo` que decisionEnginePrevidenciario.js já produz.
------------------------------------------------------------------------ */
function calcularCamposRevisaveisPrevidenciarios(decisoes) {
  if (!decisoes) return [];
  return Object.keys(CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO).filter(function (id) {
    var decisao = decisoes[id];
    return decisao && decisao.trecho && !decisao.statusRevisao;
  });
}

/* ------------------------------------------------------------------------
   2. MONTAGEM DA PROPOSTA — puro, sem rede. Concorrentes vêm de
   `decisao.evidencias` (já produzido por decidirCampo() do core — ver
   decision/decisionEnginePrevidenciario.js), filtrando as NÃO escolhidas
   com trecho real. Ausência de concorrentes nunca é inventada.
------------------------------------------------------------------------ */
function montarPropostasRevisaoPrevidenciarias(decisoes, idsAlvo) {
  var alvo = (idsAlvo || calcularCamposRevisaveisPrevidenciarios(decisoes)).slice(0, LIMITE_CAMPOS_POR_REVISAO_PREV);

  return alvo.map(function (id) {
    var decisao = decisoes[id];
    var concorrentes = (decisao.evidencias || [])
      .filter(function (e) { return !e.escolhido && e.trecho; })
      .slice(0, LIMITE_EVIDENCIAS_CONCORRENTES_PREV)
      .map(function (e) {
        return { valor: String(e.valor), trecho: String(e.trecho).slice(0, LIMITE_TRECHO_CONCORRENTE_PREV) };
      });

    var proposta = {
      id: id,
      valorExibicao: String(decisao.valor),
      trecho: String(decisao.trecho || '').slice(0, LIMITE_TRECHO_REVISAO_PREV)
    };
    if (decisao.pagina && decisao.pagina.arquivo) proposta.tipoDocumento = String(decisao.pagina.arquivo);
    if (concorrentes.length) proposta.evidenciasConcorrentes = concorrentes;
    return proposta;
  });
}

/* ------------------------------------------------------------------------
   3. CHAMADA AO BACKEND — existe pra fechar a fiação, mas o endpoint que
   ela chama ainda não está implementado (ver LIMITAÇÃO HONESTA no
   cabeçalho). Falha de rede/404 é tratada exatamente como qualquer outro
   erro de API — nunca finge sucesso.
------------------------------------------------------------------------ */
function chamarBackendRevisarCamposPrevidenciario(propostas) {
  return fetch(ENDPOINT_REVISAR_CAMPOS_PREVIDENCIARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propostas: propostas })
  }).then(function (resposta) {
    if (!resposta.ok) {
      return resposta.json().catch(function () { return null; }).then(function (corpo) {
        var motivo = (corpo && corpo.erro) ? corpo.erro : ('HTTP ' + resposta.status);
        throw new Error(motivo);
      });
    }
    return resposta.json().then(function (dados) {
      if (!dados || typeof dados.revisoes !== 'object') {
        throw new Error('resposta inesperada do servidor — nenhum campo foi revisado a partir dela');
      }
      return dados.revisoes;
    });
  });
}

/* ------------------------------------------------------------------------
   4. APLICAÇÃO DO VEREDITO — PURA (sem rede): recebe as decisões e um
   mapa `{ [id]: { veredito, confianca_numerica?, justificativa? } }` já
   obtido (de chamarBackendRevisarCamposPrevidenciario() ou de um mock em
   teste) e devolve uma CÓPIA de `decisoes` com `.statusRevisao`/
   `.confiancaRevisao`/`.observacao` acrescentados só nos campos com
   veredito válido. `.valor` NUNCA é tocado — checagem estrutural: o
   objeto de decisão devolvido para cada campo revisado é uma cópia rasa
   do original + só esses 3 campos novos.
------------------------------------------------------------------------ */
var VEREDITOS_VALIDOS_PREV = ['confirmado', 'provavel', 'rejeitado'];
var ROTULO_VEREDITO_PREV = { confirmado: 'confirmou', provavel: 'considerou provável, mas não certo', rejeitado: 'rejeitou' };

function aplicarVeredictosPrevidenciarios(decisoes, revisoes, idsAlvo) {
  var alvo = idsAlvo || Object.keys(revisoes || {});
  var resultado = Object.assign({}, decisoes);
  var revisados = 0;

  alvo.forEach(function (id) {
    var r = (revisoes || {})[id];
    var decisaoOriginal = decisoes[id];
    if (!r || !decisaoOriginal || VEREDITOS_VALIDOS_PREV.indexOf(r.veredito) === -1) return;

    var atualizada = Object.assign({}, decisaoOriginal, { statusRevisao: r.veredito });
    if (typeof r.confianca_numerica === 'number' && r.confianca_numerica >= 0 && r.confianca_numerica <= 100) {
      atualizada.confiancaRevisao = r.confianca_numerica;
    }
    var sufixoConfianca = (atualizada.confiancaRevisao != null) ? (' (confiança da IA: ' + atualizada.confiancaRevisao + '%)') : '';
    var frase = 'Revisão por IA: ' + ROTULO_VEREDITO_PREV[r.veredito] + sufixoConfianca + (r.justificativa ? ' — ' + String(r.justificativa) : '') + '.';
    if (!atualizada.observacao || atualizada.observacao.indexOf(frase) === -1) {
      atualizada.observacao = (atualizada.observacao ? atualizada.observacao + ' ' : '') + frase;
    }

    resultado[id] = atualizada;
    revisados++;
  });

  return { decisoes: resultado, revisados: revisados };
}

/**
 * Orquestração completa (assíncrona) — chama o backend e aplica o
 * resultado. Não testada com rede real nesta entrega (ver LIMITAÇÃO
 * HONESTA); as peças puras (1/2/4 acima) são as testadas.
 */
function aplicarRevisaoIAPrevidenciaria(decisoes) {
  var idsRevisaveis = calcularCamposRevisaveisPrevidenciarios(decisoes);
  if (!idsRevisaveis.length) return Promise.resolve({ usado: false, motivo: 'nada_a_revisar' });

  var propostas = montarPropostasRevisaoPrevidenciarias(decisoes, idsRevisaveis);

  return chamarBackendRevisarCamposPrevidenciario(propostas).then(function (revisoes) {
    var aplicado = aplicarVeredictosPrevidenciarios(decisoes, revisoes, idsRevisaveis);
    return { usado: true, decisoes: aplicado.decisoes, revisados: aplicado.revisados, tentados: idsRevisaveis.length };
  }).catch(function (erro) {
    return { usado: false, motivo: 'erro_api', erro: String(erro && erro.message || erro) };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO, calcularCamposRevisaveisPrevidenciarios,
    montarPropostasRevisaoPrevidenciarias, chamarBackendRevisarCamposPrevidenciario,
    aplicarVeredictosPrevidenciarios, aplicarRevisaoIAPrevidenciaria
  };
}
