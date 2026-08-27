/* ============================================================================
   PAINELPREVIDENCIARIO.JS — Atualização 19-27: integra o pipeline
   previdenciário já existente (Atualizações 14-26: extração de CNIS +
   Semantic Mapper/Evidence Layer/Candidate Pool/Field Rules/Decision
   Engine/IA revisora/preenchimento automático) à aplicação REAL, numa tela
   própria. NENHUM motor, tipo documental ou regra de benefício novo é
   criado aqui — este arquivo só ORQUESTRA o que já existe e testado, e
   RENDERIZA o resultado.

   Atualização 27 (esta entrega) — FECHA O DIAGRAMA completo pedido pelo
   usuário, ligando as duas frentes que já existiam soltas (extração de
   CNIS de um lado; Semantic Mapper/Evidence/Candidate Pool/Decision
   Engine/IA revisora/preenchimento do outro) ao MESMO fluxo real de PDF:

     PDF -> lerUmPdf() (js/core/leitorPdf.js, reaproveitado tal como está)
         -> documentos/páginas (texto + página + nome do arquivo)
         -> identificarTipoDocumentoPrevidenciario() por página
         -> [ramo CNIS: extrairVinculosDoTexto()/extrairRemuneracoesDoTexto()
              -> montarHistorico() -> calcularRMIDoHistorico() ]
         -> [ramo campos do processo, TODAS as páginas, item 27:
              mapearPaginaPrevidenciaria() (Semantic Mapper)
              -> montarEvidenciasPrevidenciarias() (Evidence Layer)
              -> montarPoolDeCandidatosPrevidenciario() (Candidate Pool,
                 já usa a fonte preferencial de field-rules/index.js)
              -> decidirCamposPrevidenciarios() (Decision Engine)
              -> decisão SEM conflito: preencherFormularioAutomaticoPrevi
                 denciario() (Auto-fill DOM) | decisão EM conflito:
                 botão "Revisar com IA" -> aplicarRevisaoIAPrevidenciaria()
                 (POST /api/previdenciario/ia-revisar-campos) ]
         -> telas: documentos reconhecidos, campos do processo (decisão +
            preenchimento/conflito), vínculos, remunerações, contribuições,
            resultado (com RMI teórica e elegibilidade SEMPRE em caixas
            visualmente distintas, nunca uma escondendo a outra).

   OS DOIS RAMOS SÃO INDEPENDENTES POR DESENHO: o ramo CNIS (vínculos/
   remunerações/histórico/RMI) não passa pelo Semantic Mapper genérico —
   continua usando os extratores especializados de tabela (competência +
   valor + empregador), que já tinham sua própria camada de decisão
   (HistoricoPrevidenciario). O ramo "campos do processo" (dataDER, dataDIB,
   especieBeneficio, motivoIndeferimento, nomeSegurado...) é o que ainda
   não tinha um COLETOR de texto de página alimentando o Semantic
   Mapper/Evidence/Candidate Pool/Decision Engine com PDF real — só havia
   testes com texto sintético (ver tests/teste-evidencia-previdenciaria.js,
   teste-candidate-pool-previdenciario.js, teste-decision-engine-
   previdenciario.js). Esta entrega é exatamente esse coletor
   (`PREV_UI_ESTADO.paginasParaEvidencia`, alimentado por TODA página lida,
   de qualquer tipo documental, não só CNIS) + a orquestração dos 4 módulos
   já prontos em sequência real.

   PROVENIÊNCIA NA TELA: toda linha de vínculo/remuneração mostra
   documento+página (via `.fonte`/`._origem.fonte`), confiança (badge) e
   status ('validado'/'requer_revisao', com estilo de linha diferente para
   as que precisam de revisão) — nunca só o valor extraído sem de onde
   ele veio.

   REAPROVEITAMENTO DELIBERADO (não duplica nada): `lerUmPdf` (leitura de
   PDF), `escaparHtml`/`$`/`toast`/`fmt`/`fmtData`/`moneyValue` (helpers de
   UI genéricos do núcleo compartilhado) — nenhum destes é redefinido aqui.
   A barra de progresso e o aviso de truncamento durante a leitura do PDF
   aparecem no único card de importação de PDF da página (topo), porque
   `lerUmPdf` escreve neles diretamente — ver a seção "5. WIRING DA UI"
   abaixo, que liga esse card ao pipeline previdenciário via o hook
   `iniciarPipelineLeituraPdf`.

   ESCOPO DESTA ENTREGA (decidido com o usuário, "V19: não criar novos
   motores, novos tipos documentais ou novas regras de benefício"): só
   CNIS. Uma página que não seja reconhecida como CNIS entra na tabela de
   "Documentos reconhecidos" com o tipo em branco/rejeitado, mas não
   trava a leitura do restante do PDF.

   DEPENDE de (globais, carregar antes deste arquivo): $, toast, fmt,
   fmtData, moneyValue, escaparHtml, lerUmPdf (leitorPdf.js),
   identificarTipoDocumentoPrevidenciario (document-types/index.js),
   extrairVinculosDoTexto (extraction/extratorVinculosCNIS.js),
   extrairRemuneracoesDoTexto (extraction/extratorRemuneracoesCNIS.js),
   HistoricoPrevidenciario.montarHistorico, calcularRMIDoHistorico.
   Para o ramo "campos do processo" (Atualização 27, opcional — se
   ausente, esta tela simplesmente não mostra a seção, sem quebrar o resto):
   montarEvidenciasPrevidenciarias (evidence/evidenciaPrevidenciaria.js),
   montarPoolDeCandidatosPrevidenciario (candidates/candidatePoolPrevidenciario.js),
   decidirCamposPrevidenciarios (decision/decisionEnginePrevidenciario.js),
   planoDePreenchimentoPrevidenciario/aplicarPreenchimentoNoDOMPrevidenciario/
   preencherFormularioAutomaticoPrevidenciario (preenchimento/
   preenchimentoAutomaticoPrevidenciario.js), montarPropostasRevisaoPrevi
   denciarias/chamarBackendRevisarCamposPrevidenciario/
   aplicarVeredictosPrevidenciarios (ia/iaRevisoraPrevidenciaria.js).
============================================================================ */

var PREV_UI_ESTADO = {
  candidatosVinculo: [],
  candidatosRemuneracao: [],
  documentosLidos: [], // [{arquivo, pagina, tipoReconhecido, confianca, emAmbiguidade}]
  historico: null,
  paginasParaEvidencia: [], // [{documento, pagina, texto}] — TODA página lida, qualquer tipo (item 27: alimenta o Semantic Mapper/Evidence Layer)
  paginasComErro: [], // [{arquivo, numero, motivo}] — páginas que falharam isoladamente na leitura/extração, nunca escondidas do usuário (ver toast em processarPdfsPrevidenciario)
  evidencias: null,        // ledger do Evidence Layer (montarEvidenciasPrevidenciarias)
  poolCandidatos: null,    // Candidate Pool (montarPoolDeCandidatosPrevidenciario)
  decisoesCampos: null,    // { porCampo, campos } — Decision Engine (decidirCamposPrevidenciarios)
  planoPreenchimento: null, // plano de preenchimento automático (planoDePreenchimentoPrevidenciario)
  camposRealmenteAplicados: null, // [<campo>...] — o que aplicarPreenchimentoNoDOMPrevidenciario() CONSEGUIU escrever no DOM de fato (pode ser MENOR que planoPreenchimento.preencher — ver .formatoInvalido); null quando só o plano puro está disponível (fallback sem DOM), e nesse caso a tabela usa planoPreenchimento.preencher como antes
  camposFormatoInvalido: [], // [<campo>...] — campo decidido, sem conflito, mas cujo valor não pôde ser escrito no <input type="date"> correspondente (formato fora do ISO esperado, ex.: ano com 2 dígitos) — nunca fica "preenchido automaticamente" sem estar preenchido de verdade
  auditoriaConfirmacoes: [] // [{campo, quando, confirmadoPor, valorEscolhido, fonteEscolhida, alternativasDescartadas, origem}] — Atualização 47, "Usar esta sugestão"
};

function _prevUiFmtCompetencia(competencia) {
  if (!competencia || typeof competencia !== 'string') return '—';
  var partes = competencia.split('-');
  return partes.length === 2 ? (partes[1] + '/' + partes[0]) : competencia;
}

function _prevUiBadgeStatus(status) {
  var rotulo = status === 'validado' ? 'validado' : (status === 'requer_revisao' ? 'requer revisão' : (status || '—'));
  var classe = status === 'validado' ? 'validado' : 'requer_revisao';
  return '<span class="status-badge ' + classe + '">' + escaparHtml(rotulo) + '</span>';
}

function _prevUiBadgeConfianca(confianca) {
  if (typeof confianca !== 'number') return '<span class="badge-conf media">—</span>';
  var nivel = confianca >= 0.85 ? 'alta' : (confianca >= 0.6 ? 'media' : 'baixa');
  return '<span class="badge-conf ' + nivel + '">' + Math.round(confianca * 100) + '%</span>';
}

function _prevUiFonte(fonte) {
  if (!fonte) return '—';
  var doc = escaparHtml(fonte.documento || '—');
  var pagina = fonte.pagina != null ? ('p. ' + fonte.pagina) : 'página —';
  var arquivo = fonte.arquivo ? (' · ' + escaparHtml(fonte.arquivo)) : '';
  return doc + ' (' + pagina + ')' + arquivo;
}

/* ------------------------------------------------------------------------
   1. LEITURA DE PDF — reaproveita lerUmPdf() (leitorPdf.js) tal como está.
------------------------------------------------------------------------ */
async function processarPdfsPrevidenciario(arquivos) {
  if (!arquivos || !arquivos.length) return;
  if (typeof lerUmPdf !== 'function') { toast('Leitor de PDF não carregado.', true); return; }

  var relatorio = $('prevRelatorioLeitura');
  if (relatorio) relatorio.innerHTML = '<p class="opt-tag">Lendo…</p>';

  // Nomes rejeitados/com erro ficam num array em vez de virar toast() na
  // hora — dois toast() em sequência SEM nenhum `await` real entre eles
  // (ex.: dois arquivos inválidos seguidos, ou o único arquivo sendo
  // inválido) fazem o navegador só pintar o ÚLTIMO: o toast() anterior é
  // sobrescrito antes do primeiro repaint e o usuário nunca chega a vê-lo.
  // Por isso o resumo inteiro (sucesso + rejeitados + erros de leitura)
  // vira UM ÚNICO toast() no fim desta função — nunca perde informação
  // por causa da ordem/quantidade de arquivos.
  var arquivosIgnorados = [];
  var arquivosComErroLeitura = [];

  for (var i = 0; i < arquivos.length; i++) {
    var arquivo = arquivos[i];
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
      arquivosIgnorados.push(arquivo.name);
      continue;
    }
    try {
      var resultado = await lerUmPdf(arquivo);
      // leitorPdf.js isola falha por página (não aborta o arquivo inteiro
      // por causa de uma página só) — as páginas que falharam ficam em
      // `.paginasComErro`, nunca escondidas do usuário.
      if (resultado && Array.isArray(resultado.paginasComErro) && resultado.paginasComErro.length) {
        resultado.paginasComErro.forEach(function (p) {
          PREV_UI_ESTADO.paginasComErro.push({ arquivo: arquivo.name, numero: p.numero, motivo: p.motivo });
        });
      }
      processarPaginasLidasPrevidenciario(resultado);
    } catch (erro) {
      console.error(erro);
      arquivosComErroLeitura.push(arquivo.name + ' (' + erro.message + ')');
    }
  }

  PREV_UI_ESTADO.historico = (typeof HistoricoPrevidenciario !== 'undefined' && HistoricoPrevidenciario.montarHistorico)
    ? HistoricoPrevidenciario.montarHistorico({ vinculos: PREV_UI_ESTADO.candidatosVinculo, remuneracoes: PREV_UI_ESTADO.candidatosRemuneracao }, {})
    : null;

  renderizarDocumentosPrev();
  renderizarVinculosPrev();
  renderizarRemuneracoesPrev();
  renderizarContribuicoesPrev();
  var resumoCampos = executarPipelineDecisaoCamposPrevidenciario();

  var totalVinc = PREV_UI_ESTADO.historico ? PREV_UI_ESTADO.historico.vinculos.length : 0;
  var totalRem = PREV_UI_ESTADO.historico ? PREV_UI_ESTADO.historico.remuneracoes.length : 0;
  var sufixoCampos = resumoCampos ? (' ' + resumoCampos.decididos + ' campo(s) do processo decidido(s) (' + resumoCampos.preenchidos + ' preenchido(s), ' + resumoCampos.emConflito + ' em conflito).') : '';
  var totalFalhasLeituraPagina = PREV_UI_ESTADO.paginasComErro.length;

  var mensagem = totalVinc + ' vínculo(s) e ' + totalRem + ' remuneração(ões) reconhecidos.' + sufixoCampos;
  if (arquivosIgnorados.length) mensagem += ' ' + arquivosIgnorados.length + ' arquivo(s) ignorado(s) (não é PDF): ' + arquivosIgnorados.join(', ') + '.';
  if (arquivosComErroLeitura.length) mensagem += ' Erro ao ler: ' + arquivosComErroLeitura.join('; ') + '.';
  if (totalFalhasLeituraPagina) mensagem += ' ' + totalFalhasLeituraPagina + ' página(s) não puderam ser interpretadas e foram puladas — veja "Documentos reconhecidos" para detalhes.';
  var houveProblema = arquivosIgnorados.length > 0 || arquivosComErroLeitura.length > 0 || totalFalhasLeituraPagina > 0;
  toast(mensagem, houveProblema);
}

function processarPaginasLidasPrevidenciario(resultadoLeitura) {
  var paginas = (resultadoLeitura && resultadoLeitura.paginas) || [];
  // Páginas boas (sem erroLeitura), já com `.arquivo` anexado — formato que
  // extrairVinculosDoDocumentoComRelatorio()/extrairRemuneracoesDoDocumento
  // ComRelatorio() (extraction/*.js) esperam para montar `.fonte` de cada
  // candidato.
  var paginasParaExtracao = [];

  paginas.forEach(function (pagina) {
    // Página que falhou isoladamente na leitura (ver leitorPdf.js —
    // `.erroLeitura`) chega aqui com texto vazio; entra na tabela de
    // documentos marcada como falha, mas não trava a leitura das demais.
    if (pagina.erroLeitura) {
      PREV_UI_ESTADO.documentosLidos.push({
        arquivo: resultadoLeitura.nomeArquivo,
        pagina: pagina.numero,
        tipoReconhecido: null,
        confianca: 0,
        emAmbiguidade: false,
        erroLeitura: pagina.erroLeitura
      });
      return;
    }

    var tipo = (typeof identificarTipoDocumentoPrevidenciario === 'function')
      ? identificarTipoDocumentoPrevidenciario(pagina.texto)
      : null;

    PREV_UI_ESTADO.documentosLidos.push({
      arquivo: resultadoLeitura.nomeArquivo,
      pagina: pagina.numero,
      tipoReconhecido: tipo ? tipo.id : null,
      confianca: tipo ? tipo.confianca : 0,
      emAmbiguidade: tipo ? !!tipo.emAmbiguidade : false
    });

    // Item 27 — TODA página (qualquer tipo, não só CNIS) alimenta o
    // Semantic Mapper/Evidence Layer: dataDER/dataDIB/especieBeneficio/
    // motivoIndeferimento/nomeSegurado costumam vir de requerimento
    // administrativo, carta de concessão/indeferimento, decisão
    // administrativa ou processo judicial — nunca do CNIS.
    PREV_UI_ESTADO.paginasParaEvidencia.push({
      documento: resultadoLeitura.nomeArquivo,
      pagina: pagina.numero,
      texto: pagina.texto
    });

    paginasParaExtracao.push(Object.assign({}, pagina, { arquivo: resultadoLeitura.nomeArquivo }));
  });

  if (paginasParaExtracao.length === 0) return;

  // A classificação "é página de CNIS?" e a extração de vínculo/remuneração
  // (com isolamento de falha por página, ver item 1 do checklist de
  // melhorias) são 100% responsabilidade dos módulos de domínio — esta
  // função de UI só entrega o lote de páginas boas e recebe de volta
  // candidatos + páginas que falharam, nunca decide sozinha "isto é CNIS"
  // nem reimplementa o try/catch por página.
  if (typeof extrairVinculosDoDocumentoComRelatorio === 'function') {
    var resultadoVinculos = extrairVinculosDoDocumentoComRelatorio(paginasParaExtracao, {});
    PREV_UI_ESTADO.candidatosVinculo = PREV_UI_ESTADO.candidatosVinculo.concat(resultadoVinculos.candidatos);
    resultadoVinculos.paginasComErro.forEach(function (p) {
      PREV_UI_ESTADO.paginasComErro.push({
        arquivo: p.arquivo || resultadoLeitura.nomeArquivo,
        numero: p.numero,
        motivo: 'falha ao extrair vínculos desta página: ' + p.motivo
      });
    });
  }
  if (typeof extrairRemuneracoesDoDocumentoComRelatorio === 'function') {
    var resultadoRemuneracoes = extrairRemuneracoesDoDocumentoComRelatorio(paginasParaExtracao, {});
    PREV_UI_ESTADO.candidatosRemuneracao = PREV_UI_ESTADO.candidatosRemuneracao.concat(resultadoRemuneracoes.candidatos);
    resultadoRemuneracoes.paginasComErro.forEach(function (p) {
      PREV_UI_ESTADO.paginasComErro.push({
        arquivo: p.arquivo || resultadoLeitura.nomeArquivo,
        numero: p.numero,
        motivo: 'falha ao extrair remunerações desta página: ' + p.motivo
      });
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PREV_UI_ESTADO, processarPdfsPrevidenciario, processarPaginasLidasPrevidenciario };
}
