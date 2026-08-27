/* ============================================================================
   PAINEL PREVIDENCIÁRIO — dividido em 5 arquivos (Atualização 55, refactor
   sem mudança de comportamento) a partir do antigo painelPrevidenciario.js
   único (1811 linhas), seguindo as 5 seções que o próprio arquivo já
   documentava por comentário numerado. Sem bundler/ES modules no projeto:
   os 5 arquivos compartilham escopo global via <script> em sequência
   (mesmo padrão já usado por todo o resto do app) — ORDEM DE CARREGAMENTO
   IMPORTA e é sempre a mesma nos 3 lugares que listam estes arquivos:
   index.html, sw.js (precache) e cada teste que carrega a UI num vm sandbox.

     1) painelPrevidenciarioEstado.js      — PREV_UI_ESTADO + leitura de PDF
     2) painelPrevidenciarioConferencia.js — tabelas de conferência (docs,
                                              campos decididos, vínculos,
                                              remunerações, contribuições)
     3) painelPrevidenciarioCalculo.js     — regras de benefício + cálculo
     4) painelPrevidenciarioResultado.js   — renderização do resultado
     5) painelPrevidenciarioWiring.js      — listeners DOM + module.exports

   Nenhuma lógica mudou nesta divisão — é só o mesmo código movido para
   arquivos menores. Ver docs/ARQUITETURA-ATUAL.md para a arquitetura atual
   e docs/historico/ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md para o histórico
   completo do arquivo original.
============================================================================ */


/* ------------------------------------------------------------------------
   2. TABELAS DE CONFERÊNCIA — cada linha com proveniência/confiança/status.
------------------------------------------------------------------------ */
function renderizarDocumentosPrev() {
  var alvo = $('prevTabelaDocumentos');
  if (!alvo) return;
  if (PREV_UI_ESTADO.documentosLidos.length === 0) {
    alvo.innerHTML = '<p class="opt-tag">Nenhum PDF importado ainda.</p>';
    return;
  }
  var linhas = PREV_UI_ESTADO.documentosLidos.map(function (d) {
    if (d.erroLeitura) {
      return '<tr><td>' + escaparHtml(d.arquivo) + '</td><td>p. ' + d.pagina + '</td><td colspan="2"><span class="opt-tag" title="' + escaparHtml(d.erroLeitura) + '">✕ falha na leitura desta página — pulada, o restante do PDF foi lido normalmente</span></td></tr>';
    }
    var tipoTexto = d.tipoReconhecido === 'cnis' ? 'CNIS' : 'não reconhecido';
    var aviso = d.emAmbiguidade ? ' <span class="opt-tag" title="Mais de um tipo documental competiu pela mesma página">⚠ ambíguo</span>' : '';
    return '<tr><td>' + escaparHtml(d.arquivo) + '</td><td>p. ' + d.pagina + '</td><td>' + tipoTexto + aviso + '</td><td>' + _prevUiBadgeConfianca(d.confianca) + '</td></tr>';
  }).join('');
  alvo.innerHTML = '<table class="prev-tabela"><thead><tr><th>Arquivo</th><th>Página</th><th>Tipo reconhecido</th><th>Confiança</th></tr></thead><tbody>' + linhas + '</tbody></table>';
}

/* ------------------------------------------------------------------------
   1.5 PIPELINE DE CAMPOS DO PROCESSO (item 27 — Semantic Mapper -> Evidence
   Layer -> Candidate Pool -> Field Rules -> Decision Engine -> Auto-fill/
   revisão IA). Só usa peças já prontas e testadas (ver cabeçalho do
   arquivo); se algum módulo não estiver carregado, degrada silenciosamente
   (a seção correspondente na tela mostra "nenhum campo reconhecido").
------------------------------------------------------------------------ */
function executarPipelineDecisaoCamposPrevidenciario() {
  if (typeof montarEvidenciasPrevidenciarias !== 'function') return null;

  PREV_UI_ESTADO.evidencias = montarEvidenciasPrevidenciarias(PREV_UI_ESTADO.paginasParaEvidencia);
  PREV_UI_ESTADO.poolCandidatos = (typeof montarPoolDeCandidatosPrevidenciario === 'function')
    ? montarPoolDeCandidatosPrevidenciario(PREV_UI_ESTADO.evidencias)
    : { porCampo: {}, campos: [] };
  PREV_UI_ESTADO.decisoesCampos = (typeof decidirCamposPrevidenciarios === 'function')
    ? decidirCamposPrevidenciarios(PREV_UI_ESTADO.poolCandidatos)
    : { porCampo: {}, campos: [] };

  // Decisão SEM conflito -> Auto-fill DOM. Decisão EM conflito nunca é
  // preenchida sozinha (ver regra de ouro em
  // preenchimentoAutomaticoPrevidenciario.js) — fica pendente de
  // confirmação manual ou do botão "Revisar com IA" (seção 1.6 abaixo).
  if (typeof preencherFormularioAutomaticoPrevidenciario === 'function') {
    var preenchimento = preencherFormularioAutomaticoPrevidenciario(PREV_UI_ESTADO.decisoesCampos.porCampo);
    PREV_UI_ESTADO.planoPreenchimento = preenchimento.plano;
    // `.aplicados` é o que REALMENTE foi escrito no DOM (pode ser menor
    // que `plano.preencher` — ver `.formatoInvalido` em
    // aplicarPreenchimentoNoDOMPrevidenciario()); a tabela de campos usa
    // isso para o badge "preenchido automaticamente", nunca o plano puro,
    // pra nunca mostrar sucesso num campo que ficou vazio de verdade.
    PREV_UI_ESTADO.camposRealmenteAplicados = preenchimento.aplicados;
    PREV_UI_ESTADO.camposFormatoInvalido = preenchimento.formatoInvalido || [];
  } else if (typeof planoDePreenchimentoPrevidenciario === 'function') {
    PREV_UI_ESTADO.planoPreenchimento = planoDePreenchimentoPrevidenciario(PREV_UI_ESTADO.decisoesCampos.porCampo);
    PREV_UI_ESTADO.camposRealmenteAplicados = null; // sem DOM disponível — tabela cai no fallback (plano.preencher)
    PREV_UI_ESTADO.camposFormatoInvalido = [];
  } else {
    PREV_UI_ESTADO.planoPreenchimento = { preencher: [], requeremConfirmacao: [], semMapeamentoDom: [], semDecisao: [] };
    PREV_UI_ESTADO.camposRealmenteAplicados = null;
    PREV_UI_ESTADO.camposFormatoInvalido = [];
  }

  renderizarCamposDecididosPrev();

  var campos = PREV_UI_ESTADO.decisoesCampos.campos || [];
  var emConflito = campos.filter(function (c) { return PREV_UI_ESTADO.decisoesCampos.porCampo[c] && PREV_UI_ESTADO.decisoesCampos.porCampo[c].emConflito; }).length;
  return { decididos: campos.length, preenchidos: PREV_UI_ESTADO.planoPreenchimento.preencher.length, emConflito: emConflito };
}

function _prevUiFonteDecisao(decisao) {
  if (!decisao || !decisao.pagina) return '—';
  var pagina = decisao.pagina.numero != null ? ('p. ' + decisao.pagina.numero) : 'página —';
  var arquivo = decisao.pagina.arquivo ? (' · ' + escaparHtml(decisao.pagina.arquivo)) : '';
  return pagina + arquivo;
}

/* ------------------------------------------------------------------------
   1.55 "DE-PARA" DE TRANSPARÊNCIA/AUDITORIA — item 2 do checklist de
   melhorias ("o operador humano precisa ter total clareza sobre o motivo
   de uma alteração"). Monta o HTML de dentro do <details> de cada campo:
     1. o trecho EXATO do documento que embasa o valor atual (decisao.trecho
        + página/arquivo) — nunca só "confie no sistema";
     2. se houve conflito: cada concorrente DESCARTADO, com o próprio trecho
        dele lado a lado — o "De" (o que outra fonte dizia) frente ao "Para"
        (o valor que prevaleceu, já mostrado na linha da tabela);
     3. a justificativa mecânica que decisorCampos.js já gera (decisao.
        justificativa) — por que este valor venceu, não outro;
     4. se revisado por IA (decisao.statusRevisao): bloco DESTACADO e
        rotulado "Revisão por IA" (nunca escondido num tooltip) com o
        veredito, a confiança numérica da IA e a justificativa dela —
        mitiga aceitação cega: o operador vê o motivo, não só o selo.
   Tudo lido do que decisorCampos.js/iaRevisoraPrevidenciaria.js JÁ
   calculam — nenhum dado novo é inventado aqui, só exibido.
------------------------------------------------------------------------ */
function _prevUiRenderizarEvidenciasDetalhe(decisao) {
  var partes = [];

  if (decisao.trecho) {
    partes.push(
      '<div><strong>Trecho que embasa o valor atual</strong>' +
      '<div class="prev-evidencia-trecho">“' + escaparHtml(decisao.trecho) + '”<br>' +
      '<span class="prev-evidencia-fonte">' + _prevUiFonteDecisao(decisao) + '</span></div></div>'
    );
  } else {
    partes.push('<div class="opt-tag">Nenhum trecho de origem registrado para este valor.</div>');
  }

  if (decisao.emConflito && decisao.conflitos && decisao.conflitos.length) {
    var itensDePara = decisao.conflitos.map(function (c) {
      var ondeC = (c.pagina != null ? ('p. ' + c.pagina) : 'página —') + (c.arquivo ? (' · ' + escaparHtml(c.arquivo)) : '');
      return '<li><strong>Fonte concorrente descartada:</strong> "' + escaparHtml(String(c.valor)) + '"' +
        (c.vezes > 1 ? (' (encontrado ' + c.vezes + 'x)') : '') +
        (c.trecho ? ('<div class="prev-evidencia-trecho">“' + escaparHtml(c.trecho) + '”<br><span class="prev-evidencia-fonte">' + escaparHtml(ondeC) + '</span></div>') : ('<div class="opt-tag">' + escaparHtml(ondeC) + '</div>')) +
        '</li>';
    }).join('');
    partes.push('<div><strong>De → Para (divergência entre fontes)</strong><ul class="prev-de-para">' + itensDePara + '</ul></div>');
  }

  if (decisao.justificativa) {
    partes.push('<div class="prev-justificativa"><strong>Por que este valor:</strong> ' + escaparHtml(decisao.justificativa) + '</div>');
  }

  if (decisao.statusRevisao) {
    var classeVeredito = ['confirmado', 'provavel', 'rejeitado'].indexOf(decisao.statusRevisao) !== -1 ? decisao.statusRevisao : '';
    partes.push(
      '<div class="prev-revisao-ia ' + classeVeredito + '">' +
      '<div class="prev-revisao-ia-titulo">🤖 Revisão por IA — ' + escaparHtml(decisao.statusRevisao) +
      (decisao.confiancaRevisao != null ? (' (confiança: ' + decisao.confiancaRevisao + '%)') : '') + '</div>' +
      '<div>' + escaparHtml(decisao.observacao || 'Sem justificativa registrada.') + '</div>' +
      '<div class="opt-tag" style="margin-top:6px;">A IA só julga o valor já proposto (confirma/considera provável/rejeita) — nunca decide um valor novo. Confira sempre o trecho acima antes de aceitar.</div>' +
      '</div>'
    );
  }

  return partes.join('');
}

/* ------------------------------------------------------------------------
   1.57 CONFIRMAÇÃO MANUAL DE CAMPO EM CONFLITO ("Usar esta sugestão") —
   Atualização 47. Fecha a lacuna registrada desde o item 8
   (preenchimentoAutomaticoPrevidenciario.js): decisões `.emConflito` nunca
   eram preenchidas automaticamente, e não existia nenhuma ação para o
   operador humano resolver o conflito manualmente — só a revisão por IA
   (que julga, mas nunca decide um valor).

   Esta função É a decisão humana (não é o motor nem a IA decidindo): o
   operador escolhe entre os candidatos concorrentes (ou digita um valor
   próprio) e a escolha vira uma decisão resolvida — auditável, com quem
   confirmou, quando, qual valor, qual era a alternativa e qual documento
   fundamentou. Nunca mexe no candidato original nem em decisões de OUTROS
   campos — só substitui a decisão deste campo por uma cópia resolvida.
------------------------------------------------------------------------ */
function _prevUiRegistrarAuditoriaConfirmacao(entrada) {
  PREV_UI_ESTADO.auditoriaConfirmacoes = PREV_UI_ESTADO.auditoriaConfirmacoes || [];
  PREV_UI_ESTADO.auditoriaConfirmacoes.push(entrada);
}

/**
 * @param {string} campo
 * @param {string} valorEscolhido
 * @param {{descricao:string, trecho?:string}} fonteEscolhida - de onde veio o valor escolhido (pra registro de auditoria).
 * @param {string} origem - 'valor_atual' | 'conflito:<indice>' | 'manual'
 */
function _prevUiConfirmarCampoManualmente(campo, valorEscolhido, fonteEscolhida, origem) {
  var decisoesInfo = PREV_UI_ESTADO.decisoesCampos;
  var decisao = decisoesInfo && decisoesInfo.porCampo && decisoesInfo.porCampo[campo];
  if (!decisao) return;

  // Alternativas descartadas: o valor atual (se não foi o escolhido) + cada
  // concorrente do conflito que não virou o escolhido — nada é omitido do
  // registro, mesmo o que "perdeu".
  var alternativasDescartadas = [];
  if (decisao.valor !== valorEscolhido) {
    alternativasDescartadas.push({ valor: decisao.valor, fonte: _prevUiFonteDecisao(decisao), trecho: decisao.trecho || null });
  }
  (decisao.conflitos || []).forEach(function (c) {
    if (String(c.valor) === String(valorEscolhido)) return;
    var ondeC = (c.pagina != null ? ('p. ' + c.pagina) : 'página —') + (c.arquivo ? (' · ' + c.arquivo) : '');
    alternativasDescartadas.push({ valor: c.valor, fonte: ondeC, trecho: c.trecho || null });
  });

  var confirmadoPor = ($('prevConfirmadoPor') && $('prevConfirmadoPor').value.trim()) || 'não informado';
  var registro = {
    campo: campo,
    quando: new Date().toISOString(),
    confirmadoPor: confirmadoPor,
    valorEscolhido: valorEscolhido,
    fonteEscolhida: fonteEscolhida.descricao,
    trechoFonteEscolhida: fonteEscolhida.trecho || null,
    alternativasDescartadas: alternativasDescartadas,
    origem: origem
  };
  _prevUiRegistrarAuditoriaConfirmacao(registro);

  // Decisão resolvida: cópia da decisão original (nunca muta o objeto que
  // decidirCamposPrevidenciarios() produziu), com o valor escolhido e
  // `.emConflito:false` — a partir daqui, o preenchimento automático (que
  // só olha `.emConflito`) já pode preencher normalmente.
  var decisaoResolvida = Object.assign({}, decisao, {
    valor: valorEscolhido,
    emConflito: false,
    confirmacaoManual: registro
  });
  decisoesInfo.porCampo[campo] = decisaoResolvida;

  var idDom = (typeof MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO !== 'undefined') ? MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO[campo] : null;
  var resultadoAplicacaoDom = null;
  if (idDom && typeof aplicarPreenchimentoNoDOMPrevidenciario === 'function') {
    resultadoAplicacaoDom = aplicarPreenchimentoNoDOMPrevidenciario({ preencher: [{ campo: campo, idDom: idDom, valor: valorEscolhido }] });
  }

  // Mesma disciplina do preenchimento automático (executarPipelineDecisao
  // CamposPrevidenciario): se o valor escolhido não coube no <input
  // type="date"> (formato fora do ISO — ver aplicarPreenchimentoNoDOM
  // Previdenciario), o toast avisa em vez de anunciar sucesso — o campo
  // no formulário continua vazio, e "✅ confirmado manualmente" sozinho
  // esconderia isso do operador.
  if (resultadoAplicacaoDom && resultadoAplicacaoDom.formatoInvalido && resultadoAplicacaoDom.formatoInvalido.length) {
    toast('Campo "' + campo + '" confirmado, mas o valor "' + valorEscolhido + '" não coube no campo de data da tela (formato inesperado) — preencha manualmente.', true);
  } else {
    toast('Campo "' + campo + '" confirmado manualmente.');
  }
  renderizarCamposDecididosPrev();
}

function renderizarAuditoriaConfirmacoesPrev() {
  var alvo = $('prevAuditoriaConfirmacoes');
  if (!alvo) return;
  var registros = PREV_UI_ESTADO.auditoriaConfirmacoes || [];
  if (!registros.length) { alvo.innerHTML = ''; return; }

  var linhas = registros.slice().reverse().map(function (r) {
    var quandoFmt = new Date(r.quando).toLocaleString('pt-BR');
    var alternativasHtml = r.alternativasDescartadas.length
      ? '<ul class="prev-pendencias">' + r.alternativasDescartadas.map(function (a) {
          return '<li>"' + escaparHtml(String(a.valor)) + '" (' + escaparHtml(a.fonte) + ')' + (a.trecho ? ' — “' + escaparHtml(a.trecho) + '”' : '') + '</li>';
        }).join('') + '</ul>'
      : '<span class="opt-tag">nenhuma (sem conflito registrado)</span>';
    return '<tr><td>' + escaparHtml(r.campo) + '</td><td>' + escaparHtml(String(r.valorEscolhido)) + '</td>' +
      '<td>' + escaparHtml(r.fonteEscolhida) + '</td><td>' + escaparHtml(r.confirmadoPor) + '</td><td>' + quandoFmt + '</td>' +
      '<td><details><summary style="cursor:pointer;">ver</summary>' + alternativasHtml + '</details></td></tr>';
  }).join('');

  alvo.innerHTML = '<h3 style="margin-top:16px;">📋 Histórico de confirmações manuais</h3>' +
    '<table class="prev-tabela"><thead><tr><th>Campo</th><th>Valor escolhido</th><th>Fonte</th><th>Confirmado por</th><th>Quando</th><th>Alternativa(s) descartada(s)</th></tr></thead><tbody>' + linhas + '</tbody></table>';
}

function renderizarCamposDecididosPrev() {
  var alvo = $('prevTabelaCampos');
  if (!alvo) return;

  var decisoesInfo = PREV_UI_ESTADO.decisoesCampos;
  var campos = (decisoesInfo && decisoesInfo.campos) || [];
  if (!campos.length) {
    alvo.innerHTML = '<p class="opt-tag">Nenhum campo do processo (DER, DIB, espécie de benefício, motivo de indeferimento, nome do segurado...) reconhecido ainda nos PDFs importados.</p>';
    renderizarAuditoriaConfirmacoesPrev();
    return;
  }

  var plano = PREV_UI_ESTADO.planoPreenchimento || { preencher: [], requeremConfirmacao: [], semMapeamentoDom: [], semDecisao: [] };
  var idsPreenchidos = {};
  // Usa o que REALMENTE foi escrito no DOM (camposRealmenteAplicados)
  // quando disponível; só cai no plano puro (plano.preencher) quando o
  // preenchimento rodou sem DOM (camposRealmenteAplicados null) — mesmo
  // comportamento de antes para esse caso.
  var listaPreenchidos = PREV_UI_ESTADO.camposRealmenteAplicados || plano.preencher.map(function (i) { return i.campo; });
  listaPreenchidos.forEach(function (campo) { idsPreenchidos[campo] = true; });
  var idsSemMapeamento = {};
  plano.semMapeamentoDom.forEach(function (c) { idsSemMapeamento[c] = true; });
  var idsFormatoInvalido = {};
  (PREV_UI_ESTADO.camposFormatoInvalido || []).forEach(function (c) { idsFormatoInvalido[c] = true; });

  var haConflitoPendente = false;

  var linhas = campos.map(function (campo) {
    var decisao = decisoesInfo.porCampo[campo];
    if (!decisao) return '';
    var statusHtml;
    if (decisao.confirmacaoManual) {
      statusHtml = '<span class="status-badge validado" title="Confirmado por ' + escaparHtml(decisao.confirmacaoManual.confirmadoPor) + ' em ' + escaparHtml(new Date(decisao.confirmacaoManual.quando).toLocaleString('pt-BR')) + '">✅ confirmado manualmente</span>';
    } else if (decisao.statusRevisao) {
      statusHtml = '<span class="opt-tag" title="' + escaparHtml(decisao.observacao || '') + '">IA: ' + escaparHtml(decisao.statusRevisao) +
        (decisao.confiancaRevisao != null ? (' (' + decisao.confiancaRevisao + '%)') : '') + '</span>';
    } else if (decisao.emConflito) {
      haConflitoPendente = true;
      statusHtml = '<span class="status-badge requer_revisao">conflito (' + decisao.conflitos.length + ' concorrente(s))</span>';
    } else if (idsPreenchidos[campo]) {
      statusHtml = '<span class="status-badge validado">preenchido automaticamente</span>';
    } else if (idsFormatoInvalido[campo]) {
      statusHtml = '<span class="status-badge requer_revisao" title="Valor extraído (' + escaparHtml(String(decisao.valor)) + ') não está num formato que o campo de data aceita — confira o trecho de origem e preencha manualmente">⚠ preencha manualmente (formato)</span>';
    } else if (idsSemMapeamento[campo]) {
      statusHtml = '<span class="opt-tag" title="Decidido sem conflito, mas esta tela ainda não tem um campo de formulário correspondente">decidido — sem campo no formulário</span>';
    } else {
      statusHtml = '<span class="opt-tag">decidido</span>';
    }
    // "De-Para" de auditoria (item 2 do checklist): sempre disponível para
    // qualquer campo com trecho, conflito ou revisão de IA — nunca só um
    // tooltip; o operador expande e vê o texto de origem antes de aceitar.
    var temEvidenciaParaMostrar = !!(decisao.trecho || (decisao.conflitos && decisao.conflitos.length) || decisao.justificativa || decisao.statusRevisao);
    var colunaEvidencias = temEvidenciaParaMostrar
      ? '<details class="prev-evidencias-detalhe"><summary>ver evidências</summary><div>' + _prevUiRenderizarEvidenciasDetalhe(decisao) + '</div></details>'
      : '<span class="opt-tag">—</span>';

    // Botões "Usar esta sugestão" — só para campo AINDA em conflito e AINDA
    // não confirmado manualmente. Um botão por candidato (o valor atual +
    // cada concorrente do conflito) + "Editar manualmente" com input
    // próprio (id previsível por campo, pra não colidir entre linhas).
    var colunaAcoes = '<span class="opt-tag">—</span>';
    if (decisao.emConflito && !decisao.confirmacaoManual) {
      var idInputManual = 'prevEditarManual_' + campo;
      var botoes = '<button type="button" class="prev-btn-usar-valor" data-campo="' + escaparHtml(campo) + '" data-valor="' + escaparHtml(String(decisao.valor)) + '" data-fonte-descricao="' + escaparHtml(_prevUiFonteDecisao(decisao)) + '" data-fonte-trecho="' + escaparHtml(decisao.trecho || '') + '" data-origem="valor_atual">✓ Usar "' + escaparHtml(String(decisao.valor)) + '" (' + escaparHtml(_prevUiFonteDecisao(decisao)) + ')</button>';
      (decisao.conflitos || []).forEach(function (c, i) {
        var ondeC = (c.pagina != null ? ('p. ' + c.pagina) : 'página —') + (c.arquivo ? (' · ' + c.arquivo) : '');
        botoes += ' <button type="button" class="prev-btn-usar-valor" data-campo="' + escaparHtml(campo) + '" data-valor="' + escaparHtml(String(c.valor)) + '" data-fonte-descricao="' + escaparHtml(ondeC) + '" data-fonte-trecho="' + escaparHtml(c.trecho || '') + '" data-origem="conflito:' + i + '">✓ Usar "' + escaparHtml(String(c.valor)) + '" (' + escaparHtml(ondeC) + ')</button>';
      });
      botoes += ' <input type="text" class="prev-input-editar-manual" id="' + idInputManual + '" placeholder="valor manual" style="width:110px;">' +
        ' <button type="button" class="prev-btn-confirmar-manual" data-campo="' + escaparHtml(campo) + '" data-input-id="' + idInputManual + '">✎ Usar valor editado</button>';
      colunaAcoes = botoes;
    }

    return '<tr><td>' + escaparHtml(campo) + '</td><td>' + escaparHtml(String(decisao.valor)) + '</td>' +
      '<td>' + _prevUiBadgeConfianca(decisao.confianca) + '</td><td>' + _prevUiFonteDecisao(decisao) + '</td><td>' + statusHtml + '</td>' +
      '<td>' + colunaEvidencias + '</td><td>' + colunaAcoes + '</td></tr>';
  }).join('');

  // Aviso/consentimento LGPD (Lei 13.709/2018) antes do botão de revisão
  // por IA — "Revisar campos em conflito com IA" envia, para a API da
  // Anthropic (fora do servidor do escritório), o TRECHO de evidência de
  // cada campo em conflito (proveniência do documento — ver colunaEvidencias
  // acima), que pode conter dado pessoal do segurado (nome, CPF, data de
  // nascimento) extraído do PDF. `_prevUiRevisarConflitosComIA()` recusa a
  // chamada (sem tocar em rede) se este checkbox não estiver marcado — ver
  // guarda lá.
  var botaoRevisao = haConflitoPendente
    ? '<div class="actions" style="margin-top:10px;">' +
      '<p class="opt-tag" style="display:block;max-width:640px;">🔒 Ao clicar em "Revisar com IA", o trecho de evidência de cada campo em conflito é enviado à API da Anthropic (fora do escritório) para julgamento — pode conter dado pessoal do segurado extraído do documento. ' +
      '<label style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;"><input type="checkbox" id="prevConsentimentoIA"> Estou ciente e autorizo o envio deste trecho para revisão por IA.</label></p>' +
      '<button type="button" class="prev-btn-revisar-conflitos-ia" id="prevBtnRevisarConflitosIA">🤖 Revisar campos em conflito com IA</button></div>'
    : '';

  alvo.innerHTML = '<table class="prev-tabela"><thead><tr><th>Campo</th><th>Valor decidido</th><th>Confiança</th><th>Fonte</th><th>Status</th><th>Evidências</th><th>Ação</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
    '<p class="opt-tag" style="margin-top:6px;">Campos sem conflito entre fontes são preenchidos automaticamente no formulário abaixo; campos em conflito NUNCA são preenchidos sozinhos — use os botões "Usar" na coluna Ação, ou "Revisar com IA" abaixo (a IA só julga, quem decide é você). Toda confirmação manual fica registrada no histórico de auditoria, com quem confirmou, quando, o valor escolhido e a alternativa descartada.</p>' +
    botaoRevisao;

  renderizarAuditoriaConfirmacoesPrev();
}

/* ------------------------------------------------------------------------
   1.6 REVISÃO POR IA — só para os campos que o Decision Engine marcou
   `.emConflito === true` (nunca para decidir um valor novo, nunca para os
   já sem conflito). Usa as peças PURAS de iaRevisoraPrevidenciaria.js
   diretamente (em vez de aplicarRevisaoIAPrevidenciaria(), que revisaria
   TODO campo decidido com trecho, mesmo sem conflito) para respeitar
   exatamente o ramo do diagrama: "conflito -> revisão/IA".
------------------------------------------------------------------------ */
async function _prevUiRevisarConflitosComIA() {
  var decisoesInfo = PREV_UI_ESTADO.decisoesCampos;
  var decisoes = decisoesInfo && decisoesInfo.porCampo;
  if (!decisoes) return;

  var idsConflito = Object.keys(decisoes).filter(function (id) {
    var d = decisoes[id];
    return d && d.emConflito && d.trecho && !d.statusRevisao;
  });
  if (!idsConflito.length) { toast('Nenhum campo em conflito pendente de revisão.'); return; }

  // Consentimento LGPD (ver checkbox #prevConsentimentoIA renderizado junto
  // do botão em renderizarCamposDecididosPrev()) — nenhum trecho de
  // documento sai para a Anthropic sem o usuário marcar explicitamente que
  // está ciente. Checkbox ausente do DOM (ex.: chamada direta em teste,
  // sem passar pela renderização) é tratada como "não consentiu", nunca
  // como "não se aplica".
  var checkboxConsentimento = $('prevConsentimentoIA');
  if (!checkboxConsentimento || !checkboxConsentimento.checked) {
    toast('Marque a caixa de ciência/autorização antes de enviar trechos dos documentos para revisão por IA.', true);
    return;
  }

  if (typeof montarPropostasRevisaoPrevidenciarias !== 'function' || typeof chamarBackendRevisarCamposPrevidenciario !== 'function' || typeof aplicarVeredictosPrevidenciarios !== 'function') {
    toast('Módulo de revisão por IA previdenciária não carregado.', true);
    return;
  }

  var btn = $('prevBtnRevisarConflitosIA');
  if (btn) { btn.disabled = true; btn.textContent = 'Revisando…'; }

  try {
    var propostas = montarPropostasRevisaoPrevidenciarias(decisoes, idsConflito);
    var revisoes = await chamarBackendRevisarCamposPrevidenciario(propostas);
    var aplicado = aplicarVeredictosPrevidenciarios(decisoes, revisoes, idsConflito);
    decisoesInfo.porCampo = aplicado.decisoes;
    toast(aplicado.revisados + ' campo(s) revisado(s) por IA.');
  } catch (erro) {
    console.error(erro);
    toast('Erro na revisão por IA: ' + (erro && erro.message ? erro.message : String(erro)), true);
  } finally {
    renderizarCamposDecididosPrev();
  }
}

// Opções do seletor de tipo por vínculo — o valor combina tipo+anosExposicao
// num único <option> ("especial-15") para não precisar de dois controles por
// linha; ver _prevUiOnMudarTipoVinculo() para o parse inverso.
var PREV_UI_OPCOES_TIPO_VINCULO = [
  { valor: 'comum', rotulo: 'Comum' },
  { valor: 'especial-15', rotulo: 'Especial (15 anos)' },
  { valor: 'especial-20', rotulo: 'Especial (20 anos)' },
  { valor: 'especial-25', rotulo: 'Especial (25 anos)' }
];

function _prevUiValorSelectTipo(v) {
  return (v.tipo === 'especial' && v.anosExposicao) ? ('especial-' + v.anosExposicao) : 'comum';
}

function _prevUiSelectTipoVinculo(idx, v) {
  var valorAtual = _prevUiValorSelectTipo(v);
  var opcoesHtml = PREV_UI_OPCOES_TIPO_VINCULO.map(function (o) {
    return '<option value="' + o.valor + '"' + (o.valor === valorAtual ? ' selected' : '') + '>' + o.rotulo + '</option>';
  }).join('');
  var aviso = v.avisoTipo ? ' <span class="opt-tag" title="' + escaparHtml(v.avisoTipo) + '">⚠</span>' : '';
  return '<select class="prev-select-tipo-vinculo" data-idx="' + idx + '" title="Marcação manual — o CNIS não informa atividade especial; use quando houver PPP/laudo/sentença comprovando">' +
    opcoesHtml + '</select>' + aviso;
}

// Chamada pelo listener delegado (wiring, seção 5): usuário mudou o tipo de
// UM vínculo na tabela. Só grava a marca no candidato ORIGINAL (._origem —
// mesma referência de PREV_UI_ESTADO.candidatosVinculo, ver historicoPrevi
// denciario.js) e remonta o histórico a partir dos MESMOS candidatos já
// extraídos — nunca refaz a leitura do PDF.
function _prevUiOnMudarTipoVinculo(idx, valorSelect) {
  var historico = PREV_UI_ESTADO.historico;
  var v = historico && historico.vinculos[idx];
  if (!v || !v._origem) return;

  if (valorSelect === 'comum') {
    v._origem.tipoManual = 'comum';
    delete v._origem.anosExposicaoManual;
  } else {
    var anos = parseInt(valorSelect.split('-')[1], 10);
    v._origem.tipoManual = 'especial';
    v._origem.anosExposicaoManual = anos;
  }

  if (typeof HistoricoPrevidenciario !== 'undefined' && HistoricoPrevidenciario.montarHistorico) {
    PREV_UI_ESTADO.historico = HistoricoPrevidenciario.montarHistorico(
      { vinculos: PREV_UI_ESTADO.candidatosVinculo, remuneracoes: PREV_UI_ESTADO.candidatosRemuneracao, segurado: historico.segurado },
      {}
    );
  }
  renderizarVinculosPrev();
  toast('Tipo do vínculo atualizado. Clique em "Calcular" de novo para refletir no tempo de contribuição e na RMI.');
}

function renderizarVinculosPrev() {
  var alvo = $('prevTabelaVinculos');
  if (!alvo) return;
  var historico = PREV_UI_ESTADO.historico;
  if (!historico || historico.vinculos.length === 0) {
    var ignorados = historico ? historico.ignorados.vinculos.length : 0;
    alvo.innerHTML = '<p class="opt-tag">Nenhum vínculo reconhecido ainda' + (ignorados > 0 ? (' (' + ignorados + ' candidato(s) descartado(s) — ver abaixo).') : '.') + '</p>' + _prevUiListaIgnorados(historico ? historico.ignorados.vinculos : []);
    return;
  }
  var linhas = historico.vinculos.map(function (v, idx) {
    var origem = v._origem || {};
    var periodo = fmtData(v.inicio) + ' — ' + (v.aberto ? 'em curso' : fmtData(v.fim));
    return '<tr><td>' + escaparHtml(origem.empregador || '—') + '</td><td>' + periodo + '</td><td>' + _prevUiSelectTipoVinculo(idx, v) + '</td>' +
      '<td>' + _prevUiBadgeConfianca(origem.confianca) + '</td><td>' + _prevUiBadgeStatus(origem.status) + '</td><td>' + _prevUiFonte(origem.fonte) + '</td></tr>';
  }).join('');
  alvo.innerHTML = '<table class="prev-tabela"><thead><tr><th>Empregador</th><th>Período</th><th>Tipo</th><th>Confiança</th><th>Status</th><th>Fonte</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
    '<p class="opt-tag" style="margin-top:6px;">O CNIS não informa atividade especial — o tipo de cada vínculo começa como "Comum" e só muda se você marcar aqui, com base em outra prova (PPP, laudo, sentença).</p>' +
    _prevUiListaIgnorados(historico.ignorados.vinculos);
}

function renderizarRemuneracoesPrev() {
  var alvo = $('prevTabelaRemuneracoes');
  if (!alvo) return;
  var historico = PREV_UI_ESTADO.historico;
  if (!historico || historico.remuneracoes.length === 0) {
    alvo.innerHTML = '<p class="opt-tag">Nenhuma remuneração reconhecida ainda.</p>' + _prevUiListaIgnorados(historico ? historico.ignorados.remuneracoes : []);
    return;
  }
  var linhas = historico.remuneracoes.map(function (r) {
    var vinculo = r.vinculoId ? r.vinculoId : (r.vinculosCorrespondentes && r.vinculosCorrespondentes.length > 1 ? 'ambíguo (' + r.vinculosCorrespondentes.length + ')' : 'sem vínculo');
    var linhaClasse = r.status === 'requer_revisao' ? ' class="requer-revisao"' : '';
    return '<tr' + linhaClasse + '><td>' + _prevUiFmtCompetencia(r.competencia) + '</td><td>' + fmt(r.valor) + (r.valorZerado ? ' <span class="opt-tag" title="Remuneração zerada — não presuma ausência de contribuição sem checar o código de ocorrência">⚠</span>' : '') + '</td>' +
      '<td>' + escaparHtml(vinculo) + '</td><td>' + _prevUiBadgeConfianca(r.confianca) + '</td><td>' + _prevUiBadgeStatus(r.status) + '</td><td>' + _prevUiFonte(r.fonte) + '</td></tr>';
  }).join('');
  alvo.innerHTML = '<table class="prev-tabela"><thead><tr><th>Competência</th><th>Valor</th><th>Vínculo</th><th>Confiança</th><th>Status</th><th>Fonte</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
    _prevUiListaIgnorados(historico.ignorados.remuneracoes);
}

function renderizarContribuicoesPrev() {
  var alvo = $('prevTabelaContribuicoes');
  if (!alvo) return;
  var historico = PREV_UI_ESTADO.historico;
  if (!historico || historico.contribuicoes.length === 0) {
    alvo.innerHTML = '<p class="opt-tag">Nenhuma contribuição apurada ainda (depende de vínculos e remunerações reconhecidos acima).</p>';
    return;
  }
  var linhas = historico.contribuicoes.map(function (c) {
    var aviso = c.ambigua ? ' <span class="opt-tag" title="Mais de um lançamento de remuneração para esta competência">⚠ ambígua</span>' : '';
    return '<tr><td>' + _prevUiFmtCompetencia(c.competencia) + '</td><td>' + fmt(c.valor) + '</td><td>' + escaparHtml(c.vinculoId || 'sem vínculo') + '</td><td>' + aviso + '</td></tr>';
  }).join('');
  alvo.innerHTML = '<table class="prev-tabela"><thead><tr><th>Competência</th><th>Valor</th><th>Vínculo</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table>';
}

function _prevUiListaIgnorados(lista) {
  if (!lista || lista.length === 0) return '';
  var itens = lista.map(function (i) { return '<li>' + escaparHtml(i.motivo || 'sem motivo informado') + (i.candidato && i.candidato.trecho ? (' — "' + escaparHtml(i.candidato.trecho) + '"') : '') + '</li>'; }).join('');
  return '<details style="margin-top:10px;"><summary class="opt-tag" style="cursor:pointer;">' + lista.length + ' candidato(s) descartado(s) na extração (nunca silenciosamente)</summary><ul class="prev-pendencias">' + itens + '</ul></details>';
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderizarDocumentosPrev, executarPipelineDecisaoCamposPrevidenciario, renderizarCamposDecididosPrev,
    _prevUiRevisarConflitosComIA, _prevUiRenderizarEvidenciasDetalhe, _prevUiFonteDecisao,
    _prevUiConfirmarCampoManualmente, renderizarAuditoriaConfirmacoesPrev,
    renderizarVinculosPrev, _prevUiOnMudarTipoVinculo, _prevUiValorSelectTipo
  };
}
