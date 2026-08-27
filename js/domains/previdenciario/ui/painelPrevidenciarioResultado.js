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
   4. RESULTADO — auditoria (resumo navegável) + RMI TEÓRICA e ELEGIBILIDADE
   SEMPRE em caixas separadas (ver .prev-caixa-rmi-teorica /
   .prev-caixa-elegibilidade no CSS) + cadeia de proveniência por
   competência na memória de cálculo.
------------------------------------------------------------------------ */

// Monta a cadeia "valor -> documento -> página -> competência ->
// remuneração extraída -> índice aplicado -> valor atualizado" pedida
// pelo usuário, a partir de UM item da memória de cálculo (já tem tudo:
// não busca nada novo, só reorganiza o que já está no objeto `m`).
function _prevUiCadeiaProveniencia(m) {
  var fontes = (m.fonte && m.fonte.length > 0) ? m.fonte : [null];
  var passos = fontes.map(function (f) {
    var doc = f ? escaparHtml(f.arquivo || f.documento || 'documento') : 'documento não identificado';
    var pagina = f && f.pagina != null ? ('página ' + f.pagina) : 'página não identificada';
    return '<b>' + doc + '</b> → ' + pagina;
  }).join(' <span class="opt-tag">e</span> ');

  var avisoConcomitancia = m.concomitante
    ? '<div class="prev-de-para" style="margin-top:6px;"><li style="list-style:none;">⚠ <b>Competência com atividades concomitantes</b> (Art. 32, Lei 8.213/91) — soma de mais de um salário de contribuição no mesmo mês' +
      (m.aplicouTetoRgpsHistorico && typeof m.valorAntesDoTetoRgps === 'number'
        ? (': ' + fmt(m.valorAntesDoTetoRgps) + ' → <b>' + fmt(m.valorOriginal) + '</b> (teto do RGPS da competência aplicado automaticamente)')
        : '') + '.' +
      (m.limitacaoTetoRgpsHistorico ? '<div class="opt-tag" style="margin-top:4px;">' + escaparHtml(m.limitacaoTetoRgpsHistorico) + '</div>' : '') + '</li></div>'
    : '';
  var avisoPendencia = m.possivelPendencia
    ? '<div class="opt-tag" style="margin-top:4px;color:var(--alerta);">⚠ Indício de pendência no CNIS (código de ocorrência: ' + escaparHtml((m.codigosOcorrencia || []).join('; ') || '—') + ') — confira a situação real desta competência antes de usar o valor.</div>'
    : '';

  return '<div class="prev-cadeia">' +
    '<b>' + fmt(m.valorAtualizado) + '</b> (valor atualizado)<br>' +
    '↑ ' + passos + '<br>' +
    '↑ competência <b>' + _prevUiFmtCompetencia(m.competencia) + '</b><br>' +
    '↑ remuneração extraída: <b>' + fmt(m.valorOriginal) + '</b> (valor original, antes da correção)<br>' +
    '↑ índice aplicado: <b>' + escaparHtml(m.indiceUtilizado) + '</b>, fator ' + m.fatorAplicado.toFixed(6) +
    avisoConcomitancia + avisoPendencia +
    '</div>';
}

function _prevUiLinhaAuditoria(rotulo, valorTexto, ancora, statusClasse, statusIcone) {
  return '<a class="prev-auditoria-linha" href="#' + ancora + '">' +
    '<span class="prev-auditoria-rotulo">' + escaparHtml(rotulo) + '</span>' +
    '<span><span class="prev-auditoria-valor">' + valorTexto + '</span>' +
    '<span class="prev-auditoria-check ' + statusClasse + '">' + statusIcone + '</span></span>' +
    '</a>';
}

// Puramente de apresentação (nenhuma regra de negócio): motorRMIDoHistorico.
// js às vezes devolve um `.motivo` de nível superior que só aponta pra um
// motivo mais específico aninhado embaixo (ex.: "salário de benefício não
// pôde ser calculado — ver .salarioBeneficio.motivo") — a UI não decide
// nada aqui, só escolhe qual string mostrar: a mais específica que existir.
function _prevUiMotivoEspecifico(resultado) {
  if (resultado && resultado.salarioBeneficio && resultado.salarioBeneficio.motivo) return resultado.salarioBeneficio.motivo;
  return (resultado && resultado.motivo) || null;
}

function renderizarResultadoPrev(resultado, contexto) {
  var alvo = $('prevResultado');
  if (!alvo) return;
  if (!resultado) { alvo.innerHTML = ''; return; }
  contexto = contexto || {};

  var html = '';

  if (resultado.motivo) {
    html += '<div class="prev-caixa" style="border:1px solid var(--erro); background:rgba(138,51,36,0.08);"><strong>Cálculo interrompido:</strong> ' + escaparHtml(_prevUiMotivoEspecifico(resultado)) + '</div>';
  }

  /* -------------------- VALIDAÇÃO FINAL (Atualização 48) — vem primeiro,
     acima até do card de auditoria, porque é o resumo de "posso confiar
     neste cálculo?" antes de entrar em qualquer detalhe. -------------------- */
  if (resultado.validacaoFinal) {
    var vf = resultado.validacaoFinal;
    var vfClasse = vf.statusGeral === 'validado' ? 'elegivel' : (vf.statusGeral === 'bloqueado' ? 'nao-elegivel' : 'nao-verificada');
    var vfRotulo = vf.statusGeral === 'validado' ? '🟢 VALIDADO' : (vf.statusGeral === 'bloqueado' ? '🔴 CÁLCULO BLOQUEADO' : '🟡 VALIDADO COM RESSALVAS');
    var vfIconePorStatus = { ok: '✓', ressalva: '⚠', bloqueado: '✗', nao_verificado: '—' };
    var vfItensHtml = vf.itens.map(function (it) {
      var classeItem = it.status === 'ok' ? 'ok' : (it.status === 'bloqueado' ? 'erro' : 'alerta');
      return '<li><span class="prev-auditoria-check ' + classeItem + '">' + vfIconePorStatus[it.status] + '</span> <strong>' + escaparHtml(it.rotulo) + '</strong>' +
        (it.detalhe ? ' — <span class="opt-tag">' + escaparHtml(it.detalhe) + '</span>' : '') + '</li>';
    }).join('');
    html += '<div class="prev-caixa prev-caixa-validacao-final prev-secao ' + vfClasse + '" id="prevSecaoValidacaoFinal">';
    html += '<div class="prev-caixa-titulo">STATUS DO CÁLCULO — ' + vfRotulo + '</div>';
    html += '<ul class="prev-pendencias" style="list-style:none; padding-left:0;">' + vfItensHtml + '</ul>';
    html += '<div class="opt-tag" style="margin-top:6px;">Esta validação só inspeciona o que os motores já calcularam (nunca decide nada novo) — 🔴 indica um problema estrutural que compromete o cálculo; 🟡 indica um ponto que merece revisão manual, mas não impede o uso do resultado.</div>';
    html += '</div>';
  }

  /* -------------------- COMPARADOR DE REGRAS (Atualização 50) -------------------- */
  if (resultado.comparadorRegras) {
    var cmp = resultado.comparadorRegras;
    html += '<div class="prev-caixa prev-secao" id="prevSecaoComparadorRegras" style="background:var(--bg-soft); border:1px solid var(--card-border);">';
    html += '<div class="prev-caixa-titulo">⚖️ COMPARADOR PREVIDENCIÁRIO <span class="opt-tag" title="Só agrega e ordena o que cada regra já calculou separadamente acima — nunca recalcula RMI nem reavalia elegibilidade.">(ranking das regras de aposentadoria programada avaliadas)</span></div>';

    if (cmp.regras.length) {
      var linhasCmp = cmp.regras.map(function (r) {
        var rotuloEleg = r.elegivel ? 'SIM' : 'NÃO';
        var rmiTxt = r.rmiFinal !== null ? fmt(r.rmiFinal) : '—';
        var obsTxt = r.motivoForaDoRanking ? ('<div class="opt-tag">' + escaparHtml(r.motivoForaDoRanking) + '</div>') : '';
        return '<tr' + (cmp.melhorRegra && cmp.melhorRegra.nome === r.nome ? ' style="font-weight:700;"' : '') + '>' +
          '<td>' + escaparHtml(r.nome) + ' <span class="opt-tag">(' + escaparHtml(r.baseLegal) + ')</span></td>' +
          '<td>' + rmiTxt + '</td><td>' + rotuloEleg + '</td><td>' + obsTxt + '</td></tr>';
      }).join('');
      html += '<table class="prev-tabela"><thead><tr><th>Regra</th><th>RMI</th><th>Elegível</th><th>Observação</th></tr></thead><tbody>' + linhasCmp + '</tbody></table>';

      if (cmp.melhorRegra) {
        html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao elegivel" style="margin-top:10px;">' +
          '<div class="prev-caixa-titulo">🏆 MELHOR RESULTADO — ' + escaparHtml(cmp.melhorRegra.nome) + '</div>' +
          '<div class="prev-caixa-valor">' + fmt(cmp.melhorRegra.rmiFinal) + '</div>' +
          '<div class="opt-tag">Maior RMI entre as regras elegíveis com valor calculado nesta rodada (' + escaparHtml(cmp.melhorRegra.baseLegal) + '). Não considera direito adquirido, professor, especial, rural ou PCD (ainda não implementadas).</div>' +
          '</div>';
      } else {
        html += '<div class="opt-tag" style="margin-top:8px;">' + escaparHtml(cmp.motivoSemMelhorRegra) + '</div>';
      }
    } else {
      html += '<p class="opt-tag">Nenhuma regra de transição avaliada ainda — marque idade/sexo/DER e, se quiser, as regras de transição acima para ver a comparação.</p>';
    }
    html += '</div>';
  }

  /* -------------------- CARD DE AUDITORIA (resumo navegável) -------------------- */
  var sbAud = resultado.salarioBeneficio;
  var tempoAud = resultado.tempoEcarencia && resultado.tempoEcarencia.tempoContribuicao;
  var carenciaAud = resultado.elegibilidade && resultado.elegibilidade.carencia;
  var rmiAud = resultado.rmiTeorica;
  var elegAud = resultado.elegibilidade;

  html += '<div class="prev-auditoria">';
  html += '<div class="prev-auditoria-cabecalho"><div class="segurado">' + (contexto.nomeSegurado ? 'Segurado: ' + escaparHtml(contexto.nomeSegurado) : 'Segurado não identificado') + '</div>' +
    '<div class="der">DER: ' + (contexto.competenciaReferencia ? _prevUiFmtCompetencia(contexto.competenciaReferencia) : '—') + '</div></div>';

  html += _prevUiLinhaAuditoria('Tempo de contribuição', tempoAud ? (tempoAud.tempoTotal.anos + 'a ' + tempoAud.tempoTotal.meses + 'm ' + tempoAud.tempoTotal.dias + 'd') : '—', 'prevSecaoTempo', tempoAud ? 'ok' : 'alerta', tempoAud ? '✓' : '—');
  html += _prevUiLinhaAuditoria('Carência', carenciaAud ? (carenciaAud.totalMeses + ' competência(s)') : '—', 'prevSecaoElegibilidade', carenciaAud ? 'ok' : 'alerta', carenciaAud ? '✓' : '⚠');
  html += _prevUiLinhaAuditoria('Salário de benefício', (sbAud && sbAud.salarioBeneficio !== null) ? fmt(sbAud.salarioBeneficio) : '—', 'prevSecaoSalario', (sbAud && sbAud.salarioBeneficio !== null) ? 'ok' : 'erro', (sbAud && sbAud.salarioBeneficio !== null) ? '✓' : '✗');
  html += _prevUiLinhaAuditoria('RMI teórica', rmiAud ? fmt(rmiAud.rmiFinal) : '—', 'prevSecaoRmi', rmiAud ? 'ok' : 'erro', rmiAud ? '✓' : '✗');
  html += _prevUiLinhaAuditoria('Elegibilidade', elegAud ? (elegAud.elegivel === true ? 'Requisitos atendidos' : (elegAud.elegivel === false ? 'Requisitos não atendidos' : 'Não verificada')) : '—',
    'prevSecaoElegibilidade', elegAud ? (elegAud.elegivel === true ? 'ok' : (elegAud.elegivel === false ? 'erro' : 'alerta')) : 'alerta',
    elegAud ? (elegAud.elegivel === true ? '✓' : (elegAud.elegivel === false ? '✗' : '⚠')) : '—');
  html += '<p class="opt-tag" style="margin:10px 4px 0;">Clique em qualquer linha para ir direto à seção correspondente, com a memória de cálculo e a fonte no PDF.</p>';
  html += '</div>';

  /* -------------------- SEÇÕES DETALHADAS (cada uma com id de âncora) -------------------- */

  // Salário de benefício + memória de cálculo, com cadeia de proveniência por competência.
  if (sbAud && sbAud.salarioBeneficio !== null) {
    html += '<div class="prev-caixa prev-secao" id="prevSecaoSalario" style="background:var(--bg-soft); border:1px solid var(--card-border);">';
    html += '<div class="prev-caixa-titulo">Salário de benefício</div>';
    html += '<div class="prev-caixa-valor">' + fmt(sbAud.salarioBeneficio) + '</div>';
    html += '<div class="opt-tag">Média de ' + sbAud.quantidadeSalarios + ' competência(s), corrigidas pelo INPC até ' + _prevUiFmtCompetencia(sbAud.competenciaReferencia) + '.</div>';
    if (sbAud.memoria && sbAud.memoria.length > 0) {
      var linhasMem = sbAud.memoria.map(function (m) {
        var fontesTxt = (m.fonte || []).map(_prevUiFonte).join('; ') || '—';
        var marcaConcomitante = m.concomitante ? ' <span class="opt-tag" title="Soma de atividades concomitantes (Art. 32, Lei 8.213/91) — ver detalhes na lupa">⚠ concomitante</span>' : '';
        var marcaTeto = m.aplicouTetoRgpsHistorico ? ' <span class="opt-tag" title="Teto do RGPS da competência aplicado automaticamente — ver detalhes na lupa">🔒 teto aplicado</span>' : '';
        return '<tr><td>' + _prevUiFmtCompetencia(m.competencia) + marcaConcomitante + marcaTeto + '</td><td>' + fmt(m.valorOriginal) + '</td><td>' + escaparHtml(m.indiceUtilizado) + '</td>' +
          '<td>' + m.fatorAplicado.toFixed(6) + '</td><td>' + fmt(m.valorAtualizado) + '</td><td>' + m.participacaoNaMedia.toFixed(2) + '%</td>' +
          '<td>' + fontesTxt + '</td><td><details><summary style="cursor:pointer;" title="Ver de onde este número veio">🔍</summary>' + _prevUiCadeiaProveniencia(m) + '</details></td></tr>';
      }).join('');
      html += '<details open style="margin-top:10px;"><summary style="cursor:pointer;">Memória de cálculo (' + sbAud.memoria.length + ' competências) — clique na lupa 🔍 de qualquer linha para rastrear até o PDF</summary>' +
        '<table class="prev-tabela" style="margin-top:8px;"><thead><tr><th>Competência</th><th>Valor original</th><th>Índice utilizado</th><th>Fator aplicado</th><th>Valor atualizado</th><th>Participação na média</th><th>Fonte</th><th>Proveniência</th></tr></thead><tbody>' + linhasMem + '</tbody></table></details>';
    }
    html += '</div>';
  }

  // Tempo de contribuição.
  if (tempoAud) {
    var t = tempoAud.tempoTotal;
    html += '<div class="prev-caixa prev-secao" id="prevSecaoTempo" style="background:var(--bg-soft); border:1px solid var(--card-border);">';
    html += '<div class="prev-caixa-titulo">Tempo de contribuição</div>';
    html += '<div class="prev-caixa-valor">' + t.anos + ' ano(s), ' + t.meses + ' mês(es) e ' + t.dias + ' dia(s)</div>';
    if (tempoAud.houveConcomitanciaEspecial) {
      html += '<div class="opt-tag" style="margin-top:4px;color:var(--alerta);">⚠ Detectada CONCOMITÂNCIA de atividade especial (dois ou mais vínculos especiais convertíveis se sobrepondo) — o acréscimo de conversão usou o fator mais vantajoso para os dias sobrepostos, sem duplicar, mas não há tese pacífica localizada sobre qual fator prevalece nesse cenário. Revise manualmente.</div>';
    }
    html += '</div>';
  }

  // DIREITO ADQUIRIDO — Aposentadoria por tempo de contribuição (regra
  // pré-EC 103/2019, Atualização 51) — seção própria, SEPARADA das demais
  // (não é regra de transição, é a lei antiga aplicada integralmente).
  if (resultado.direitoAdquiridoTempoContribuicao) {
    var elegDireitoAdq = resultado.direitoAdquiridoTempoContribuicao.elegibilidade;
    var rmiDireitoAdq = resultado.direitoAdquiridoTempoContribuicao.rmi;

    if (rmiDireitoAdq) {
      html += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="prevSecaoRmiDireitoAdquirido">';
      html += '<div class="prev-caixa-titulo">🕰️ RMI teórica — DIREITO ADQUIRIDO (tempo de contribuição) <span class="opt-tag" title="Lei 8.213/91, art. 53 (regra pré-EC 103/2019). Só a fórmula — NÃO significa que o segurado tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula</span></div>';
      html += '<div class="prev-caixa-valor">' + fmt(rmiDireitoAdq.rmiFinal) + '</div>';
      html += '<div class="opt-tag">' + (rmiDireitoAdq.dispensouFatorPrevidenciario
        ? '100% do salário de benefício (80% maiores salários) — Fator Previdenciário DISPENSADO pela pontuação do art. 29-C.'
        : ('Salário de benefício (80% maiores) × Fator Previdenciário informado (' + rmiDireitoAdq.percentualOuFatorAplicado.toFixed(4) + ').')) +
        (rmiDireitoAdq.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiDireitoAdq.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
      html += '</div>';
    } else {
      html += '<div class="prev-caixa prev-secao" style="background:var(--bg-soft); border:1px solid var(--card-border);" id="prevSecaoRmiDireitoAdquirido">';
      html += '<div class="prev-caixa-titulo">🕰️ RMI — DIREITO ADQUIRIDO (tempo de contribuição)</div>';
      html += '<div class="opt-tag">Informe o "Salário de benefício (80% maiores salários)" — e, se a pontuação do art. 29-C não dispensar o fator, também o "Fator previdenciário" — para ver a RMI desta regra.</div>';
      html += '</div>';
    }

    var classeCaixaDireitoAdq = elegDireitoAdq.elegivel === true ? 'elegivel' : 'nao-elegivel';
    var rotuloDireitoAdq = elegDireitoAdq.elegivel === true ? '✅ Elegível' : '❌ Não elegível';
    html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixaDireitoAdq + '" id="prevSecaoElegibilidadeDireitoAdquirido">';
    html += '<div class="prev-caixa-titulo">🕰️ ELEGIBILIDADE — DIREITO ADQUIRIDO (tempo de contribuição) — ' + rotuloDireitoAdq + '</div>';
    html += '<div class="opt-tag">Lei 8.213/91, art. 53. Sem idade mínima. Tempo mínimo exigido em 13/11/2019: ' + elegDireitoAdq.tempoMinimoExigidoAnos + ' anos. Pontuação (idade+tempo) em 13/11/2019: ' + elegDireitoAdq.pontuacaoAtingida.toFixed(2) + ' de ' + elegDireitoAdq.pontuacaoExigidaParaDispensarFator + ' para dispensar o Fator Previdenciário (art. 29-C)' + (elegDireitoAdq.dispensaFatorPrevidenciario ? ' — DISPENSADO' : ' — NÃO dispensado, fator obrigatório') + '.</div>';
    if (elegDireitoAdq.pendencias && elegDireitoAdq.pendencias.length > 0) {
      html += '<ul class="prev-pendencias">' + elegDireitoAdq.pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    html += '<div class="prev-limitacoes"><details><summary style="cursor:pointer;">Limitações desta apuração</summary><ul class="prev-pendencias"><li>Não calcula o salário de benefício pela regra dos 80% maiores salários nem o Fator Previdenciário — ambos recebidos prontos.</li><li>Não verifica se o tempo/idade/carência informados como "até 13/11/2019" realmente correspondem a essa data.</li></ul></details></div>';
    html += '</div>';
  }

  // RMI TEÓRICA — sempre rotulada como teórica, nunca como "final"/"valor a receber".
  if (rmiAud) {
    html += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="prevSecaoRmi">';
    html += '<div class="prev-caixa-titulo">RMI teórica <span class="opt-tag" title="Só a fórmula (salário de benefício × percentual) — NÃO significa que o segurado tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula, não é um resultado exercível por si só</span></div>';
    html += '<div class="prev-caixa-valor">' + fmt(rmiAud.rmiFinal) + '</div>';
    html += '<div class="opt-tag">' + (rmiAud.percentualAplicado * 100).toFixed(0) + '% do salário de benefício' + (rmiAud.anosExcedentesConsiderados > 0 ? (' (' + rmiAud.anosExcedentesConsiderados + ' ano(s) excedente(s) ao tempo mínimo)') : '') + '.' +
      (rmiAud.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiAud.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
    html += '</div>';
  }

  // ELEGIBILIDADE — caixa própria, cor e rótulo bem diferentes da RMI teórica.
  if (elegAud) {
    var classeCaixa = elegAud.elegivel === true ? 'elegivel' : (elegAud.elegivel === false ? 'nao-elegivel' : 'nao-verificada');
    var rotulo = elegAud.elegivel === true ? '✅ Elegível' : (elegAud.elegivel === false ? '❌ Não elegível' : '⚠ Elegibilidade não verificada');
    html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixa + '" id="prevSecaoElegibilidade">';
    html += '<div class="prev-caixa-titulo">ELEGIBILIDADE — ' + rotulo + '</div>';
    html += '<div class="opt-tag">Regra verificada: ' + escaparHtml(elegAud.regraVerificada) + '.</div>';
    if (elegAud.pendencias && elegAud.pendencias.length > 0) {
      html += '<ul class="prev-pendencias">' + elegAud.pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    if (elegAud.carencia) {
      html += '<div class="prev-limitacoes"><strong>Carência apurada: ' + elegAud.carencia.totalMeses + ' mês(es).</strong> ' + escaparHtml(elegAud.carencia.metodologia) +
        '<details style="margin-top:6px;"><summary style="cursor:pointer;">Limitações desta apuração de carência</summary><ul class="prev-pendencias">' +
        elegAud.carencia.limitacoes.map(function (l) { return '<li>' + escaparHtml(l) + '</li>'; }).join('') + '</ul></details></div>';
    }
    html += '</div>';
  }

  // REGRA DE TRANSIÇÃO POR PONTOS (EC 103/2019, art. 15) — seção própria,
  // SEPARADA da regra permanente acima (nunca combinadas na mesma caixa,
  // pra não sugerir que uma "substitui" ou é "mais importante" que a
  // outra). Só aparece quando resultado.regraPontos foi anexado por
  // avaliarRegraPontosSeAplicavel() — nenhuma regra nova decidida aqui.
  if (resultado.regraPontos) {
    var elegPontos = resultado.regraPontos.elegibilidade;
    var rmiPontos = resultado.regraPontos.rmi;

    html += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="prevSecaoRmiPontos">';
    html += '<div class="prev-caixa-titulo">RMI teórica — Regra de transição por PONTOS <span class="opt-tag" title="EC 103/2019, art. 15. Só a fórmula — NÃO significa que o segurado tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula</span></div>';
    html += '<div class="prev-caixa-valor">' + fmt(rmiPontos.rmiFinal) + '</div>';
    html += '<div class="opt-tag">' + (rmiPontos.percentualAplicado * 100).toFixed(0) + '% do salário de benefício' + (rmiPontos.anosExcedentesConsiderados > 0 ? (' (' + rmiPontos.anosExcedentesConsiderados + ' ano(s) excedente(s) ao tempo mínimo de ' + rmiPontos.tempoMinimoExigidoAnos + ' anos)') : (' (tempo mínimo desta regra: ' + rmiPontos.tempoMinimoExigidoAnos + ' anos)')) + '.' +
      (rmiPontos.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiPontos.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
    html += '</div>';

    var classeCaixaPontos = elegPontos.elegivel === true ? 'elegivel' : 'nao-elegivel';
    var rotuloPontos = elegPontos.elegivel === true ? '✅ Elegível' : '❌ Não elegível';
    html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixaPontos + '" id="prevSecaoElegibilidadePontos">';
    html += '<div class="prev-caixa-titulo">ELEGIBILIDADE — Regra de transição por PONTOS — ' + rotuloPontos + '</div>';
    html += '<div class="opt-tag">EC 103/2019, art. 15. Pontuação (idade + tempo de contribuição) em ' + elegPontos.anoReferencia + ': ' + elegPontos.pontuacaoAtingida.toFixed(2) + ' de ' + elegPontos.pontuacaoExigida + ' pontos exigidos. Tempo mínimo exigido: ' + elegPontos.tempoMinimoExigidoAnos + ' anos.</div>';
    if (elegPontos.pendencias && elegPontos.pendencias.length > 0) {
      html += '<ul class="prev-pendencias">' + elegPontos.pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    html += '<div class="prev-limitacoes"><details><summary style="cursor:pointer;">Limitação desta apuração</summary><ul class="prev-pendencias"><li>Não verifica filiação ao RGPS anterior a 13/11/2019, pressuposto legal desta regra de transição — confirme esse requisito manualmente no caso concreto.</li></ul></details></div>';
    html += '</div>';
  }

  // REGRA DE TRANSIÇÃO POR IDADE MÍNIMA PROGRESSIVA (EC 103/2019, art. 16)
  // — seção própria, mesmo padrão da regra de pontos.
  if (resultado.regraIdadeMinimaProgressiva) {
    var elegIdadeProg = resultado.regraIdadeMinimaProgressiva.elegibilidade;
    var rmiIdadeProg = resultado.regraIdadeMinimaProgressiva.rmi;

    html += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="prevSecaoRmiIdadeProgressiva">';
    html += '<div class="prev-caixa-titulo">RMI teórica — Regra de transição por IDADE MÍNIMA PROGRESSIVA <span class="opt-tag" title="EC 103/2019, art. 16. Só a fórmula — NÃO significa que o segurado tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula</span></div>';
    html += '<div class="prev-caixa-valor">' + fmt(rmiIdadeProg.rmiFinal) + '</div>';
    html += '<div class="opt-tag">' + (rmiIdadeProg.percentualAplicado * 100).toFixed(0) + '% do salário de benefício' + (rmiIdadeProg.anosExcedentesConsiderados > 0 ? (' (' + rmiIdadeProg.anosExcedentesConsiderados + ' ano(s) excedente(s) ao tempo mínimo de ' + rmiIdadeProg.tempoMinimoExigidoAnos + ' anos)') : (' (tempo mínimo desta regra: ' + rmiIdadeProg.tempoMinimoExigidoAnos + ' anos)')) + '.' +
      (rmiIdadeProg.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiIdadeProg.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
    html += '</div>';

    var classeCaixaIdadeProg = elegIdadeProg.elegivel === true ? 'elegivel' : 'nao-elegivel';
    var rotuloIdadeProg = elegIdadeProg.elegivel === true ? '✅ Elegível' : '❌ Não elegível';
    html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixaIdadeProg + '" id="prevSecaoElegibilidadeIdadeProgressiva">';
    html += '<div class="prev-caixa-titulo">ELEGIBILIDADE — Regra de transição por IDADE MÍNIMA PROGRESSIVA — ' + rotuloIdadeProg + '</div>';
    html += '<div class="opt-tag">EC 103/2019, art. 16. Idade exigida em ' + elegIdadeProg.anoReferencia + ': ' + elegIdadeProg.idadeExigida.toFixed(1) + ' anos. Tempo mínimo exigido: ' + elegIdadeProg.tempoMinimoExigidoAnos + ' anos.</div>';
    if (elegIdadeProg.pendencias && elegIdadeProg.pendencias.length > 0) {
      html += '<ul class="prev-pendencias">' + elegIdadeProg.pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    html += '<div class="prev-limitacoes"><details><summary style="cursor:pointer;">Limitação desta apuração</summary><ul class="prev-pendencias"><li>Não verifica filiação ao RGPS anterior a 13/11/2019, pressuposto legal desta regra de transição — confirme esse requisito manualmente no caso concreto.</li></ul></details></div>';
    html += '</div>';
  }

  // REGRA DE TRANSIÇÃO POR PEDÁGIO DE 50% (EC 103/2019, art. 17) — seção
  // própria, mesmo padrão da regra de pontos acima. A RMI só aparece se o
  // fator previdenciário foi informado (o sistema não o calcula — ver
  // regras/transicao/pedagio50.js); a elegibilidade aparece de qualquer
  // forma, já que não depende do fator.
  if (resultado.regraPedagio50) {
    var elegPed50 = resultado.regraPedagio50.elegibilidade;
    var rmiPed50 = resultado.regraPedagio50.rmi;

    if (rmiPed50) {
      html += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="prevSecaoRmiPedagio50">';
      html += '<div class="prev-caixa-titulo">RMI teórica — Regra de transição por PEDÁGIO DE 50% <span class="opt-tag" title="EC 103/2019, art. 17. Só a fórmula — NÃO significa que o segurado tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula</span></div>';
      html += '<div class="prev-caixa-valor">' + fmt(rmiPed50.rmiFinal) + '</div>';
      html += '<div class="opt-tag">Média de 100% dos salários de contribuição × fator previdenciário informado (' + rmiPed50.fatorPrevidenciarioAplicado.toFixed(4) + ').' +
        (rmiPed50.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiPed50.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
      html += '</div>';
    } else {
      html += '<div class="prev-caixa prev-secao" style="background:var(--bg-soft); border:1px solid var(--card-border);" id="prevSecaoRmiPedagio50">';
      html += '<div class="prev-caixa-titulo">RMI — Regra de transição por PEDÁGIO DE 50%</div>';
      html += '<div class="opt-tag">Informe o fator previdenciário (campo "Fator previdenciário", nos parâmetros do cálculo) para ver a RMI desta regra — o sistema não o calcula (depende da tábua de expectativa de sobrevida do IBGE).</div>';
      html += '</div>';
    }

    var classeCaixaPed50 = elegPed50.elegivel === true ? 'elegivel' : 'nao-elegivel';
    var rotuloPed50 = elegPed50.elegivel === true ? '✅ Elegível' : '❌ Não elegível';
    html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixaPed50 + '" id="prevSecaoElegibilidadePedagio50">';
    html += '<div class="prev-caixa-titulo">ELEGIBILIDADE — Regra de transição por PEDÁGIO DE 50% — ' + rotuloPed50 + '</div>';
    html += '<div class="opt-tag">EC 103/2019, art. 17. Sem idade mínima. Pedágio calculado: ' + elegPed50.pedagioAnos.toFixed(4) + ' ano(s). Tempo total exigido (mínimo + pedágio): ' + elegPed50.tempoTotalExigidoAnos.toFixed(4) + ' anos.</div>';
    if (elegPed50.pendencias && elegPed50.pendencias.length > 0) {
      html += '<ul class="prev-pendencias">' + elegPed50.pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    html += '</div>';
  }

  // REGRA DE TRANSIÇÃO POR PEDÁGIO DE 100% (EC 103/2019, art. 20).
  if (resultado.regraPedagio100) {
    var elegPed100 = resultado.regraPedagio100.elegibilidade;
    var rmiPed100 = resultado.regraPedagio100.rmi;

    html += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="prevSecaoRmiPedagio100">';
    html += '<div class="prev-caixa-titulo">RMI teórica — Regra de transição por PEDÁGIO DE 100% <span class="opt-tag" title="EC 103/2019, art. 20. Só a fórmula — NÃO significa que o segurado tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula</span></div>';
    html += '<div class="prev-caixa-valor">' + fmt(rmiPed100.rmiFinal) + '</div>';
    html += '<div class="opt-tag">100% da média dos salários de contribuição — sem redução, sem fator previdenciário.' +
      (rmiPed100.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiPed100.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
    html += '</div>';

    var classeCaixaPed100 = elegPed100.elegivel === true ? 'elegivel' : 'nao-elegivel';
    var rotuloPed100 = elegPed100.elegivel === true ? '✅ Elegível' : '❌ Não elegível';
    html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixaPed100 + '" id="prevSecaoElegibilidadePedagio100">';
    html += '<div class="prev-caixa-titulo">ELEGIBILIDADE — Regra de transição por PEDÁGIO DE 100% — ' + rotuloPed100 + '</div>';
    html += '<div class="opt-tag">EC 103/2019, art. 20. Idade mínima: ' + elegPed100.idadeMinimaAnos + ' anos. Pedágio calculado: ' + elegPed100.pedagioAnos.toFixed(4) + ' ano(s). Tempo total exigido (mínimo + pedágio): ' + elegPed100.tempoTotalExigidoAnos.toFixed(4) + ' anos.</div>';
    if (elegPed100.pendencias && elegPed100.pendencias.length > 0) {
      html += '<ul class="prev-pendencias">' + elegPed100.pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    html += '</div>';
  }

  // APOSENTADORIA POR INCAPACIDADE PERMANENTE (Lei 8.213/91, arts. 42/45)
  // — espécie SEPARADA (não é regra de transição da aposentadoria
  // programada); só aparece quando o usuário marcou "Avaliar esta espécie
  // também". Título visualmente diferenciado (🩺) pra deixar claro que é
  // outra espécie de benefício, não mais uma variante da programada.
  if (resultado.beneficioIncapacidadePermanente) {
    var elegIncap = resultado.beneficioIncapacidadePermanente.elegibilidade;
    var rmiIncap = resultado.beneficioIncapacidadePermanente.rmi;
    var carenciaIncap = resultado.beneficioIncapacidadePermanente.carencia;

    html += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="prevSecaoRmiIncapacidadePermanente">';
    html += '<div class="prev-caixa-titulo">🩺 RMI teórica — Aposentadoria por INCAPACIDADE PERMANENTE <span class="opt-tag" title="Lei 8.213/91, arts. 42/45. Só a fórmula — NÃO significa que o segurado tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula</span></div>';
    html += '<div class="prev-caixa-valor">' + fmt(rmiIncap.rmiFinal) + '</div>';
    if (rmiIncap.causaAcidentaria) {
      html += '<div class="opt-tag">100% do salário de benefício (incapacidade acidentária — sem redução).' +
        (rmiIncap.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiIncap.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
    } else {
      html += '<div class="opt-tag">' + (rmiIncap.percentualAplicado * 100).toFixed(0) + '% do salário de benefício (mesma fórmula da regra permanente, art. 26)' + (rmiIncap.anosExcedentesConsiderados > 0 ? (' — ' + rmiIncap.anosExcedentesConsiderados + ' ano(s) excedente(s)') : '') + '.' +
        (rmiIncap.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiIncap.aplicouTeto ? ' Teto do RGPS aplicado.' : '') + '</div>';
    }
    if (rmiIncap.adicionalGrandeInvalidezAplicado) {
      html += '<div class="opt-tag" style="margin-top:4px;">+ 25% de grande invalidez (art. 45) sobre ' + fmt(rmiIncap.rmiBase) + ' — este acréscimo ULTRAPASSA o teto do RGPS de propósito (art. 45, parágrafo único, "a").</div>';
    }
    html += '</div>';

    var classeCaixaIncap = elegIncap.elegivel === true ? 'elegivel' : 'nao-elegivel';
    var rotuloIncap = elegIncap.elegivel === true ? '✅ Elegível' : '❌ Não elegível';
    html += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixaIncap + '" id="prevSecaoElegibilidadeIncapacidadePermanente">';
    html += '<div class="prev-caixa-titulo">🩺 ELEGIBILIDADE — Aposentadoria por INCAPACIDADE PERMANENTE — ' + rotuloIncap + '</div>';
    html += '<div class="opt-tag">Lei 8.213/91, art. 42. Sem idade mínima, sem tempo de contribuição mínimo.' +
      (carenciaIncap ? (' Carência apurada: ' + carenciaIncap.totalMeses + ' mês(es) (exige 12, salvo dispensa).') : '') + '</div>';
    if (elegIncap.pendencias && elegIncap.pendencias.length > 0) {
      html += '<ul class="prev-pendencias">' + elegIncap.pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    html += '<div class="prev-limitacoes"><details><summary style="cursor:pointer;">Limitações desta apuração</summary><ul class="prev-pendencias"><li>Não verifica qualidade de segurado.</li><li>Não confirma perícia médica real nem consulta a lista de doenças/afecções que dispensam carência — recebe esses fatos já verificados.</li></ul></details></div>';
    html += '</div>';
  }

  // Helper compartilhado pelas 4 espécies novas abaixo (auxílio por
  // incapacidade temporária, auxílio-acidente, pensão por morte,
  // salário-maternidade) — só monta o par de caixas RMI+elegibilidade no
  // mesmo estilo visual já usado acima, evitando repetir a mesma
  // string de HTML 4 vezes. Não decide nada, só formata o que já veio
  // pronto de cada avaliarXSeAplicavel().
  function blocoRmiElegibilidade(idPrefixo, emoji, tituloEspecie, baseLegal, rmiValor, rmiDetalheHtml, elegivel, pendencias, limitacoesHtml) {
    var h = '';
    h += '<div class="prev-caixa prev-caixa-rmi-teorica prev-secao" id="' + idPrefixo + 'Rmi">';
    h += '<div class="prev-caixa-titulo">' + emoji + ' RMI teórica — ' + tituloEspecie + ' <span class="opt-tag" title="' + escaparHtml(baseLegal) + '. Só a fórmula — NÃO significa que o segurado/dependente tem direito a este valor. Ver ELEGIBILIDADE abaixo.">ⓘ é só a fórmula</span></div>';
    h += '<div class="prev-caixa-valor">' + fmt(rmiValor) + '</div>';
    h += '<div class="opt-tag">' + rmiDetalheHtml + '</div>';
    h += '</div>';

    var classeCaixa = elegivel === true ? 'elegivel' : 'nao-elegivel';
    var rotulo = elegivel === true ? '✅ Elegível' : '❌ Não elegível';
    h += '<div class="prev-caixa prev-caixa-elegibilidade prev-secao ' + classeCaixa + '" id="' + idPrefixo + 'Elegibilidade">';
    h += '<div class="prev-caixa-titulo">' + emoji + ' ELEGIBILIDADE — ' + tituloEspecie + ' — ' + rotulo + '</div>';
    h += '<div class="opt-tag">' + escaparHtml(baseLegal) + '.</div>';
    if (pendencias && pendencias.length > 0) {
      h += '<ul class="prev-pendencias">' + pendencias.map(function (p) { return '<li>' + escaparHtml(p) + '</li>'; }).join('') + '</ul>';
    }
    if (limitacoesHtml) {
      h += '<div class="prev-limitacoes"><details><summary style="cursor:pointer;">Limitações desta apuração</summary><ul class="prev-pendencias">' + limitacoesHtml + '</ul></details></div>';
    }
    h += '</div>';
    return h;
  }

  // AUXÍLIO POR INCAPACIDADE TEMPORÁRIA (Lei 8.213/91, arts. 59/61).
  if (resultado.auxilioIncapacidadeTemporaria) {
    var elegAuxTemp = resultado.auxilioIncapacidadeTemporaria.elegibilidade;
    var rmiAuxTemp = resultado.auxilioIncapacidadeTemporaria.rmi;
    var carenciaAuxTemp = resultado.auxilioIncapacidadeTemporaria.carencia;
    var detalheAuxTemp = '91% do salário de benefício.' +
      (rmiAuxTemp.aplicouLimiteUltimos12SC ? ' Limitado à média dos últimos 12 salários de contribuição (art. 29, §10).' : '') +
      (rmiAuxTemp.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiAuxTemp.aplicouTeto ? ' Teto do RGPS aplicado.' : '');
    var baseLegalAuxTemp = 'Lei 8.213/91, arts. 59/61' + (carenciaAuxTemp ? ('. Carência apurada: ' + carenciaAuxTemp.totalMeses + ' mês(es) (exige 12, salvo dispensa)') : '');
    html += blocoRmiElegibilidade('prevSecaoAuxTemp', '🤒', 'Auxílio por INCAPACIDADE TEMPORÁRIA', baseLegalAuxTemp,
      rmiAuxTemp.rmiFinal, detalheAuxTemp, elegAuxTemp.elegivel, elegAuxTemp.pendencias,
      '<li>Não verifica qualidade de segurado nem confirma perícia real.</li><li>Não calcula o limite do art. 29, §10 (média dos últimos 12 SC) automaticamente.</li>');
  }

  // AUXÍLIO-ACIDENTE (Lei 8.213/91, art. 86).
  if (resultado.auxilioAcidente) {
    var elegAuxAc = resultado.auxilioAcidente.elegibilidade;
    var rmiAuxAc = resultado.auxilioAcidente.rmi;
    var detalheAuxAc = '50% do salário de benefício.' +
      (rmiAuxAc.aplicouPiso ? ' Piso do salário mínimo aplicado.' : '') + (rmiAuxAc.aplicouTeto ? ' Teto do RGPS aplicado.' : '');
    html += blocoRmiElegibilidade('prevSecaoAuxAcidente', '🦽', 'AUXÍLIO-ACIDENTE', 'Lei 8.213/91, art. 86. Sem carência, sem idade mínima',
      rmiAuxAc.rmiFinal, detalheAuxAc, elegAuxAc.elegivel, elegAuxAc.pendencias,
      '<li>Não confirma perícia real da sequela/redução de capacidade.</li><li>Não trata a vedação de cumulação com aposentadoria (art. 86, §3º).</li>');
  }

  // PENSÃO POR MORTE (Lei 8.213/91, arts. 16/74-78).
  if (resultado.pensaoPorMorte) {
    var elegPensao = resultado.pensaoPorMorte.elegibilidade;
    var rmiPensao = resultado.pensaoPorMorte.rmi;
    var detalhePensao = 'Cota familiar de ' + (rmiPensao.percentualCotaFamiliar * 100).toFixed(0) + '% sobre ' + fmt(resultado.pensaoPorMorte.valorBaseAposentadoria) +
      ' (' + escaparHtml(resultado.pensaoPorMorte.origemValorBase) + '). Cota por dependente: ' + fmt(rmiPensao.rmiCotaPorDependente) + '.';
    html += blocoRmiElegibilidade('prevSecaoPensaoMorte', '⚱️', 'PENSÃO POR MORTE', 'Lei 8.213/91, arts. 74/75',
      rmiPensao.rmiCotaFamiliar, detalhePensao, elegPensao.elegivel, elegPensao.pendencias,
      '<li>Não calcula a DURAÇÃO do benefício (tabela de anos por idade do dependente, art. 77, §2º).</li><li>Não classifica dependentes por classe nem aplica exclusão entre classes.</li><li>Não verifica qualidade de segurado do falecido além do fato informado.</li>');
  }

  // SALÁRIO-MATERNIDADE (Lei 8.213/91, arts. 25/71-73).
  if (resultado.salarioMaternidade) {
    var elegMaternidade = resultado.salarioMaternidade.elegibilidade;
    var rmiMaternidade = resultado.salarioMaternidade.rmi;
    var detalheMaternidade = 'Categoria: ' + escaparHtml(rmiMaternidade.categoria) + '.' +
      (rmiMaternidade.aplicouPiso ? ' Piso do salário mínimo aplicado (art. 73).' : '') + (rmiMaternidade.aplicouTeto ? ' Teto do RGPS aplicado.' : '');
    html += blocoRmiElegibilidade('prevSecaoMaternidade', '🤰', 'SALÁRIO-MATERNIDADE', 'Lei 8.213/91, arts. 25/71-73. SEM carência (STF, ADIs 2.110/2.111)',
      rmiMaternidade.rmiFinal, detalheMaternidade, elegMaternidade.elegivel, elegMaternidade.pendencias,
      '<li>Não calcula a base de cálculo por categoria (remuneração integral, último SC, média de 12 SC) — recebida pronta.</li><li>Não trata prazos diferenciados de adoção por idade da criança.</li>');
  }

  if (!html) html = '<p class="opt-tag">Nada calculado ainda.</p>';
  alvo.innerHTML = html;
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderizarResultadoPrev, _prevUiMotivoEspecifico };
}
