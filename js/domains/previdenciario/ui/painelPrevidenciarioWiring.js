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
   5. WIRING DA UI — reaproveita o card/zona de importação de PDF que já
   existe em leitorPdf.js (zonaDropPdf/inputPdf/btnAnexarPdf/
   btnCancelarLeitura/barra de progresso/histórico), em vez de duplicar
   essa UI aqui. leitorPdf.js chama iniciarPipelineLeituraPdf(arquivos) de
   forma opcional/guardada (typeof === 'function') sempre que o usuário
   escolhe ou solta um PDF na zona — como não há mais painel de
   desapropriação nesta página (que antes definia esse hook em
   painelConferencia.js), o previdenciário passa a ser quem o define.
------------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof window.iniciarPipelineLeituraPdf === 'undefined') {
    window.iniciarPipelineLeituraPdf = processarPdfsPrevidenciario;
  }

  var btnCalcular = $('prevBtnCalcular');
  if (btnCalcular) btnCalcular.addEventListener('click', calcularPrevidenciario);

  // Delegado (a tabela é reescrita a cada renderizarVinculosPrev(), então o
  // listener fica no container estável, nunca em cada <select> individual).
  var tabelaVinculos = $('prevTabelaVinculos');
  if (tabelaVinculos) {
    tabelaVinculos.addEventListener('change', function (e) {
      var alvo = e.target;
      if (!alvo || !alvo.classList || !alvo.classList.contains('prev-select-tipo-vinculo')) return;
      var idx = parseInt(alvo.getAttribute('data-idx'), 10);
      _prevUiOnMudarTipoVinculo(idx, alvo.value);
    });
  }

  // Delegado (a tabela de campos do processo é reescrita a cada
  // renderizarCamposDecididosPrev(), o botão "Revisar com IA" só existe
  // quando há conflito pendente; os botões "Usar esta sugestão"/"Usar
  // valor editado" só existem em linhas ainda em conflito).
  var tabelaCampos = $('prevTabelaCampos');
  if (tabelaCampos) {
    tabelaCampos.addEventListener('click', function (e) {
      var alvo = e.target;
      if (!alvo || !alvo.classList) return;
      if (alvo.classList.contains('prev-btn-revisar-conflitos-ia')) {
        _prevUiRevisarConflitosComIA();
        return;
      }
      if (alvo.classList.contains('prev-btn-usar-valor')) {
        _prevUiConfirmarCampoManualmente(
          alvo.getAttribute('data-campo'),
          alvo.getAttribute('data-valor'),
          { descricao: alvo.getAttribute('data-fonte-descricao'), trecho: alvo.getAttribute('data-fonte-trecho') || null },
          alvo.getAttribute('data-origem')
        );
        return;
      }
      if (alvo.classList.contains('prev-btn-confirmar-manual')) {
        var campo = alvo.getAttribute('data-campo');
        var inputId = alvo.getAttribute('data-input-id');
        var input = $(inputId);
        var valorDigitado = input ? input.value.trim() : '';
        if (!valorDigitado) { toast('Digite um valor antes de confirmar.', true); return; }
        _prevUiConfirmarCampoManualmente(campo, valorDigitado, { descricao: 'editado manualmente', trecho: null }, 'manual');
        return;
      }
    });
  }
});

// Este arquivo só registra o listener de DOMContentLoaded — não define
// nenhuma função própria para exportar. Cada um dos outros 4 arquivos do
// split (Estado/Conferencia/Calculo/Resultado) tem seu próprio
// module.exports com só as funções que ELE define (ver cabeçalho do
// split no topo de painelPrevidenciarioEstado.js). Um teste que precise
// de require() direto (sem vm sandbox) deve importar o arquivo específico
// onde a função vive, não este.
